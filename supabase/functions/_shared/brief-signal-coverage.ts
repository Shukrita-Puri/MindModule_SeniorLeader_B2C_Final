// OWNERSHIP: engineering.
//
// SINGLE SOURCE OF MECHANICAL SIGNAL COVERAGE for BRIEF, NUDGES and PLAN.
// (The filename is legacy — predates the shared CEO-behaviour module. Do not
// rename; many callers import from this path.)
//
// Every mechanical/deterministic signal that any surface rule reads is
// derived here. Triangulation (mood × wearable × calendar fusion, user tags,
// social-load inference) is the Edge consumer's job — it writes those fields
// onto the matrix after calling `buildSignalMatrix`.
//
// This module is a pure builder: it does NOT fetch from the database. The
// consumer (typically compute-outer-readiness, smart-nudges-evaluator, or
// generate-mastery-plan) is responsible for fetching and passes raw blocks in.

import type { SignalMatrix, RuleContext } from "./brief-context.ts";
// A–H resolution via the single canonical entry point (overrides + learned
// tokens + persisted category + dictionary).
import { resolveEvent, type ResolveEventInput } from "./events/resolve-event-category.ts";
const classifyEvent = (input: ResolveEventInput) => resolveEvent(input).subtype;
import {
  isTravelTitle,
  isAwayFromHome,
  isSameDayRoundTrip,
  classifyTravelTier,
  LONG_HAUL_MIN_HOURS,
} from "./ceo-behaviour/travel.ts";
import { isPtoOrHolidayTitle, isPersonalHolidayTitle } from "./ceo-behaviour/pto-holiday.ts";
import {
  titleDecisionScore,
  attendeeWeight,
} from "./ceo-behaviour/decision-density.ts";
import {
  classifyAvailability,
  type AvailabilityResult,
  type AvailabilityEvent,
} from "./availability/availability-classifier.ts";

// --- Travel & Holiday detection v2 tuning constants (file-local SSOT). -----
// Plan-approved values; bumping these is a deliberate behaviour change.
const POST_FLIGHT_WINDOW_SHORT_HOURS = 6;
const POST_FLIGHT_WINDOW_LONG_HOURS = 24;
const HOLIDAY_WEEKDAY_RUN_MIN = 4;
const MID_TRIP_LOOKBACK_DAYS = 2;
const RETURN_LEG_LOOKBACK_DAYS = 7;
const HALF_DAY_PTO_RX = /\b(half[- ]day|afternoon off|morning off)\b/i;

/** Raw inputs the consumer already has. All fields optional / nullable. */
export interface SignalCoverageInput {
  wearable: {
    hrvDeviationPct: number | null;
    hrvUnusual?: boolean;
    sleepHours: number | null;
    sleepDeviationPct: number | null;
    rhrDeviationPct: number | null;
    hrElevatedProxy?: boolean;
  } | null;
  checkIn: {
    emotionalSelfDeclared?: string | null;
    mentalSharpness?: number | null;
    confidence?: number | null;
    clarity?: number | null;
  } | null;
  scoreToday: number | null;
  scoreYesterday: number | null;
  trailingClarityAvg?: number | null;
  timezone: {
    offsetMinutes: number | null;
    shift48hHours: number | null;
    travelDay?: boolean;
    /** Edge-owned: true when today's local TZ differs from user's home TZ. */
    shiftedTimezoneToday?: boolean;
    /** Edge-owned: details of a long-haul flight in today's calendar. */
    longHaulFlight?: { durationHours: number } | null;
  };
  /** Part 1 — travel_state snapshot. Optional. When omitted, `awayFromHome`
   *  is left undefined and downstream rules fail open (assume away). */
  travelState?: {
    state?: string | null;
    distanceFromHomeKm?: number | null;
  } | null;
  /** Calendar events in chronological order, all in user's local timezone. */
  events: Array<{
    title: string;
    startTime: string | Date;
    endTime?: string | Date | null;
    isAllDay?: boolean;
    stakesLevel?: string | null;
    status?: "confirmed" | "tentative" | "declined" | "cancelled";
    isWeekend?: boolean;
    /** Work-evidence inputs for the Availability SSOT — optional. When
     *  present, the canonical classifier can override PTO/holiday
     *  framing on days with genuine work meetings (e.g. Saturday with
     *  3 client calls → WORKDAY). Consumers that don't surface these
     *  yet degrade to workload-only classification. */
    isOrganizer?: boolean;
    attendeesCount?: number;
    source?: string | null;
    calendarSummary?: string | null;
  }>;
  /** Optional trailing 4 days of events (1..4 days ago) used by the
   *  conference cluster's trailing-fatigue computation. Omit and trailing
   *  signals stay 0 / null — rules silently no-op. */
  trailingEvents?: Array<{
    title: string;
    startTime: string | Date;
    endTime?: string | Date | null;
    isAllDay?: boolean;
    daysAgo: number;
  }>;
  /** Tomorrow's events. Drives `conferenceStartsTomorrow`. */
  tomorrowEvents?: Array<{
    title: string;
    startTime: string | Date;
    endTime?: string | Date | null;
    isAllDay?: boolean;
  }>;
  /** Next 3 days of events (excluding today). Drives `nextThreeDaysMeetingCount`
   *  used by `postConferenceReentry` and `trailingConferenceLoad`. */
  nextThreeDaysEvents?: Array<{
    title: string;
    startTime: string | Date;
    isAllDay?: boolean;
  }>;
  /** Optional wide context window for pattern-based holiday + multi-day trip
   *  span detection. Up to 14 days back / 14 days forward, signed dayOffset
   *  (excludes today). When omitted, ALL pattern-based detection (holiday-by-
   *  pattern, mid-trip days, return-leg) silently no-ops — only title-based
   *  PTO and same-day post-flight scan run. Consumer must pre-compute
   *  `isWeekend` from the user's local TZ. */
  surroundingEvents?: Array<{
    title: string;
    startTime: string | Date;
    endTime?: string | Date | null;
    isAllDay?: boolean;
    dayOffset: number;
    status?: "confirmed" | "tentative" | "declined" | "cancelled";
    isWeekend?: boolean;
  }>;
  /** Now reference, used for minutesUntil. Pass user's local now. */
  now: Date;
  /** Optional morning-compressed flag (consumer can pre-compute from
   *  early-morning HRV / sleep). If omitted we infer from current signals. */
  morningWasCompressed?: boolean;
  /** Optional midday-recovery flag (consumer pre-computes from HR/HRV trend). */
  middayRecoveryDetected?: boolean;
  /** User home country from profiles.country (nullable). Feeds the canonical
   *  availability classifier so region-qualified holidays and FYI holiday
   *  calendars are gated by geography, not just title regex. */
  userHomeCountry?: string | null;
  /** Reserved for future Travel SSOT — the country the user is physically in
   *  today. When unset the classifier falls back to `userHomeCountry`. */
  userCurrentCountry?: string | null;
  /** User-approved PTO/annual-leave (from onboarding/UI). Optional. */
  explicitPto?: boolean;
  /** Workload hint from upstream calendar-load classifier. Optional. */
  calendarLoad?: "low" | "medium" | "high" | string | null;
}

const HIGH_STAKES_LEVELS = new Set(["board", "external", "investor"]);

// --- Conference / Summit cluster (v2) -------------------------------------
// Tier-1 regex. Tier-2 (day-N inference) groups consecutive days containing
// CONFERENCE_RX hits or a stable normalized title. Tier-3 (user tags) is set
// by Edge as `userTaggedConferenceToday` / `userTaggedSpeakingToday`.
export const SPEAKING_RX =
  /\b(panel|fireside|keynote|speaking|on[- ]stage|presenting|talk|moderat\w+|q\s?&\s?a|address|remarks)\b/i;
export const CONFERENCE_RX =
  /\b(summit|conference|convention|forum|expo|symposium|congress|offsite)\b/i;

type SpeakingKind = "panel" | "fireside" | "keynote" | "talk" | "moderator" | "qa" | "other";

function classifySpeakingKind(title: string): SpeakingKind {
  if (/\bpanel\b/i.test(title)) return "panel";
  if (/\bfireside\b/i.test(title)) return "fireside";
  if (/\bkeynote\b/i.test(title)) return "keynote";
  if (/\bmoderat/i.test(title)) return "moderator";
  if (/\bq\s?&\s?a\b/i.test(title)) return "qa";
  if (/\b(talk|address|remarks|presenting|speaking|on[- ]stage)\b/i.test(title)) return "talk";
  return "other";
}

function normalizeConferenceTitle(t: string): string {
  return t.toLowerCase()
    .replace(/\bday\s*\d+\b/gi, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// --- Travel & Holiday detection v2 helpers ---------------------------------
// All pure. Operate over the augmented event shapes (today's `events[]` and
// `surroundingEvents[]`). Missing `status` defaults to "confirmed".

type EventStatus = "confirmed" | "tentative" | "declined" | "cancelled";
interface EventLike {
  title: string;
  startTime: string | Date;
  endTime?: string | Date | null;
  isAllDay?: boolean;
  status?: EventStatus;
  isWeekend?: boolean;
}

function isConfirmedEvt(e: { status?: EventStatus }): boolean {
  const s = e.status ?? "confirmed";
  return s === "confirmed" || s === "tentative";
}

function isMeetingLikeEvt(e: EventLike): boolean {
  if (!isConfirmedEvt(e)) return false;
  if (e.isAllDay) return false;
  // Exclude travel and PTO-marker titles from "meeting" counts.
  if (isTravelTitle(e.title)) return false;
  if (isPtoOrHolidayTitle(e.title)) return false;
  const dur = eventDurationMin(e);
  if (dur != null && dur <= 0) return false;
  return true;
}

function isTravelLikeEvt(e: EventLike): boolean {
  return isConfirmedEvt(e) && isTravelTitle(e.title);
}

function isConferenceLikeEvt(e: EventLike): boolean {
  if (!isConfirmedEvt(e)) return false;
  if (!CONFERENCE_RX.test(e.title) && !SPEAKING_RX.test(e.title)) return false;
  if (e.isAllDay) return true;
  const dur = eventDurationMin(e);
  return typeof dur === "number" && dur >= 240;
}

interface DayShape {
  hasMeeting: boolean;
  hasTravel: boolean;
  hasPtoMarker: boolean;
  hasConference: boolean;
  isWeekend: boolean;
  isEmpty: boolean;
}

function buildDayShape(
  todayEvents: ReadonlyArray<EventLike>,
  surrounding: ReadonlyArray<EventLike & { dayOffset: number }> | undefined,
): Map<number, DayShape> {
  const map = new Map<number, DayShape>();
  const ensure = (offset: number, isWeekend: boolean): DayShape => {
    let s = map.get(offset);
    if (!s) {
      s = {
        hasMeeting: false,
        hasTravel: false,
        hasPtoMarker: false,
        hasConference: false,
        isWeekend,
        isEmpty: true,
      };
      map.set(offset, s);
    }
    // Once weekend is true on any event for the day, persist it.
    if (isWeekend) s.isWeekend = true;
    return s;
  };
  const merge = (s: DayShape, e: EventLike) => {
    s.isEmpty = false;
    if (isMeetingLikeEvt(e)) s.hasMeeting = true;
    if (isTravelLikeEvt(e)) s.hasTravel = true;
    if (e.isAllDay && isPtoOrHolidayTitle(e.title) && isConfirmedEvt(e)) s.hasPtoMarker = true;
    if (isConferenceLikeEvt(e)) s.hasConference = true;
  };
  // Today (offset 0). isWeekend on today comes from any event's flag.
  const todayWeekend = todayEvents.some((e) => e.isWeekend === true);
  // Ensure today exists even when empty.
  const todayShape = ensure(0, todayWeekend);
  for (const e of todayEvents) merge(todayShape, e);
  for (const e of surrounding ?? []) {
    const s = ensure(e.dayOffset, e.isWeekend === true);
    merge(s, e);
  }
  return map;
}

/** Walks weekdays outward from `centerOffset` in both directions. Weekends
 *  are skipped (do not break the run and do not count). Stops when a weekday
 *  fails `predicate` OR when no shape exists for that offset. The center day
 *  itself must satisfy the predicate (returns 0 otherwise). */
function countConsecutiveWeekdayRun(
  shape: Map<number, DayShape>,
  predicate: (d: DayShape) => boolean,
  centerOffset = 0,
  maxRadius = 14,
): number {
  const center = shape.get(centerOffset);
  if (!center || center.isWeekend || !predicate(center)) return 0;
  let count = 1;
  for (const dir of [-1, 1] as const) {
    for (let step = 1; step <= maxRadius; step += 1) {
      const off = centerOffset + dir * step;
      const s = shape.get(off);
      if (!s) break;
      if (s.isWeekend) continue; // skip but keep walking
      if (!predicate(s)) break;
      count += 1;
    }
  }
  return count;
}

function lastTravelWithinDays(
  shape: Map<number, DayShape>,
  n: number,
): number | null {
  for (let off = -1; off >= -n; off -= 1) {
    const s = shape.get(off);
    if (s?.hasTravel) return off;
  }
  return null;
}

function nextTravelWithinDays(
  shape: Map<number, DayShape>,
  n: number,
): number | null {
  for (let off = 1; off <= n; off += 1) {
    const s = shape.get(off);
    if (s?.hasTravel) return off;
  }
  return null;
}

/** Was there a confirmed work meeting on any day in [fromOffset..toOffset]? */
function anyMeetingInRange(
  shape: Map<number, DayShape>,
  fromOffset: number,
  toOffset: number,
): boolean {
  const [a, b] = fromOffset <= toOffset ? [fromOffset, toOffset] : [toOffset, fromOffset];
  for (let off = a; off <= b; off += 1) {
    if (shape.get(off)?.hasMeeting) return true;
  }
  return false;
}

function eventDurationMin(
  e: { startTime: string | Date; endTime?: string | Date | null },
): number | null {
  if (!e.endTime) return null;
  const s = typeof e.startTime === "string" ? new Date(e.startTime).getTime() : e.startTime.getTime();
  const en = typeof e.endTime === "string" ? new Date(e.endTime).getTime() : (e.endTime as Date).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(en)) return null;
  return Math.max(0, Math.round((en - s) / 60000));
}

function minutesUntil(start: string | Date, now: Date): number {
  const t = typeof start === "string" ? new Date(start).getTime() : start.getTime();
  return Math.round((t - now.getTime()) / 60000);
}

/** Returns true if the event title classifies into a People & Difficult
 *  Conversations / Influence-emotional / Visibility-personal slot per taxonomy. */
function isEmotionalDrainEvent(title: string): boolean {
  const ev = classifyEvent(title);
  if (!ev) return false;
  // Pillar D = Interpersonal High-Stakes (canonical categoryId).
  return ev.categoryId === "D" ||
    /1on1|layoff|review|escalation|town hall|townhall|difficult/i.test(ev.id + " " + (ev.label || ""));
}

export function buildSignalMatrix(input: SignalCoverageInput): SignalMatrix {
  const wear = input.wearable ?? {
    hrvDeviationPct: null,
    sleepHours: null,
    sleepDeviationPct: null,
    rhrDeviationPct: null,
  };
  const checkIn = input.checkIn ?? {};

  // --- Canonical Availability SSOT ----------------------------------------
  // Compute the single-source availability decision up front so every
  // downstream derivation (ptoTodayAllDay, personalHolidayInferred, rule
  // context) reads from the same answer. See `_shared/availability/*`.
  const availability: AvailabilityResult = classifyAvailability({
    now: input.now,
    userHomeCountry: input.userHomeCountry ?? null,
    userCurrentCountry: input.userCurrentCountry ?? null,
    explicitPto: input.explicitPto === true,
    calendarLoad: input.calendarLoad ?? null,
    events: input.events.map((e): AvailabilityEvent => ({
      title: String(e.title || ''),
      startTime: typeof e.startTime === 'string'
        ? e.startTime
        : (e.startTime instanceof Date ? e.startTime.toISOString() : ''),
      endTime: typeof e.endTime === 'string'
        ? e.endTime
        : (e.endTime instanceof Date ? e.endTime.toISOString() : (
            typeof e.startTime === 'string'
              ? e.startTime
              : (e.startTime instanceof Date ? e.startTime.toISOString() : '')
          )),
      isAllDay: e.isAllDay === true,
      isOrganizer: (e as any).isOrganizer === true,
      attendeesCount: Number((e as any).attendeesCount ?? 0) || 0,
      source: (e as any).source ?? null,
      calendarSummary: (e as any).calendarSummary ?? null,
    })),
  });

  // Pre-compute next-event slices.
  const futureEvents = input.events
    .map((e) => ({
      title: e.title,
      minutesUntil: minutesUntil(e.startTime, input.now),
      stakesLevel: e.stakesLevel ?? null,
    }))
    .filter((e) => e.minutesUntil >= 0)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  const emotionalDrainNext4h =
    futureEvents.find(
      (e) => e.minutesUntil <= 240 && isEmotionalDrainEvent(e.title),
    ) ?? null;

  const emotionalDrainNext24h =
    futureEvents.find(
      (e) => e.minutesUntil <= 24 * 60 && isEmotionalDrainEvent(e.title),
    ) ?? null;

  const highStakesNext24h =
    futureEvents.find(
      (e) =>
        e.minutesUntil <= 24 * 60 &&
        e.stakesLevel != null &&
        HIGH_STAKES_LEVELS.has(e.stakesLevel.toLowerCase()),
    ) ?? null;

  const isHighVisibilityToday = highStakesNext24h !== null;

  // --- Travel shape: FIRST travel event of the day owns the pre-flight window.
  //     60–240 min window matches legacy smart-nudges preFlight detector. Long
  //     gaps and connection legs are the Edge consumer's job (see
  //     `inFlightConnectionMinutes`).
  const firstTravelToday = futureEvents.find(
    (e) => e.minutesUntil <= 24 * 60 && isTravelTitle(e.title),
  ) ?? null;
  const preFlightWindowMinutes =
    firstTravelToday &&
    firstTravelToday.minutesUntil >= 60 &&
    firstTravelToday.minutesUntil <= 240
      ? firstTravelToday.minutesUntil
      : null;
  const nextTravelEventTitle = firstTravelToday ? firstTravelToday.title : null;

  // --- Travel cluster self-derivation ----------------------------------------
  // Brief↔Plan parity: travelDay and longHaulFlight must reflect calendar
  // shape (any travel-titled event today) — NOT only timezone deltas.
  // Before this block, callers that set `timezone.travelDay = false` on the
  // morning of an outbound flight (user still in home TZ) caused every
  // travel.ts rule to short-circuit, so Brief never named the flight while
  // Plan still anchored on it via JIT/event-taxonomy. Self-deriving here
  // closes the gap for every consumer of this module.
  const travelDayDerived =
    (input.timezone.travelDay ?? false) || !!firstTravelToday;

  // longHaulFlight: prefer caller value, else derive from today's travel
  // events' duration. Picks the longest travel event today (handles
  // multi-leg itineraries where the long-haul leg matters most).
  let longHaulFlightDerived: { durationHours: number } | null =
    input.timezone.longHaulFlight ?? null;
  if (!longHaulFlightDerived) {
    let maxDurH = 0;
    for (const e of input.events) {
      if (!isTravelTitle(e.title)) continue;
      const dm = eventDurationMin(e);
      if (dm == null) continue;
      const h = dm / 60;
      if (h > maxDurH) maxDurH = h;
    }
    if (maxDurH >= 3) {
      longHaulFlightDerived = { durationHours: Math.round(maxDurH * 10) / 10 };
    }
  }

  // --- Travel & Holiday detection v2 ---------------------------------------
  // See plan doc: gaps #1 mid-trip, #2 return leg, #3 long-haul window,
  // #4 weekend-straddling holiday, #5 conference guard, #6 workcation,
  // #7 half-day PTO, #9 declined/cancelled meetings.
  //
  // Pattern-based branches silently no-op when `surroundingEvents` is not
  // supplied. Title-based PTO and same-day post-flight scan always run.
  const todayEventsV2: EventLike[] = input.events;
  const shape = buildDayShape(todayEventsV2, input.surroundingEvents);

  // --- ptoTodayAllDay ------------------------------------------------------
  // A. All-day PTO/holiday title, NOT a conference/offsite.
  const ptoTitleAllDay = input.events.some(
    (e) =>
      e.isAllDay === true &&
      isConfirmedEvt(e) &&
      isPtoOrHolidayTitle(e.title) &&
      !CONFERENCE_RX.test(e.title) &&
      !SPEAKING_RX.test(e.title),
  );
  // B. Half-day PTO: timed PTO marker OR half-day-pattern title.
  const halfDayPto = input.events.some(
    (e) =>
      isConfirmedEvt(e) &&
      e.isAllDay !== true &&
      (isPtoOrHolidayTitle(e.title) || HALF_DAY_PTO_RX.test(e.title)),
  );
  // C. Pattern: ≥N consecutive zero-meeting weekdays around today.
  const todayShape = shape.get(0);
  const noMeetingPredicate = (d: DayShape) => !d.hasMeeting && !d.hasConference;
  const weekdayRunNoMeetings = input.surroundingEvents
    ? countConsecutiveWeekdayRun(shape, noMeetingPredicate, 0)
    : 0;
  const ptoByPattern =
    !!input.surroundingEvents &&
    todayShape != null &&
    !todayShape.isWeekend &&
    !todayShape.hasConference &&
    weekdayRunNoMeetings >= HOLIDAY_WEEKDAY_RUN_MIN;

  // Canonical override matrix:
  //   1. Classifier says PTO or applicable PUBLIC_HOLIDAY  → true (SSOT)
  //   2. Classifier says WORKDAY                            → undefined
  //      (work-evidence override — e.g. Sat with 3 client meetings)
  //   3. Classifier detected a holiday but decided it does NOT apply to
  //      the user (foreign region / foreign FYI feed)       → undefined
  //      (this is exactly the "Bank Holiday (N Ireland)" case we're
  //      fixing — the title regex WOULD trip legacy inference, but the
  //      SSOT already rejected it, so we suppress)
  //   4. Otherwise (LIGHT_ROUTINE / REST_DAY with no holiday hint)      →
  //      fall through to legacy title/pattern-based inference. This
  //      preserves the 4-weekday zero-meeting pattern, half-day PTO,
  //      and unqualified-title branches that Brief has always fired.
  const availStateForPto = availability.state;
  const legacyPtoInferred = ptoTitleAllDay || halfDayPto || ptoByPattern;
  const holidayRejectedByRegion =
    availability.holiday.detected && !availability.holiday.applicable;
  const ptoTodayAllDayDerived: true | undefined =
    availStateForPto === 'PTO' ||
    (availStateForPto === 'PUBLIC_HOLIDAY' && availability.holiday.applicable)
      ? true
      : availStateForPto === 'WORKDAY' || holidayRejectedByRegion
        ? undefined
        : legacyPtoInferred
          ? true
          : undefined;

  // --- personalHolidayInferred --------------------------------------------
  // A. Personal-leaning title on today's all-day event (with conference guard).
  const personalHolidayTitle = input.events.some(
    (e) =>
      e.isAllDay === true &&
      isConfirmedEvt(e) &&
      isPersonalHolidayTitle(e.title) &&
      !CONFERENCE_RX.test(e.title) &&
      !SPEAKING_RX.test(e.title),
  );
  // B + C. Pattern run of zero-meeting weekdays, no conference anywhere in
  // the run. Travel in the run is allowed (workcation / bleisure → personal).
  const personalHolidayByPattern = ptoByPattern;

  // personalHolidayInferred is a NARROWER signal than ptoTodayAllDay — it
  // only fires for personal-leaning titles ("Vacation", "Annual Leave") and
  // pattern-based runs. Plain "PTO" / "OOO" must NOT trip it. Applying the
  // classifier here would over-fire, so we keep the legacy narrow
  // derivation and only apply the SSOT to SUPPRESS it (WORKDAY override or
  // region-rejected holiday).
  const legacyPersonalHolidayInferred =
    personalHolidayTitle || personalHolidayByPattern;
  const personalHolidayInferredDerived: true | undefined =
    availStateForPto === 'WORKDAY' || holidayRejectedByRegion
      ? undefined
      : legacyPersonalHolidayInferred
        ? true
        : undefined;

  // --- ptoMeetingPresent ---------------------------------------------------
  // PTO day (any branch) + a confirmed timed meeting today that is not itself
  // the PTO marker. Half-day case: morning meeting + afternoon-off counts.
  const ptoMeetingPresentDerived =
    ptoTodayAllDayDerived === true &&
    input.events.some((e) => isMeetingLikeEvt(e))
      ? true
      : undefined;

  // --- workTravelInferred --------------------------------------------------
  // Multi-branch; true if any branch fires.
  const longHaul = !!longHaulFlightDerived &&
    longHaulFlightDerived.durationHours >= LONG_HAUL_MIN_HOURS;
  const flightEndMin = firstTravelToday
    ? (() => {
        const evt = input.events.find((e) => e.title === firstTravelToday.title && isTravelTitle(e.title));
        if (!evt?.endTime) return null;
        return minutesUntil(evt.endTime, input.now);
      })()
    : null;

  let workTravelInferredDerived: true | undefined = undefined;

  // Branch 1/2 — outbound: post-flight scan window depends on long-haul flag.
  if (firstTravelToday && flightEndMin != null) {
    const windowHours = longHaul ? POST_FLIGHT_WINDOW_LONG_HOURS : POST_FLIGHT_WINDOW_SHORT_HOURS;
    const windowEnd = flightEndMin + windowHours * 60;
    const meetingAfterLanding = futureEvents.find((fe) => {
      if (fe.minutesUntil < flightEndMin) return false;
      if (fe.minutesUntil > windowEnd) return false;
      if (isTravelTitle(fe.title)) return false;
      // Find the underlying event to check status / all-day.
      const underlying = input.events.find((e) => e.title === fe.title);
      if (underlying && !isMeetingLikeEvt(underlying)) return false;
      return true;
    });
    if (meetingAfterLanding) workTravelInferredDerived = true;
  }

  // Branch 3 — mid-trip day (no flight today but flight in last 1–2 days,
  // and TZ is shifted OR no return flight queued). Requires surroundingEvents.
  if (
    workTravelInferredDerived !== true &&
    !firstTravelToday &&
    input.surroundingEvents
  ) {
    const priorTravel = lastTravelWithinDays(shape, MID_TRIP_LOOKBACK_DAYS);
    if (priorTravel != null) {
      const tzShifted = input.timezone.shiftedTimezoneToday === true;
      const returnQueued = nextTravelWithinDays(shape, RETURN_LEG_LOOKBACK_DAYS) != null;
      const todayHasMeeting = input.events.some((e) => isMeetingLikeEvt(e));
      if ((tzShifted || !returnQueued) && todayHasMeeting) {
        workTravelInferredDerived = true;
      }
    }
  }

  // Branch 4 — return leg: flight today + prior work-travel span (travel +
  // confirmed meeting between the prior travel and today). Requires
  // surroundingEvents.
  if (
    workTravelInferredDerived !== true &&
    firstTravelToday &&
    input.surroundingEvents
  ) {
    const priorTravel = lastTravelWithinDays(shape, RETURN_LEG_LOOKBACK_DAYS);
    if (priorTravel != null && anyMeetingInRange(shape, priorTravel, -1)) {
      workTravelInferredDerived = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Conference / Summit cluster (v2) — mechanical signals.
  // All inputs are optional; missing inputs yield null/0 and the rule layer
  // silently no-ops. Triangulation fields (userTagged*) are NOT set here.
  // ---------------------------------------------------------------------------

  const todayHasConferenceWrapper = input.events.some((e) => {
    if (!CONFERENCE_RX.test(e.title)) return false;
    if (e.isAllDay) return true;
    const dur = eventDurationMin(e);
    return typeof dur === "number" && dur >= 240;
  });

  // Build trailing+today chain to compute Day N.
  const trailing = input.trailingEvents ?? [];
  const dayHasConferenceMarker = (offset: number, source: Array<{ title: string; isAllDay?: boolean; startTime: string|Date; endTime?: string|Date|null; daysAgo?: number }>) => {
    const pool = source.filter((e) => (e.daysAgo ?? 0) === offset);
    return pool.some((e) => {
      if (!CONFERENCE_RX.test(e.title)) return false;
      if (e.isAllDay) return true;
      const dur = eventDurationMin(e);
      return typeof dur === "number" && dur >= 240;
    });
  };

  // Conference day-N: walk back from today while previous day has a marker.
  let conferenceDayNumber: number | null = null;
  let conferenceTotalDays: number | null = null;
  let conferenceEventTitle: string | null = null;
  if (todayHasConferenceWrapper) {
    let back = 0;
    while (dayHasConferenceMarker(back + 1, trailing)) back += 1;
    conferenceDayNumber = back + 1;
    conferenceEventTitle =
      input.events.find((e) => CONFERENCE_RX.test(e.title))?.title ?? null;
    // Forward chain into tomorrow (one step lookahead — total may grow when
    // we re-evaluate tomorrow; that is acceptable for MVP).
    const tomorrowMarker = (input.tomorrowEvents ?? []).some((e) => {
      if (!CONFERENCE_RX.test(e.title)) return false;
      if (e.isAllDay) return true;
      const dur = eventDurationMin(e);
      return typeof dur === "number" && dur >= 240;
    });
    conferenceTotalDays = conferenceDayNumber + (tomorrowMarker ? 1 : 0);
  }

  // conferenceDayNumberYesterday: only set when yesterday was the LAST day of
  // a multi-day chain (i.e. yesterday had marker, today does not, chain length
  // ≥ 2 ending yesterday).
  let conferenceDayNumberYesterday: number | null = null;
  if (!todayHasConferenceWrapper && dayHasConferenceMarker(1, trailing)) {
    let back = 1;
    while (dayHasConferenceMarker(back + 1, trailing)) back += 1;
    if (back >= 2) conferenceDayNumberYesterday = back;
  }

  // conferenceStartsTomorrow: tomorrow has marker AND today does not.
  const tomorrowHasMarker = (input.tomorrowEvents ?? []).some((e) => {
    if (!CONFERENCE_RX.test(e.title)) return false;
    if (e.isAllDay) return true;
    const dur = eventDurationMin(e);
    return typeof dur === "number" && dur >= 240;
  });
  const conferenceStartsTomorrow = tomorrowHasMarker && !todayHasConferenceWrapper;
  if (conferenceStartsTomorrow && !conferenceEventTitle) {
    conferenceEventTitle =
      (input.tomorrowEvents ?? []).find((e) => CONFERENCE_RX.test(e.title))?.title ?? null;
  }

  // Speaking sub-blocks on today's calendar.
  const speakingBlocksToday = input.events
    .filter((e) => !e.isAllDay && SPEAKING_RX.test(e.title))
    .map((e) => {
      const dur = eventDurationMin(e);
      return {
        title: e.title,
        minutesUntil: minutesUntil(e.startTime, input.now),
        durationMinutes: dur,
        kind: classifySpeakingKind(e.title),
      };
    })
    .filter((b) => b.durationMinutes === null || b.durationMinutes >= 15);

  // First inter-session gap among today's timed events (sorted by start).
  const timedToday = input.events
    .filter((e) => !e.isAllDay && e.endTime)
    .map((e) => ({
      start: typeof e.startTime === "string" ? new Date(e.startTime).getTime() : e.startTime.getTime(),
      end: typeof e.endTime === "string" ? new Date(e.endTime as string).getTime() : (e.endTime as Date).getTime(),
    }))
    .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end))
    .sort((a, b) => a.start - b.start);
  let firstSessionGapMinutesToday: number | null = null;
  if (timedToday.length >= 2) {
    const gap = Math.round((timedToday[1].start - timedToday[0].end) / 60000);
    firstSessionGapMinutesToday = gap >= 0 ? gap : null;
  }

  // Parallel meetings on a conference day: timed events that are NOT the
  // conference wrapper (≥240min OR matches CONFERENCE_RX) and NOT speaking
  // sub-blocks. Counts both in-venue people-meetings and external meetings
  // clocked in alongside the summit. Distinguishes "exploring & learning"
  // (count=0) from "active engagement" (count≥1).
  let conferenceParallelMeetingsToday = 0;
  if (todayHasConferenceWrapper) {
    for (const e of input.events) {
      if (e.isAllDay) continue;
      if (CONFERENCE_RX.test(e.title)) continue;          // the wrapper itself
      if (SPEAKING_RX.test(e.title)) continue;            // covered by speaking rule
      const dur = eventDurationMin(e);
      if (typeof dur === "number" && dur >= 240) continue; // any long block ≈ wrapper
      if (typeof dur === "number" && dur < 15) continue;   // ignore micro-holds
      conferenceParallelMeetingsToday += 1;
    }
  }

  // Trailing 4-day conference day count (excluding today).
  let conferenceDaysInTrailing4 = 0;
  for (let d = 1; d <= 4; d += 1) {
    if (dayHasConferenceMarker(d, trailing)) conferenceDaysInTrailing4 += 1;
  }

  // Next 3 days meeting count (excluding all-day).
  const nextThreeDaysMeetingCount = input.nextThreeDaysEvents
    ? input.nextThreeDaysEvents.filter((e) => !e.isAllDay).length
    : null;

  // Composite trailing-conference load.
  let trailingConferenceLoad: "low" | "medium" | "high" = "low";
  const n3 = nextThreeDaysMeetingCount ?? 0;
  if (conferenceDaysInTrailing4 >= 2 && n3 >= 10) trailingConferenceLoad = "high";
  else if (conferenceDaysInTrailing4 >= 1 && n3 >= 6) trailingConferenceLoad = "medium";

  // Post-peak window: yesterday ≥75 AND today recovery deficit.
  const yesterdayHigh =
    typeof input.scoreYesterday === "number" && input.scoreYesterday >= 75;
  const recoveryDeficit =
    (typeof wear.hrvDeviationPct === "number" && wear.hrvDeviationPct <= -10) ||
    (typeof wear.sleepHours === "number" && wear.sleepHours < 6) ||
    (typeof wear.rhrDeviationPct === "number" && wear.rhrDeviationPct >= 8);
  const postPeakWindow = yesterdayHigh && recoveryDeficit;

  // Clarity drop vs trailing 7d avg (negative number = drop).
  let clarityDrop: number | null = null;
  if (
    typeof checkIn.clarity === "number" &&
    typeof input.trailingClarityAvg === "number"
  ) {
    clarityDrop = checkIn.clarity - input.trailingClarityAvg;
  }

  // Morning compressed: explicit or inferred from current wearable signals.
  const morningWasCompressed =
    input.morningWasCompressed ??
    ((typeof wear.hrvDeviationPct === "number" && wear.hrvDeviationPct <= -10) ||
      (typeof wear.sleepHours === "number" && wear.sleepHours < 6.5));

  return {
    hrvDeviationPct: wear.hrvDeviationPct,
    hrvUnusual: wear.hrvUnusual ?? false,
    sleepHours: wear.sleepHours,
    sleepDeviationPct: wear.sleepDeviationPct,
    sleepBelow6h:
      typeof wear.sleepHours === "number" ? wear.sleepHours < 6 : false,
    rhrDeviationPct: wear.rhrDeviationPct,
    hrElevatedProxy: wear.hrElevatedProxy ?? false,

    emotionalSelfDeclared: checkIn.emotionalSelfDeclared ?? null,
    mentalSharpness: checkIn.mentalSharpness ?? null,
    confidence: checkIn.confidence ?? null,

    timezoneOffsetMinutes: input.timezone.offsetMinutes,
    timezoneShift48hHours: input.timezone.shift48hHours,
    travelDay: travelDayDerived,
    longHaulFlight: longHaulFlightDerived,

    ptoTodayAllDay: ptoTodayAllDayDerived,
    ptoMeetingPresent: ptoMeetingPresentDerived,
    personalHolidayInferred: personalHolidayInferredDerived,
    workTravelInferred: workTravelInferredDerived,

    // --- Part 1: travel load split -------------------------------------------
    awayFromHome: (() => {
      const ts = input.travelState;
      if (!ts) return undefined;
      return isAwayFromHome(ts.state ?? null, ts.distanceFromHomeKm ?? null);
    })(),
    sameDayReturn: (() => {
      const travelEvts = input.events
        .filter((e) => isTravelTitle(e.title))
        .map((e) => ({
          title: e.title,
          start_time: typeof e.startTime === 'string'
            ? e.startTime
            : (e.startTime as Date).toISOString(),
          end_time: typeof e.endTime === 'string'
            ? e.endTime
            : e.endTime instanceof Date
              ? e.endTime.toISOString()
              : (typeof e.startTime === 'string'
                  ? e.startTime
                  : (e.startTime as Date).toISOString()),
        }));
      return isSameDayRoundTrip(travelEvts, input.now);
    })(),
    travelTier: (() => {
      const ts = input.travelState;
      const away = ts
        ? isAwayFromHome(ts.state ?? null, ts.distanceFromHomeKm ?? null)
        : true; // fail-open for tier so the round-trip arc still classifies
      const sameDay = (() => {
        const travelEvts = input.events
          .filter((e) => isTravelTitle(e.title))
          .map((e) => ({
            title: e.title,
            start_time: typeof e.startTime === 'string'
              ? e.startTime
              : (e.startTime as Date).toISOString(),
            end_time: typeof e.endTime === 'string'
              ? e.endTime
              : e.endTime instanceof Date
                ? e.endTime.toISOString()
                : (typeof e.startTime === 'string'
                    ? e.startTime
                    : (e.startTime as Date).toISOString()),
          }));
        return isSameDayRoundTrip(travelEvts, input.now);
      })();
      const durH = longHaulFlightDerived?.durationHours ?? 0;
      // Only emit when there is at least one travel event today.
      if (!travelDayDerived) return undefined;
      return classifyTravelTier(durH, sameDay, away);
    })(),

    yesterdayScore: input.scoreYesterday,
    todayScore: input.scoreToday,
    postPeakWindow,
    isHighVisibilityToday,

    emotionalDrainEventInNext4h: emotionalDrainNext4h
      ? { title: emotionalDrainNext4h.title, minutesUntil: emotionalDrainNext4h.minutesUntil }
      : null,

    emotionalDrainEventInNext24h: emotionalDrainNext24h
      ? { title: emotionalDrainNext24h.title, minutesUntil: emotionalDrainNext24h.minutesUntil }
      : null,

    highStakesEventInNext24h: highStakesNext24h
      ? { title: highStakesNext24h.title, minutesUntil: highStakesNext24h.minutesUntil }
      : null,

    morningWasCompressed,
    middayRecoveryDetected: input.middayRecoveryDetected ?? false,
    clarityDropFromTrailingAvg: clarityDrop,

    // Batch 4 — mechanical travel shape. Triangulation + delivery fields are
    // not populated here; Edge consumers add them before calling evaluate().
    preFlightWindowMinutes,
    nextTravelEventTitle,

    // Conference / Summit cluster (v2) — mechanical fields only.
    conferenceDayNumber,
    conferenceDayNumberYesterday,
    conferenceTotalDays,
    conferenceEventTitle,
    speakingBlocksToday,
    hasFullDayConferenceWrapper: todayHasConferenceWrapper,
    firstSessionGapMinutesToday,
    conferenceDaysInTrailing4,
    trailingConferenceLoad,
    nextThreeDaysMeetingCount,
    conferenceStartsTomorrow,
    conferenceParallelMeetingsToday,
  };
}

/** Build a RuleContext from raw input + computed signals. Convenience wrapper. */
export function buildRuleContext(
  input: SignalCoverageInput,
  extras: Partial<
    Pick<
      RuleContext,
      | "dayOfWeek"
      | "homeCountry"
      | "backToBackHoursToday"
      | "historicalAppOpenRateLow"
      | "conferenceDayNumber"
      | "availability"
    >
  > = {},
): RuleContext {
  const signals = buildSignalMatrix(input);
  const localHour = input.now.getHours();
  // Re-derive availability here (cheap, deterministic) so it lands on the
  // RuleContext even when the caller didn't pass it via extras. This is the
  // shared thread every consumer (Brief, Plan, Nudges) reads from.
  const availability = extras.availability ?? classifyAvailability({
    now: input.now,
    userHomeCountry: input.userHomeCountry ?? null,
    userCurrentCountry: input.userCurrentCountry ?? null,
    explicitPto: input.explicitPto === true,
    calendarLoad: input.calendarLoad ?? null,
    events: input.events.map((e): AvailabilityEvent => ({
      title: String(e.title || ''),
      startTime: typeof e.startTime === 'string'
        ? e.startTime
        : (e.startTime instanceof Date ? e.startTime.toISOString() : ''),
      endTime: typeof e.endTime === 'string'
        ? e.endTime
        : (e.endTime instanceof Date ? e.endTime.toISOString() : (
            typeof e.startTime === 'string'
              ? e.startTime
              : (e.startTime instanceof Date ? e.startTime.toISOString() : '')
          )),
      isAllDay: e.isAllDay === true,
      isOrganizer: (e as any).isOrganizer === true,
      attendeesCount: Number((e as any).attendeesCount ?? 0) || 0,
      source: (e as any).source ?? null,
      calendarSummary: (e as any).calendarSummary ?? null,
    })),
  });

  // Enrich upcoming events with canonical A-H classification and mechanical
  // fields that Batch-3 rules read. This is the same window used by the
  // decision-density rule, so we keep the score pre-computed here.
  const upcomingEvents = input.events
    .map((e) => {
      const et = classifyEvent(e.title);
      const rawDuration = eventDurationMin(e);
      const durationMinutes = rawDuration == null ? undefined : rawDuration;
      return {
        title: e.title,
        minutesUntil: minutesUntil(e.startTime, input.now),
        stakesLevel: e.stakesLevel ?? null,
        isEmotionalDrain: isEmotionalDrainEvent(e.title),
        attendeeCount: Number((e as any).attendeesCount ?? 0) || 0,
        durationMinutes,
        categoryId: et?.categoryId ?? null,
        isInterpersonal: et?.categoryId === "D",
        source: (e as any).source ?? null,
      };
    })
    .filter((e) => e.minutesUntil >= 0)
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  // Pre-compute decision density score for the next 4h window. Mirrors the
  // logic in ceo-behaviour/decision-density.ts so the rule can short-circuit.
  const decisionWindow = upcomingEvents.filter((e) => e.minutesUntil <= 240);
  let decisionDensityScore: number | null = null;
  let decisionDensityAccumulator = 0;
  for (const e of decisionWindow) {
    const layer1 = titleDecisionScore({
      title: e.title,
      attendeeCount: e.attendeeCount,
      durationMinutes: e.durationMinutes,
    });
    if (layer1 <= 0) continue;
    decisionDensityAccumulator += layer1 * attendeeWeight(e.attendeeCount);
  }
  if (decisionDensityAccumulator >= 2.5) {
    decisionDensityScore = Math.round(decisionDensityAccumulator * 10) / 10;
  }

  return {
    signals: {
      ...signals,
      decisionDensityScore,
      decisionDensityWindow: decisionDensityScore != null ? "next-4h" : null,
    },
    upcomingEvents,
    localHour,
    availability,
    homeCountry: input.userHomeCountry ?? null,
    ...extras,
  };
}
