/**
 * week-ahead-hydration.ts — one shared hydrator that turns raw calendar rows
 * into the full input set `evaluateWeekAheadMode()` needs.
 *
 * WHY THIS EXISTS
 * Before this module only `smart-nudges` hydrated PTO / public-holiday /
 * long-weekend flags; the Plan and the Brief called `evaluateWeekAheadMode`
 * with `dayOfWeek` + `localHour` only, so branches 2–4 of the waterfall
 * (end_of_pto / end_of_public_holiday / end_of_long_weekend) could never
 * fire on those surfaces. A UK bank-holiday Monday that closed a long
 * weekend therefore rendered a normal day-of Plan and a weekend-flavoured
 * Brief.
 *
 * No new detection logic lives here: every day is classified through the
 * Availability SSOT (`classifyDay`) and the long-weekend verdict comes from
 * `isLastDayOfLongWeekend`. Empty calendars are never off-days.
 */

import {
  type AvailabilityEvent,
  type AvailabilityState,
  classifyDay,
  isLastDayOfLongWeekend,
} from "./availability-classifier.ts";
import { eventOverlapsDay } from "../signal-engine/db-queries.ts";

/** Loose calendar row shape — accepts snake_case DB rows or camelCase. */
export interface RawCalendarRow {
  title?: string | null;
  start_time?: string | null;
  startTime?: string | null;
  end_time?: string | null;
  endTime?: string | null;
  is_all_day?: boolean | null;
  isAllDay?: boolean | null;
  is_organizer?: boolean | null;
  isOrganizer?: boolean | null;
  attendees_count?: number | null;
  attendeesCount?: number | null;
  source?: string | null;
  calendar_name?: string | null;
  calendar_summary?: string | null;
  calendarSummary?: string | null;
  [k: string]: unknown;
}

export interface WeekAheadHydrationInput {
  /** User-local "now". */
  localNow: Date;
  /** ISO-2 home country (profiles.country). Drives holiday applicability. */
  homeCountry?: string | null;
  /** Current country when travelling (holiday lookups only). */
  currentCountry?: string | null;
  /** Local weekend days (0=Sun … 6=Sat). */
  weekendDays?: number[];
  /** Today's calendar rows. */
  todayEvents?: RawCalendarRow[] | null;
  /** Tomorrow's calendar rows. */
  tomorrowEvents?: RawCalendarRow[] | null;
  /** Rows covering the previous ≤14 days (any order). */
  lookbackEvents?: RawCalendarRow[] | null;
  /** User-approved PTO flag, when a surface already knows it. */
  explicitPto?: boolean;
}

export interface WeekAheadHydration {
  ptoTodayAllDay: boolean;
  ptoTomorrowAllDay: boolean;
  holidayAllDayEventToday: boolean;
  tomorrowIsWorkday: boolean;
  /** Tomorrow is itself an off-day → today is NOT the last day of the run. */
  tomorrowIsOffDay: boolean;
  isLastDayOfLongWeekend: boolean;
  todayIsOffDay: boolean;
  /** Diagnostics — safe to log. */
  todayState: AvailabilityState;
  tomorrowState: AvailabilityState;
}

function toAvailEvent(e: RawCalendarRow): AvailabilityEvent {
  const start = String(e.start_time ?? e.startTime ?? "");
  const end = String(e.end_time ?? e.endTime ?? start);
  const spansDay = (() => {
    const s = new Date(start).getTime();
    const t = new Date(end).getTime();
    return Number.isFinite(s) && Number.isFinite(t) &&
      (t - s) >= 20 * 3600 * 1000;
  })();
  return {
    title: String(e.title ?? ""),
    startTime: start,
    endTime: end,
    isAllDay: e.is_all_day === true || e.isAllDay === true || spansDay,
    isOrganizer: e.is_organizer === true || e.isOrganizer === true,
    attendeesCount: Number(e.attendees_count ?? e.attendeesCount ?? 0) || 0,
    source: (e.source ?? e.calendar_name ?? null) as string | null,
    calendarSummary: (e.calendar_summary ?? e.calendarSummary ?? null) as
      | string
      | null,
  };
}

/** UTC calendar-day key. Matches how calendar rows are bucketed elsewhere. */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Hydrate the full Week-Ahead input set. Fail-open: any missing source falls
 * back to a safe value (WORKDAY / not-off) rather than throwing, so the
 * evaluator always runs.
 */
export function hydrateWeekAheadInputs(
  input: WeekAheadHydrationInput,
): WeekAheadHydration {
  const weekendDays = input.weekendDays ?? [0, 6];
  const homeCountry = input.homeCountry ?? null;
  const currentCountry = input.currentCountry ?? null;
  const now = input.localNow;

  const classify = (
    when: Date,
    rows: RawCalendarRow[] | null | undefined,
    explicitPto = false,
  ): { state: AvailabilityState; isOffDay: boolean } => {
    try {
      const r = classifyDay({
        now: when,
        userHomeCountry: homeCountry,
        userCurrentCountry: currentCountry,
        weekendDays,
        explicitPto,
        events: (rows ?? []).map(toAvailEvent),
      });
      return { state: r.state, isOffDay: r.isOffDay };
    } catch {
      const isWeekend = weekendDays.includes(when.getDay());
      return {
        state: isWeekend ? "REST_DAY" : "WORKDAY",
        isOffDay: isWeekend,
      };
    }
  };

  const today = classify(now, input.todayEvents, input.explicitPto === true);

  const tomorrowDate = new Date(now.getTime());
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = classify(tomorrowDate, input.tomorrowEvents);

  // Bucket the lookback rows by UTC day using OVERLAP, not start date, so a
  // multi-day stay / OOO block is present on every day it covers (SSOT v2).
  const lookback = (input.lookbackEvents ?? []) as RawCalendarRow[];
  const rowsForDay = (iso: string): RawCalendarRow[] =>
    lookback.filter((e) =>
      eventOverlapsDay(e as any, `${iso}T00:00:00.000Z`, `${iso}T23:59:59.999Z`)
    );

  const priorDays: Array<{ state: AvailabilityState }> = [];
  const cursor = new Date(now.getTime());
  for (let i = 0; i < 14; i++) {
    cursor.setDate(cursor.getDate() - 1);
    const rows = rowsForDay(dayKey(cursor));
    const r = classify(new Date(cursor.getTime()), rows);
    priorDays.push({ state: r.state });
    if (!r.isOffDay) break;
  }


  const longWeekend = isLastDayOfLongWeekend({
    today: { state: today.state },
    tomorrowIsWorkday: !tomorrow.isOffDay,
    priorDays,
  });

  return {
    ptoTodayAllDay: today.state === "PTO",
    ptoTomorrowAllDay: tomorrow.state === "PTO",
    holidayAllDayEventToday: today.state === "PUBLIC_HOLIDAY",
    tomorrowIsWorkday: !tomorrow.isOffDay,
    tomorrowIsOffDay: tomorrow.isOffDay,
    isLastDayOfLongWeekend: longWeekend,
    todayIsOffDay: today.isOffDay,
    todayState: today.state,
    tomorrowState: tomorrow.state,
  };
}
