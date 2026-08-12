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
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { sanitizePayload, validateForCompletion } from "../_shared/onboardingV8Validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
};

function derivePracticeTagFromGoals(goals: string[]): string {
  const g = goals.join(' ').toLowerCase();
  if (g.includes('board') || g.includes('governance')) return 'regulation_composure';
  if (g.includes('focus') || g.includes('deep_work')) return 'focus_clarity';
  if (g.includes('energy') || g.includes('recovery')) return 'energy_endurance';
  if (g.includes('pressure') || g.includes('resilience')) return 'regulation_early';
  if (g.includes('mindset') || g.includes('reframe')) return 'mindset_reframe';
  return 'regulation_composure'; // safe default
}

function derivePressureTagFromChips(stakes: string[], burden: string[]): string {
  const all = [...stakes, ...burden].join(' ').toLowerCase();
  if (all.includes('board') || all.includes('investor')) return 'high_stakes_executive';
  if (all.includes('people') || all.includes('conflict') || all.includes('team')) return 'interpersonal_pressure';
  if (all.includes('travel') || all.includes('load') || all.includes('volume')) return 'operational_load';
  return 'high_stakes_executive';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const userId = await verifyAuth0JWT(authHeader, req);

    const body = await req.json();
    const {
      onboarding_version,
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
      force_bypass_validation,
      onboarding_insight,
      archetype_description,
      archetype_title,
      self_check_ins_enabled,
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

    let v8Row: any = null;
    if (onboarding_version === "v8") {
      const { data: fetchedV8Row, error: v8FetchError } = await supabaseAdmin
        .from("onboarding_v8_responses")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      v8Row = fetchedV8Row;
      if (v8FetchError) {
        console.error("[complete-onboarding] v8 fetch error:", v8FetchError);
        return new Response(
          JSON.stringify({ error: "Failed to load onboarding_v8_responses", detail: v8FetchError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const force_bypass_validation = body.force_bypass_validation === true;

      if (!v8Row) {
        if (force_bypass_validation) {
          v8Row = { user_id: userId, step_status: {} };
        } else {
          return new Response(
            JSON.stringify({ error: "missing_v8_row" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const sanitized = sanitizePayload(v8Row as Record<string, unknown>);
      
      if (!force_bypass_validation) {
        const validationErrors = validateForCompletion(sanitized);
        if (validationErrors.length > 0) {
          return new Response(
            JSON.stringify({ error: "validation_failed", errors: validationErrors }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const completedAt = existing?.onboarding_completed_at ?? new Date().toISOString();
      const { error: v8UpdateError } = await supabaseAdmin
        .from("onboarding_v8_responses")
        .upsert({
          user_id: userId,
          completed_at: v8Row.completed_at ?? completedAt,
          step_status: {
            ...((v8Row.step_status as Record<string, unknown> | null) ?? {}),
            connect: "completed",
          },
        })
        .eq("user_id", userId);
      if (v8UpdateError) {
        console.error("[complete-onboarding] v8 update error:", v8UpdateError);
        return new Response(
          JSON.stringify({ error: "Failed to update onboarding_v8_responses", detail: v8UpdateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Build update payload – always persist results data
    const updateData: Record<string, unknown> = {};

    // ── v8 personality field derivation ──────────────────────────
    // v8 onboarding collects goals/chips but never writes the profiles.*
    // personality fields that Plan, Brief, Coach, Nudges all read.
    // Derive them here so the entire personalization layer is unsilenced.
    if (onboarding_version === "v8" && v8Row) {
      const goals: string[] = Array.isArray(v8Row.goals) ? v8Row.goals : [];
      const stakesChips: string[] = Array.isArray(v8Row.stakes_chips) ? v8Row.stakes_chips : [];
      const burdenChips: string[] = Array.isArray(v8Row.burden_chips) ? v8Row.burden_chips : [];
      const cosProfile = v8Row.cos_profile as Record<string, any> | null;

      // Derive practice_priority_tag from goals
      const practiceTag = derivePracticeTagFromGoals(goals);
      // Derive pressure_context_tag from chips
      const pressureTag = derivePressureTagFromChips(stakesChips, burdenChips);

      updateData.practice_priority_tag = practiceTag;
      updateData.pressure_context_tag = pressureTag;
      updateData.growth_priority = goals[0] ?? null;
      if (goals.length > 0) {
        updateData.protection_goals = goals;
      }
      updateData.user_archetype = cosProfile?.provisional_archetype?.name ?? null;
      updateData.archetype_title = cosProfile?.provisional_archetype?.subtitle ?? null;
      updateData.archetype_description = cosProfile?.provisional_archetype?.description ?? null;
      updateData.identity_role = cosProfile?.identity?.role ?? null;
      updateData.biggest_pressure = cosProfile?.cognitive_load_map?.primary_depletion_pattern ?? null;
      updateData.onboarding_insight = cosProfile?.communication_profile?.cos_brief_rules ?? null;

      // Write preferred_practice_window
      const prefWindow = typeof v8Row.preferred_practice_window === 'string'
        ? v8Row.preferred_practice_window
        : (typeof v8Row.reset_modality === 'string' ? v8Row.reset_modality : null);
      if (prefWindow) {
        updateData.preferred_practice_window = prefWindow;
      }

      // Write country if collected
      const homeCountry = typeof v8Row.home_country === 'string' ? v8Row.home_country.trim() : null;
      if (homeCountry) {
        updateData.country = homeCountry;
      }

      // Forward v8 connector selections to user_integrations
      const calSel = Array.isArray(v8Row.calendar_selections) ? v8Row.calendar_selections : [];
      const wearSel = Array.isArray(v8Row.wearable_selections) ? v8Row.wearable_selections : [];
      if (calSel.length > 0 || wearSel.length > 0) {
        const integrationData: Record<string, unknown> = {
          user_id: userId,
          updated_at: new Date().toISOString(),
        };
        if (calSel[0]) {
          integrationData.calendar_provider = calSel[0];
          integrationData.calendar_connected_at = new Date().toISOString();
        }
        if (wearSel[0]) {
          integrationData.watch_type = wearSel[0];
        }
        const { error: v8IntErr } = await supabaseAdmin
          .from("user_integrations")
          .upsert(integrationData, { onConflict: "user_id" });
        if (v8IntErr) {
          console.warn("[complete-onboarding] v8 user_integrations upsert warning:", v8IntErr);
        } else {
          console.log("[complete-onboarding] ✅ v8 user_integrations saved for:", redactUserId(userId));
        }
      }

      console.log("[complete-onboarding] ✅ v8 personality fields derived:", redactUserId(userId), {
        practiceTag, pressureTag, archetype: updateData.user_archetype,
      });
    }

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
    if (typeof self_check_ins_enabled === "boolean") {
      updateData.self_check_ins_enabled = self_check_ins_enabled;
    }

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
        console.log("[complete-onboarding] ✅ user_integrations saved for:", redactUserId(userId));
      }
    }

    // Idempotent: only set onboarding_completed_at if not already set
    // skip_completion=true allows persisting baseline data without marking onboarding as done
    if (skip_completion) {
      console.log("[complete-onboarding] skip_completion=true, persisting data only for user:", redactUserId(userId));
    } else if (!existing?.onboarding_completed_at) {
      updateData.onboarding_completed_at = new Date().toISOString();
      console.log("[complete-onboarding] Setting onboarding_completed_at for user:", redactUserId(userId));
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

    // Initialize notification_preferences for the user if no row exists
    const briefTiming = typeof v8Row?.brief_timing === 'string' ? v8Row.brief_timing : null;
    const { error: npErr } = await supabaseAdmin
      .from("notification_preferences")
      .upsert({
        user_id: userId,
        morning_anchor_enabled: briefTiming === 'morning' || briefTiming == null,
        pre_event_prep_enabled: true,
        evening_close_enabled: briefTiming === 'evening' || briefTiming == null,
        pattern_alert_enabled: true,
        state_aware_nudge_enabled: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (npErr) {
      console.warn("[complete-onboarding] notification_preferences upsert warning:", npErr);
    } else {
      console.log("[complete-onboarding] ✅ notification_preferences initialized for:", redactUserId(userId));
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

    // Fire-and-forget: seed event_priority_memory from onboarding goals & chips
    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && serviceKey) {
        fetch(`${supaUrl}/functions/v1/seed-onboarding-memory`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ userId }),
        }).then(async (r) => {
          console.log("[complete-onboarding] seed-onboarding-memory status:", r.status);
        }).catch((err) => {
          console.warn("[complete-onboarding] seed-onboarding-memory enqueue failed:", err);
        });
      }
    } catch (e) {
      console.warn("[complete-onboarding] seed-onboarding-memory trigger threw:", e);
    }

    console.log("[complete-onboarding] ✅ Onboarding completed for:", redactUserId(userId));

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
