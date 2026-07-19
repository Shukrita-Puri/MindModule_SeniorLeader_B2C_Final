/**
 * useWeekAheadMode — derives whether the Plan page should render the
 * Week-Ahead Planning surface instead of the normal day-of plan.
 *
 * Source of truth = server. The hook also evaluates the same predicate
 * locally as an instant render-hint so we never flash the wrong surface.
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.1.
 */

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Home Country → local planning weekday. Mirrors the server-side
 * `planningDayOfWeek` in `supabase/functions/_shared/plan/week-ahead-mode.ts`.
 */
const SATURDAY_WEEKLY_COUNTRIES = new Set([
  "SA", "KW", "QA", "BH", "OM", "IL",
]);
function planningDayOfWeek(homeCountry?: string | null): 0 | 6 {
  return SATURDAY_WEEKLY_COUNTRIES.has((homeCountry ?? "").toUpperCase())
    ? 6
    : 0;
}

export interface WeekAheadHint {
  active: boolean;
  reason: string | null;
  /** True when activated via ?mode=week-ahead (manual entry / nudge link). */
  manualOverride: boolean;
}

/**
 * @param serverDecision Server-authoritative Week-Ahead decision (wins).
 * @param homeCountry Optional Home Country (ISO-2) used ONLY by the local
 *   fallback when the server decision is absent — Sunday-start working-week
 *   countries (SA/KW/QA/BH/OM/IL) plan on Saturday.
 */
export function useWeekAheadMode(
  serverDecision?: { active: boolean; reason: string | null } | null,
  homeCountry?: string | null,
): WeekAheadHint {
  const [searchParams] = useSearchParams();
  const manualOverride = searchParams.get("mode") === "week-ahead";

  return useMemo<WeekAheadHint>(() => {
    if (manualOverride) {
      return { active: true, reason: "manual_override", manualOverride: true };
    }
    // Server-authoritative decision wins over the local heuristic.
    if (serverDecision && typeof serverDecision.active === "boolean") {
      return {
        active: serverDecision.active,
        reason: serverDecision.reason ?? null,
        manualOverride: false,
      };
    }
    // Local fallback mirrors the server engine: only the weekly planning
    // day fires here. End-of-PTO / end-of-holiday / end-of-long-weekend
    // branches require calendar visibility and are always server-driven.
    const dow = new Date().getDay();
    if (dow === planningDayOfWeek(homeCountry)) {
      return { active: true, reason: "weekly_planning", manualOverride: false };
    }
    return { active: false, reason: null, manualOverride: false };
  }, [manualOverride, serverDecision?.active, serverDecision?.reason, homeCountry]);
}