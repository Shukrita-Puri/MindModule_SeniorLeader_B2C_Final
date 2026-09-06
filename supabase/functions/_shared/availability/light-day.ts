// LIGHT DAY SSOT — one definition consumed by Brief, Plan and Smart Nudges.
//
// A light day is a day where the user is NOT expected to run a full working
// cadence:
//   • a working day holding zero or one timed meeting  → 'light_workday'
//   • a weekend day                                    → 'weekend'
//   • an applicable public holiday                     → 'public_holiday'
//   • PTO / OOO                                        → 'pto'
//
// EXCLUSION — the LAST day of any weekend / holiday / PTO run is NOT a light
// day. That day keeps the existing week-ahead behaviour (Brief framing, plan
// slots, evening week-ahead nudge) untouched. "Last day" means either the
// user's weekly planning day (Sunday for most countries, Saturday for
// Israel / Gulf) or the final off-day before a workday.
//
// This module detects nothing new: it is a projection of
// `classifyAvailability` plus the caller-supplied "tomorrow is a workday"
// and planning-day facts.

import {
  classifyAvailability,
  type AvailabilityInput,
  type AvailabilityResult,
  type AvailabilityState,
} from "./availability-classifier.ts";

export type LightDayKind =
  | "light_workday"
  | "weekend"
  | "public_holiday"
  | "pto";

export interface LightDayResult {
  /** True only when the day should run the light-day cadence. */
  isLightDay: boolean;
  kind: LightDayKind | null;
  /** Final day of a weekend / holiday / PTO run — week-ahead behaviour wins. */
  isLastDayOfRun: boolean;
  /** Underlying availability state (unchanged semantics). */
  state: AvailabilityState;
  /** Timed meetings counted on the day (all-day markers excluded). */
  meetingCount: number;
  reason: string;
}

export interface LightDayInput extends AvailabilityInput {
  /** True when the next calendar day is a workday (caller walks the calendar). */
  tomorrowIsWorkday?: boolean;
  /** True when today is the user's weekly planning day (Sun, or Sat in IL/Gulf). */
  isPlanningDay?: boolean;
  /** Pre-computed availability, to avoid classifying twice. */
  availability?: AvailabilityResult;
}

/** Timed events only — all-day holiday / PTO markers never count as meetings. */
export function countTimedMeetings(input: AvailabilityInput): number {
  return (input.events || []).filter((e) => {
    if (e.isAllDay === true) return false;
    const s = new Date(e.startTime).getTime();
    const en = new Date(e.endTime).getTime();
    return Number.isFinite(s) && Number.isFinite(en) && en > s;
  }).length;
}

const OFF_STATES: ReadonlySet<AvailabilityState> = new Set<AvailabilityState>([
  "PTO",
  "PUBLIC_HOLIDAY",
  "REST_DAY",
]);

const KIND_BY_STATE: Partial<Record<AvailabilityState, LightDayKind>> = {
  PTO: "pto",
  PUBLIC_HOLIDAY: "public_holiday",
  REST_DAY: "weekend",
};

/**
 * Single entry point. Consumers must NOT re-derive "is this a light day?"
 * from event counts, weekend arithmetic or calendar load.
 */
export function classifyLightDay(input: LightDayInput): LightDayResult {
  const availability = input.availability ?? classifyAvailability(input);
  const state = availability.state;
  const meetingCount = countTimedMeetings(input);

  // Off-day run (weekend / holiday / PTO).
  if (OFF_STATES.has(state)) {
    const isLastDayOfRun =
      input.isPlanningDay === true || input.tomorrowIsWorkday === true;
    const kind = KIND_BY_STATE[state] ?? "weekend";
    if (isLastDayOfRun) {
      return {
        isLightDay: false,
        kind,
        isLastDayOfRun: true,
        state,
        meetingCount,
        reason: input.isPlanningDay === true
          ? "last_day_of_run_planning_day"
          : "last_day_of_run_before_workday",
      };
    }
    return {
      isLightDay: true,
      kind,
      isLastDayOfRun: false,
      state,
      meetingCount,
      reason: `light_day_${kind}`,
    };
  }

  // Working day with zero or one meeting.
  if (meetingCount <= 1) {
    return {
      isLightDay: true,
      kind: "light_workday",
      isLastDayOfRun: false,
      state,
      meetingCount,
      reason: meetingCount === 0
        ? "light_workday_no_meetings"
        : "light_workday_single_meeting",
    };
  }

  return {
    isLightDay: false,
    kind: null,
    isLastDayOfRun: false,
    state,
    meetingCount,
    reason: "working_day",
  };
}
