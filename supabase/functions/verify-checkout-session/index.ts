/**
 * Verify Checkout Session Edge Function
 *
 * Called from the /upgrade return page immediately after Stripe redirects
 * the user back with ?session_id=cs_.... Confirms with Stripe directly
 * (instead of waiting for the webhook) and mirrors the subscription state
 * into `profiles`, so access can be unlocked in a few seconds.
 *
 * The Stripe webhook remains the source of truth — this function is
 * idempotent and only updates the profile when Stripe reports a
 * trialing/active subscription tied to the authenticated user.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { getStripeConfig } from "../_shared/stripe-config.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function mapStatus(stripeStatus: string | undefined): string {
  switch (stripeStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "unpaid":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
      return "inactive";
    default:
      return stripeStatus ?? "inactive";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req);

    let body: { sessionId?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const sessionId = (body.sessionId || "").trim();
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return json({ error: "Invalid sessionId" }, 400);
    }

    const stripeConfig = getStripeConfig();
    if (!stripeConfig.secretKey) {
      return json({ error: "Stripe is not configured" }, 500);
    }
    const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: "2023-10-16" });

    // Retrieve Checkout Session, expanding subscription so we get the full
    // record in a single round-trip.
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });

    // Ownership check — this is the critical security gate.
    const sessionUserId = session.metadata?.userId;
    if (!sessionUserId || sessionUserId !== userId) {
      console.warn(
        `[verify-checkout-session] Ownership mismatch for ${redactUserId(userId)} on ${sessionId}`,
      );
      return json({ error: "Session does not belong to authenticated user" }, 403);
    }

    if (session.status !== "complete") {
      return json({
        success: true,
        accessGranted: false,
        reason: `checkout_status_${session.status ?? "unknown"}`,
      });
    }

    const subscription = typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription as Stripe.Subscription | null;

    if (!subscription) {
      return json({ success: true, accessGranted: false, reason: "subscription_not_ready" });
    }

    const stripeStatus = subscription.status;
    if (stripeStatus !== "trialing" && stripeStatus !== "active") {
      return json({
        success: true,
        accessGranted: false,
        reason: `subscription_status_${stripeStatus}`,
      });
    }

    const interval = subscription.items.data[0]?.price?.recurring?.interval;
    const metaPlan = session.metadata?.plan;
    const tier = interval === "year" || metaPlan === "annual" ? "annual_pro" : "monthly_pro";
    const currency = session.metadata?.currency
      || subscription.items.data[0]?.price?.currency?.toUpperCase()
      || "USD";

    const status = mapStatus(stripeStatus);
    const customerId = typeof session.customer === "string"
      ? session.customer
      : (session.customer as Stripe.Customer | null)?.id ?? null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const update: Record<string, unknown> = {
      subscription_status: status,
      subscription_tier: tier,
      subscription_currency: currency,
      stripe_subscription_id: subscription.id,
      subscription_current_period_start: subscription.current_period_start
        ? new Date(subscription.current_period_start * 1000).toISOString()
        : null,
      subscription_current_period_end: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null,
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      // Clear any prior cancellation stamps — a successful new checkout
      // supersedes them, otherwise the UI keeps rendering "Canceled".
      subscription_canceled_at: null,
      subscription_cancel_at: null,
    };
    if (customerId) update.stripe_customer_id = customerId;

    const { error: updateErr } = await supabase
      .from("profiles")
      .update(update)
      .eq("id", userId);

    if (updateErr) {
      console.error("[verify-checkout-session] profile update failed:", updateErr.message);
      return json({ error: "Failed to update profile" }, 500);
    }

    // Idempotent event insert — use a synthetic stripe_event_id keyed to the
    // checkout session so re-runs of this function don't duplicate rows and
    // don't collide with the real webhook event id.
    const eventKey = `verify_checkout_session:${sessionId}`;
    const { data: existing } = await supabase
      .from("subscription_events")
      .select("id")
      .eq("stripe_event_id", eventKey)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from("subscription_events").insert({
        user_id: userId,
        event_type: status === "active" ? "subscription_started" : "trial_started",
        to_tier: tier,
        stripe_event_id: eventKey,
        stripe_event_type: "verify_checkout_session",
        metadata: {
          plan: metaPlan ?? null,
          currency,
          stripe_status: stripeStatus,
          checkout_session_id: sessionId,
          source: "verify-checkout-session",
        },
      });
      if (insertErr) {
        console.warn(
          "[verify-checkout-session] subscription_events insert failed (non-fatal):",
          insertErr.message,
        );
      }
    }

    console.log(
      `[verify-checkout-session] Access granted for ${redactUserId(userId)} tier=${tier} status=${status}`,
    );

    return json({ success: true, accessGranted: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isAuth = /jwt|token|unauthor/i.test(message);
    console.error("[verify-checkout-session] Error:", message);
    return json({ error: message }, isAuth ? 401 : 500);
  }
});
