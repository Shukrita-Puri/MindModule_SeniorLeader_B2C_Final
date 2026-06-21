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

export interface WeekAheadHint {
  active: boolean;
  reason: string | null;
  /** True when activated via ?mode=week-ahead (manual entry / nudge link). */
  manualOverride: boolean;
}

export function useWeekAheadMode(): WeekAheadHint {
  const [searchParams] = useSearchParams();
  const manualOverride = searchParams.get("mode") === "week-ahead";

  return useMemo<WeekAheadHint>(() => {
    if (manualOverride) {
      return { active: true, reason: "manual_override", manualOverride: true };
    }
    // Mirror the server predicate (_shared/plan/week-ahead-mode.ts §17.2a):
    // Saturday is a recovery day, NOT a Week-Ahead day. Only Sunday triggers
    // the surface client-side. Special last-day-PTO/holiday/long-weekend
    // branches are server-driven and only land via manual override here.
    const dow = new Date().getDay();
    if (dow === 0) return { active: true, reason: "sunday", manualOverride: false };
    return { active: false, reason: null, manualOverride: false };
  }, [manualOverride]);
}