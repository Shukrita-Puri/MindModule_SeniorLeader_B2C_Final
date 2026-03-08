/**
 * Credit Referrer Edge Function
 * 
 * Called by stripe-webhook (or other webhooks) to credit a referrer
 * with 1 month free using the atomic credit_referrer_atomic DB function.
 * 
 * This function uses atomic Postgres functions to prevent race conditions
 * on credited_months and enforces a 6-month cap per 90-day cycle.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { referrerId } = await req.json();

    if (!referrerId) {
      return new Response(
        JSON.stringify({ error: "Missing referrerId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Atomic credit (handles 6-month cap + 90-day reset)
    const { data: result, error: rpcError } = await supabase.rpc("credit_referrer_atomic", {
      p_referrer_id: referrerId,
    });

    if (rpcError) {
      console.error("[credit-referrer] RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: "Failed to credit referrer" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!result?.credited) {
      console.log(`[credit-referrer] Credit skipped for ${referrerId}: ${result?.reason}`);
      return new Response(
        JSON.stringify({
          message: `Referrer at cap (${result?.current_credited || 0}/6 months)`,
          credited: false,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extend subscription period by 1 month
    await supabase.rpc("extend_subscription", {
      p_user_id: referrerId,
      p_months: 1,
    });

    console.log(`[credit-referrer] ✅ Referrer ${referrerId} credited (${result.new_credited}/6 months)`);

    return new Response(
      JSON.stringify({
        message: `Referrer credited with 1 month (${result.new_credited}/6)`,
        credited: true,
        reset_occurred: result.reset_occurred,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[credit-referrer] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
