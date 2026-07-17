import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  __specDeterministicInternals,
  buildSpecDeterministicBrief,
  buildSpecDeterministicBriefFromAssessmentContext,
  type SpecDeterministicParams,
} from "./spec-deterministic-brief.ts";

function baseParams(): SpecDeterministicParams {
  return {
    bandValence: "mid",
    timeOfDay: "morning",
    hasWearable: false,
    hrvDeviation: null,
    sleepDuration: null,
    sleepDeviation: null,
    sleepHardFloor: false,
    rhrDeviation: null,
    calendarLoad: null,
    todayHighStakes: [],
    nextHighStakesEvent: null,
    hasBackToBack: false,
    avgScore7d: null,
    scoreTrajectory7d: null,
    hrvEventCorrelation: null,
    checkInOutcome: null,
    clarityLevel: null,
    confidenceLevel: null,
    behaviourFlags: null,
    tomorrowLoad: null,
    tomorrowHighStakesTitles: [],
  };
}

Deno.test("spec deterministic — top signal prefers anchored CEO behaviour + HRV correlation", () => {
  const params = baseParams();
  params.behaviourFlags = [{ anchorEvent: "Board Meeting" }];
  params.todayHighStakes = ["Board Meeting"];
  params.hrvEventCorrelation = "HRV drops avg 18% before board meetings, 5 occurrences";
  assertEquals(__specDeterministicInternals.pickTopSignal(params), "hr_event_correlation");
});

Deno.test("spec deterministic — HRV correlation alone does not outrank a quiet day", () => {
  const params = baseParams();
  params.hrvEventCorrelation = "HRV drops avg 18% before board meetings, 5 occurrences";
  assertEquals(__specDeterministicInternals.pickTopSignal(params), "baseline_quiet");
});

Deno.test("spec deterministic — evening tomorrow-heavy signal reads from tomorrow block", () => {
  const params = baseParams();
  params.timeOfDay = "evening";
  params.tomorrowLoad = "high";
  params.tomorrowHighStakesTitles = ["Board Meeting"];
  const built = buildSpecDeterministicBrief(params)!;
  assertEquals(built.topSignal, "tomorrow_heavy");
  assertStringIncludes(built.body, "Tomorrow");
});

Deno.test("spec deterministic — assessment context fallback uses the same finalized context and adds divergence lead", () => {
  const built = buildSpecDeterministicBriefFromAssessmentContext({
    local: {
      date: "2026-07-17",
      window: "morning",
      timezoneOffsetMinutes: 330,
      currentTimezone: "Asia/Kolkata",
      homeTimezone: "Asia/Kolkata",
    },
    readiness: {
      score: 62,
      tier: "managing",
      displayedTier: "managing",
      capReason: null,
      band: "mid",
      mode: "refined",
    },
    pills: {
      finalized: [],
      qualifiers: {} as never,
      coherence: { inSync: true, adjustments: [] },
      coherenceWarning: null,
      diagnostics: {
        derive: { warnings: [] },
        finalize: { warnings: [] },
      },
    },
    provenance: {
      mrs: {
        sources: ["wearable", "calendar", "checkin"],
        primary: "wearable",
        refinedBy: "checkin",
        normalizedSources: ["wearable_objective", "calendar_context", "self_report"],
      },
      brief: {
        sources: ["wearable_objective", "calendar_context", "self_report"],
        briefSource: "deterministic",
      },
      pills: {
        decision_readiness: ["wearable_objective", "self_report"],
        physical_reserves: ["wearable_objective"],
        resilience_capacity: ["wearable_objective", "self_report"],
      },
    },
    checkIn: {
      outcome: "drained",
      clarityLevel: 2,
      confidenceLevel: 3,
      mentalSharpnessLevel: 2,
      emotionLevel: 3,
      regulationLevel: 3,
      pressureLevel: 4,
    },
    wearable: {
      hasWearable: true,
      wearableFreshForGate: true,
      hasTodayData: true,
      hasRecentData: true,
      wearableDaysConnected: 20,
      wearableSourceAgeDays: 0,
      hrvValue: 60,
      hrvDeviation: 4,
      sleepDuration: 430,
      sleepScore: 79,
      sleepEfficiency: 76,
      rhrValue: 64,
      rhrDeviation: 4,
      hrValue: 82,
      hrDeviation: 2,
    },
    patterns: {
      hrv3dTrend: "stable",
      rhr3dTrend: "stable",
      sustainedDeficitFlag: false,
      consecutiveHighLoadDays: 1,
      cooccurrence7d: {
        cooccurrence_count: 0,
        cooccurrence_ratio: null,
        days_observed: 3,
      },
      avgScore7d: 63,
      scoreTrajectory7d: "stable",
      hrvEventCorrelation: null,
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
    divergence: {
      pillar: "decision_readiness",
      left: {
        source: "wearable_objective",
        direction: "positive",
        evidenceKeys: ["hrvValue"],
      },
      right: {
        source: "self_report",
        direction: "negative",
        evidenceKeys: ["outcome"],
      },
    },
    deterministic: {
      derivationVersion: "w3.5-turn-b-test",
      inputFingerprint: "input-fingerprint",
      pillFingerprint: "pill-fingerprint",
    },
  });

  assertEquals(built?.topSignal, "imminent_high_stakes");
  assertStringIncludes(built?.body ?? "", "You checked in drained, while HRV is holding above its usual range.");
});
