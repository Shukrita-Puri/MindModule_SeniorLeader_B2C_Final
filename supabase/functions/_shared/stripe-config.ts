/**
 * Shared Stripe Configuration
 * 
 * Resolves the correct Stripe secret key, webhook secret, and price IDs
 * based on APP_ENV. Defaults to test mode when APP_ENV is not set.
 * 
 * Rules:
 *   development | staging → Stripe Test Mode
 *   production → Stripe Live Mode
 */

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceIds: {
    GBP: { monthly: string; annual: string };
    USD: { monthly: string; annual: string };
  };
  isLiveMode: boolean;
}

export function getStripeConfig(): StripeConfig {
  const appEnv = (Deno.env.get('APP_ENV') || 'development').toLowerCase();
  const isLive = appEnv === 'production';

  const prefix = isLive ? '' : 'TEST_';
  const envPrefix = isLive ? 'STRIPE_' : 'STRIPE_TEST_';

  const secretKey = Deno.env.get(`${envPrefix}SECRET_KEY`) || Deno.env.get('STRIPE_SECRET_KEY') || '';
  const webhookSecret = Deno.env.get(`${envPrefix}WEBHOOK_SECRET`) || Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

  if (!secretKey) {
    console.error(`[stripe-config] ❌ FATAL: No Stripe secret key found. Expected ${envPrefix}SECRET_KEY or STRIPE_SECRET_KEY in Supabase secrets. Payments will fail.`);
  }
  if (!webhookSecret) {
    console.warn(`[stripe-config] ⚠️ No webhook secret found. Expected ${envPrefix}WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET. Webhook signature verification will fail.`);
  }

  const priceIds = {
    GBP: {
      monthly: Deno.env.get(`${envPrefix}PRICE_GBP_MONTHLY`) || Deno.env.get('STRIPE_PRICE_GBP_MONTHLY') || '',
      annual: Deno.env.get(`${envPrefix}PRICE_GBP_ANNUAL`) || Deno.env.get('STRIPE_PRICE_GBP_ANNUAL') || '',
    },
    USD: {
      monthly: Deno.env.get(`${envPrefix}PRICE_USD_MONTHLY`) || Deno.env.get('STRIPE_PRICE_USD_MONTHLY') || '',
      annual: Deno.env.get(`${envPrefix}PRICE_USD_ANNUAL`) || Deno.env.get('STRIPE_PRICE_USD_ANNUAL') || '',
    },
  };

  console.log(`[stripe-config] Mode: ${isLive ? 'LIVE' : 'TEST'} (APP_ENV=${appEnv})`);

  return { secretKey, webhookSecret, priceIds, isLiveMode: isLive };
}
