import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.14.0?target=deno";
import { authenticateRequest } from "../_shared/auth.ts";
import { getStripeConfig } from "../_shared/stripe-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.errorResponse) return authResult.errorResponse;
    const userId = authResult.userId;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile, error: profileErr } = await db
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (profileErr || !profile?.stripe_customer_id) {
      console.error("[create-customer-portal] No stripe_customer_id for", userId);
      return new Response(
        JSON.stringify({ error: "No billing account found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripeConfig = getStripeConfig();
    if (!stripeConfig.secretKey) {
      console.error("[create-customer-portal] Stripe secret key not configured");
      return new Response(
        JSON.stringify({ error: "Billing service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const stripe = new Stripe(stripeConfig.secretKey, { apiVersion: "2023-10-16" });
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://wwwmindmoduleme.lovable.app";

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${frontendUrl}/profile`,
    });

    console.log(`[create-customer-portal] ✅ Portal session created for ${userId}`);

    return new Response(
      JSON.stringify({ portalUrl: session.url }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[create-customer-portal] Error:", err);
    return new Response(
      JSON.stringify({ error: "Failed to create portal session" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
