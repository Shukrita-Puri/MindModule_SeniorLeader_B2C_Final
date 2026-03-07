/**
 * reset-onboarding: Resets onboarding fields on a user's profile for re-entry.
 * 
 * - Verifies Auth0 JWT
 * - Nulls out all onboarding-related fields on profiles (keeps the row for analytics)
 * - Deletes onboarding_progress row
 * - Deletes user_integrations row
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const userId = await verifyAuth0JWT(authHeader);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Null out all onboarding-related fields on profiles (keep row for analytics)
    const { error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update({
        onboarding_completed_at: null,
        mental_fitness_baseline: null,
        component_scores: null,
        user_archetype: null,
        identity_role: null,
        biggest_pressure: null,
        energy_regulation_response: null,
        focus_recovery_response: null,
        energy_renewal_response: null,
        growth_priority: null,
        practice_priority_tag: null,
        pressure_context_tag: null,
        onboarding_session_id: null,
        onboarding_insight: null,
        archetype_description: null,
        archetype_title: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (updateErr) {
      console.error("[reset-onboarding] Profile update error:", updateErr);
      return new Response(
        JSON.stringify({ error: "Failed to reset profile", detail: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Delete onboarding_progress row
    const { error: progressErr } = await supabaseAdmin
      .from("onboarding_progress")
      .delete()
      .eq("user_id", userId);

    if (progressErr) {
      console.warn("[reset-onboarding] onboarding_progress delete warning:", progressErr);
    }

    // 3. Delete user_integrations row
    const { error: intErr } = await supabaseAdmin
      .from("user_integrations")
      .delete()
      .eq("user_id", userId);

    if (intErr) {
      console.warn("[reset-onboarding] user_integrations delete warning:", intErr);
    }

    console.log("[reset-onboarding] ✅ Onboarding reset for user:", userId);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[reset-onboarding] Fatal error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
