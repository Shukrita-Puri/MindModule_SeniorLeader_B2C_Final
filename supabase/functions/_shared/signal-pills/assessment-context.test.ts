import {
  assert,
  assertEquals,
  assertObjectMatch,
  assertStringIncludes,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAssessmentContext, buildPillContextFromAssessment, formatPillAssessmentSection } from "./assessment-context.ts";
import { derivePills, finalizePills, type DerivePillsInput } from "./derive-pills.ts";

function baseInput(overrides: Partial<DerivePillsInput> = {}): DerivePillsInput {
  return {
    hrvValue: 58,
    hrvDeviation: 4,
    sleepDuration: 435,
    sleepScoreVal: 78,
    rhrValue: 68,
    rhrDeviation: 12,
    hrValue: 88,
    hrDeviation: 6,
    sleepEfficiency: 74,
    wearableContextHrvDeviation: 4,
    wearableContextPoorSleep: false,
    wearableContextHrvElevated: false,
    clarityLevel: 3,
    emotionLevel: 3,
    regulationLevel: 3,
    pressureLevel: 4,
    calendarLoad: "high",
    calendarPressure: "high",
    highStakesEventsCount: 2,
    rhr3dTrend: "stable",
    sustainedDeficitFlag: false,
    cooccurrence7d: {
      cooccurrence_count: 1,
      cooccurrence_ratio: 0.25,
      days_observed: 4,
    },
    protectionGoals: ["mornings"],
    wearableFreshForGate: true,
    checkInFreshForGate: true,
    hasWearable: true,
    wearableDaysConnected: 45,
    ...overrides,
  };
}

async function buildContext() {
  const derived = derivePills(baseInput());
  const finalized = finalizePills({
    pills: derived.pills,
    safeTier: "depleted" as any,
    cognitiveTier: derived.cognitiveTier,
    physicalTier: derived.physicalTier,
    resilienceTier: derived.resilienceTier,
    checkinHistory14d: [
      {
        checkin_date: "2026-07-17",
        time_window: "morning",
        clarity_level: 3,
        emotion_level: 3,
        pressure_level: 4,
        regulation_level: 3,
      },
    ],
    wearableHistory14d: [
      {
        summary_date: "2026-07-17",
        hrv: 58,
        resting_heart_rate: 68,
        sleep_score: 78,
        total_sleep_minutes: 435,
        sleep_efficiency: 74,
      },
    ],
    baselines: { hrv: 54, rhr: 60, sleep: 420 },
    hrv3dTrend: "improving",
    rhr3dTrend: "stable",
  });

  return await buildAssessmentContext({
    localDate: "2026-07-17",
    timeWindow: "morning",
    timezoneOffsetMinutes: 330,
    currentTimezone: "Asia/Kolkata",
    homeTimezone: "Asia/Kolkata",
    derivationVersion: "w3.5-turn-b-test",
    readiness: {
      score: 63,
      tier: "managing",
      displayedTier: "managing",
      capReason: null,
      band: "mid",
      mode: "refined",
    },
    pills: {
      finalized: finalized.pills,
      qualifiers: finalized.qualifiers,
      coherence: finalized.coherence,
      coherenceWarning: finalized.coherenceWarning,
      diagnostics: {
        derive: derived.diagnostics,
        finalize: finalized.diagnostics,
      },
    },
    provenance: {
      mrs: { sources: ["wearable", "calendar", "checkin"], primary: "wearable", refinedBy: "checkin" },
      brief: { sources: ["wearable", "calendar", "checkin"], briefSource: "deterministic" },
      pills: {
        decision_readiness: ["wearable", "checkin", "calendar"],
        physical_reserves: ["wearable"],
        resilience_capacity: ["wearable", "checkin", "calendar"],
      },
    },
    checkIn: {
      outcome: "drained but steady enough to work the plan",
      clarityLevel: 3,
      confidenceLevel: 3,
      mentalSharpnessLevel: 3,
      emotionLevel: 3,
      regulationLevel: 3,
      pressureLevel: 4,
    },
    wearable: {
      hasWearable: true,
      wearableFreshForGate: true,
      hasTodayData: true,
      hasRecentData: true,
      wearableDaysConnected: 45,
      wearableSourceAgeDays: 0,
      hrvValue: 58,
      hrvDeviation: 4,
      sleepDuration: 435,
      sleepScore: 78,
      sleepEfficiency: 74,
      rhrValue: 68,
      rhrDeviation: 12,
      hrValue: 88,
      hrDeviation: 6,
    },
    patterns: {
      hrv3dTrend: "improving",
      rhr3dTrend: "stable",
      sustainedDeficitFlag: false,
      consecutiveHighLoadDays: 2,
      cooccurrence7d: {
        cooccurrence_count: 1,
        cooccurrence_ratio: 0.25,
        days_observed: 4,
      },
      avgScore7d: 64,
      scoreTrajectory7d: "stable",
      hrvEventCorrelation: "HRV tends to dip before board reviews",
    },
    calendar: {
      load: "high",
      pressure: "high",
      highStakesEventsCount: 2,
      hasBackToBack: true,
      nextHighStakesMinutesUntil: 45,
      typicalLoadForDow: "medium",
      tomorrowLoad: "medium",
      tomorrowHighStakesCount: 1,
    },
  });
}

Deno.test("assessment context freezes finalized pills, qualifiers, and coherence output", async () => {
  const context = await buildContext();

  assertStrictEquals(Object.isFrozen(context), true);
  assertStrictEquals(Object.isFrozen(context.pills.finalized), true);
  assertStrictEquals(Object.isFrozen(context.pills.finalized[0]), true);
  assertStrictEquals(Object.isFrozen(context.pills.qualifiers), true);
  assertStrictEquals(Object.isFrozen(context.pills.coherence.adjustments), true);
  assertEquals(context.pills.coherence.inSync, false);
  assertEquals(context.pills.coherence.adjustments.length, 1);
  assertEquals(context.pills.finalized.some((pill) => pill.tier === "red"), true);
});

Deno.test("assessment context derives structured divergence from objective wearable evidence versus self-report", async () => {
  const context = await buildContext();

  assert(context.divergence !== null);
  assertObjectMatch(context.divergence!, {
    pillar: "decision_readiness",
    left: {
      source: "wearable_objective",
      direction: "positive",
    },
    right: {
      source: "self_report",
      direction: "negative",
    },
  });
  assertEquals(context.divergence?.left.evidenceKeys.includes("hrvValue"), true);
  assertEquals(context.divergence?.right.evidenceKeys.includes("outcome"), true);
});

Deno.test("assessment context exports validator/prompt views from finalized payload", async () => {
  const context = await buildContext();
  const pillContext = buildPillContextFromAssessment(context);
  const promptSection = formatPillAssessmentSection(context);

  assertEquals(pillContext.decisionReadiness, context.pills.finalized[0].tier);
  assertEquals(pillContext.physicalReserves, context.pills.finalized[1].tier);
  assertEquals(pillContext.resilienceCapacity, context.pills.finalized[2].tier);
  assertStringIncludes(promptSection, "=== PILL ASSESSMENT ===");
  assertStringIncludes(promptSection, "Structured divergence:");
  assertStringIncludes(promptSection, context.deterministic.pillFingerprint);
});
