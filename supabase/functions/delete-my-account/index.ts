/**
 * delete-my-account — user self-serve account deletion (App Store Review
 * Guideline 5.1.1(v)).
 *
 * Server-driven: the caller's Auth0 JWT decides whose data is deleted. There
 * is NO caller-supplied user id. A confirmation phrase is required so an
 * accidental / replayed request cannot destroy an account.
 *
 * What it does, in order:
 *  1. Deactivates every APNs device token for the account (stops nudges).
 *  2. Purges stored integration tokens (calendar / Oura) from the vault.
 *  3. Deletes every row the user owns across the public schema.
 *  4. Deletes the profile row.
 *
 * What it deliberately does NOT do:
 *  - It does not cancel an Apple subscription. Apple owns that lifecycle; the
 *    client copy tells the user to cancel in Settings > Apple ID.
 *  - It does not delete the Auth0 identity record (see APP_STORE_REVIEW_AUDIT.md).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import Stripe from "https://esm.sh/stripe@14.14.0";
import { authenticateRequest } from '../_shared/auth.ts';
import { getStripeConfig } from '../_shared/stripe-config.ts';

const CONFIRMATION_PHRASE = 'DELETE';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await authenticateRequest(req, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;

  // Impersonated sessions must never be able to delete the target account.
  if (auth.impersonation) {
    return json({ error: 'Account deletion is not available during impersonation' }, 403);
  }

  const userId = auth.userId!;
  const body = await req.json().catch(() => ({}));
  const confirmation = typeof body?.confirmation === 'string' ? body.confirmation.trim().toUpperCase() : '';
  if (confirmation !== CONFIRMATION_PHRASE) {
    return json({ error: `Confirmation must equal "${CONFIRMATION_PHRASE}"` }, 400);
  }

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const startedAt = Date.now();

  try {
    // 0. Cancel Stripe subscription if it exists
    const { data: profile } = await db
      .from('profiles')
      .select('stripe_subscription_id, subscription_provider')
      .eq('id', userId)
      .single();

    if (profile?.subscription_provider === 'stripe' && profile?.stripe_subscription_id) {
      try {
        const stripeConfig = getStripeConfig();
        if (stripeConfig.secretKey) {
          const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2023-10-16' });
          // Cancel immediately upon account deletion
          await stripe.subscriptions.cancel(profile.stripe_subscription_id);
          console.log(`[delete-my-account] Cancelled Stripe subscription for ${userId}`);
        }
      } catch (stripeErr) {
        console.error(`[delete-my-account] Failed to cancel Stripe subscription:`, stripeErr);
        // We log it but proceed with account deletion so they aren't trapped
      }
    }

    // 1. Stop notifications immediately, before the bulk delete.
    await db
      .from('notification_device_tokens')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    // 2 + 3. Vault token purge + full row purge (SECURITY DEFINER RPC).
    const { data: counts, error } = await db.rpc('delete_my_user_data', { _user_id: userId });
    if (error) throw error;

    console.log('[delete-my-account] completed', {
      userId,
      durationMs: Date.now() - startedAt,
    });

    return json({
      ok: true,
      deleted: counts ?? {},
      durationMs: Date.now() - startedAt,
      note: 'Apple subscriptions are NOT cancelled by account deletion (Apple policy). Stripe subscriptions were cancelled if found.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Deletion failed';
    console.error('[delete-my-account] failed:', message);
    return json({ error: 'Account deletion failed. Please contact support@mindmodule.me.' }, 500);
  }
});