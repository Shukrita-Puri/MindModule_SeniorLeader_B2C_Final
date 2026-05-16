// OWNERSHIP: engineering. Assembles the §3 Signal Coverage Matrix from raw
// inputs already fetched by the consumer (wearable row, check-in row, calendar
// events, profile, pattern store).
//
// This module is a pure builder: it does NOT fetch from the database. The
// consumer (typically compute-outer-readiness) is responsible for fetching and
// passes the raw blocks in. Keeping IO out of this file is what makes the
// matrix unit-testable.

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

  const highStakesNext24h =
    futureEvents.find(
      (e) =>
        e.minutesUntil <= 24 * 60 &&
        e.stakesLevel != null &&
        HIGH_STAKES_LEVELS.has(e.stakesLevel.toLowerCase()),
    ) ?? null;

  const isHighVisibilityToday = highStakesNext24h !== null;

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

    highStakesEventInNext24h: highStakesNext24h
      ? { title: highStakesNext24h.title, minutesUntil: highStakesNext24h.minutesUntil }
      : null,

    morningWasCompressed,
    middayRecoveryDetected: input.middayRecoveryDetected ?? false,
    clarityDropFromTrailingAvg: clarityDrop,
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