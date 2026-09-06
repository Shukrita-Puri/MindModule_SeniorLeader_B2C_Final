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
import { deriveTravelDay } from "../_shared/travel/hydrate-travel-day.ts";
import {
  classifyAvailability,
  classifyDay,
  type AvailabilityEvent,
} from "../_shared/availability/availability-classifier.ts";
import {
  evaluateWeekAheadMode,
  isSaturdayRecoveryDay,
  type WeekAheadReason,
} from "../_shared/plan/week-ahead-mode.ts";
import { planningDayOfWeek } from "../_shared/plan/user-locale.ts";
import { localParts } from "../_shared/effective-timezone.ts";
import { dayOfWeekFromIsoDate } from "../_shared/signal-engine/day-kind-detector.ts";
import type { TimeWindow } from "./scheduler.ts";

export type DayType =
  | "workday"
  | "weekend_saturday"
  | "weekend_sunday"
  | "travel"
  | "pto"
  | "pto_with_meeting"
  | "light_day"
  | "week_ahead"; // last-day-PTO / last-day-holiday / long-weekend

// NOTE ON `public_holiday`: the canonical PTO/holiday detector
// (`isPtoOrHolidayTitle` in _shared/ceo-behaviour/pto-holiday.ts) intentionally
// collapses PTO and public holidays into a single behaviour cluster (both use
// the same `holidayReducedTouch` cadence: morning-only + optional
// `pto_with_meeting` fallback). We therefore do NOT emit a separate
// `public_holiday` day-type — it would be a distinction without a runtime
// difference. Add one only if PTO and public-holiday cadences ever diverge.

export interface DayTypeEventLite {
  title: string | null;
  start_time: string;
  end_time: string;
  is_all_day?: boolean | null;
  attendees_count?: number | null;
  /**
   * Optional calendar-feed metadata. Plumbed through to the Availability SSOT
   * so FYI holiday subscriptions ("Holidays in United Kingdom") can be
   * matched by feed country when title lacks a region qualifier
   * (e.g. "Christmas Day"). Absent = treated as unqualified.
   */
  source?: string | null;
  calendar_summary?: string | null;
}

export interface DayTypeInput {
  effectiveTimezone: string;
  now: Date;
  userHomeCountry?: string | null;
  userCurrentCountry?: string | null;
  explicitPto?: boolean;
  /** Merged today-events (already de-duped by mergeCalendarEvents). */
  todayEvents: DayTypeEventLite[];
  /** Merged tomorrow-events (for last-day-PTO / last-day-holiday). */
  tomorrowEvents: DayTypeEventLite[];
  /** travel_state row from effective-timezone.ts. `null` = no row. Passed
   *  whole to the travel SSOT (`deriveTravelDay`), which reads state,
   *  distance, freshness timestamps and persisted trip windows. */
  travel: Record<string, unknown> | null;
  /** Profile current timezone — the SSOT's timezone-change rung. */
  currentTimezone?: string | null;
  /** Number of consecutive off-days that just preceded today (weekend day or
   *  all-day PTO/holiday event). The orchestrator hydrates this from a small
   *  2-day lookback so the `last_day_long_weekend` branch of week-ahead can
   *  actually fire. Defaults to 0 — leaving it unset just disables that
   *  branch, it never breaks the resolver.
   *
   *  Why 2 and not more: the only downstream consumer,
   *  `evaluateWeekAheadMode`, triggers at `>= 2`. A deeper lookback would be
   *  wasted work today. If a future rule needs a larger horizon, extend the
   *  orchestrator query and the doc here together. */
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

function toAvailabilityEvents(events: DayTypeEventLite[]): AvailabilityEvent[] {
  return events.map((e) => ({
    title: String(e.title ?? ""),
    startTime: String(e.start_time ?? ""),
    endTime: String(e.end_time ?? e.start_time ?? ""),
    isAllDay: e.is_all_day === true,
    attendeesCount: Number(e.attendees_count ?? 0) || 0,
    source: e.source ?? null,
    calendarSummary: e.calendar_summary ?? null,
  }));
}

function hasRealMeeting(events: DayTypeEventLite[]): boolean {
  return events.some((e) => {
    if (e.is_all_day === true) return false;
    if (isTravelTitle(e.title ?? "")) return false;
    // Attendee count is a soft signal; the presence of a non-all-day, non-PTO
    // event is enough to count as "a meeting slipped in".
    return true;
  });
}

/**
 * Total meeting minutes today across real meetings (excluding all-day,
 * PTO/holiday, and travel-titled events). Used by the light-day heuristic so
 * "one 3-hour offsite" is not mistaken for a light day just because it is a
 * single event.
 */
function realMeetingMinutes(events: DayTypeEventLite[]): number {
  let mins = 0;
  for (const e of events) {
    if (e.is_all_day === true) continue;
    if (isTravelTitle(e.title ?? "")) continue;
    const start = Date.parse(e.start_time);
    const end = Date.parse(e.end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    mins += Math.round((end - start) / 60000);
  }
  return mins;
}

/**
 * Travel comes from the single travel SSOT (`deriveTravelDay`) — the same
 * verdict Brief, Plan and Nudges consume — so a location-only trip window
 * (domestic intercity travel with no calendar block) counts here too, and a
 * stale `state` can no longer assert travel on its own.
 */
function isTravelActive(
  input: DayTypeInput,
  todayEvents: DayTypeEventLite[],
): boolean {
  const verdict = deriveTravelDay(
    (input.travel ?? null) as Record<string, unknown> | null,
    { now: input.now, currentTimezone: input.currentTimezone ?? null },
  );
  if (verdict.travelDay) return true;
  // Fallback: no usable travel_state evidence but a travel-titled event
  // lives on today.
  return todayEvents.some((e) => isTravelTitle(e.title ?? ""));
}

/**
 * Resolve the canonical day-type and the windows the orchestrator is allowed
 * to dispatch on. Pure — same inputs, same output.
 */
export function resolveDayTypeAndCadence(input: DayTypeInput): DayTypeDecision {
  const local = localParts(input.effectiveTimezone, input.now);
  const localDayDate = new Date(`${local.localDate}T12:00:00Z`);
  const tomorrowLocalDayDate = new Date(`${local.localDate}T12:00:00Z`);
  tomorrowLocalDayDate.setUTCDate(tomorrowLocalDayDate.getUTCDate() + 1);
  const dayOfWeek = dayOfWeekFromIsoDate(local.localDate);

  const travelDay = isTravelActive(input, input.todayEvents);
  const todayAvailability = classifyAvailability({
    now: localDayDate,
    userHomeCountry: input.userHomeCountry ?? null,
    userCurrentCountry: input.userCurrentCountry ?? null,
    explicitPto: input.explicitPto === true,
    events: toAvailabilityEvents(input.todayEvents),
  });
  const tomorrowAvailability = classifyDay({
    now: tomorrowLocalDayDate,
    userHomeCountry: input.userHomeCountry ?? null,
    userCurrentCountry: input.userCurrentCountry ?? null,
    events: toAvailabilityEvents(input.tomorrowEvents),
  });
  const ptoToday =
    todayAvailability.state === "PTO" || todayAvailability.state === "PUBLIC_HOLIDAY";
  const meetingToday = hasRealMeeting(input.todayEvents);
  const meetingMinutesToday = realMeetingMinutes(input.todayEvents);
  const ptoTomorrow =
    tomorrowAvailability.state === "PTO" || tomorrowAvailability.state === "PUBLIC_HOLIDAY";
  const planningDay = planningDayOfWeek(input.userHomeCountry ?? null);
  const recoveryDay = planningDay === 6 ? 5 : 6;
  const weeklyPlanningDay = planningDay;
  const isWeekend = dayOfWeek === recoveryDay || dayOfWeek === weeklyPlanningDay;

  // Week-ahead evaluator owns the "last day of block" decisions. We only need
  // it when we might land in a week-ahead surface (Sunday, or the tail of a
  // PTO/holiday/long-weekend block).
  const weekAhead = evaluateWeekAheadMode({
    dayOfWeek,
    localHour: local.hour,
    homeCountry: input.userHomeCountry ?? null,
    travelDay,
    ptoTodayAllDay: ptoToday,
    ptoTomorrowAllDay: ptoTomorrow,
    holidayAllDayEventToday: todayAvailability.state === "PUBLIC_HOLIDAY",
    tomorrowIsWorkday: !tomorrowAvailability.isOffDay,
    // Last-day-only rule: a run that continues into tomorrow keeps the
    // Week-Ahead surface for its final day.
    tomorrowIsOffDay: tomorrowAvailability.isOffDay,
    // This orchestrator does not carry a full ≥3-day lookback, so the
    // end_of_long_weekend branch is intentionally left to smart-nudges,
    // which walks the full 14-day calendar via the Availability SSOT.
    isLastDayOfLongWeekend: false,
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

  // 2. WEEK-AHEAD — end_of_pto / end_of_public_holiday / end_of_long_weekend
  //    (weekly_planning day is handled below as a distinct weekend_sunday
  //    day-type so we don't collapse ordinary weekly-planning nudge cadence
  //    into week-ahead cadence.)
  if (
    weekAhead.active &&
    weekAhead.reason &&
    weekAhead.reason !== "weekly_planning" &&
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
        evidence: [`availability=${todayAvailability.state.toLowerCase()}`, "meeting_slipped_in"],
      };
    }
    return {
      dayType: "pto",
      // Matches ceo-behaviour/pto-holiday.ts copyHint: "morning only; suppress
      // afternoon/evening notifications". Orchestrator centralises that here.
      allowedWindows: new Set<TimeWindow>(["morning"]),
      weekAheadReason: null,
      evidence: [`availability=${todayAvailability.state.toLowerCase()}`],
    };
  }

  // 4. WEEKEND — recovery day is locale-aware (Saturday in Sunday-start
  //    countries, Friday in Saturday-start countries). The following day is
  //    the plain weekly-planning trigger.
  if (dayOfWeek === recoveryDay) {
    if (isSaturdayRecoveryDay({
      dayOfWeek: recoveryDay,
      localHour: local.hour,
      homeCountry: input.userHomeCountry ?? null,
      travelDay: false,
    })) {
      return {
        dayType: "weekend_saturday",
        allowedWindows: new Set<TimeWindow>(["morning", "evening"]),
        weekAheadReason: null,
        evidence: ["weekend_recovery_day"],
      };
    }
  }
  if (dayOfWeek === weeklyPlanningDay) {
    return {
      dayType: "weekend_sunday",
      allowedWindows: new Set<TimeWindow>(["morning", "evening"]),
      weekAheadReason: "weekly_planning",
      evidence: ["weekend_weekly_planning_day"],
    };
  }

  // 5. LIGHT DAY — workday with negligible meeting load. Skip the afternoon
  //    regen (there is no midday load to react to) but keep morning + evening
  //    for orientation and close-out.
  //
  //    Heuristic: workday with either zero real meetings OR total real-meeting
  //    load < 60 min (a couple of short syncs, no anchoring block). A single
  //    long meeting (offsite, board slot, 90-min interview) intentionally
  //    trips out of light-day so the afternoon regen still fires.
  //
  //    TRADEOFF (intentional): we do NOT read `context.calendarDemandScore`
  //    here. That score is computed by the daily-context pipeline that runs
  //    AFTER the day-type gate (MRS depends on it), so pulling it up would
  //    force a second compose pass or duplicate the scorer. Meeting-minutes
  //    is a cheap, monotonic proxy: it correlates with demand well enough for
  //    a cadence decision, and the worst case is one extra afternoon regen
  //    that downstream can no-op cheaply — never a suppressed real load day.
  const LIGHT_DAY_MEETING_MINUTES_MAX = 60;
  if (
    !isWeekend &&
    (!meetingToday || meetingMinutesToday < LIGHT_DAY_MEETING_MINUTES_MAX)
  ) {
    return {
      dayType: "light_day",
      allowedWindows: new Set<TimeWindow>(["morning", "evening"]),
      weekAheadReason: null,
      evidence: meetingToday
        ? [`workday_low_load=${meetingMinutesToday}min`]
        : ["workday_no_meetings"],
    };
  }

  // 6. REGULAR WORKDAY — full cadence.
  return {
    dayType: "workday",
    allowedWindows: new Set<TimeWindow>(ALL_WINDOWS),
    weekAheadReason: null,
    evidence: [`local_dow=${dayOfWeek}`],
  };
}
