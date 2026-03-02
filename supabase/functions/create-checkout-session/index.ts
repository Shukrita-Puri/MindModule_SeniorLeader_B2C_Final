/**
 * Create Checkout Session Edge Function
 * 
 * Authenticates user via Auth0 JWT, gets/creates Stripe customer,
 * creates a Stripe Checkout Session with 7-day trial.
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

    const { plan, currency } = await req.json();

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

    // Create checkout session with 7-day trial
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
        metadata: { userId, plan: selectedPlan, currency: selectedCurrency }
      },
      success_url: `${frontendUrl}/onboarding/context-connection?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/onboarding/payment`,
      metadata: { userId, plan: selectedPlan, currency: selectedCurrency }
    });

    console.log(`[create-checkout-session] Session created for user ${userId}, plan: ${selectedPlan}, currency: ${selectedCurrency}`);

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
