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
    const dow = new Date().getDay();
    if (dow === 6) return { active: true, reason: "saturday", manualOverride: false };
    if (dow === 0) return { active: true, reason: "sunday", manualOverride: false };
    return { active: false, reason: null, manualOverride: false };
  }, [manualOverride]);
}