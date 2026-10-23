// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 State Profile Composer (ST-01 to ST-06).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateStateProfile } from "./index.ts";

Deno.test("StateProfile - ST-01: Morning low HRV and short sleep with no check-in", () => {
  const result = evaluateStateProfile({
    rawBiometrics: {
      readingTimestampUtc: "2026-10-24T07:30:00Z",
      hrvMs: 38,
      restingHrBpm: 63,
      sleepMinutes: 320,
    },
    baselines: {
      hrvBaselineMs: 50,
      restingHrBaselineBpm: 60,
      sleepBaselineMinutes: 450,
    },
    hasCalendar: true,
    hasWearable: true,
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  assertEquals(result.tier, "managing");
  assertEquals(result.agreement.hasDivergence, false);
  assertEquals(result.gate.isOpen, true);
  assertEquals(result.gate.stateConfidence, "high");
});

Deno.test("StateProfile - ST-02: Low HRV with clear and steady check-in emits bodyMindDivergence", () => {
  const result = evaluateStateProfile({
    rawBiometrics: {
      readingTimestampUtc: "2026-10-24T07:30:00Z",
      hrvMs: 38,
      restingHrBpm: 63,
      sleepMinutes: 320,
    },
    baselines: {
      hrvBaselineMs: 50,
      restingHrBaselineBpm: 60,
      sleepBaselineMinutes: 450,
    },
    checkIns: [
      {
        timestampUtc: "2026-10-24T07:45:00Z",
        clarityLevel: 5,
        emotionLevel: 5,
        energyLevel: 5,
        pressureLevel: 5,
        regulationLevel: 5,
      },
    ],
    hasCalendar: true,
    hasWearable: true,
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  // Base tier managing refined by 1 step to steady
  assertEquals(result.tier, "steady");
  assertEquals(result.basePhysiologyTier, "managing");
  assertEquals(result.agreement.hasDivergence, true);
  assertEquals(result.agreement.divergence?.direction, "body_lower");
});

Deno.test("StateProfile - ST-03: Afternoon tier managing with board meeting in 90 mins emits readinessDemandGap", () => {
  const result = evaluateStateProfile({
    rawBiometrics: {
      readingTimestampUtc: "2026-10-24T13:30:00Z",
      hrvMs: 40,
      restingHrBpm: 62,
      sleepMinutes: 330,
    },
    baselines: {
      hrvBaselineMs: 50,
      restingHrBaselineBpm: 60,
      sleepBaselineMinutes: 450,
    },
    hasCalendar: true,
    hasWearable: true,
    scheduledItems: [
      {
        id: "evt-board",
        title: "Q4 Board Meeting",
        category: "A",
        startUtc: "2026-10-24T15:30:00Z",
      },
    ],
    nowUtc: new Date("2026-10-24T14:00:00Z"),
  });

  assertEquals(result.fit.hasGap, true);
  assertEquals(result.fit.readinessDemandGap?.itemsAhead[0].title, "Q4 Board Meeting");
  assertEquals(result.fit.readinessDemandGap?.minutesUntilFirst, 90);
});

Deno.test("StateProfile - ST-04: Afternoon tier lower than morning with HR drift emits stateChange down and hrDrift", () => {
  const result = evaluateStateProfile({
    rawBiometrics: {
      readingTimestampUtc: "2026-10-24T13:30:00Z",
      hrvMs: 40,
      restingHrBpm: 65,
      sleepMinutes: 340,
    },
    baselines: {
      hrvBaselineMs: 50,
      restingHrBaselineBpm: 60,
      sleepBaselineMinutes: 450,
    },
    previousWindowTier: "steady",
    intradayHrBpm: 70, // 70 vs 60 is +16.7% drift (>10%)
    hasCalendar: true,
    hasWearable: true,
    nowUtc: new Date("2026-10-24T14:00:00Z"),
  });

  assertEquals(result.trajectory.stateChange, "down");
  assertEquals(result.trajectory.hrDrift?.isDriftingUp, true);
});

Deno.test("StateProfile - ST-05: No wearable connected triggers wearable-less mode", () => {
  const result = evaluateStateProfile({
    rawBiometrics: {},
    hasCalendar: true,
    hasWearable: false,
    checkIns: [
      {
        timestampUtc: "2026-10-24T08:00:00Z",
        clarityLevel: 4,
        energyLevel: 4,
      },
    ],
    nowUtc: new Date("2026-10-24T08:30:00Z"),
  });

  assertEquals(result.gate.wearableLessMode, true);
  assertEquals(result.gate.isOpen, true);
  assertEquals(result.headline.includes("Wearable-less mode"), true);
});

Deno.test("StateProfile - ST-06: Calendar disconnected closes gate", () => {
  const result = evaluateStateProfile({
    rawBiometrics: {
      readingTimestampUtc: "2026-10-24T08:00:00Z",
      hrvMs: 50,
      restingHrBpm: 60,
      sleepMinutes: 450,
    },
    hasCalendar: false,
    hasWearable: true,
    nowUtc: new Date("2026-10-24T08:30:00Z"),
  });

  assertEquals(result.gate.isOpen, false);
  assertEquals(result.gate.cardsAwaiting, true);
  assertEquals(result.headline, "Calendar is disconnected");
});
