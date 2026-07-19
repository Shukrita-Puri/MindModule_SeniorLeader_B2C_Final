/**
 * week-ahead-nudge.ts — shared predicate for the `weekAheadPickerInvite`
 * nudge rule. Pure function so it can be unit-tested without the
 * smart-nudges runtime.
 *
 * Fires on any local 16:00–19:00 tick where `evaluateWeekAheadMode`
 * returned an active decision. Which weekday is "weekly_planning" is
 * decided upstream by Home Country — Saturday is a valid planning day
 * for Sunday-start working-week countries.
 *
 * Deduplication (per-reason, per-day) is enforced by the caller.
 */

import type { WeekAheadDecision, WeekAheadReason } from "./week-ahead-mode.ts";

/**
 * Reasons that appear in a dispatched `variant_id`
 * (`week_ahead_picker_invite::<reason>`) and drive per-reason dedupe.
 */
export const WEEK_AHEAD_REASONS = [
  "weekly_planning",
  "end_of_pto",
  "end_of_public_holiday",
  "end_of_long_weekend",
  "manual_override",
] as const;

export type WeekAheadFireReason = typeof WEEK_AHEAD_REASONS[number];

export interface WeekAheadNudgeInput {
  /** 0=Sun, 6=Sat — user local day of week. */
  dayOfWeek: number;
  /** Local hour (0–23). */
  localHour: number;
  /** Decision from `evaluateWeekAheadMode` for "today". */
  weekAheadDecision: WeekAheadDecision;
  /**
   * Per-reason, per-day dedupe. Caller passes the set of variant reasons
   * already delivered today (populated from `notification_log`).
   */
  alreadySentReasonsToday?: ReadonlySet<WeekAheadFireReason>;
  /** True if the user opened the picker today (any path: deep link, manual). */
  pickerOpenedToday?: boolean;
}

export interface WeekAheadNudgeDecision {
  fire: boolean;
  /** Stable reason string surfaced in logs + analytics. */
  reason:
    | WeekAheadFireReason
    | "out_of_window"
    | "already_sent"
    | "picker_already_opened"
    | "week_ahead_inactive";
}

const WINDOW_START = 16; // 16:00 local
const WINDOW_END = 19;   // 19:00 local (exclusive)

function inWindow(hour: number): boolean {
  return hour >= WINDOW_START && hour < WINDOW_END;
}

export function shouldFireWeekAheadPickerInvite(
  input: WeekAheadNudgeInput,
): WeekAheadNudgeDecision {
  if (!inWindow(input.localHour)) {
    return { fire: false, reason: "out_of_window" };
  }

  if (input.pickerOpenedToday) {
    return { fire: false, reason: "picker_already_opened" };
  }

  const wam = input.weekAheadDecision;
  if (!wam.active || wam.reason === null) {
    return { fire: false, reason: "week_ahead_inactive" };
  }

  const reason = wam.reason as WeekAheadFireReason;
  if (input.alreadySentReasonsToday?.has(reason)) {
    return { fire: false, reason: "already_sent" };
  }
  return { fire: true, reason };
}