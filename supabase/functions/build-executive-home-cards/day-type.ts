// -----------------------------------------------------------------------------
// Executive Home orchestrator — centralized day-type resolution.
//
// OWNERSHIP: the Executive Home orchestrator owns CADENCE (which windows fire
// at all today). Downstream functions (compute-outer-readiness /
// generate-mastery-plan / smart-nudges) own CONTENT once a window is chosen.
//
// This module resolves a single canonical `dayType` and the set of windows the
// orchestrator is allowed to dispatch on for that day. It reuses the existing
// shared detectors — it does NOT re-invent business logic:
//   • Travel      → resolveEffectiveTimezone.travel.state (already fetched)
//                   AND the canonical `isTravelTitle` regex.
//   • PTO/holiday → the canonical `PTO_TITLE_RX` / `isPtoOrHolidayTitle`.
//   • Week-ahead  → the canonical `evaluateWeekAheadMode` + `isSaturdayRecoveryDay`.
//
// The resolver runs BEFORE MRS in the orchestrator. When `mode === "scheduled"`
// and the due window is not in `allowedWindows`, the orchestrator skips the
// run and logs `day_type_window_suppressed`. Manual refresh / replay / dry-run
// paths always run — day-type is stamped on the trace for observability but
// does not gate manual work.
// -----------------------------------------------------------------------------

import { isTravelTitle } from "../_shared/ceo-behaviour/travel.ts";
import { isPtoOrHolidayTitle } from "../_shared/ceo-behaviour/pto-holiday.ts";
import {
  evaluateWeekAheadMode,
  isSaturdayRecoveryDay,
  type WeekAheadReason,
} from "../_shared/plan/week-ahead-mode.ts";
import { localParts } from "../_shared/effective-timezone.ts";
import type { TimeWindow } from "./scheduler.ts";

export type DayType =
  | "workday"
  | "weekend_saturday"
  | "weekend_sunday"
  | "travel"
  | "pto"
  | "public_holiday"
  | "pto_with_meeting"
  | "light_day"
  | "week_ahead"; // last-day-PTO / last-day-holiday / long-weekend

export interface DayTypeEventLite {
  title: string | null;
  start_time: string;
  end_time: string;
  is_all_day?: boolean | null;
  attendees_count?: number | null;
}

export interface DayTypeInput {
  effectiveTimezone: string;
  now: Date;
  /** Merged today-events (already de-duped by mergeCalendarEvents). */
  todayEvents: DayTypeEventLite[];
  /** Merged tomorrow-events (for last-day-PTO / last-day-holiday). */
  tomorrowEvents: DayTypeEventLite[];
  /** travel_state row from effective-timezone.ts. `null` = no row. */
  travel: { state?: string | null } | null;
  /** Number of consecutive off-days that just preceded today. Optional; when
   *  omitted the long-weekend branch of week-ahead never triggers. */
  consecutiveOffDaysBefore?: number;
}

export interface DayTypeDecision {
  dayType: DayType;
  /** Windows the orchestrator is allowed to dispatch on. Ordered set. */
  allowedWindows: Set<TimeWindow>;
  /** Week-ahead reason when `dayType === "week_ahead"`, else null. */
  weekAheadReason: WeekAheadReason | null;
  /** Short human-readable evidence for the trace log. */
  evidence: string[];
}

const ALL_WINDOWS: TimeWindow[] = ["morning", "afternoon", "evening"];

function isPtoAllDayToday(events: DayTypeEventLite[]): boolean {
  return events.some(
    (e) => e.is_all_day === true && isPtoOrHolidayTitle(e.title ?? ""),
  );
}

function hasRealMeeting(events: DayTypeEventLite[]): boolean {
  return events.some((e) => {
    if (e.is_all_day === true) return false;
    if (isPtoOrHolidayTitle(e.title ?? "")) return false;
    if (isTravelTitle(e.title ?? "")) return false;
    // Attendee count is a soft signal; the presence of a non-all-day, non-PTO
    // event is enough to count as "a meeting slipped in".
    return true;
  });
}

function isPtoAllDayTomorrow(events: DayTypeEventLite[]): boolean {
  return events.some(
    (e) => e.is_all_day === true && isPtoOrHolidayTitle(e.title ?? ""),
  );
}

function isTravelActive(
  travel: DayTypeInput["travel"],
  todayEvents: DayTypeEventLite[],
): boolean {
  const state = travel?.state ?? null;
  if (state && state !== "not_travelling") return true;
  // Fallback: no travel_state row but a travel-titled event lives on today.
  return todayEvents.some((e) => isTravelTitle(e.title ?? ""));
}

/**
 * Resolve the canonical day-type and the windows the orchestrator is allowed
 * to dispatch on. Pure — same inputs, same output.
 */
export function resolveDayTypeAndCadence(input: DayTypeInput): DayTypeDecision {
  const local = localParts(input.effectiveTimezone, input.now);
  const weekdayShort = new Intl.DateTimeFormat("en-US", {
    timeZone: input.effectiveTimezone,
    weekday: "short",
  })
    .format(input.now)
    .toLowerCase()
    .slice(0, 3);
  const dayOfWeek =
    weekdayShort === "sun" ? 0
    : weekdayShort === "mon" ? 1
    : weekdayShort === "tue" ? 2
    : weekdayShort === "wed" ? 3
    : weekdayShort === "thu" ? 4
    : weekdayShort === "fri" ? 5
    : 6;

  const travelDay = isTravelActive(input.travel, input.todayEvents);
  const ptoToday = isPtoAllDayToday(input.todayEvents);
  const meetingToday = hasRealMeeting(input.todayEvents);
  const ptoTomorrow = isPtoAllDayTomorrow(input.tomorrowEvents);
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // Week-ahead evaluator owns the "last day of block" decisions. We only need
  // it when we might land in a week-ahead surface (Sunday, or the tail of a
  // PTO/holiday/long-weekend block).
  const weekAhead = evaluateWeekAheadMode({
    dayOfWeek,
    localHour: local.hour,
    travelDay,
    ptoTodayAllDay: ptoToday,
    ptoTomorrowAllDay: ptoTomorrow,
    holidayAllDayEventToday: ptoToday, // canonical detector treats them together
    tomorrowIsWorkday:
      // If tomorrow is Sat/Sun and no explicit workday signal, treat as off.
      // Otherwise, workday unless PTO/holiday covers it.
      !(dayOfWeek === 5 || dayOfWeek === 6) && !ptoTomorrow,
    consecutiveOffDaysBefore: input.consecutiveOffDaysBefore ?? 0,
  });

  // 1. TRAVEL — wins over everything (matches ceo-behaviour/travel.ts precedence).
  if (travelDay) {
    return {
      dayType: "travel",
      // Travel day keeps the full cadence — pre-flight, landing, and evening
      // recovery are all separately scheduled downstream. The orchestrator
      // must not silence any window on a travel day.
      allowedWindows: new Set<TimeWindow>(ALL_WINDOWS),
      weekAheadReason: null,
      evidence: [`travel_state=${input.travel?.state ?? "none"}`],
    };
  }

  // 2. WEEK-AHEAD — last-day-PTO / last-day-holiday / last-day-long-weekend
  //    (Sunday is handled below as a distinct weekend_sunday day-type so we
  //    don't collapse ordinary Sunday nudge cadence into week-ahead cadence.)
  if (
    weekAhead.active &&
    weekAhead.reason &&
    weekAhead.reason !== "sunday" &&
    weekAhead.reason !== "manual_override"
  ) {
    return {
      dayType: "week_ahead",
      // Week-ahead framing is a morning + evening surface — planning happens
      // ahead of tomorrow's workday, no midday regen on an off-day.
      allowedWindows: new Set<TimeWindow>(["morning", "evening"]),
      weekAheadReason: weekAhead.reason,
      evidence: [`week_ahead=${weekAhead.reason}`],
    };
  }

  // 3. PTO / PUBLIC HOLIDAY — reduced-touch cadence per holidayReducedTouch:
  //    morning-only when there is NO meeting; when a meeting slipped in, the
  //    ptoWithMeetingFallback allows the afternoon regen to also fire so the
  //    downstream Brief/Plan can frame the meeting cleanly.
  if (ptoToday) {
    if (meetingToday) {
      return {
        dayType: "pto_with_meeting",
        allowedWindows: new Set<TimeWindow>(["morning", "afternoon"]),
        weekAheadReason: null,
        evidence: ["pto_all_day", "meeting_slipped_in"],
      };
    }
    return {
      dayType: "pto",
      // Matches ceo-behaviour/pto-holiday.ts copyHint: "morning only; suppress
      // afternoon/evening notifications". Orchestrator centralises that here.
      allowedWindows: new Set<TimeWindow>(["morning"]),
      weekAheadReason: null,
      evidence: ["pto_all_day"],
    };
  }

  // 4. WEEKEND — Saturday is recovery-day (single morning + evening surface);
  //    Sunday is the plain week-ahead trigger.
  if (dayOfWeek === 6) {
    if (isSaturdayRecoveryDay({ dayOfWeek: 6, localHour: local.hour, travelDay: false })) {
      return {
        dayType: "weekend_saturday",
        allowedWindows: new Set<TimeWindow>(["morning", "evening"]),
        weekAheadReason: null,
        evidence: ["saturday_recovery"],
      };
    }
  }
  if (dayOfWeek === 0) {
    return {
      dayType: "weekend_sunday",
      allowedWindows: new Set<TimeWindow>(["morning", "evening"]),
      weekAheadReason: "sunday",
      evidence: ["sunday_week_ahead"],
    };
  }

  // 5. LIGHT DAY — workday with zero real meetings. Conservative heuristic:
  //    skip the afternoon regen (there is no midday load to react to) but
  //    keep morning + evening for orientation and close-out.
  if (!isWeekend && !meetingToday) {
    return {
      dayType: "light_day",
      allowedWindows: new Set<TimeWindow>(["morning", "evening"]),
      weekAheadReason: null,
      evidence: ["workday_no_meetings"],
    };
  }

  // 6. REGULAR WORKDAY — full cadence.
  return {
    dayType: "workday",
    allowedWindows: new Set<TimeWindow>(ALL_WINDOWS),
    weekAheadReason: null,
    evidence: [`weekday=${weekdayShort}`],
  };
}