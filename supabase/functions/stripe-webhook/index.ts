/**
 * Stripe Webhook Handler
 * 
 * Processes Stripe events (no JWT auth — uses Stripe signature verification).
 * Handles: checkout.session.completed, customer.subscription.updated,
 * invoice.payment_succeeded, invoice.payment_failed, customer.subscription.deleted
 * 
 * Uses environment-based Stripe mode selection via _shared/stripe-config.ts.
 * 
 * Payment-only referral attribution:
 *   Signup attribution: handled here on checkout.session.completed (code from metadata or custom_fields)
 *   Conversion credit: handled here on subscription.updated → active
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";
import { getStripeConfig } from "../_shared/stripe-config.ts";

Deno.serve(async (req) => {
  const stripeConfig = getStripeConfig();

  if (!stripeConfig.secretKey || !stripeConfig.webhookSecret) {
    console.error('[stripe-webhook] Missing Stripe secret key or webhook secret');
    return new Response('Webhook not configured', { status: 500 });
  }

  const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: '2023-10-16' });

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeConfig.webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] Signature verification failed:', msg);
    return new Response(`Webhook Error: ${msg}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  console.log(`[stripe-webhook] Processing: ${event.type} (${stripeConfig.isLiveMode ? 'LIVE' : 'TEST'})`);

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;
        const currency = session.metadata?.currency;

        if (!userId) { console.warn('[stripe-webhook] No userId in metadata'); break; }

        // Idempotency: check if this event was already processed
        const { data: existingEvent } = await supabase
          .from('subscription_events')
          .select('id')
          .eq('stripe_event_id', event.id)
          .maybeSingle();

        if (existingEvent) {
          console.log(`[stripe-webhook] Event ${event.id} already processed, skipping`);
          break;
        }

        // Duplicate subscription guard: skip if profile already has this subscription
        const subId = session.subscription as string;
        if (subId) {
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('stripe_subscription_id, subscription_status')
            .eq('id', userId)
            .single();

          if (existingProfile?.stripe_subscription_id === subId &&
              (existingProfile.subscription_status === 'active' || existingProfile.subscription_status === 'trialing')) {
            console.log(`[stripe-webhook] Profile already has subscription ${subId}, skipping duplicate`);
            break;
          }
        }

        // Determine the paid tier from the plan metadata
        const paidTier = plan === 'annual' ? 'annual_pro' : 'monthly_pro';

        await supabase.from('profiles').update({
          subscription_status: 'trialing',
          subscription_tier: paidTier,
          subscription_currency: currency || 'USD',
          stripe_subscription_id: session.subscription as string,
          trial_ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        }).eq('id', userId);

        await supabase.from('subscription_events').insert({
          user_id: userId,
          event_type: 'trial_started',
          to_tier: paidTier,
          stripe_event_id: event.id,
          stripe_event_type: event.type,
          metadata: { plan, currency }
        });

        // ═══════════════════════════════════════════════════════════
        // PAYMENT-ONLY REFERRAL ATTRIBUTION
        // Extract code: metadata.referralCode (app flow) → custom_fields (Stripe-native)
        // Store in profiles.referral_code_used, then create attribution
        // ═══════════════════════════════════════════════════════════
        try {
          // Priority 1: metadata from create-checkout-session (app payment page)
          let referralCode = session.metadata?.referralCode?.trim().toUpperCase() || null;

          // Priority 2: Stripe Checkout custom_fields (native iOS manual entry)
          if (!referralCode) {
            const customFields = (session as any).custom_fields;
            const referralField = customFields?.find((f: any) => f.key === 'referral_code');
            referralCode = referralField?.text?.value?.trim().toUpperCase() || null;
          }

          if (referralCode) {
            // Find referrer by code
            const { data: referrer } = await supabase
              .from('user_referrals')
              .select('user_id')
              .eq('referral_code', referralCode)
              .maybeSingle();

            if (referrer && referrer.user_id !== userId) {
              // Store code in profiles for single source of truth
              await supabase.from('profiles').update({
                referral_code_used: referralCode,
                referral_code_entered_at: new Date().toISOString(),
              }).eq('id', userId);

              // Check for existing conversion (idempotency)
              const { data: existingConversion } = await supabase
                .from('referral_conversions')
                .select('id')
                .eq('referee_id', userId)
                .maybeSingle();

              if (!existingConversion) {
                // New signup attribution (trial start — no conversion yet)
                await supabase.from('referral_conversions').insert({
                  referrer_id: referrer.user_id,
                  referee_id: userId,
                  referral_code: referralCode,
                  signed_up_at: new Date().toISOString(),
                  converted_to_pro_at: null,
                });

                // Atomic increment: signup only
                await supabase.rpc('increment_referral_stats', {
                  p_referrer_id: referrer.user_id,
                  p_increment_signups: true,
                  p_increment_conversions: false,
                });

                console.log(`[stripe-webhook] Referral attribution: ${referralCode} → referrer ${referrer.user_id}`);
              }
            } else if (referrer && referrer.user_id === userId) {
              console.warn(`[stripe-webhook] Self-referral blocked: ${userId} used own code ${referralCode}`);
            }
          }
        } catch (refErr) {
          console.warn('[stripe-webhook] Referral attribution failed:', refErr);
        }

        console.log(`[stripe-webhook] Trial started for ${userId}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;
        if (!userId) break;

        // Idempotency check
        const { data: existingSubEvent } = await supabase
          .from('subscription_events')
          .select('id')
          .eq('stripe_event_id', event.id)
          .maybeSingle();

        if (existingSubEvent) {
          console.log(`[stripe-webhook] Event ${event.id} already processed, skipping`);
          break;
        }

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
              // Atomic credit referrer FIRST (handles 6-month cap + 90-day reset)
              // Do this before marking conversion so we don't mark credited if credit fails
              const { data: creditResult } = await supabase.rpc('credit_referrer_atomic', {
                p_referrer_id: conversion.referrer_id,
              });

              let rewardGranted = false;

              if (creditResult?.credited) {
                // Extend subscription_current_period_end by 1 month
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

                rewardGranted = true;
                console.log(`[stripe-webhook] ✅ Referral conversion credited: ${conversion.referral_code} → ${conversion.referrer_id} (${creditResult.new_credited}/6 months)`);
              } else {
                console.log(`[stripe-webhook] Referral credit skipped: ${creditResult?.reason || 'unknown'}`);
              }

              // NOW mark conversion as completed (after reward is secured)
              await supabase
                .from('referral_conversions')
                .update({
                  converted_to_pro_at: new Date().toISOString(),
                  credited_to_referrer: rewardGranted,
                  credited_at: rewardGranted ? new Date().toISOString() : null,
                })
                .eq('id', conversion.id);

              // Atomic increment: ONLY total_conversions (signups already done in Stage 1)
              await supabase.rpc('increment_referral_stats', {
                p_referrer_id: conversion.referrer_id,
                p_increment_signups: false,
                p_increment_conversions: true,
              });

              // Founding Member: attempt assignment for referrer on successful conversion
              try {
                const { data: fmResult } = await supabase.rpc('try_assign_founding_member', {
                  p_user_id: conversion.referrer_id,
                });
                if (fmResult === true) {
                  console.log(`[stripe-webhook] 🏅 Founding Member assigned to referrer ${conversion.referrer_id}`);
                }
              } catch (fmErr) {
                console.warn('[stripe-webhook] Founding Member assignment failed (non-critical):', fmErr);
              }
            }
          } catch (refErr) {
            // Non-critical — log but don't fail the webhook
            console.warn('[stripe-webhook] Referral credit check failed:', refErr);
          }
        } else if (subscription.status === 'trialing') {
          // Update period dates during trial too
          await supabase.from('profiles').update({
            subscription_status: 'trialing',
            subscription_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          }).eq('id', userId);
        } else if (subscription.status === 'past_due') {
          await supabase.from('profiles').update({
            subscription_status: 'past_due',
          }).eq('id', userId);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = sub.metadata?.userId;
        if (!userId) break;

        // Update period end on successful payment (handles renewals)
        await supabase.from('profiles').update({
          subscription_current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          subscription_current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        }).eq('id', userId);

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
