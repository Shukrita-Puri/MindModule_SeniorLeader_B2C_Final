/**
 * verify-apple-purchase
 *
 * Server-side verification of StoreKit 2 signed transactions. Called by the
 * iOS app after a purchase, after Restore Purchases, and on launch/resume.
 *
 * Guarantees:
 *  - Auth0 JWT required; the entitlement is always written for the *token's*
 *    user, never a caller-supplied id.
 *  - Signature of every JWS is verified before the payload is trusted.
 *  - Bundle id is checked against APPLE_BUNDLE_ID when configured.
 *  - Idempotent: re-posting the same transaction is a no-op upsert.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { authenticateRequest } from '../_shared/auth.ts';
import {
  verifyAppleSignedPayload,
  applyAppleEntitlement,
  recordAppleTransaction,
  isTransactionActive,
  type AppleTransactionPayload,
} from '../_shared/apple-entitlement.ts';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const auth = await authenticateRequest(req, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;
  const userId = auth.userId!;

  const body = await req.json().catch(() => ({}));
  const signedTransactions: unknown = body?.signedTransactions;
  if (!Array.isArray(signedTransactions) || signedTransactions.length === 0) {
    return json({ error: 'signedTransactions[] required' }, 400);
  }
  if (signedTransactions.length > 25) {
    return json({ error: 'Too many transactions in one request' }, 400);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const expectedBundleId = Deno.env.get('APPLE_BUNDLE_ID');
  let entitled = false;
  let newest: AppleTransactionPayload | null = null;
  const errors: string[] = [];

  for (const jws of signedTransactions) {
    if (typeof jws !== 'string') continue;
    let tx: AppleTransactionPayload;
    try {
      tx = await verifyAppleSignedPayload<AppleTransactionPayload>(jws);
    } catch (err) {
      errors.push((err as Error).message);
      continue;
    }

    if (expectedBundleId && tx.bundleId && tx.bundleId !== expectedBundleId) {
      errors.push(`bundleId mismatch: ${tx.bundleId}`);
      continue;
    }
    if (!tx.transactionId || !tx.originalTransactionId || !tx.productId) {
      errors.push('incomplete transaction payload');
      continue;
    }

    await recordAppleTransaction(db, userId, tx, {
      notificationType: body?.source ? `client_${body.source}` : 'client',
      raw: tx as unknown,
    });

    if (isTransactionActive(tx)) {
      if (!newest || (tx.expiresDate ?? Infinity) > (newest.expiresDate ?? Infinity)) {
        newest = tx;
      }
      entitled = true;
    } else if (!newest) {
      newest = tx;
    }
  }

  if (!newest) {
    return json({ error: 'No verifiable Apple transaction', details: errors }, 400);
  }

  const result = await applyAppleEntitlement(db, userId, newest);

  return json({
    ok: true,
    entitled: entitled || result.entitled,
    productId: newest.productId,
    expiresAt: newest.expiresDate ? new Date(newest.expiresDate).toISOString() : null,
    warnings: errors.length ? errors : undefined,
  });
});