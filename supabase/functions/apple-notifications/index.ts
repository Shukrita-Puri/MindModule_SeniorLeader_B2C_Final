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
} from '../_shared/apple-entitlement.ts';

interface NotificationPayload {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  data?: {
    bundleId?: string;
    environment?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
}

interface RenewalInfo {
  autoRenewStatus?: number;
  gracePeriodExpiresDate?: number;
  originalTransactionId?: string;
}

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

  const expectedBundleId = Deno.env.get('APPLE_BUNDLE_ID');
  if (expectedBundleId && notification.data?.bundleId && notification.data.bundleId !== expectedBundleId) {
    console.warn('[apple-notifications] bundleId mismatch:', notification.data.bundleId);
    return json({ error: 'Bundle mismatch' }, 401);
  }

  const signedTx = notification.data?.signedTransactionInfo;
  if (!signedTx) {
    // TEST notifications and some types carry no transaction — ack so Apple
    // does not retry.
    console.log('[apple-notifications] no transaction info for', notification.notificationType);
    return json({ ok: true, acknowledged: notification.notificationType });
  }

  let tx: AppleTransactionPayload;
  try {
    tx = await verifyAppleSignedPayload<AppleTransactionPayload>(signedTx);
  } catch (err) {
    console.warn('[apple-notifications] transaction signature rejected:', (err as Error).message);
    return json({ error: 'Invalid transaction signature' }, 401);
  }

  let renewal: RenewalInfo | null = null;
  if (notification.data?.signedRenewalInfo) {
    try {
      renewal = await verifyAppleSignedPayload<RenewalInfo>(notification.data.signedRenewalInfo);
    } catch {
      renewal = null;
    }
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

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
    console.warn('[apple-notifications] unresolved user for original txn', tx.originalTransactionId);
    return json({ ok: true, unresolved: true });
  }

  // Grace period / billing retry: Apple keeps the user entitled until the
  // grace period expires, so extend the effective expiry.
  const graceExpiry = renewal?.gracePeriodExpiresDate;
  const effective: AppleTransactionPayload = {
    ...tx,
    expiresDate:
      graceExpiry && graceExpiry > (tx.expiresDate ?? 0) ? graceExpiry : tx.expiresDate,
  };

  await recordAppleTransaction(db, userId, effective, {
    notificationType: notification.notificationType,
    notificationSubtype: notification.subtype,
    raw: notification as unknown,
  });

  const result = await applyAppleEntitlement(db, userId, effective);

  await db.from('subscription_events').insert({
    user_id: userId,
    event_type: `apple.${notification.notificationType}${notification.subtype ? `.${notification.subtype}` : ''}`,
    metadata: {
      notificationUUID: notification.notificationUUID,
      productId: tx.productId,
      environment: tx.environment ?? notification.data?.environment,
      entitled: result.entitled,
    },
  }).then(undefined, () => { /* analytics only — never block the ack */ });

  return json({ ok: true, entitled: result.entitled });
});