/**
 * Create Checkout Session Edge Function
 * 
 * Authenticates user via Auth0 JWT, gets/creates Stripe customer,
 * creates a Stripe Checkout Session with 7-day trial.
 * Accepts optional referralCode – validates and stores in Stripe session metadata.
 * 
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
    // Auth0 JWT verification
    const userId = await verifyAuth0JWT(req);

    const { plan, currency, referralCode } = await req.json();

    const stripeConfig = getStripeConfig();
    if (!stripeConfig.secretKey) {
      throw new Error('Stripe is not configured. Please add the Stripe secret key.');
    }

    const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2023-10-16' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, stripe_customer_id, subscription_status, stripe_subscription_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
    }

    // ═══════════════════════════════════════════════════════════
    // DUPLICATE SUBSCRIPTION GUARD
    // If user already has an active/trialing subscription, redirect to billing portal
    // ═══════════════════════════════════════════════════════════
    if (profile.subscription_status === 'active' || profile.subscription_status === 'trialing') {
      console.log(`[create-checkout-session] User ${userId} already has subscription (${profile.subscription_status}), redirecting to portal`);

      if (profile.stripe_customer_id) {
        const portalStripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2023-10-16' });
        const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://app.mindmodule.me';
        const portalSession = await portalStripe.billingPortal.sessions.create({
          customer: profile.stripe_customer_id,
          return_url: `${frontendUrl}/profile`,
        });

        return new Response(
          JSON.stringify({ alreadySubscribed: true, portalUrl: portalSession.url }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'You already have an active subscription.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get or create Stripe customer
    let customerId = profile.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        metadata: { userId }
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', userId);
    }

    // ═══════════════════════════════════════════════════════════
    // REFERRAL CODE VALIDATION (no attribution here – just validate for Stripe metadata)
    // Attribution happens in stripe-webhook on checkout.session.completed
    // ═══════════════════════════════════════════════════════════
    let validatedReferralCode: string | null = null;

    if (referralCode && typeof referralCode === 'string' && referralCode.trim()) {
      const code = referralCode.trim().toUpperCase();

      // Validate code exists and isn't self-referral
      const { data: referrer } = await supabase
        .from('user_referrals')
        .select('user_id')
        .eq('referral_code', code)
        .single();

      if (referrer && referrer.user_id !== userId) {
        validatedReferralCode = code;
        console.log(`[create-checkout-session] Validated referral code: ${code}`);
      } else if (referrer?.user_id === userId) {
        console.warn(`[create-checkout-session] User tried to use own referral code: ${code}`);
      } else {
        console.warn(`[create-checkout-session] Invalid referral code: ${code}`);
      }
    }

    // Price IDs from environment-based config
    const selectedCurrency = currency === 'GBP' ? 'GBP' : 'USD';
    const selectedPlan = plan === 'monthly' ? 'monthly' : 'annual';
    const priceId = stripeConfig.priceIds[selectedCurrency][selectedPlan];

    if (!priceId) {
      throw new Error(`Price ID not configured for ${selectedCurrency} ${selectedPlan}`);
    }

    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://app.mindmodule.me';

    // Build metadata (include referral code if validated)
    const sessionMetadata: Record<string, string> = {
      userId,
      plan: selectedPlan,
      currency: selectedCurrency,
    };
    if (validatedReferralCode) {
      sessionMetadata.referralCode = validatedReferralCode;
    }

    // Create checkout session with 7-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: sessionMetadata,
      },
      // Stripe Checkout custom field for referral code entry (native iOS users)
      custom_fields: [
        {
          key: 'referral_code',
          label: { type: 'custom', custom: 'Referral Code (optional)' },
          type: 'text',
          optional: true,
        },
      ],
      success_url: `${frontendUrl}/onboarding/context-connection?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/onboarding/payment`,
      metadata: sessionMetadata,
    });

    console.log(`[create-checkout-session] Session created for user ${userId}, plan: ${selectedPlan}, currency: ${selectedCurrency}${validatedReferralCode ? `, referral: ${validatedReferralCode}` : ''}, mode: ${stripeConfig.isLiveMode ? 'LIVE' : 'TEST'}`);

    return new Response(
      JSON.stringify({ sessionId: session.id, checkoutUrl: session.url }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[create-checkout-session] Error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
