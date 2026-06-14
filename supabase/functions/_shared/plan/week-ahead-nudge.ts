/**
 * week-ahead-nudge.ts — shared predicate for the `weekAheadPickerInvite`
 * nudge rule (§17.7). Pure function so it can be unit-tested without the
 * smart-nudges runtime, then wired into the runner in a follow-up.
 *
 * Fires on:
 *   - Sunday 16:00–19:00 local
 *   - 16:00–19:00 local on a detected last-PTO / last-holiday /
 *     last-long-weekend day (reason from `evaluateWeekAheadMode`)
 *
 * Never fires on Saturday (Saturday is a recovery day across Brief, Plan,
 * and Nudges — see §17.2a).
 */

import type { WeekAheadDecision } from "./week-ahead-mode.ts";

/**
 * Canonical list of valid `reason` strings emitted by
 * `shouldFireWeekAheadPickerInvite` when `fire === true`. These are the
 * suffixes used in the dispatched `variant_id` (`<base>::<reason>`) and
 * in analytics SQL (`docs/WEEK_AHEAD_TRIGGER_VERIFICATION.sql`) via
 * `variant_id LIKE '%::<reason>'`.
 *
 * IMPORTANT — collision rule: no reason in this list may be a suffix of
 * another (e.g. `pto_evening` + `last_day_pto_evening` would both match
 * `'%::pto_evening'` and silently double-count). The unit test
 * `week-ahead-reasons.test.ts` enforces this; add new reasons to this
 * const and the test will fail loudly if a collision is introduced.
 */
export const WEEK_AHEAD_REASONS = [
  "sunday_evening",
  "last_day_pto_evening",
  "last_day_holiday_evening",
  "last_day_long_weekend_evening",
] as const;

export type WeekAheadFireReason = typeof WEEK_AHEAD_REASONS[number];

export interface WeekAheadNudgeInput {
  /** 0=Sun, 6=Sat — user local day of week. */
  dayOfWeek: number;
  /** Local hour (0–23). */
  localHour: number;
  /** Decision from `evaluateWeekAheadMode` for "today". */
  weekAheadDecision: WeekAheadDecision;
  /** True if a `weekAheadPickerInvite` push was already sent today. */
  alreadySentToday?: boolean;
  /** True if the user opened the picker today (any path: deep link, manual). */
  pickerOpenedToday?: boolean;
}

export interface WeekAheadNudgeDecision {
  fire: boolean;
  /** Stable reason string surfaced in logs + analytics. */
  reason:
    | "sunday_evening"
    | "last_day_pto_evening"
    | "last_day_holiday_evening"
    | "last_day_long_weekend_evening"
    | "out_of_window"
    | "saturday_recovery_day"
    | "weekday"
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
  // Suppression: Saturday recovery day is sacred.
  if (input.dayOfWeek === 6) {
    return { fire: false, reason: "saturday_recovery_day" };
  }

  if (!inWindow(input.localHour)) {
    return { fire: false, reason: "out_of_window" };
  }

  if (input.alreadySentToday) {
    return { fire: false, reason: "already_sent" };
  }

  if (input.pickerOpenedToday) {
    return { fire: false, reason: "picker_already_opened" };
  }

  // Week-Ahead Mode must be active (covers travel + full-working-weekend
  // suppression via the shared predicate).
  const wam = input.weekAheadDecision;
  if (!wam.active) {
    // Plain weekday or suppressed weekend — but Sunday is the active path,
    // so an inactive Sunday means a suppressor (travel / working weekend)
    // intentionally killed the surface.
    return { fire: false, reason: wam.reason === null && input.dayOfWeek !== 0 ? "weekday" : "week_ahead_inactive" };
  }

  // Reason-aware mapping for telemetry. `manual_override` and `sunday` map
  // to sunday_evening when day=0; otherwise the last-day-* branches win.
  switch (wam.reason) {
    case "last_day_pto":
      return { fire: true, reason: "last_day_pto_evening" };
    case "last_day_holiday":
      return { fire: true, reason: "last_day_holiday_evening" };
    case "last_day_long_weekend":
      return { fire: true, reason: "last_day_long_weekend_evening" };
    case "sunday":
    case "manual_override":
    default:
      return { fire: true, reason: "sunday_evening" };
  }
}