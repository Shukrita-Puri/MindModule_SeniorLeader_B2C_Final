import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const APP_STORE_URL = "https://apps.apple.com/app/mind-module/id123456789";

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

    // Check if user already has a referral code – .maybeSingle() since may not exist
    const { data: existing } = await db
      .from("user_referrals")
      .select("referral_code, referral_link, total_signups, total_conversions")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify(existing), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's name for initials
    const { data: profile } = await db
      .from("profiles")
      .select("display_name, auth_name, full_name")
      .eq("id", userId)
      .single();

    const name = profile?.display_name || profile?.auth_name || profile?.full_name || "User";
    const firstName = name.split(" ")[0];
    const initials = firstName.substring(0, 2).toUpperCase();

    // Generate unique branded code: MM-{initials}-1MP-{3 random chars}
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let referralCode = "";
    let attempts = 0;

    while (attempts < 5) {
      let randomSuffix = "";
      for (let i = 0; i < 3; i++) {
        randomSuffix += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      referralCode = `MM-${initials}-1MP-${randomSuffix}`;

      // Check for collision – .maybeSingle() since we expect no match
      const { data: collision } = await db
        .from("user_referrals")
        .select("referral_code")
        .eq("referral_code", referralCode)
        .maybeSingle();

      if (!collision) break;
      attempts++;
    }

    if (attempts === 5) {
      return new Response(
        JSON.stringify({ error: "Could not generate unique code" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store App Store URL (not web join link)
    const referralLink = APP_STORE_URL;
    const { error } = await db.from("user_referrals").insert({
      user_id: userId,
      referral_code: referralCode,
      referral_link: referralLink,
    });

    if (error) {
      console.error("[generate-referral-link] Insert error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to create referral" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        referral_code: referralCode,
        referral_link: referralLink,
        total_signups: 0,
        total_conversions: 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[generate-referral-link] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
