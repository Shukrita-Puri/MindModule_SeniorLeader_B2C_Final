/**
 * travel-notifications
 *
 * Idempotent scheduler/canceller for travel-aware notifications.
 * Triggered by persist-travel-location whenever travel_state transitions,
 * and also callable manually (e.g. when the user marks "travel planned"
 * in the UI).
 *
 * Notification phases:
 *   - pre_travel:    state → travel_planned         "Heads up: travel coming up"
 *   - during_travel: state → en_route | arrived     "You're away - readiness adapts"
 *   - post_travel:   state → returning | not_travelling  "Welcome back - re-orient"
 *
 * Stale cancellation rules:
 *   - Any pending notification whose state_at_schedule no longer matches
 *     the user's current state is cancelled with reason 'state_changed'.
 *   - Any pending notification scheduled more than 24h ago without delivery
 *     is cancelled with reason 'stale_window'.
 *
 * Idempotency:
 *   - (user_id, phase, anchor_key) is unique. anchor_key encodes the
 *     state transition + local date so re-firing the scheduler for the
 *     same transition collapses to one row.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { EVENT_PHASE_MAP } from "../_shared/events/event-phase-map.ts";
import { EVENT_CATEGORIES } from "../_shared/events/event-categories.ts";
import { PROTOCOL_COMBOS } from "../_shared/protocols/protocol-combos.ts";
import {
  localParts,
  resolveEffectiveTimezone,
} from "../_shared/effective-timezone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type Phase = "pre_travel" | "during_travel" | "post_travel";

function phaseForTransition(prev: string, next: string): Phase | null {
  if (next === "travel_planned") return "pre_travel";
  if (next === "en_route" || next === "arrived") return "during_travel";
  if (next === "returning" || (prev !== "not_travelling" && next === "not_travelling")) {
    return "post_travel";
  }
  return null;
}

// Travel notification copy is derived from the canonical Travel category (G)
// in EVENT_PHASE_MAP plus PROTOCOL_COMBOS. We never re-author travel framing
// inline - the §4 phase contract is the single source of truth so Brief,
// Plan, and Notifications speak the same language about Pre / During / Post.
const TRAVEL_PHASE_KEY: Record<Phase, "pre" | "during" | "post"> = {
  pre_travel: "pre",
  during_travel: "during",
  post_travel: "post",
};

const TRAVEL_TITLE: Record<Phase, (tz: string | null) => string> = {
  pre_travel: () => "Travel ahead",
  during_travel: (tz) => {
    const label = tz ? tz.split("/").pop()?.replace(/_/g, " ") ?? tz : null;
    return label ? `Travelling (${label})` : "Travelling";
  },
  post_travel: () => "Welcome back",
};

function copyForPhase(phase: Phase, tz: string | null): { title: string; body: string } {
  const phaseKey = TRAVEL_PHASE_KEY[phase];
  const ph = EVENT_PHASE_MAP.G[phaseKey];
  // Canonical fallback: empty contract shouldn't happen for G but stay safe.
  if (!ph) {
    return { title: TRAVEL_TITLE[phase](tz), body: EVENT_CATEGORIES.G.name };
  }
  const combo = PROTOCOL_COMBOS[ph.combo];
  // Body: derived from the canonical phase goal + protocol combo outcome so
  // notification copy stays aligned with what Brief and Plan are surfacing
  // for the same Travel phase.
  const body = combo ? `${ph.goal}. ${combo.outcome}.` : `${ph.goal}.`;
  return { title: TRAVEL_TITLE[phase](tz), body };
}

async function loadPlanTravelPhase(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  localDate: string,
  desiredPhase: "pre" | "during" | "post",
): Promise<{ phase: Phase; anchorKey: string; title: string | null; whyLine: string | null } | null> {
  const { data, error } = await supabase
    .from("mastery_plan_snapshots")
    .select("id,horizon_modules,generated_at")
    .eq("user_id", userId)
    .eq("plan_date", localDate)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("[travel-notifications] plan full-arc read failed", error.message ?? error);
    return null;
  }
  const row = data as { horizon_modules?: unknown } | null;
  const modules = Array.isArray(row?.horizon_modules) ? row.horizon_modules : [];
  const hit = modules
    .map((module) => module as Record<string, unknown>)
    .find((m) =>
      (m.mode === "full_arc" || Boolean(m.jitPhase)) &&
      m.jitPhase === desiredPhase &&
      String(m.jitEventTitle ?? "").toLowerCase().includes("travel")
    );
  if (!hit) return null;
  const phase: Phase =
    desiredPhase === "pre" ? "pre_travel" :
    desiredPhase === "during" ? "during_travel" :
    "post_travel";
  return {
    phase,
    anchorKey: `plan-full-arc:${localDate}:${desiredPhase}:${String(hit?.jitEventTitle ?? "travel").slice(0, 48)}`,
    title: typeof hit?.jitEventTitle === "string" ? hit.jitEventTitle : null,
    whyLine: typeof hit?.whyLine === "string" ? hit.whyLine : null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const userId: string | undefined = body.user_id;
    const prevState: string = body.prev_state ?? "not_travelling";
    const newState: string = body.new_state ?? "not_travelling";
    const inputTz: string | null = body.tz ?? null;

    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,current_timezone,home_timezone")
      .eq("id", userId)
      .maybeSingle();
    const tzRead = await resolveEffectiveTimezone(supabase, userId, profile ?? { current_timezone: inputTz });
    const tz = tzRead.effectiveTimezone || inputTz;
    const now = new Date();
    const nowIso = now.toISOString();
    const todayKey = localParts(tz).localDate;

    // 1. Cancel any pending notifications whose snapshot no longer matches
    // current state, OR that are older than 24h with no delivery.
    const { data: pending } = await supabase
      .from("travel_notifications")
      .select("id, phase, state_at_schedule, scheduled_for")
      .eq("user_id", userId)
      .is("delivered_at", null)
      .is("cancelled_at", null);

    const stale: { id: string; reason: string }[] = [];
    for (const n of pending ?? []) {
      if (n.state_at_schedule !== newState) {
        stale.push({ id: n.id, reason: "state_changed" });
      } else if (
        new Date(n.scheduled_for).getTime() <
        now.getTime() - 24 * 60 * 60 * 1000
      ) {
        stale.push({ id: n.id, reason: "stale_window" });
      }
    }
    if (stale.length) {
      for (const s of stale) {
        await supabase
          .from("travel_notifications")
          .update({
            cancelled_at: nowIso,
            cancel_reason: s.reason,
            updated_at: nowIso,
          })
          .eq("id", s.id);
      }
      console.log(`[travel-notifications] cancelled ${stale.length} stale rows for ${userId}`);
    }

    // 2. Schedule the new notification for this transition (if any).
    const transitionPhase = phaseForTransition(prevState, newState);
    const desiredPlanPhase = transitionPhase ? TRAVEL_PHASE_KEY[transitionPhase] : null;
    const planPhase = desiredPlanPhase
      ? await loadPlanTravelPhase(supabase, userId, todayKey, desiredPlanPhase)
      : null;
    const phase = planPhase?.phase ?? transitionPhase;
    let scheduledId: string | null = null;
    if (phase) {
      const anchorKey = planPhase?.anchorKey ?? `${prevState}->${newState}:${todayKey}`;
      const { title, body: msg } = copyForPhase(phase, tz);

      // Pre-travel fires ~2h before user-set departure (best-effort: we
      // don't have a known departure time here, so just schedule for
      // "soon" - the JS layer can re-call with a known time later).
      const scheduledFor = new Date(now.getTime() + 60 * 1000); // 1 min from now

      const { data: inserted, error } = await supabase
        .from("travel_notifications")
        .upsert(
          {
            user_id: userId,
            phase,
            state_at_schedule: newState,
            scheduled_for: scheduledFor.toISOString(),
            anchor_key: anchorKey,
            title: planPhase?.title || title,
            body: planPhase?.whyLine || msg,
            payload: { prev_state: prevState, tz, source: planPhase ? "mastery_plan_full_arc" : "travel_state_transition" },
            updated_at: nowIso,
          },
          { onConflict: "user_id,phase,anchor_key" },
        )
        .select("id")
        .maybeSingle();
      if (error) {
        console.error("[travel-notifications] upsert error", error);
      } else {
        scheduledId = inserted?.id ?? null;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cancelled: stale.length,
        scheduled_phase: phase,
        scheduled_id: scheduledId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[travel-notifications] error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
