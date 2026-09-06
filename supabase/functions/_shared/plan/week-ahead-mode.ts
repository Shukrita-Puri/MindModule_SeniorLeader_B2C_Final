/**
 * week-ahead-mode.ts — single predicate shared by Brief, Plan, and Nudges to
 * decide when the user should land in the Week-Ahead Planning surface instead
 * of a normal day-of self-regulation flow.
 *
 * SSOT: docs/GENERATE_MASTERY_PLAN_SSOT.md §17.
 *
 * The helper is intentionally input-driven (plain primitives + a small signals
 * bag) so it can be called from any edge function without dragging the full
 * RuleContext. Callers project the data they already have.
 */

import { planningDayOfWeek } from "./user-locale.ts";
export { planningDayOfWeek };

/**
 * Day-neutral reason vocabulary. Describes WHY the Week-Ahead surface
 * fired, never WHICH weekday it fired on. The planning weekday itself is
 * derived from Home Country via `planningDayOfWeek`.
 */
export type WeekAheadReason =
  | "weekly_planning"
  | "end_of_pto"
  | "end_of_public_holiday"
  | "end_of_long_weekend"
  | "manual_override";



export interface WeekAheadInput {
  /** 0=Sun, 6=Sat — user local day of week. */
  dayOfWeek: number;
  /** Local hour (0–23). Currently unused but reserved for future windowing. */
  localHour: number;
  /** ISO-2 country from `profiles.country`. Determines planning weekday. */
  homeCountry?: string | null;
  /** Truthy when the active travel detector says today is a travel day.
   *  Only consumed by `isSaturdayRecoveryDay`; the Week-Ahead engine
   *  itself no longer suppresses on travel — planning cadence is fixed. */
  travelDay?: boolean;
  /** True when the weekend is operating as a working weekend.
   *  Only consumed by `isSaturdayRecoveryDay`; the Week-Ahead engine no
   *  longer suppresses on working weekends. */
  fullWorkingWeekend?: boolean;
  /** PTO covers today as an all-day event. */
  ptoTodayAllDay?: boolean;
  /** PTO covers tomorrow as an all-day event. */
  ptoTomorrowAllDay?: boolean;
  /** Today is a public holiday (all-day event). */
  holidayAllDayEventToday?: boolean;
  /** Tomorrow is a workday (used to detect "last day of holiday block"). */
  tomorrowIsWorkday?: boolean;
  /**
   * DEPRECATED: kept for one release so cached callers keep working.
   * The new engine consumes `isLastDayOfLongWeekend` from the Availability
   * SSOT instead of re-deriving from this counter.
   */
  consecutiveOffDaysBefore?: number;
  /**
   * SSOT-derived (see `availability-classifier.ts#isLastDayOfLongWeekend`):
   * today is the last day of a contiguous off-day block that contains BOTH
   * a normal-weekend day AND at least one adjacent PTO or applicable public
   * holiday day. A plain weekend is NOT a long weekend.
   */
  isLastDayOfLongWeekend?: boolean;
  /**
   * SSOT-derived flag: today itself is an off-day (PTO, applicable public
   * holiday, or weekend). Consumed by `isSaturdayRecoveryDay` and the
   * legacy fallback; the new engine does not depend on it.
   */
  todayIsOffDay?: boolean;
  /**
   * SSOT-derived: tomorrow is itself an off-day (PTO, applicable public
   * holiday, or weekend). When TRUE the off-run continues past today, so
   * today is NOT the last day and Week-Ahead must stay inactive — the
   * invitation belongs to the final day of the run only. Left `undefined`
   * by callers without calendar visibility (no behaviour change there).
   */
  tomorrowIsOffDay?: boolean;

  /** Manual entry via deep link (?mode=week-ahead). Forces active=true. */
  manualOverride?: boolean;
}

export interface WeekAheadDecision {
  active: boolean;
  reason: WeekAheadReason | null;
  lookbackDays: number;   // for Brief week-recap
  lookaheadDays: number;  // for Plan upcoming-week picker
}

/**
 * Elimination engine — order matters.
 *
 *   1. manualOverride           → manual_override
 *   2. end of PTO block         → end_of_pto
 *   3. end of public holiday    → end_of_public_holiday
 *   4. end of long weekend      → end_of_long_weekend   (SSOT boolean)
 *   5. today == planning day    → weekly_planning       (suppressed on
 *                                                        PTO / holiday)
 *   else                        → inactive
 *
 * Return-from-break precedence is **PTO → public holiday → long weekend
 * → weekly planning**. First matching reason wins. A day that is both
 * the last day of PTO AND the last day of a long weekend is reported as
 * `end_of_pto` by design (PTO is the more specific signal).
 *
 * Global travel / full-working-weekend short-circuits are intentionally
 * removed — the planning cadence is fixed by Home Country. Saturday is
 * no longer universally excluded; it is the planning day for
 * Sunday-start working-week countries.
 */
export function evaluateWeekAheadMode(input: WeekAheadInput): WeekAheadDecision {
  if (input.manualOverride) {
    return { active: true, reason: "manual_override", lookbackDays: 7, lookaheadDays: 7 };
  }

  // 2. End of PTO (isolated PTO day with a workday after → return-to-work).
  if (input.ptoTodayAllDay === true && input.ptoTomorrowAllDay === false) {
    return {
      active: true,
      reason: "end_of_pto",
      lookbackDays: 7,
      lookaheadDays: 7,
    };
  }

  // 3. End of public holiday (single-day holiday returning to work).
  if (input.holidayAllDayEventToday === true && input.tomorrowIsWorkday === true) {
    return {
      active: true,
      reason: "end_of_public_holiday",
      lookbackDays: 7,
      lookaheadDays: 7,
    };
  }

  // 4. End of long weekend — SSOT boolean. A long weekend REQUIRES both a
  // normal weekend day AND at least one adjacent PTO/holiday day; plain
  // weekends never trigger this branch.
  if (input.isLastDayOfLongWeekend === true) {
    return {
      active: true,
      reason: "end_of_long_weekend",
      lookbackDays: 7,
      lookaheadDays: 7,
    };
  }

  // 5. Weekly planning day (Home Country dependent). Suppressed if today
  // is itself PTO / public holiday — return-from-break triggers already
  // covered those cases above.
  if (input.dayOfWeek === planningDayOfWeek(input.homeCountry)) {
    if (input.ptoTodayAllDay === true || input.holidayAllDayEventToday === true) {
      return inactive();
    }
    return {
      active: true,
      reason: "weekly_planning",
      lookbackDays: 7,
      lookaheadDays: 7,
    };
  }

  return inactive();
}

function inactive(): WeekAheadDecision {
  return { active: false, reason: null, lookbackDays: 0, lookaheadDays: 0 };
}

/**
 * Saturday recovery-day predicate. Used by the Brief (compute-outer-readiness)
 * to select the `week_recovery` driver — Plan never reads this (Saturday
 * Plan stays on the weekday cadence so the user still has a self-regulation
 * surface). Returns false on travel days and full working weekends so those
 * contexts keep their own behaviour.
 */
export function isSaturdayRecoveryDay(input: WeekAheadInput): boolean {
  const recoveryDay = planningDayOfWeek(input.homeCountry) === 6 ? 5 : 6;
  if (input.dayOfWeek !== recoveryDay) return false;
  if (input.travelDay) return false;
  if (input.fullWorkingWeekend) return false;
  return true;
}

/** Convenience: normalises an event title into a stable bucket for memory. */
export function normalizeEventTypeKey(title: string | null | undefined): string {
  if (!title) return "untitled";
  const t = title.toLowerCase().trim();
  if (/\b1\s*[:\-]\s*1\b|\b1\s*on\s*1\b|\bone[\s-]?on[\s-]?one\b/.test(t)) return "1on1";
  if (/\bboard\b/.test(t)) return "board";
  if (/\bstandup|stand-up\b/.test(t)) return "standup";
  if (/\binterview\b/.test(t)) return "interview";
  if (/\bperf(ormance)? review|\breview\b/.test(t)) return "review";
  if (/\bdeep work|\bfocus block\b/.test(t)) return "deep_work";
  if (/\boffsite|off-site\b/.test(t)) return "offsite";
  if (/\bpitch|\bsales call|\bclient\b/.test(t)) return "client";
  if (/\bplanning\b/.test(t)) return "planning";
  if (/\bsync\b|\bcheck[- ]?in\b/.test(t)) return "sync";
  // Fallback: first 3 alphanumeric tokens.
  return t.replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 3).join("_") || "generic";
}
