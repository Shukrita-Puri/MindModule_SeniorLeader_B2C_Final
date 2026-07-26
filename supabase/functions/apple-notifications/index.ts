/**
 * apple-notifications — App Store Server Notifications V2 endpoint.
 *
 * Intentionally unauthenticated (Apple calls it directly), but the payload is
 * only trusted after its Apple signature is verified — the same rule the
 * Stripe webhook follows with its signing secret.
 *
 * Handles: initial buy, renewals, expiration, refunds/revocation, grace
 * period, billing retry, price-increase consent, and subscription changes.
 * Processing is idempotent via the unique index on apple_transactions.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  verifyAppleSignedPayload,
  applyAppleEntitlement,
  recordAppleTransaction,
  type AppleTransactionPayload,
  type AppleRenewalInfo,
} from '../_shared/apple-entitlement.ts';
import { getSubscriptionStatus, appStoreApiConfigured } from '../_shared/app-store-server-api.ts';

interface NotificationPayload {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  signedDate?: number;
  version?: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

/**
 * Notification types that must always be re-verified against the App Store
 * Server API before we change entitlement — these either revoke access or
 * arrive out of order under retry.
 */
const REVERIFY_TYPES = new Set([
  'REFUND',
  'REVOKE',
  'REFUND_REVERSED',
  'EXPIRED',
  'GRACE_PERIOD_EXPIRED',
  'DID_FAIL_TO_RENEW',
  'DID_CHANGE_RENEWAL_STATUS',
  'SUBSCRIBED',
  'DID_RENEW',
  'OFFER_REDEEMED',
]);

/** Types that carry no entitlement change — record only. */
const INFORMATIONAL_TYPES = new Set([
  'PRICE_INCREASE',
  'REFUND_DECLINED',
  'CONSUMPTION_REQUEST',
  'RENEWAL_EXTENDED',
  'RENEWAL_EXTENSION',
  'TEST',
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const body = await req.json().catch(() => null);
  const signedPayload = body?.signedPayload;
  if (typeof signedPayload !== 'string') {
    return json({ error: 'signedPayload required' }, 400);
  }

  let notification: NotificationPayload;
  try {
    notification = await verifyAppleSignedPayload<NotificationPayload>(signedPayload);
  } catch (err) {
    console.warn('[apple-notifications] signature rejected:', (err as Error).message);
    return json({ error: 'Invalid Apple signature' }, 401);
  }

  if (!notification.notificationUUID || !notification.notificationType) {
    return json({ error: 'Malformed notification payload' }, 400);
  }

  // Reject stale replays (Apple retries for up to 3 days; anything older than
  // 7 days is not a legitimate delivery).
  if (notification.signedDate && Date.now() - notification.signedDate > 7 * 24 * 60 * 60 * 1000) {
    console.warn('[apple-notifications] stale notification rejected', notification.notificationType);
    return json({ error: 'Notification too old' }, 400);
  }

  const expectedBundleId = Deno.env.get('APPLE_BUNDLE_ID');
  if (expectedBundleId && notification.data?.bundleId && notification.data.bundleId !== expectedBundleId) {
    console.warn('[apple-notifications] bundleId mismatch');
    return json({ error: 'Bundle mismatch' }, 401);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ---- Idempotency gate -------------------------------------------------
  // Insert first; a unique-violation means Apple already delivered this
  // notificationUUID and it was processed. Ack without reprocessing.
  const { error: claimError } = await db.from('apple_notification_events').insert({
    notification_uuid: notification.notificationUUID,
    notification_type: notification.notificationType,
    notification_subtype: notification.subtype ?? null,
    environment: notification.data?.environment ?? null,
    signed_date: notification.signedDate ? new Date(notification.signedDate).toISOString() : null,
    status: 'received',
  });

  if (claimError) {
    if ((claimError as { code?: string }).code === '23505') {
      console.log('[apple-notifications] duplicate delivery ignored', notification.notificationType);
      return json({ ok: true, duplicate: true });
    }
    console.error('[apple-notifications] ledger insert failed:', claimError.message);
    // Fail closed so Apple retries rather than silently dropping the event.
    return json({ error: 'Ledger unavailable' }, 500);
  }

  const finish = async (
    status: string,
    detail: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => {
    await db
      .from('apple_notification_events')
      .update({ status, detail, processed_at: new Date().toISOString(), ...extra })
      .eq('notification_uuid', notification.notificationUUID);
  };

  const signedTx = notification.data?.signedTransactionInfo;
  if (!signedTx) {
    // TEST notifications and some types carry no transaction — ack so Apple
    // does not retry.
    await finish('acknowledged', { reason: 'no_transaction_info' });
    return json({ ok: true, acknowledged: notification.notificationType });
  }

  let tx: AppleTransactionPayload;
  try {
    tx = await verifyAppleSignedPayload<AppleTransactionPayload>(signedTx);
  } catch (err) {
    console.warn('[apple-notifications] transaction signature rejected:', (err as Error).message);
    await finish('rejected', { reason: 'invalid_transaction_signature' });
    return json({ error: 'Invalid transaction signature' }, 401);
  }

  if (expectedBundleId && tx.bundleId && tx.bundleId !== expectedBundleId) {
    await finish('rejected', { reason: 'bundle_mismatch' });
    return json({ error: 'Bundle mismatch' }, 401);
  }
  if (!tx.transactionId || !tx.originalTransactionId || !tx.productId) {
    await finish('rejected', { reason: 'incomplete_transaction' });
    return json({ error: 'Incomplete transaction payload' }, 400);
  }

  let renewal: AppleRenewalInfo | null = null;
  if (notification.data?.signedRenewalInfo) {
    try {
      renewal = await verifyAppleSignedPayload<AppleRenewalInfo>(notification.data.signedRenewalInfo);
    } catch {
      renewal = null;
    }
  }

  // Resolve the Auth0 user. Apple only gives us the appAccountToken we
  // attached at purchase time, or the original transaction id we have already
  // recorded. Both routes are server-side lookups — never caller-supplied.
  let userId: string | null = null;

  const { data: existing } = await db
    .from('apple_transactions')
    .select('user_id')
    .eq('original_transaction_id', tx.originalTransactionId)
    .limit(1)
    .maybeSingle();
  if (existing?.user_id) userId = existing.user_id as string;

  if (!userId) {
    const { data: byProfile } = await db
      .from('profiles')
      .select('id')
      .eq('apple_original_transaction_id', tx.originalTransactionId)
      .limit(1)
      .maybeSingle();
    if (byProfile?.id) userId = byProfile.id as string;
  }

  if (!userId) {
    // Unknown transaction — store nothing user-scoped, but ack so Apple stops
    // retrying. The client-side verify path will bind it on next launch.
    console.warn('[apple-notifications] unresolved user for notification', notification.notificationType);
    await finish('unresolved', { reason: 'user_not_found' }, {
      original_transaction_id: tx.originalTransactionId,
      transaction_id: tx.transactionId,
    });
    return json({ ok: true, unresolved: true });
  }

  // Re-verify against the App Store Server API for entitlement-changing
  // types. Apple's own signed status is authoritative and immune to
  // out-of-order notification delivery.
  let effective = tx;
  let effectiveRenewal = renewal;
  let reverified = false;
  if (REVERIFY_TYPES.has(notification.notificationType) && appStoreApiConfigured()) {
    const status = await getSubscriptionStatus(tx.originalTransactionId);
    if (status) {
      effective = status.transaction;
      effectiveRenewal = status.renewal ?? renewal;
      reverified = true;
    }
  }

  await recordAppleTransaction(db, userId, effective, {
    notificationType: notification.notificationType,
    notificationSubtype: notification.subtype,
    notificationUuid: notification.notificationUUID,
    signedDate: notification.signedDate,
    renewal: effectiveRenewal,
    raw: notification as unknown,
  });

  const entitlementChanging = !INFORMATIONAL_TYPES.has(notification.notificationType);
  const result = entitlementChanging
    ? await applyAppleEntitlement(db, userId, effective, {
        renewal: effectiveRenewal,
        notificationType: notification.notificationType,
        notificationSubtype: notification.subtype,
        notificationUuid: notification.notificationUUID,
        signedDate: notification.signedDate,
      })
    : { entitled: true };

  await db.from('subscription_events').insert({
    user_id: userId,
    event_type: `apple.${notification.notificationType}${notification.subtype ? `.${notification.subtype}` : ''}`,
    metadata: {
      notificationUUID: notification.notificationUUID,
      productId: effective.productId,
      environment: effective.environment ?? notification.data?.environment,
      reverified,
      entitled: result.entitled,
    },
  }).then(undefined, () => { /* analytics only — never block the ack */ });

  await finish('processed', {
    entitled: result.entitled,
    reverified,
    entitlementChanging,
  }, {
    user_id: userId,
    original_transaction_id: effective.originalTransactionId,
    transaction_id: effective.transactionId,
  });

  return json({ ok: true, entitled: result.entitled });
});