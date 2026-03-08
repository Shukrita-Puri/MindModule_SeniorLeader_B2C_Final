import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

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

    const { referralCode } = await req.json();

    if (!referralCode) {
      return new Response(
        JSON.stringify({ message: "No referral code provided" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find referrer (referral_code is UNIQUE — .single() is correct)
    const { data: referrer, error: referrerError } = await db
      .from("user_referrals")
      .select("user_id")
      .eq("referral_code", referralCode)
      .single();

    if (referrerError || !referrer) {
      return new Response(
        JSON.stringify({ error: "Invalid referral code" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No self-referral
    if (referrer.user_id === userId) {
      return new Response(
        JSON.stringify({ error: "Cannot refer yourself" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already tracked — .maybeSingle() since record may not exist
    const { data: existingConversion } = await db
      .from("referral_conversions")
      .select("id")
      .eq("referee_id", userId)
      .maybeSingle();

    if (existingConversion) {
      return new Response(
        JSON.stringify({ message: "Already tracked" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create conversion record (Stage 1: signup only, no converted_to_pro_at)
    await db.from("referral_conversions").insert({
      referrer_id: referrer.user_id,
      referee_id: userId,
      referral_code: referralCode,
      signed_up_at: new Date().toISOString(),
      converted_to_pro_at: null,
    });

    // Atomic increment: ONLY total_signups (not conversions — that's Stage 2)
    await db.rpc("increment_referral_stats", {
      p_referrer_id: referrer.user_id,
      p_increment_signups: true,
      p_increment_conversions: false,
    });

    console.log(`[track-referral-signup] ✅ Signup tracked: ${referralCode} → ${userId}`);

    return new Response(
      JSON.stringify({ message: "Signup tracked" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[track-referral-signup] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
