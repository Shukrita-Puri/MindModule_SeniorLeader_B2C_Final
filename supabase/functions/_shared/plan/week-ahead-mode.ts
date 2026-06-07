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

export type WeekAheadReason =
  | "saturday"
  | "sunday"
  | "last_day_pto"
  | "last_day_holiday"
  | "last_day_long_weekend"
  | "manual_override";

export interface WeekAheadInput {
  /** 0=Sun, 6=Sat — user local day of week. */
  dayOfWeek: number;
  /** Local hour (0–23). Currently unused but reserved for future windowing. */
  localHour: number;
  /** Truthy when the active travel detector says today is a travel day. */
  travelDay?: boolean;
  /** True when the weekend is operating as a working weekend (≥3 meetings
   *  or ≥4h back-to-back or an explicit weekend work block). */
  fullWorkingWeekend?: boolean;
  /** PTO covers today as an all-day event. */
  ptoTodayAllDay?: boolean;
  /** PTO covers tomorrow as an all-day event. */
  ptoTomorrowAllDay?: boolean;
  /** Today is a public holiday (all-day event). */
  holidayAllDayEventToday?: boolean;
  /** Tomorrow is a workday (used to detect "last day of holiday block"). */
  tomorrowIsWorkday?: boolean;
  /** Number of consecutive off-days that have just preceded today. */
  consecutiveOffDaysBefore?: number;
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
 * Decide whether the user is in week-ahead-planning mode.
 * Order matters — first match wins.
 */
export function evaluateWeekAheadMode(input: WeekAheadInput): WeekAheadDecision {
  if (input.manualOverride) {
    return { active: true, reason: "manual_override", lookbackDays: 7, lookaheadDays: 7 };
  }

  // Travel always wins — the travel context owns those days.
  if (input.travelDay) return inactive();

  // A working weekend reverts to weekday cadence.
  if (input.fullWorkingWeekend) return inactive();

  // Last day of a PTO block (today off, tomorrow back on).
  if (input.ptoTodayAllDay && input.ptoTomorrowAllDay === false) {
    return { active: true, reason: "last_day_pto", lookbackDays: 7, lookaheadDays: 7 };
  }

  // Last day of a public holiday block.
  if (input.holidayAllDayEventToday && input.tomorrowIsWorkday) {
    return { active: true, reason: "last_day_holiday", lookbackDays: 7, lookaheadDays: 7 };
  }

  // End-of-long-weekend (≥2 consecutive off days behind us, tomorrow is work).
  if (
    (input.consecutiveOffDaysBefore ?? 0) >= 2 &&
    input.tomorrowIsWorkday
  ) {
    return { active: true, reason: "last_day_long_weekend", lookbackDays: 7, lookaheadDays: 7 };
  }

  // Plain Sat / Sun.
  if (input.dayOfWeek === 6) {
    return { active: true, reason: "saturday", lookbackDays: 7, lookaheadDays: 7 };
  }
  if (input.dayOfWeek === 0) {
    return { active: true, reason: "sunday", lookbackDays: 7, lookaheadDays: 7 };
  }

  return inactive();
}

function inactive(): WeekAheadDecision {
  return { active: false, reason: null, lookbackDays: 0, lookaheadDays: 0 };
}

/** Convenience: normalises an event title into a stable bucket for memory. */
export function normalizeEventTypeKey(title: string | null | undefined): string {
  if (!title) return "untitled";
  const t = title.toLowerCase().trim();
  if (/\b1[:\-]?on[:\-]?1\b|\bone[\s-]?on[\s-]?one\b/.test(t)) return "1on1";
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