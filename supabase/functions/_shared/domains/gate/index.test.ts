// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Gate Domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateGate } from "./index.ts";

Deno.test("Gate - ST-05: No wearable connected triggers wearable-less mode with check-in confidence", () => {
  const result = evaluateGate({
    hasCalendar: true,
    hasWearable: false,
    physiologyFreshness: "missing",
    hasCheckInToday: true,
  });

  assertEquals(result.wearableLessMode, true);
  assertEquals(result.isOpen, true);
  assertEquals(result.cardsAwaiting, false);
  assertEquals(result.stateConfidence, "moderate");
});

Deno.test("Gate - ST-06: Disconnected calendar closes gate with reason", () => {
  const result = evaluateGate({
    hasCalendar: false,
    hasWearable: true,
    physiologyFreshness: "fresh",
  });

  assertEquals(result.isOpen, false);
  assertEquals(result.cardsAwaiting, true);
  assertEquals(result.reason, "Calendar is disconnected");
});

Deno.test("Gate - N-CG1 & N-CG2: High tactical coverage and account age yields T3 weight tier", () => {
  const result = evaluateGate({
    hasCalendar: true,
    hasWearable: true,
    physiologyFreshness: "fresh",
    hasCheckInToday: true,
    coverageInput: {
      hasClassifiedItemsToday: true,
      hasFreshWearableReading: true,
      hasCheckInToday: true,
      wearableAgeHours: 4, // Full quality
      patternsCountWith3PlusOccurrences: 6, // 100% target
      wearableDaysInLast30: 21, // 100% target
      meanPatternConfidence: 1.0,
      declaredGoalsCount: 2,
      accountAgeDays: 45, // >= 30 days yields T3
    },
  });

  assertEquals(result.horizonCoverage.immediate.blended, 1.0);
  assertEquals(result.horizonCoverage.tactical.blended, 1.0);
  assertEquals(result.horizonCoverage.weightTier, "T3");
});
