/**
 * complete-onboarding: Persists onboarding results and sets onboarding_completed_at.
 * 
 * - Verifies Auth0 JWT
 * - Idempotent: only sets onboarding_completed_at if currently NULL
 * - Persists baseline, archetype, component_scores, and personalization tags
 * - Returns updated profile
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
    const userId = await verifyAuth0JWT(authHeader, req);

    const body = await req.json();
    const {
      mental_fitness_baseline,
      component_scores,
      user_archetype,
      practice_priority_tag,
      pressure_context_tag,
      onboarding_session_id,
      identity_role,
      biggest_pressure,
      emotional_awareness_response,
      stress_response_response,
      recovery_patterns_response,
      mental_clarity_response,
      growth_intention,
      skip_completion,
      onboarding_insight,
      archetype_description,
      archetype_title,
    } = body;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check current onboarding status
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("id", userId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[complete-onboarding] Fetch error:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Failed to check profile", detail: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build update payload – always persist results data
    const updateData: Record<string, unknown> = {};

    if (mental_fitness_baseline !== undefined) updateData.mental_fitness_baseline = mental_fitness_baseline;
    if (component_scores !== undefined) updateData.component_scores = component_scores;
    if (user_archetype !== undefined) updateData.user_archetype = user_archetype;
    if (practice_priority_tag !== undefined) updateData.practice_priority_tag = practice_priority_tag;
    if (pressure_context_tag !== undefined) updateData.pressure_context_tag = pressure_context_tag;
    if (onboarding_session_id !== undefined) updateData.onboarding_session_id = onboarding_session_id;
    if (identity_role !== undefined) updateData.identity_role = identity_role;
    if (biggest_pressure !== undefined) updateData.biggest_pressure = biggest_pressure;
    if (emotional_awareness_response !== undefined) updateData.energy_regulation_response = emotional_awareness_response;
    if (stress_response_response !== undefined) updateData.focus_recovery_response = stress_response_response;
    if (recovery_patterns_response !== undefined) updateData.energy_renewal_response = recovery_patterns_response;
    if (mental_clarity_response !== undefined) updateData.growth_priority = mental_clarity_response;
    if (onboarding_insight !== undefined) updateData.onboarding_insight = onboarding_insight;
    if (archetype_description !== undefined) updateData.archetype_description = archetype_description;
    if (archetype_title !== undefined) updateData.archetype_title = archetype_title;

    // Persist user_integrations if calendar/watch data provided
    const { calendar_provider, watch_type } = body;
    if (calendar_provider !== undefined || watch_type !== undefined) {
      const integrationData: Record<string, unknown> = {
        user_id: userId,
        updated_at: new Date().toISOString(),
      };
      if (calendar_provider !== undefined) {
        integrationData.calendar_provider = calendar_provider;
        if (calendar_provider) integrationData.calendar_connected_at = new Date().toISOString();
      }
      if (watch_type !== undefined) {
        integrationData.watch_type = watch_type;
        if (!watch_type) {
          // Explicitly clearing watch_type → mark disconnected
          integrationData.watch_connection_status = "disconnected";
          integrationData.watch_sync_status = "unknown";
          integrationData.watch_status_updated_at = new Date().toISOString();
          integrationData.watch_disconnected_at = new Date().toISOString();
        }
      }

      const { error: intErr } = await supabaseAdmin
        .from("user_integrations")
        .upsert(integrationData, { onConflict: "user_id" });

      if (intErr) {
        console.warn("[complete-onboarding] user_integrations upsert warning:", intErr);
      } else {
        console.log("[complete-onboarding] ✅ user_integrations saved for:", userId);
      }
    }

    // Idempotent: only set onboarding_completed_at if not already set
    // skip_completion=true allows persisting baseline data without marking onboarding as done
    if (skip_completion) {
      console.log("[complete-onboarding] skip_completion=true, persisting data only for user:", userId);
    } else if (!existing?.onboarding_completed_at) {
      updateData.onboarding_completed_at = new Date().toISOString();
      console.log("[complete-onboarding] Setting onboarding_completed_at for user:", userId);
    } else {
      console.log("[complete-onboarding] onboarding_completed_at already set, skipping timestamp update");
    }

    updateData.updated_at = new Date().toISOString();

    const { data: profile, error: updateErr } = await supabaseAdmin
      .from("profiles")
      .update(updateData)
      .eq("id", userId)
      .select("id, email, full_name, subscription_status, subscription_plan, onboarding_completed_at, mental_fitness_baseline, user_archetype")
      .single();

    if (updateErr) {
      console.error("[complete-onboarding] Update error:", updateErr);
      return new Response(
        JSON.stringify({ error: "Failed to update profile", detail: updateErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create initial mental fitness score if baseline provided and not already set
    if (mental_fitness_baseline && !existing?.onboarding_completed_at) {
      const { error: scoreErr } = await supabaseAdmin
        .from("mental_fitness_scores")
        .upsert({
          user_id: userId,
          score_date: new Date().toISOString().split("T")[0],
          score: mental_fitness_baseline,
          is_baseline_period: true,
          baseline_avg: mental_fitness_baseline,
        }, { onConflict: "user_id,score_date" });

      if (scoreErr) {
        console.warn("[complete-onboarding] Mental fitness score insert warning:", scoreErr);
      }
    }

    console.log("[complete-onboarding] ✅ Onboarding completed for:", userId);

    return new Response(
      JSON.stringify({ success: true, profile }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[complete-onboarding] Fatal error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
