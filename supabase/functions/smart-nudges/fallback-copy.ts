// ─────────────────────────────────────────────────────────────────────────────
// Smart Nudges — deterministic static fallback copy bank
//
// Extracted from index.ts so the fallback bank, its validation, and its
// contract tests can live in a module that does not import the edge-function
// entrypoint.
// ─────────────────────────────────────────────────────────────────────────────

import { planningDayOfWeek } from "../_shared/plan/user-locale.ts";
import {
  highStakesScore,
  isHighStakesTitle,
  isNoiseTitle,
} from "../_shared/events/event-classifier.ts";
import { resolveEvent } from "../_shared/events/resolve-event-category.ts";
import { EVENT_PHASE_MAP } from "../_shared/events/event-phase-map.ts";
import { PROTOCOL_COMBOS } from "../_shared/protocols/protocol-combos.ts";
import {
  type EventPhase,
  phaseClause,
  resolveEventPhase,
} from "../_shared/nudges/event-phase.ts";
import {
  buildV8CtxForCheck,
  isNamedContextViolation,
  violatesCopyContractV8,
  violatesTruthContract,
  type CopyContractCheckCtx,
  type TruthContractCheckCtx,
} from "./copy-contract.ts";
export { isNamedContextViolation } from "./copy-contract.ts";

export interface NudgeCopy {
  title: string;
  body: string;
  variantId: string;
  aiProvider?: "static" | "claude" | "gemini" | null;
}

export interface CalendarEvent {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  external_id: string;
  is_organizer?: boolean;
  attendees_count?: number;
  is_all_day?: boolean;
  source_calendar?: string | null;
}

export interface WearableSignals {
  sleepScore: number | null;
  hrv: number | null;
  rhr: number | null;
  hrvBaseline30d: number | null;
  rhrBaseline30d: number | null;
  hrvDeltaPct: number | null;
  rhrElevated: boolean;
  totalSleepMinutes: number | null;
}

export interface PlanNudgeSlot {
  slotIndex: 0 | 1 | 2;
  slot: "morning" | "afternoon" | "evening";
  mode: "jit" | "state" | "jit+state" | "full_arc";
  arcLabel: "Prepare" | "During" | "Recover" | "Steady" | string;
  jitPhase: "pre" | "during" | "post" | null;
  jitEventTitle: string | null;
  whyLine: string | null;
  categoryId: string | null;
  subcategory: string | null;
}

export interface CoachSignals {
  pendingCommitments: Array<{
    text: string;
    overdueDays: number;
    patternArea: string | null;
    metaSkill: string | null;
  }>;
  activePatterns: Array<{
    description: string;
    patternArea: string | null;
    observationCount: number;
  }>;
  stressSignals: Array<{ topic: string; sessionId: string }>;
  lastSessionAt: Date | null;
  sessionsIn7d: number;
}

export interface FallbackNudgeContext {
  userId: string;
  todayStr: string;
  tomorrowStr: string;
  localHour: number;
  localMinute: number;
  localTime: number;
  dayOfWeek: number;
  dayName: string;
  isWeekend: boolean;
  homeCountry: string | null;
  weekendDays: number[];
  planningDay: 0 | 6;
  lightDay: {
    isLightDay: boolean;
    reason?: string;
    prepMeeting: { title: string; startHour: number; categoryId: string | null } | null;
  };
  briefWindow: "morning" | "afternoon" | "evening";
  timeZone: string;
  todayEvents: CalendarEvent[];
  tomorrowEvents: CalendarEvent[];
  nonNoiseEvents: CalendarEvent[];
  firstNonNoiseEvent: CalendarEvent | null;
  eventCount: number;
  highStakesEvents: CalendarEvent[];
  calendarGaps: Array<{
    startMs?: number;
    endMs?: number;
    durationMinutes: number;
    hasHighStakesPre?: boolean;
    hasHighStakesPost?: boolean;
  }>;
  dayType: "light" | "moderate" | "heavy" | "extreme";
  wearable: WearableSignals;
  hasWearableData: boolean;
  wearableFreshness: "fresh" | "stale" | "missing";
  coach: CoachSignals;
  morningCheckinOutcome: string | null;
  afternoonCheckinOutcome: string | null;
  lastCheckinTime: Date | null;
  checkinCountToday: number;
  pendingPracticeIds: string[];
  completedPracticeIds: string[];
  planSlots: PlanNudgeSlot[] | null;
  planSnapshotStatus: "ready" | "missing" | "empty";
  planPersistedDayKind: string | null;
  planPersistedDayShape: string | null;
  jitEvents: Array<{
    eventId: string;
    eventTitle: string;
    eventStart: string;
    finalScore: number;
    externalId: string;
    confidenceBand: string;
  }>;
  hrvDeltaPctFromSnapshot: number | null;
  // Pattern summary shape is owned by the caller (index.ts PatternSummary).
  // Fallback copy never reads it, so it stays opaque here to avoid drift.
  pattern?: unknown;
  dayContext: {
    kind: "normal" | "travel-day" | "away-day";
    signalToken?: string;
    postTravel: boolean;
    preFlight?: { eventTitle: string; minutesUntil: number } | null;
    inFlight?: { eventTitle: string; minutesUntil: number } | null;
    ptoMode?: boolean;
    landingPlusHighStakes?: { eventTitle: string; minutesUntil: number } | null;
    availability?: {
      kind: "normal" | "travel-day" | "away-day" | "pto";
      reason: string;
    };
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

type TravelPhaseKey = "pre" | "during" | "post";

export function travelPhaseFraming(
  phase: TravelPhaseKey,
): { goal: string; outcome: string } {
  const ph = EVENT_PHASE_MAP.G[phase];
  const goal = ph?.goal ?? "";
  const combo = ph ? PROTOCOL_COMBOS[ph.combo] : null;
  return { goal, outcome: combo?.outcome ?? "" };
}

export function isNoiseEvent(title: string): boolean {
  return isNoiseTitle(title);
}

export function isHighStakes(title: string | null): boolean {
  return isHighStakesTitle(title);
}

export function weekendDaysForHomeCountry(
  homeCountry?: string | null,
): number[] {
  return planningDayOfWeek(homeCountry) === 6 ? [5, 6] : [0, 6];
}

export function isWeekendDayForHomeCountry(
  dayOfWeek: number,
  homeCountry?: string | null,
): boolean {
  return weekendDaysForHomeCountry(homeCountry).includes(dayOfWeek);
}

export function firstWeekendDayForHomeCountry(
  homeCountry?: string | null,
): number {
  return planningDayOfWeek(homeCountry) === 6 ? 5 : 6;
}

export function lastWeekendDayForHomeCountry(
  homeCountry?: string | null,
): number {
  return planningDayOfWeek(homeCountry) === 6 ? 6 : 0;
}

export function truncateEventTitle(title: string | null | undefined): string {
  const t = (title || "").trim();
  if (!t) return "your meeting";
  if (t.length <= 20) return t;
  return t.split(/\s+/).slice(0, 3).join(" ");
}

export function normalizeNotificationCopy(copy: NudgeCopy): NudgeCopy {
  return {
    title: copy.title.trim().replace(/\s+/g, " "),
    body: copy.body.trim().replace(/\s+/g, " "),
    variantId: copy.variantId,
    aiProvider: copy.aiProvider,
  };
}

// ── Low-context static variants ─────────────────────────────────────────────

/**
 * Variants that are deliberately generic because the available context is
 * genuinely low (e.g. first day off with no events). They are waived from the
 * named-context rule ONLY; every other quality gate still applies.
 */
export const LOW_CONTEXT_STATIC_VARIANTS = new Set([
  "FB-N1-away",
  "FB-N1-travel",
  "FB-N1-post-travel",
  "FB-N1-sat-recovery",
  "FB-N1-sun-reset",
  "FB-N3-sat",
]);

export function isLowContextStaticFallbackVariant(variantId: string): boolean {
  return LOW_CONTEXT_STATIC_VARIANTS.has(variantId.replace(/::[ABCD]$/, ""));
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateStaticFallbackCopy(
  copy: NudgeCopy | null,
  ctx: FallbackNudgeContext,
  nudgeType: string,
  anchorPhase?: EventPhase | null,
): NudgeCopy | null {
  if (!copy) return null;
  copy = normalizeNotificationCopy(copy);
  const v8Ctx = buildV8CtxForCheck(ctx);
  const violation = violatesCopyContractV8(copy.body, v8Ctx);
  if (
    violation &&
    !(isLowContextStaticFallbackVariant(copy.variantId) &&
      isNamedContextViolation(violation))
  ) {
    console.warn(
      `[smart-nudges v8] Suppressed static fallback ${copy.variantId} for ${nudgeType}: ${violation} | "${copy.body}"`,
    );
    return null;
  }
  if (violation) {
    console.log(
      `[smart-nudges v8] Allowed low-context static fallback ${copy.variantId} for ${nudgeType}: ${violation}`,
    );
  }

  const truthCtx: TruthContractCheckCtx = {
    morningCheckinOutcome: ctx.morningCheckinOutcome,
    wearable: ctx.wearable,
  };
  const truthViolation = violatesTruthContract(
    copy.body,
    truthCtx,
    anchorPhase ?? null,
  );
  if (truthViolation) {
    console.warn(
      `[smart-nudges truth] Suppressed static fallback ${copy.variantId} for ${nudgeType}: ${truthViolation} | "${copy.body}"`,
    );
    return null;
  }
  return { ...copy, aiProvider: "static" };
}

// ── Guaranteed floor texts ───────────────────────────────────────────────────

/**
 * Last-resort copy that is guaranteed to pass the V8 contract even with no
 * named context. These are used only when the AI path and every deterministic
 * fallback have been rejected, so a nudge is never silently dropped.
 */
export function guaranteedFloorNudgeOneCopy(): NudgeCopy {
  return {
    title: "Set your intention",
    body:
      "Take 5 minutes now to set your intention before the day moves. Check in to set your intention.",
    variantId: "FLOOR-N1",
  };
}

export function guaranteedFloorNudgeTwoCopy(): NudgeCopy {
  return {
    title: "Recalibrate mid-day",
    body:
      "Take 5 minutes in the middle of the day to recalibrate. Check in to recalibrate.",
    variantId: "FLOOR-N2",
  };
}

export function guaranteedFloorNudgeThreeCopy(): NudgeCopy {
  return {
    title: "Close the day",
    body:
      "Take 5 minutes tonight to close the day cleanly. Check in to close the day.",
    variantId: "FLOOR-N3",
  };
}

// ── Nudge 1 fallback copy ────────────────────────────────────────────────────

export function getFallbackNudgeOneMorningCopy(
  ctx: FallbackNudgeContext,
): NudgeCopy {
  const dc = ctx.dayContext;

  // Away-day morning (weekday or weekend, no meeting needed).
  if (dc.kind === "away-day") {
    const m = `${ctx.eventCount} meeting${ctx.eventCount === 1 ? "" : "s"}`;
    return {
      title: "Day away",
      body:
        `Day away today - ${m} on the calendar. Take 5 minutes before you switch off - check in to set your intention.`,
      variantId: "FB-N1-away",
    };
  }

  // Travel today.
  if (dc.kind === "travel-day") {
    const m = `${ctx.eventCount} meeting${ctx.eventCount === 1 ? "" : "s"}`;
    return {
      title: "Travel today",
      body:
        `Travel today - ${m} on the calendar. Ground yourself in 5 minutes before the day moves - check in to set your intention.`,
      variantId: "FB-N1-travel",
    };
  }

  // Post-travel morning.
  if (dc.postTravel) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount === 1 ? "" : "s"}`;
    return {
      title: "Recovery context",
      body:
        `Yesterday included travel - ${m} today. Take 5 minutes to log in and prep your state.`,
      variantId: "FB-N1-post-travel",
    };
  }

  if (
    ctx.hasWearableData && ctx.wearable.sleepScore !== null &&
    ctx.wearable.sleepScore < 60
  ) {
    return {
      title: "Short sleep last night",
      body:
        `Last night was light on recovery (Sleep ${ctx.wearable.sleepScore}/100). Today still needs you sharp - log in to prep your state.`,
      variantId: "FB-N1-recovery",
    };
  }
  if (
    ctx.hasWearableData && ctx.wearable.hrvDeltaPct !== null &&
    ctx.wearable.hrvDeltaPct < -15
  ) {
    return {
      title: "Starting from where you are",
      body:
        `Your body is running below baseline (HRV ${ctx.wearable.hrvDeltaPct}%) and ${ctx.eventCount} meeting${
          ctx.eventCount === 1 ? "" : "s"
        } sit ahead. Manage the day rather than react to it - check in to set your intention.`,
      variantId: "FB-N1-hrv",
    };
  }
  if (ctx.highStakesEvents.length > 0) {
    const ev = truncateEventTitle(
      ctx.highStakesEvents[0].title || "high-stakes meeting",
    );
    return {
      title: "Preparing mental performance",
      body:
        `${ev} on the calendar today. Walk in with the edge, not the anxiety - log in to prep your mind.`,
      variantId: "FB-N1-stakes",
    };
  }
  if (ctx.dayType === "heavy" || ctx.dayType === "extreme") {
    return {
      title: "Starting from where you are",
      body:
        `${ctx.eventCount} meetings ahead today. Manage your energy instead of reacting to it - check in to set your intention.`,
      variantId: "FB-N1-heavy",
    };
  }
  if (ctx.dayOfWeek === firstWeekendDayForHomeCountry(ctx.homeCountry)) {
    if (ctx.firstNonNoiseEvent) {
      const ev = truncateEventTitle(
        ctx.firstNonNoiseEvent.title || "today's meeting",
      );
      return {
        title: "Weekend with one to land",
        body:
          `${ev} on the calendar today. Land your mind before it arrives - check in to set your intention.`,
        variantId: "FB-N1-sat-anchored",
      };
    }
    const m = `${ctx.eventCount} meeting${ctx.eventCount === 1 ? "" : "s"}`;
    return {
      title: "Weekend recovery",
      body:
        `First weekend day - ${m} today. A 5-minute reset shapes the weekend you need - check in to set your intention.`,
      variantId: "FB-N1-sat-recovery",
    };
  }

  if (ctx.dayOfWeek === lastWeekendDayForHomeCountry(ctx.homeCountry)) {
    if (ctx.firstNonNoiseEvent) {
      const ev = truncateEventTitle(ctx.firstNonNoiseEvent.title);
      return {
        title: "Weekend reset",
        body:
          `${ev} on the calendar today. A short reset before the day forms - check in to set your intention.`,
        variantId: "FB-N1-sun-anchored",
      };
    }
    const m = `${ctx.eventCount} meeting${ctx.eventCount === 1 ? "" : "s"}`;
    return {
      title: "Sunday reset",
      body:
        `Sunday - ${m} today. A 5-minute reset lands you before the week forms - check in to set your intention.`,
      variantId: "FB-N1-sun-reset",
    };
  }
  if (ctx.eventCount > 0) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount > 1 ? "s" : ""}`;
    return {
      title: "Setting the day",
      body:
        `${m} ahead today. Three minutes of clarity now beats reacting to the calendar - check in to set your intention.`,
      variantId: "FB-N1-calendar",
    };
  }
  return {
    title: "Room to breathe today",
    body: `Only ${ctx.eventCount} meeting${
      ctx.eventCount === 1 ? "" : "s"
    } on the calendar today gives you the rare chance to choose what your mind owns. Use the space - check in to set your intention.`,
    variantId: "FB-N1-light",
  };
}

export function getFallbackNudgeOneJitCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: "Preparing mental performance",
    body:
      `From your morning Plan: ${ev} in ${minutesUntil} min. Walk in with the edge, not the anxiety - log in to prep your mind.`,
    variantId: "FB-N1-JIT",
  };
}

export function getFallbackNudgeOneJitPostTravelCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  return {
    title: "Preparing mental performance",
    body:
      `From your morning Plan: ${ev} in ${minutesUntil} min. Yesterday included travel - log in to prep your mind.`,
    variantId: "FB-N1-JIT-post-travel",
  };
}

// ── Nudge 2 fallback copy ────────────────────────────────────────────────────

export function getFallbackNudgeTwoJitCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  if (minutesUntil <= 120) {
    return {
      title: "Preparing mental performance",
      body:
        `From your plan: ${ev} in ${minutesUntil} min. Walk in sharp - log in to prep your mind.`,
      variantId: "FB-N2-JIT-soon",
    };
  }
  const eventTime = new Date(Date.now() + minutesUntil * 60000);
  const timeStr = eventTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    title: "Preparing mental performance",
    body:
      `From your plan: ${ev} at ${timeStr}. Front-load the prep instead of scrambling later - log in to prep your mind.`,
    variantId: "FB-N2-JIT-later",
  };
}

export function getFallbackNudgeTwoPrioritiesCopy(
  remaining: number,
  _priorityTitle: string,
): NudgeCopy {
  const p = `${remaining} practice${remaining > 1 ? "s" : ""}`;
  return {
    title: "Recalibrating mid-day",
    body:
      `${p} still open on today's plan. Stay sharp instead of running on fumes - check in to recalibrate.`,
    variantId: "FB-N2-priorities",
  };
}

export function getFallbackNudgeTwoRecalibrateCopy(
  eventTitle: string,
  anchor?: { startMs: number; endMs: number; nowMs: number } | null,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  if (anchor) {
    const phase = resolveEventPhase(anchor);
    const clause = phaseClause(ev, phase, anchor);
    return {
      title: "Mid-day reset window",
      body:
        `Your morning state was low and ${clause}. This is the recovery window - check in to recalibrate.`,
      variantId: "FB-N2-recal",
    };
  }
  return {
    title: "Mid-day reset window",
    body:
      `Your morning state was low and ${ev} is next. This is the recovery window - check in to recalibrate.`,
    variantId: "FB-N2-recal",
  };
}

export function getFallbackNudgeTwoReservesCopy(
  nextEventTitle: string,
  signal: "rhr" | "hrv",
): NudgeCopy {
  const ev = truncateEventTitle(nextEventTitle);
  if (signal === "rhr") {
    return {
      title: "Managing the moment",
      body:
        `You're running warm (RHR elevated) and ${ev} is next. Short, sharp, built for right now - log in to prep your state.`,
      variantId: "FB-N2-reserves-rhr",
    };
  }
  return {
    title: "Managing the moment",
    body:
      `You're running low (HRV below baseline) and ${ev} is next. Short, sharp, built for right now - log in to prep your state.`,
    variantId: "FB-N2-reserves-hrv",
  };
}

export function getFallbackNudgeTwoConsecutiveLowCopy(daysLow: number): NudgeCopy {
  return {
    title: "Recovery deficit detected",
    body:
      `Your body's been under-recovering for ${daysLow} days. That's a load signal, not a weakness - log in to recalibrate your mind.`,
    variantId: "FB-N2-consec-low",
  };
}

// ── Travel arc fallback copy ─────────────────────────────────────────────────

export function getFallbackNudgeOnePreFlightCopy(
  eventTitle: string,
  minutesUntil: number,
): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  const { goal } = travelPhaseFraming("pre");
  return {
    title: "Travel ahead",
    body: `${ev} in ~${minutesUntil} min. ${goal} - log in to prep your state.`,
    variantId: "nudge_one_pre_flight",
  };
}

export function getFallbackNudgeTwoInFlightCopy(eventTitle: string): NudgeCopy {
  const ev = truncateEventTitle(eventTitle);
  const { goal, outcome } = travelPhaseFraming("during");
  return {
    title: "Mid-air reset",
    body:
      `You're in the air on ${ev}. ${goal}. ${outcome} - open in the app, or run it yourself: 4-in / 6-out for 2 minutes.`,
    variantId: "nudge_two_in_flight",
  };
}

export function getFallbackNudgeOnePostArrivalCopy(): NudgeCopy {
  const { goal } = travelPhaseFraming("post");
  return {
    title: "Recovery context",
    body:
      `Yesterday included travel - body may still be carrying load. ${goal} - check in to recalibrate.`,
    variantId: "nudge_one_post_arrival",
  };
}

export function getFallbackNudgeThreeLookaheadCopy(
  tomorrowEventTitle: string,
): NudgeCopy {
  const ev = truncateEventTitle(tomorrowEventTitle);
  return {
    title: "Tomorrow forms tonight",
    body:
      `${ev} on tomorrow's calendar. A clean close tonight is half the prep - log in to prep your mind tonight.`,
    variantId: "nudge_three_lookahead",
  };
}

// ── Nudge 3 fallback copy ────────────────────────────────────────────────────

export function getFallbackNudgeThreeCopy(
  ctx: FallbackNudgeContext,
): NudgeCopy {
  const prioritiesRemaining = ctx.pendingPracticeIds.length;
  const prioritiesTotal = ctx.completedPracticeIds.length +
    ctx.pendingPracticeIds.length;

  if (ctx.dayOfWeek === lastWeekendDayForHomeCountry(ctx.homeCountry)) {
    const tomorrowCount = ctx.tomorrowEvents.filter((e) =>
      !isNoiseEvent(e.title || "")
    ).length;
    const tomorrowStakes = ctx.tomorrowEvents.filter((e) =>
      isHighStakes(e.title)
    );
    if (tomorrowStakes.length > 0) {
      const ev = truncateEventTitle(tomorrowStakes[0].title);
      return {
        title: "Big Monday - pre-loading now",
        body:
          `Tomorrow opens with ${ev}. Wake up ahead instead of behind - log in to prep your mind tonight.`,
        variantId: "FB-N3-sun-stakes",
      };
    }
    if (tomorrowCount >= 4) {
      return {
        title: "Monday is already mapped",
        body:
          `Tomorrow opens with ${tomorrowCount} meetings. Three minutes of clarity tonight beats two hours of catch-up - check in to set tomorrow.`,
        variantId: "FB-N3-sun-heavy",
      };
    }
    return {
      title: "Carrying the right things into Monday",
      body: `Light Monday ahead - ${tomorrowCount} meeting${
        tomorrowCount === 1 ? "" : "s"
      } on the calendar. Decide what you're bringing in - check in to set tomorrow.`,
      variantId: "FB-N3-sun-default",
    };
  }

  if (ctx.dayOfWeek === 5) {
    if (ctx.eventCount > 0) {
      return {
        title: "Week complete",
        body:
          `${ctx.eventCount} meetings behind you this week. Close the week before it bleeds into the weekend - check in to close the week.`,
        variantId: "FB-N3-fri",
      };
    }
    return {
      title: "Week complete",
      body:
        `Five days of leadership behind you this week. Close the week cleanly so it doesn't bleed into the weekend - check in to close the week.`,
      variantId: "FB-N3-fri-light",
    };
  }

  if (ctx.dayOfWeek === firstWeekendDayForHomeCountry(ctx.homeCountry)) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount === 1 ? "" : "s"}`;
    return {
      title: "The body's still catching up",
      body:
        `First day off - ${m} today. A 5-minute check-in tells you what kind of weekend you need - check in to land the weekend.`,
      variantId: "FB-N3-sat",
    };
  }

  if (prioritiesRemaining > 0) {
    const p = `${prioritiesRemaining} practice${
      prioritiesRemaining > 1 ? "s" : ""
    }`;
    return {
      title: "Closing strong",
      body:
        `${p} still open on today's plan and the day is winding down. Land the close before tomorrow loads up - check in to close the day.`,
      variantId: "FB-N3-priorities",
    };
  }
  if (prioritiesTotal > 0 && prioritiesRemaining === 0) {
    return {
      title: "Closing strong",
      body: `${prioritiesTotal} practice${
        prioritiesTotal === 1 ? "" : "s"
      } done today. Land it cleanly so tomorrow opens fresh - check in to close the day.`,
      variantId: "FB-N3-done",
    };
  }

  if (ctx.hasWearableData && ctx.wearable.rhrElevated) {
    return {
      title: "Recovery in progress",
      body:
        `Your body ran warm today (RHR elevated). Close the day with a short reset before tomorrow loads up - log in to recalibrate your mind.`,
      variantId: "FB-N3-rhr",
    };
  }
  if (ctx.eventCount >= 6) {
    return {
      title: "Evening cool-down",
      body:
        `${ctx.eventCount} meetings, no real break for your mind today. Close the day before it carries into tomorrow - log in to recalibrate your mind.`,
      variantId: "FB-N3-heavy",
    };
  }
  if (ctx.eventCount > 0) {
    const m = `${ctx.eventCount} meeting${ctx.eventCount > 1 ? "s" : ""}`;
    return {
      title: "Closing the day",
      body:
        `${m} behind you today. Close cleanly so tomorrow opens fresh - check in to close the day.`,
      variantId: "FB-N3-default",
    };
  }
  return {
    title: "Closing the day",
    body:
      `Quiet day on the calendar today, but tomorrow still benefits from a clean close tonight - check in to close the day.`,
    variantId: "FB-N3-light",
  };
}
