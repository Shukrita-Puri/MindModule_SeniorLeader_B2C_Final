import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAssessmentContext, buildPillContextFromAssessment, formatPillAssessmentSection } from "../_shared/signal-pills/assessment-context.ts";
import { derivePills, finalizePills, type DerivePillsInput } from "../_shared/signal-pills/derive-pills.ts";
import { buildDeterministicBriefFallback } from "../_shared/brief/deterministic-brief.ts";
import { validateBrief, validatePillBodyConsistency } from "../_shared/brief-validators.ts";

const INDEX_PATH = new URL("./index.ts", import.meta.url);

function baseInput(overrides: Partial<DerivePillsInput> = {}): DerivePillsInput {
  return {
    hrvValue: 61,
    hrvDeviation: 6,
    sleepDuration: 440,
    sleepScoreVal: 81,
    rhrValue: 67,
    rhrDeviation: 5,
    hrValue: 82,
    hrDeviation: 3,
    sleepEfficiency: 78,
    wearableContextHrvDeviation: 6,
    wearableContextPoorSleep: false,
    wearableContextHrvElevated: false,
    clarityLevel: 4,
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
    wearableDaysConnected: 30,
    ...overrides,
  };
}

async function buildGreenMindDrainedContext() {
  const derived = derivePills(baseInput());
  const finalized = finalizePills({
    pills: derived.pills,
    safeTier: "balanced" as any,
    cognitiveTier: derived.cognitiveTier,
    physicalTier: derived.physicalTier,
    resilienceTier: derived.resilienceTier,
    checkinHistory14d: [
      {
        checkin_date: "2026-07-17",
        time_window: "morning",
        clarity_level: 4,
        emotion_level: 3,
        pressure_level: 4,
        regulation_level: 3,
      },
    ],
    wearableHistory14d: [
      {
        summary_date: "2026-07-17",
        hrv: 61,
        resting_heart_rate: 67,
        sleep_score: 81,
        total_sleep_minutes: 440,
        sleep_efficiency: 78,
      },
    ],
    baselines: { hrv: 55, rhr: 61, sleep: 425 },
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
      score: 64,
      tier: "balanced",
      displayedTier: "balanced",
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
        decision_readiness: ["wearable", "calendar", "checkin"],
        physical_reserves: ["wearable"],
        resilience_capacity: ["wearable", "calendar", "checkin"],
      },
    },
    checkIn: {
      outcome: "drained",
      clarityLevel: 4,
      confidenceLevel: 3,
      mentalSharpnessLevel: 4,
      emotionLevel: 3,
      regulationLevel: 3,
      pressureLevel: 4,
    },
    wearable: {
      hasWearable: true,
      wearableFreshForGate: true,
      hasTodayData: true,
      hasRecentData: true,
      wearableDaysConnected: 30,
      wearableSourceAgeDays: 0,
      hrvValue: 61,
      hrvDeviation: 6,
      sleepDuration: 440,
      sleepScore: 81,
      sleepEfficiency: 78,
      rhrValue: 67,
      rhrDeviation: 5,
      hrValue: 82,
      hrDeviation: 3,
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
  });
}

async function buildUnreadClarityContext() {
  const derived = derivePills(baseInput({
    hrvValue: null,
    hrvDeviation: null,
    sleepDuration: null,
    sleepScoreVal: null,
    rhrValue: null,
    rhrDeviation: null,
    hrValue: null,
    hrDeviation: null,
    clarityLevel: 2,
    checkInFreshForGate: false,
    wearableFreshForGate: true,
  }));
  const finalized = finalizePills({
    pills: derived.pills,
    safeTier: "balanced" as any,
    cognitiveTier: derived.cognitiveTier,
    physicalTier: derived.physicalTier,
    resilienceTier: derived.resilienceTier,
    checkinHistory14d: [],
    wearableHistory14d: [],
    baselines: { hrv: null, rhr: null, sleep: null },
    hrv3dTrend: "unknown",
    rhr3dTrend: "unknown",
  });

  return await buildAssessmentContext({
    localDate: "2026-07-17",
    timeWindow: "morning",
    timezoneOffsetMinutes: 330,
    currentTimezone: "Asia/Kolkata",
    homeTimezone: "Asia/Kolkata",
    derivationVersion: "w3.5-turn-b-test",
    readiness: {
      score: 58,
      tier: "balanced",
      displayedTier: "balanced",
      capReason: null,
      band: "mid",
      mode: "baseline",
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
      mrs: { sources: ["checkin"], primary: "checkin", refinedBy: null },
      brief: { sources: ["checkin"], briefSource: "awaiting" },
      pills: {
        decision_readiness: ["checkin"],
        physical_reserves: [],
        resilience_capacity: ["checkin"],
      },
    },
    checkIn: {
      outcome: null,
      clarityLevel: 2,
      confidenceLevel: 3,
      mentalSharpnessLevel: 3,
      emotionLevel: 3,
      regulationLevel: 3,
      pressureLevel: 3,
    },
    wearable: {
      hasWearable: false,
      wearableFreshForGate: true,
      hasTodayData: false,
      hasRecentData: false,
      wearableDaysConnected: null,
      wearableSourceAgeDays: null,
      hrvValue: null,
      hrvDeviation: null,
      sleepDuration: null,
      sleepScore: null,
      sleepEfficiency: null,
      rhrValue: null,
      rhrDeviation: null,
      hrValue: null,
      hrDeviation: null,
    },
    patterns: {
      hrv3dTrend: "unknown",
      rhr3dTrend: "unknown",
      sustainedDeficitFlag: false,
      consecutiveHighLoadDays: 0,
      cooccurrence7d: {
        cooccurrence_count: 0,
        cooccurrence_ratio: null,
        days_observed: 0,
      },
      avgScore7d: null,
      scoreTrajectory7d: null,
      hrvEventCorrelation: null,
    },
    calendar: {
      load: null,
      pressure: null,
      highStakesEventsCount: 0,
      hasBackToBack: false,
      nextHighStakesMinutesUntil: null,
      typicalLoadForDow: null,
      tomorrowLoad: null,
      tomorrowHighStakesCount: 0,
    },
  });
}

Deno.test("Turn B prompt flow: finalized tiers, fingerprint, divergence, unread pills, and evidence keys are rendered from AssessmentContext", async () => {
  const context = await buildGreenMindDrainedContext();
  const unreadContext = await buildUnreadClarityContext();
  const section = formatPillAssessmentSection(context);
  const unreadSection = formatPillAssessmentSection(unreadContext);

  for (const pill of context.pills.finalized) {
    assertStringIncludes(section, `${pill.label}: ${pill.tier} · ${pill.tierLabel}`);
  }
  assertStringIncludes(section, context.deterministic.pillFingerprint);
  assertStringIncludes(section, "Structured divergence: decision_readiness");
  assertStringIncludes(section, "wearable_objective positive");
  assertStringIncludes(section, "self_report negative");
  assertStringIncludes(section, "[hrvValue");
  assertStringIncludes(section, "[outcome]");
  assert(section.includes("typicalDOWScore") === false);
  assertStringIncludes(unreadSection, "Decision Readiness: neutral · Mind Unread");
});

Deno.test("Turn B prompt flow: clarity remains self-report, never wearable/objective", async () => {
  const context = {
    ...(await buildUnreadClarityContext()),
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
        evidenceKeys: ["clarityLevel"],
      },
    },
  } as any;
  const section = formatPillAssessmentSection(context);

  assertStringIncludes(section, "self_report negative [clarityLevel]");
  assert(section.includes("wearable_objective negative [clarityLevel]") === false);
  assertStringIncludes(section, "Do not call clarity wearable/objective.");
});

Deno.test("Turn B execution order and prompt reuse are source-enforced", async () => {
  const src = await Deno.readTextFile(INDEX_PATH);
  const iDerive = src.indexOf("const pillDerivation = derivePills({");
  const iFinalize = src.indexOf("const pillFinalized = finalizePills({");
  const iContext = src.indexOf("assessmentContext = await buildAssessmentContext({");
  const iUserPrompt = src.indexOf("let userPrompt = ");
  const iInject = src.indexOf("if (assessmentPromptSection) userPrompt += assessmentPromptSection;");
  const iFirstCall = src.indexOf("content = await callLovableAIText({");
  const iRetry = src.indexOf("const retryUserPrompt = userPrompt + FOUR_BEAT_RETRY_GUIDANCE + (targeted || STRICT_PHRASE_RETRY);");
  const iFallback = src.indexOf("buildDeterministicBriefFallback({");
  const iPersistence = src.indexOf("await upsertDailyContextSnapshot(db, {");
  const iResponse = src.indexOf("signalPills: echoedSignalPills,");

  assert(iDerive < iFinalize);
  assert(iFinalize < iContext);
  assert(iContext < iUserPrompt);
  assert(iUserPrompt < iInject);
  assert(iInject < iFirstCall);
  assert(iFirstCall < iRetry);
  assert(iRetry < iFallback);
  assert(iFallback < iPersistence);
  assert(iPersistence < iResponse);

  assertStringIncludes(src, "const retryUserPrompt = userPrompt + FOUR_BEAT_RETRY_GUIDANCE + (targeted || STRICT_PHRASE_RETRY);");
  assertStringIncludes(src, "assessmentSignalPillsPayload = assessmentContext.pills.finalized as any[];");
  assertStringIncludes(src, "const signalPillsPayload = assessmentSignalPillsPayload ?? echoedSignalPills ?? null;");
  assertStringIncludes(src, "signalPills: signalPillsPayload,");
  assertStringIncludes(src, "refined_signal_pills: suppressScorePayload ? null : signalPillsPayload,");
  assertStringIncludes(src, "baseline_signal_pills: suppressScorePayload ? null : signalPillsPayload,");
});

Deno.test("Turn B no post-context mutation or re-derivation occurs after buildAssessmentContext", async () => {
  const src = await Deno.readTextFile(INDEX_PATH);
  const start = src.indexOf("assessmentContext = await buildAssessmentContext({");
  const tail = src.slice(start);

  assert(tail.includes("derivePills(") === false);
  assert(tail.includes("finalizePills(") === false);
  assert(/assertPillCoherence\s*\(/.test(tail) === false);
  assert(tail.includes("assessmentContext.pills.finalized[") === false);
  assert(tail.includes("assessmentContext.pills.qualifiers.") === false);
  assert(tail.includes("assessmentContext.pills.coherence.adjustments.push") === false);
  assert(tail.includes("assessmentContext.divergence.") === false);
});

Deno.test("Turn B divergence generation path: valid evidence-backed copy stays valid, unsupported contradiction is rejected", async () => {
  const context = await buildGreenMindDrainedContext();
  const section = formatPillAssessmentSection(context);
  const pillContext = buildPillContextFromAssessment(context);
  const built = buildDeterministicBriefFallback({
    band: "firing",
    hasWearable: true,
    checkInOutcome: "drained",
    cognitivePillTier: "green",
    physicalPillTier: "green",
    wearableFact: "Recovery is running above its usual range",
    window: "morning",
    todayHighStakes: ["Board Review"],
    calendarLoad: "high",
    meetingCount: 2,
    sleepScore: 81,
    hasBackToBack: false,
  });

  assert(context.divergence !== null);
  assertEquals(context.pills.finalized.find((pill) => pill.key === "decision_readiness")?.tier, "green");
  assertStringIncludes(section, "wearable_objective positive");
  assertStringIncludes(section, "self_report negative");
  assertStringIncludes(built.body, "Recovery is running above its usual range but you've checked in drained");

  const invalid = validatePillBodyConsistency(
    "The mind feels spent going into the board review, so protect the first hour and pace the calls.",
    pillContext,
  );
  assertEquals(invalid.ok, false);

  const detCtx: any = {
    signals: {
      hrvDeviationPct: context.wearable.hrvDeviation,
      hrvUnusual: false,
      sleepHours: context.wearable.sleepDuration != null ? context.wearable.sleepDuration / 60 : null,
      sleepDeviationPct: null,
      sleepBelow6h: false,
      rhrDeviationPct: context.wearable.rhrDeviation,
      hrElevatedProxy: false,
      emotionalSelfDeclared: context.checkIn.outcome,
      mentalSharpness: context.checkIn.mentalSharpnessLevel,
      confidence: context.checkIn.confidenceLevel,
      timezoneOffsetMinutes: null,
      timezoneShift48hHours: null,
      travelDay: false,
      yesterdayScore: null,
      todayScore: context.readiness.score,
      postPeakWindow: false,
      isHighVisibilityToday: false,
      highStakesEventInNext24h: { title: "Board Review", minutesUntil: 45 },
      emotionalDrainEventInNext4h: null,
      morningWasCompressed: false,
      middayRecoveryDetected: false,
      clarityDropFromTrailingAvg: null,
    },
    behaviourFlags: [],
    lexiconClusters: [],
    forbiddenWords: [],
    allowedPatternKeywords: [],
  };
  const valid = validateBrief(built.phrase, built.body, detCtx, {
    mrsScore: context.readiness.score,
    pillContext,
  });
  assert(valid.ok, `expected deterministic divergence copy to validate, got: ${valid.reason}`);
});
