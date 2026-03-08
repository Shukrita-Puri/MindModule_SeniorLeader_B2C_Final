/**
 * Create Checkout Session Edge Function
 * 
 * Authenticates user via Auth0 JWT, gets/creates Stripe customer,
 * creates a Stripe Checkout Session with 7-day trial.
 * Accepts optional referralCode — validates and stores in Stripe metadata.
 * 
 * NOTE: Referral signup attribution (Stage 1) is handled by track-referral-signup
 * at onboarding completion. This function only passes the code to Stripe metadata
 * so the webhook can process Stage 2 conversion attribution.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { verifyAuth0JWT } from "../_shared/auth.ts";

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
    const userId = await verifyAuth0JWT(req.headers.get('Authorization'));

    const { plan, currency, referralCode } = await req.json();

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      throw new Error('Stripe is not configured. Please add STRIPE_SECRET_KEY.');
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw new Error('User profile not found');
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
    // REFERRAL CODE VALIDATION (no attribution here — just validate for Stripe metadata)
    // Stage 1 attribution happens at onboarding completion via track-referral-signup
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

    // Price IDs from secrets
    const priceIds: Record<string, Record<string, string>> = {
      GBP: {
        monthly: Deno.env.get('STRIPE_PRICE_GBP_MONTHLY') || '',
        annual: Deno.env.get('STRIPE_PRICE_GBP_ANNUAL') || ''
      },
      USD: {
        monthly: Deno.env.get('STRIPE_PRICE_USD_MONTHLY') || '',
        annual: Deno.env.get('STRIPE_PRICE_USD_ANNUAL') || ''
      }
    };

    const selectedCurrency = currency === 'GBP' ? 'GBP' : 'USD';
    const selectedPlan = plan === 'monthly' ? 'monthly' : 'annual';
    const priceId = priceIds[selectedCurrency][selectedPlan];

    if (!priceId) {
      throw new Error(`Price ID not configured for ${selectedCurrency} ${selectedPlan}`);
    }

    const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://wwwmindmoduleme.lovable.app';

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

    console.log(`[create-checkout-session] Session created for user ${userId}, plan: ${selectedPlan}, currency: ${selectedCurrency}${validatedReferralCode ? `, referral: ${validatedReferralCode}` : ''}`);

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
