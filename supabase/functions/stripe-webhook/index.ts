/**
 * Stripe Webhook Handler
 * 
 * Processes Stripe events (no JWT auth — uses Stripe signature verification).
 * Handles: checkout.session.completed, customer.subscription.updated,
 * invoice.payment_succeeded, invoice.payment_failed, customer.subscription.deleted
 * 
 * Two-stage referral attribution:
 *   Stage 1 (signup) handled by track-referral-signup edge function
 *   Stage 2 (conversion) handled here on subscription.updated → active
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";

Deno.serve(async (req) => {
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeKey || !webhookSecret) {
    console.error('[stripe-webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    return new Response('Webhook not configured', { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] Signature verification failed:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  console.log(`[stripe-webhook] Processing: ${event.type}`);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;
        const currency = session.metadata?.currency;

        if (!userId) { console.warn('[stripe-webhook] No userId in metadata'); break; }

        await supabase.from('profiles').update({
          subscription_status: 'trialing',
          subscription_tier: 'trial',
          subscription_currency: currency || 'USD',
          stripe_subscription_id: session.subscription as string,
          trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }).eq('id', userId);

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'trial_started',
          to_tier: 'trial',
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          metadata: { plan, currency }
        });

        // ═══════════════════════════════════════════════════════════
        // REFERRAL: Handle code entered in Stripe Checkout custom field
        // (Native iOS users who didn't come via /join/:code web flow)
        // This creates Stage 1 attribution if not already done
        // ═══════════════════════════════════════════════════════════
        try {
          const customFields = (session as any).custom_fields;
          const referralField = customFields?.find((f: any) => f.key === 'referral_code');
          const stripeEnteredCode = referralField?.text?.value?.trim().toUpperCase();

          if (stripeEnteredCode) {
            const { data: existingConversion } = await supabase
              .from('referral_conversions')
              .select('id')
              .eq('referee_id', userId)
              .maybeSingle();

            if (!existingConversion) {
              const { data: referrer } = await supabase
                .from('user_referrals')
                .select('user_id')
                .eq('referral_code', stripeEnteredCode)
                .single();

              if (referrer && referrer.user_id !== userId) {
                await supabase.from('referral_conversions').insert({
                  referrer_id: referrer.user_id,
                  referee_id: userId,
                  referral_code: stripeEnteredCode,
                  signed_up_at: new Date().toISOString(),
                  converted_to_pro_at: null,
                });

                // Atomic increment: signup only
                await supabase.rpc('increment_referral_stats', {
                  p_referrer_id: referrer.user_id,
                  p_increment_signups: true,
                  p_increment_conversions: false,
                });

                console.log(`[stripe-webhook] Referral from Stripe field: ${stripeEnteredCode} → referrer ${referrer.user_id}`);
              }
            }
          }
        } catch (refErr) {
          console.warn('[stripe-webhook] Referral custom field processing failed:', refErr);
        }

        console.log(`[stripe-webhook] Trial started for ${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        // Check if trial converted to active
        if (subscription.status === 'active') {
          const tier = subscription.items.data[0]?.price?.recurring?.interval === 'year'
            ? 'annual_pro' : 'monthly_pro';

          await supabase.from('profiles').update({
            subscription_status: 'active',
            subscription_tier: tier,
            subscription_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            trial_ends_at: null
          }).eq('id', userId);

          await supabase.from('subscription_events').insert({
            user_id: userId,
            event_type: 'trial_converted',
            from_tier: 'trial',
            to_tier: tier,
            stripe_event_id: event.id,
            stripe_event_type: event.type
          });

          console.log(`[stripe-webhook] Subscription active for ${userId}: ${tier}`);

          // ═══════════════════════════════════════════════════════════
          // STAGE 2: REFERRAL CONVERSION — Credit referrer on Pro purchase
          // Only fires for paid plans (not 7-day trial)
          // ═══════════════════════════════════════════════════════════
          try {
            // Find uncredited conversion for this user — .maybeSingle() since may not exist
            const { data: conversion } = await supabase
              .from('referral_conversions')
              .select('id, referrer_id, referral_code, credited_to_referrer, converted_to_pro_at')
              .eq('referee_id', userId)
              .maybeSingle();

            if (conversion && conversion.referrer_id && !conversion.converted_to_pro_at) {
              // Mark conversion as completed
              await supabase
                .from('referral_conversions')
                .update({
                  converted_to_pro_at: new Date().toISOString(),
                  credited_to_referrer: true,
                  credited_at: new Date().toISOString(),
                })
                .eq('id', conversion.id);

              // Atomic increment: ONLY total_conversions (signups already done in Stage 1)
              await supabase.rpc('increment_referral_stats', {
                p_referrer_id: conversion.referrer_id,
                p_increment_signups: false,
                p_increment_conversions: true,
              });

              // Atomic credit referrer (handles 6-month cap + 90-day reset)
              const { data: creditResult } = await supabase.rpc('credit_referrer_atomic', {
                p_referrer_id: conversion.referrer_id,
              });

              if (creditResult?.credited) {
                // Also extend subscription_current_period_end by 1 month
                await supabase.rpc('extend_subscription', {
                  p_user_id: conversion.referrer_id,
                  p_months: 1,
                });

                // Apply Stripe balance credit for the referrer
                const { data: referrerProfile } = await supabase
                  .from('profiles')
                  .select('stripe_subscription_id')
                  .eq('id', conversion.referrer_id)
                  .single();

                if (referrerProfile?.stripe_subscription_id) {
                  try {
                    const refSub = await stripe.subscriptions.retrieve(referrerProfile.stripe_subscription_id);
                    const customer = refSub.customer as string;
                    const priceAmount = refSub.items.data[0]?.price?.unit_amount || 0;

                    if (priceAmount > 0) {
                      await stripe.customers.createBalanceTransaction(customer, {
                        amount: -priceAmount, // Negative = credit
                        currency: refSub.items.data[0]?.price?.currency || 'usd',
                        description: `Referral credit: ${conversion.referral_code}`,
                      });
                      console.log(`[stripe-webhook] ✅ Credited ${priceAmount} to referrer ${conversion.referrer_id}`);
                    }
                  } catch (stripeErr) {
                    console.warn('[stripe-webhook] Failed to credit Stripe balance:', stripeErr);
                  }
                }

                console.log(`[stripe-webhook] ✅ Referral conversion credited: ${conversion.referral_code} → ${conversion.referrer_id} (${creditResult.new_credited}/6 months)`);
              } else {
                console.log(`[stripe-webhook] Referral credit skipped: ${creditResult?.reason || 'unknown'}`);
              }
            }
          } catch (refErr) {
            // Non-critical — log but don't fail the webhook
            console.warn('[stripe-webhook] Referral credit check failed:', refErr);
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'payment_succeeded',
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          metadata: { amount: invoice.amount_paid, currency: invoice.currency }
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = sub.metadata?.userId;
        if (!userId) break;

        await supabase.from('profiles').update({
          subscription_status: 'past_due'
        }).eq('id', userId);

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'payment_failed',
          stripe_event_id: event.id,
          stripe_event_type: event.type
        });

        console.log(`[stripe-webhook] Payment failed for ${userId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const fromTier = subscription.items.data[0]?.price?.recurring?.interval === 'year'
          ? 'annual_pro' : 'monthly_pro';

        await supabase.from('profiles').update({
          subscription_status: 'canceled',
          subscription_tier: 'none',
          subscription_canceled_at: new Date().toISOString()
        }).eq('id', userId);

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'subscription_canceled',
          from_tier: fromTier,
          to_tier: 'none',
          stripe_event_id: event.id,
          stripe_event_type: event.type
        });

        console.log(`[stripe-webhook] Subscription canceled for ${userId}`);
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[stripe-webhook] Error processing ${event.type}:`, msg);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
});
