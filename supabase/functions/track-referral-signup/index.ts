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

    // Find referrer
    const { data: referrer } = await db
      .from("user_referrals")
      .select("user_id, total_signups")
      .eq("referral_code", referralCode)
      .single();

    if (!referrer) {
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

    // Check if already referred
    const { data: existingConversion } = await db
      .from("referral_conversions")
      .select("id")
      .eq("referee_id", userId)
      .single();

    if (existingConversion) {
      return new Response(
        JSON.stringify({ message: "User already referred" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Record conversion
    await db.from("referral_conversions").insert({
      referrer_id: referrer.user_id,
      referee_id: userId,
      referral_code: referralCode,
      signed_up_at: new Date().toISOString(),
    });

    // Increment signup count
    await db
      .from("user_referrals")
      .update({ total_signups: (referrer.total_signups || 0) + 1 })
      .eq("user_id", referrer.user_id);

    console.log(`[track-referral-signup] ✅ Referral tracked: ${referralCode} → ${userId}`);

    return new Response(
      JSON.stringify({ message: "Referral tracked" }),
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
