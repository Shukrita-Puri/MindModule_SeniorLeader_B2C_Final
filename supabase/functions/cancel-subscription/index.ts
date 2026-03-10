/**
 * Cancel Subscription Edge Function
 * 
 * Auth0 JWT verification → cancels subscription at period end via Stripe API.
 * Saves cancellation feedback.
 * Uses environment-based Stripe mode selection via _shared/stripe-config.ts.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { getStripeConfig } from "../_shared/stripe-config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req.headers.get('Authorization'));
    const { reason, reasonDetails, immediate } = await req.json();

    const stripeConfig = getStripeConfig();
    if (!stripeConfig.secretKey) throw new Error('Stripe not configured');

    const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2023-10-16' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user's subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_subscription_id')
      .eq('id', userId)
      .single();

    if (!profile?.stripe_subscription_id) {
      throw new Error('No active subscription found');
    }

    // Cancel in Stripe (at period end by default)
    const subscription = await stripe.subscriptions.update(
      profile.stripe_subscription_id,
      { cancel_at_period_end: !immediate }
    );

    const endsAt = new Date(subscription.current_period_end * 1000);

    // Update profile
    await supabase.from('profiles').update({
      subscription_cancel_at: endsAt.toISOString()
    }).eq('id', userId);

    // Save cancellation feedback
    await supabase.from('cancellation_feedback').insert({
      user_id: userId,
      reason: reason || 'other',
      reason_details: reasonDetails || null,
      retention_offer_shown: null,
      retention_offer_accepted: false
    });

    console.log(`[cancel-subscription] Canceled for ${userId}, ends at ${endsAt.toISOString()}`);

    return new Response(
      JSON.stringify({ success: true, endsAt: endsAt.toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[cancel-subscription] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
