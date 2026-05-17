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
import { EVENT_TYPES, classifyEvent } from "./executive-state-taxonomy.ts";

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
    stakesLevel?: string | null;
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

// Travel-event detection. Mirrors smart-nudges TRAVEL_RX. Used to identify the
// first travel event of the day for preFlightWindowMinutes. Pure shape — does
// not classify whether a long gap is a true connection vs personal time; that
// triangulation lives in the Edge consumer that populates
// `inFlightConnectionMinutes`.
const TRAVEL_RX =
  /\b(flight|flying|fly to|airport|depart|arrival|arriving|landing|long[- ]haul|red[- ]eye)\b/i;

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
  const classified = classifyEvent(title);
  if (!classified) return false;
  const ev = EVENT_TYPES.find((e) => e.id === classified);
  if (!ev) return false;
  // Pillars D (People & Difficult Conversations) and emotional sub-events.
  return ev.group === "D_people" ||
    ev.group === "E_leadership" || // legacy alias for D
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
    (e) => e.minutesUntil <= 24 * 60 && TRAVEL_RX.test(e.title),
  ) ?? null;
  const preFlightWindowMinutes =
    firstTravelToday &&
    firstTravelToday.minutesUntil >= 60 &&
    firstTravelToday.minutesUntil <= 240
      ? firstTravelToday.minutesUntil
      : null;
  const nextTravelEventTitle = firstTravelToday ? firstTravelToday.title : null;

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