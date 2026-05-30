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
import { classifyEvent } from "./executive-state-taxonomy.ts";
import { isTravelTitle } from "./ceo-behaviour/travel.ts";

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
  };
  /** Calendar events in chronological order, all in user's local timezone. */
  events: Array<{
    title: string;
    startTime: string | Date;
    endTime?: string | Date | null;
    isAllDay?: boolean;
    stakesLevel?: string | null;
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
  /** Now reference, used for minutesUntil. Pass user's local now. */
  now: Date;
  /** Optional morning-compressed flag (consumer can pre-compute from
   *  early-morning HRV / sleep). If omitted we infer from current signals. */
  morningWasCompressed?: boolean;
  /** Optional midday-recovery flag (consumer pre-computes from HR/HRV trend). */
  middayRecoveryDetected?: boolean;
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
  // Pillar D = People & Difficult Conversations (canonical categoryId).
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
    travelDay: input.timezone.travelDay ?? false,

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
      | "backToBackHoursToday"
      | "historicalAppOpenRateLow"
      | "conferenceDayNumber"
    >
  > = {},
): RuleContext {
  const signals = buildSignalMatrix(input);
  const localHour = input.now.getHours();
  return {
    signals,
    upcomingEvents: input.events
      .map((e) => ({
        title: e.title,
        minutesUntil: minutesUntil(e.startTime, input.now),
        stakesLevel: e.stakesLevel ?? null,
        isEmotionalDrain: isEmotionalDrainEvent(e.title),
      }))
      .filter((e) => e.minutesUntil >= 0)
      .sort((a, b) => a.minutesUntil - b.minutesUntil),
    localHour,
    ...extras,
  };
}