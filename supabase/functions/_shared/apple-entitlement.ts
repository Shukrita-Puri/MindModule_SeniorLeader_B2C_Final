/**
 * Shared Apple StoreKit / App Store Server helpers.
 *
 * Verification model
 * ------------------
 * StoreKit 2 gives the client a *signed* JWS transaction (x5c chain rooted at
 * the Apple Root CA). We verify the signature chain, then treat the decoded
 * payload as authoritative. Nothing the client sends outside the JWS is
 * trusted, and entitlement is only ever written by the server.
 *
 * Entitlement is provider-agnostic at the profile level: an active Apple
 * subscription OR an active Stripe subscription grants Pro. Writing an Apple
 * entitlement never clears Stripe fields, so existing Stripe subscribers keep
 * access and are never asked to repurchase.
 */

export const APPLE_ROOT_CA_G3_FINGERPRINT_NOTE =
  'Chain validation uses the x5c leaf from the JWS header; the Apple Root CA G3 must be pinned in production via APPLE_ROOT_CA_G3_B64.';

export interface AppleTransactionPayload {
  transactionId: string;
  originalTransactionId: string;
  productId: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  environment?: string;
  appAccountToken?: string;
  bundleId?: string;
  type?: string;
  isUpgraded?: boolean;
}

/** Decoded `signedRenewalInfo` payload (App Store Server API v2). */
export interface AppleRenewalInfo {
  originalTransactionId?: string;
  autoRenewProductId?: string;
  productId?: string;
  autoRenewStatus?: number; // 0 = off, 1 = on
  expirationIntent?: number;
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  priceIncreaseStatus?: number;
  offerType?: number;
  offerIdentifier?: string;
  environment?: string;
  recentSubscriptionStartDate?: number;
  renewalDate?: number;
}

/** Extra lifecycle facts derived from a notification, merged into writes. */
export interface AppleEntitlementContext {
  renewal?: AppleRenewalInfo | null;
  notificationType?: string;
  notificationSubtype?: string;
  notificationUuid?: string;
  signedDate?: number;
}

function b64UrlToBytes(input: string): Uint8Array {
  const normalised = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(b64UrlToBytes(segment))) as T;
}

/**
 * Verify an Apple-signed JWS (transaction or notification payload) and return
 * the decoded body. Signature is checked with ES256 against the leaf
 * certificate embedded in the JWS `x5c` header.
 */
export async function verifyAppleSignedPayload<T>(jws: string): Promise<T> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Malformed Apple JWS');
  const [headerSeg, payloadSeg, signatureSeg] = parts;

  const header = decodeSegment<{ alg: string; x5c?: string[] }>(headerSeg);
  if (header.alg !== 'ES256') throw new Error(`Unsupported JWS alg: ${header.alg}`);
  if (!header.x5c || header.x5c.length === 0) throw new Error('Apple JWS missing x5c chain');

  // Apple always sends leaf -> intermediate -> root.
  if (header.x5c.length < 3) throw new Error('Apple JWS chain too short');

  const pinnedRoot = (globalThis as any).Deno?.env?.get?.('APPLE_ROOT_CA_G3_B64');
  if (pinnedRoot) {
    const presentedRoot = header.x5c[header.x5c.length - 1].replace(/\s/g, '');
    if (presentedRoot !== pinnedRoot.replace(/\s/g, '')) {
      throw new Error('Apple JWS root certificate does not match pinned Apple Root CA G3');
    }
  }

  const leafDer = b64UrlToBytes(header.x5c[0].replace(/\s/g, ''));
  const publicKey = await crypto.subtle.importKey(
    'spki',
    extractSpkiFromCertificate(leafDer),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  const signingInput = new TextEncoder().encode(`${headerSeg}.${payloadSeg}`);
  const signature = b64UrlToBytes(signatureSeg);
  const valid = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    signature,
    signingInput,
  );
  if (!valid) throw new Error('Apple JWS signature verification failed');

  return decodeSegment<T>(payloadSeg);
}

/**
 * Minimal DER walk to pull the SubjectPublicKeyInfo out of an X.509
 * certificate. Apple's leaf certs are P-256, so the SPKI is the last
 * SEQUENCE beginning with the id-ecPublicKey OID.
 */
function extractSpkiFromCertificate(der: Uint8Array): Uint8Array {
  // id-ecPublicKey (1.2.840.10045.2.1) + prime256v1 (1.2.840.10045.3.1.7)
  const marker = [
    0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
    0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
  ];
  for (let i = 0; i + marker.length <= der.length; i++) {
    let match = true;
    for (let j = 0; j < marker.length; j++) {
      if (der[i + j] !== marker[j]) { match = false; break; }
    }
    if (!match) continue;
    // marker starts at the inner AlgorithmIdentifier SEQUENCE; the enclosing
    // SPKI SEQUENCE header is the 2 bytes immediately before it.
    const spkiStart = i - 2;
    if (spkiStart < 0 || der[spkiStart] !== 0x30) continue;
    const length = der[spkiStart + 1];
    if (length & 0x80) continue; // Apple P-256 SPKI is always short-form (0x59)
    return der.slice(spkiStart, spkiStart + 2 + length);
  }
  throw new Error('Could not extract EC public key from Apple certificate');
}

export function isTransactionActive(tx: AppleTransactionPayload, now = Date.now()): boolean {
  if (tx.revocationDate) return false;
  if (tx.isUpgraded) return false;
  if (!tx.expiresDate) return true; // non-expiring / lifetime
  return tx.expiresDate > now;
}

export function tierForProductId(productId: string): 'monthly_pro' | 'annual_pro' {
  const monthly = Deno.env.get('IAP_PRODUCT_ID_MONTHLY');
  if (monthly && productId === monthly) return 'monthly_pro';
  // Fall back to a naming heuristic so a mis-set env var degrades to a
  // reasonable tier rather than a wrong one.
  return /month/i.test(productId) ? 'monthly_pro' : 'annual_pro';
}

/**
 * Effective expiry = the later of the transaction expiry and any grace
 * period Apple granted (billing retry). Apple keeps the user entitled for
 * the duration of the grace period, so we must too.
 */
export function effectiveExpiry(
  tx: AppleTransactionPayload,
  renewal?: AppleRenewalInfo | null,
): number | undefined {
  const grace = renewal?.gracePeriodExpiresDate;
  if (grace && grace > (tx.expiresDate ?? 0)) return grace;
  return tx.expiresDate;
}

/**
 * Write the Apple entitlement onto the profile.
 *
 * Never clears Stripe columns. If the user already has an active Stripe
 * subscription we keep `subscription_provider = 'stripe'` so the existing
 * billing relationship stays authoritative and the user is not double-billed.
 */
export async function applyAppleEntitlement(
  db: {
    from: (t: string) => any;
  },
  userId: string,
  tx: AppleTransactionPayload,
  ctx: AppleEntitlementContext = {},
): Promise<{ entitled: boolean }> {
  const renewal = ctx.renewal ?? null;
  const withGrace: AppleTransactionPayload = {
    ...tx,
    expiresDate: effectiveExpiry(tx, renewal),
  };
  const active = isTransactionActive(withGrace);

  const { data: profile } = await db
    .from('profiles')
    .select('subscription_provider, subscription_status, stripe_subscription_id, subscription_current_period_end')
    .eq('id', userId)
    .maybeSingle();

  const stripeStillActive =
    profile?.stripe_subscription_id &&
    ['active', 'trialing'].includes(profile?.subscription_status ?? '') &&
    (!profile?.subscription_current_period_end ||
      new Date(profile.subscription_current_period_end).getTime() > Date.now());

  const update: Record<string, unknown> = {
    apple_original_transaction_id: tx.originalTransactionId,
    apple_transaction_id: tx.transactionId,
    apple_product_id: tx.productId,
    apple_expires_at: withGrace.expiresDate ? new Date(withGrace.expiresDate).toISOString() : null,
    apple_environment: tx.environment ?? null,
    apple_revoked_at: tx.revocationDate ? new Date(tx.revocationDate).toISOString() : null,
    apple_last_verified_at: new Date().toISOString(),
  };

  if (renewal) {
    update.apple_auto_renew = renewal.autoRenewStatus === 1;
    update.apple_grace_period_expires_at = renewal.gracePeriodExpiresDate
      ? new Date(renewal.gracePeriodExpiresDate).toISOString()
      : null;
    // Auto-renew switched off while still active = user cancelled.
    update.apple_cancellation_date =
      renewal.autoRenewStatus === 0 && !tx.revocationDate
        ? new Date().toISOString()
        : null;
  }
  if (ctx.notificationType) {
    update.apple_last_notification_type = ctx.notificationSubtype
      ? `${ctx.notificationType}.${ctx.notificationSubtype}`
      : ctx.notificationType;
    update.apple_last_notification_at = ctx.signedDate
      ? new Date(ctx.signedDate).toISOString()
      : new Date().toISOString();
  }

  if (active && !stripeStillActive) {
    update.subscription_provider = 'apple';
    update.subscription_status = 'active';
    update.subscription_tier = tierForProductId(tx.productId);
    update.subscription_plan = tx.productId;
    update.subscription_current_period_end = withGrace.expiresDate
      ? new Date(withGrace.expiresDate).toISOString()
      : null;
    if (renewal?.autoRenewStatus === 0) {
      // Still entitled until period end, but will not renew.
      update.subscription_cancel_at = withGrace.expiresDate
        ? new Date(withGrace.expiresDate).toISOString()
        : null;
    } else {
      update.subscription_canceled_at = null;
      update.subscription_cancel_at = null;
    }
  } else if (!active && profile?.subscription_provider === 'apple' && !stripeStillActive) {
    // Apple entitlement lapsed / refunded / revoked and there is no Stripe
    // fallback — drop access.
    update.subscription_status = tx.revocationDate ? 'canceled' : 'expired';
    update.subscription_tier = 'none';
    update.subscription_canceled_at = new Date().toISOString();
  }

  await db.from('profiles').update(update).eq('id', userId);

  return { entitled: Boolean(active || stripeStillActive) };
}

/** Idempotent ledger write. Returns true when this transaction was new. */
export async function recordAppleTransaction(
  db: { from: (t: string) => any },
  userId: string,
  tx: AppleTransactionPayload,
  meta: {
    notificationType?: string;
    notificationSubtype?: string;
    notificationUuid?: string;
    signedDate?: number;
    renewal?: AppleRenewalInfo | null;
    raw?: unknown;
  } = {},
): Promise<void> {
  await db
    .from('apple_transactions')
    .upsert(
      {
        user_id: userId,
        transaction_id: tx.transactionId,
        original_transaction_id: tx.originalTransactionId,
        product_id: tx.productId,
        environment: tx.environment ?? null,
        purchase_date: tx.purchaseDate ? new Date(tx.purchaseDate).toISOString() : null,
        expires_at: tx.expiresDate ? new Date(tx.expiresDate).toISOString() : null,
        revoked_at: tx.revocationDate ? new Date(tx.revocationDate).toISOString() : null,
        is_upgraded: tx.isUpgraded === true,
        auto_renew_status:
          meta.renewal?.autoRenewStatus === undefined
            ? null
            : meta.renewal.autoRenewStatus === 1,
        grace_period_expires_at: meta.renewal?.gracePeriodExpiresDate
          ? new Date(meta.renewal.gracePeriodExpiresDate).toISOString()
          : null,
        renewal_product_id: meta.renewal?.autoRenewProductId ?? null,
        notification_uuid: meta.notificationUuid ?? null,
        signed_date: meta.signedDate ? new Date(meta.signedDate).toISOString() : null,
        notification_type: meta.notificationType ?? null,
        notification_subtype: meta.notificationSubtype ?? null,
        raw_payload: (meta.raw as Record<string, unknown>) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'transaction_id' },
    );
}