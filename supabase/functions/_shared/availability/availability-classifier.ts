/**
 * Canonical Availability Classifier (SSOT).
 *
 * Answers: "Is the user actually working today, and if so under what workload?"
 *
 * Consumed by:
 *   - generate-mastery-plan (planner) — feeds `hasRestSignals` into slot allocator
 *   - _shared/brief-signal-coverage    — gates PTO/holiday brief signals
 *   - _shared/ceo-behaviour/pto-holiday — gates reduced-touch framing
 *   - smart-nudges                     — gates nudge cadence
 *
 * Design principle: availability is decided by evidence, not workload.
 * Meeting counts and empty calendars are workload signals — they NEVER
 * decide whether the user is working. See docs section "Canonical Override
 * Principle" in the ticket for the precedence rules.
 */

import {
  PTO_TITLE_RX,
  PERSONAL_HOLIDAY_TITLE_RX,
} from "../ceo-behaviour/pto-holiday.ts";
import {
  isApplicableHoliday,
  isFyiHolidayCalendar,
  type RegionToken,
} from "./holiday-applicability.ts";

export type AvailabilityState =
  | "WORKDAY"
  | "LIGHT_ROUTINE"
  | "REST_DAY"
  | "PTO"
  | "PUBLIC_HOLIDAY";

export interface AvailabilityEvent {
  title: string;
  startTime: string;
  endTime: string;
  isAllDay?: boolean;
  isOrganizer?: boolean;
  attendeesCount?: number;
  source?: string | null;
  calendarSummary?: string | null;
}

export interface AvailabilityInput {
  now: Date;
  /** Local weekend days; default = Saturday only. Sunday intentionally not
   *  a rest day by default (many executives plan the week on Sunday). */
  weekendDays?: number[];
  /** Home country from profiles.country. Nullable. */
  userHomeCountry?: string | null;
  /** Reserved for future Travel SSOT. Falls back to home when unset. */
  userCurrentCountry?: string | null;
  events: AvailabilityEvent[];
  /** User-approved PTO/annual-leave (from future onboarding/UI). */
  explicitPto?: boolean;
  /** Workload hint from upstream calendar-load classifier. */
  calendarLoad?: "low" | "medium" | "high" | string | null;
}

export interface AvailabilityResult {
  state: AvailabilityState;
  isRestDay: boolean;
  workEvidence: { meetingCount: number; hasWorkMeetings: boolean };
  holiday: {
    detected: boolean;
    applicable: boolean;
    title?: string;
    scope?: RegionToken;
  };
  reason: string;
}

const WORK_MEETING_MIN = 2;

function isTimedWorkMeeting(e: AvailabilityEvent): boolean {
  if (e.isAllDay === true) return false;
  // A timed event counts as work when the user is organiser or the event
  // has other attendees. Focus-only blocks (no attendees, not organiser)
  // are workload, not availability evidence.
  if (e.isOrganizer === true) return true;
  if ((e.attendeesCount ?? 0) >= 1) return true;
  return false;
}

function looksLikeHolidayMarker(e: AvailabilityEvent): boolean {
  if (e.isAllDay !== true) return false;
  const title = e.title || "";
  if (PTO_TITLE_RX.test(title) || PERSONAL_HOLIDAY_TITLE_RX.test(title)) return true;
  // Any all-day event on an FYI holiday-subscription calendar (e.g.
  // "Holidays in United Kingdom") is a holiday marker even when the title
  // isn't a PTO regex match — e.g. "Christmas Day", "Independence Day".
  return isFyiHolidayCalendar(e);
}

/**
 * Classify the user's availability state.
 *
 * Precedence (top-down, first match wins):
 *   1. Calendar work evidence (≥2 timed work meetings) → WORKDAY.
 *      Overrides weekend, PTO marker, holiday.
 *   2. Explicit user intent (explicitPto) → PTO. Travel never overrides PTO.
 *   3. Applicable public holiday → PUBLIC_HOLIDAY.
 *   4. Weekend day → REST_DAY.
 *   5. Workload split → LIGHT_ROUTINE (low/empty) or WORKDAY.
 */
export function classifyAvailability(
  input: AvailabilityInput,
): AvailabilityResult {
  const events = input.events || [];
  const weekendDays = input.weekendDays ?? [6];
  const dow = input.now.getDay();
  const country = input.userCurrentCountry ?? input.userHomeCountry ?? null;

  // Step 1 — calendar work evidence.
  const workMeetings = events.filter(isTimedWorkMeeting);
  const meetingCount = workMeetings.length;
  const hasWorkMeetings = meetingCount >= WORK_MEETING_MIN;

  // Holiday detection (needed for both step 3 and the returned envelope).
  let holidayDetected = false;
  let holidayApplicable = false;
  let holidayTitle: string | undefined;
  let holidayScope: RegionToken | undefined;
  for (const e of events) {
    if (!looksLikeHolidayMarker(e)) continue;
    holidayDetected = true;
    const app = isApplicableHoliday(e, country);
    if (app.applicable) {
      holidayApplicable = true;
      holidayTitle = e.title;
      holidayScope = app.region;
      break;
    }
    // Track the first detected marker for observability even if not applicable.
    if (!holidayTitle) {
      holidayTitle = e.title;
      holidayScope = app.region;
    }
  }

  const isWeekend = weekendDays.includes(dow);

  // Step 1 override — work meetings beat weekend / PTO / holiday.
  if (hasWorkMeetings) {
    return {
      state: "WORKDAY",
      isRestDay: false,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: holidayDetected,
        applicable: holidayApplicable,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: `work_evidence_override:${meetingCount}_meetings`,
    };
  }

  // Step 2 — explicit PTO. Travel never overrides.
  if (input.explicitPto === true) {
    return {
      state: "PTO",
      isRestDay: true,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: holidayDetected,
        applicable: holidayApplicable,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: "explicit_pto",
    };
  }

  // Step 3 — applicable public holiday.
  if (holidayApplicable) {
    return {
      state: "PUBLIC_HOLIDAY",
      isRestDay: true,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: true,
        applicable: true,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: `applicable_holiday:${holidayScope ?? "UNKNOWN"}`,
    };
  }

  // Step 4 — weekend.
  if (isWeekend) {
    return {
      state: "REST_DAY",
      isRestDay: true,
      workEvidence: { meetingCount, hasWorkMeetings },
      holiday: {
        detected: holidayDetected,
        applicable: false,
        title: holidayTitle,
        scope: holidayScope,
      },
      reason: "weekend",
    };
  }

  // Step 5 — workload split. Never a rest day.
  const isLight =
    events.length === 0 ||
    input.calendarLoad === "low" ||
    !events.some(isTimedWorkMeeting);
  return {
    state: isLight ? "LIGHT_ROUTINE" : "WORKDAY",
    isRestDay: false,
    workEvidence: { meetingCount, hasWorkMeetings },
    holiday: {
      detected: holidayDetected,
      applicable: false,
      title: holidayTitle,
      scope: holidayScope,
    },
    reason: isLight ? "workday_light_routine" : "workday_normal",
  };
}

/**
 * Convenience adapter: given a classifier input, return the boolean
 * `hasRestSignals` value expected by the slot allocator. This is the
 * single planner-boundary surface that used to compute the flag from
 * `calendarLoad === 'low' && events.length === 0`.
 */
export function classifyHasRestSignals(input: AvailabilityInput): boolean {
  return classifyAvailability(input).isRestDay;
}