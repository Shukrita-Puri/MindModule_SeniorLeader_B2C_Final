// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Remaining Domain (WN-02, WN-03).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateRemaining } from "./index.ts";

Deno.test("Remaining - WN-02: Afternoon crisis call (J) emits highest remaining stakes J", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const result = evaluateRemaining({
    nowUtc: now,
    items: [
      {
        id: "past-sync",
        title: "Morning Sync",
        category: "E",
        startUtc: "2026-10-24T09:00:00Z",
        endUtc: "2026-10-24T09:30:00Z",
      },
      {
        id: "crisis-call",
        title: "Urgent Hostile Takeover Crisis Call",
        category: "J",
        startUtc: "2026-10-24T16:00:00Z",
        endUtc: "2026-10-24T17:00:00Z",
      },
      {
        id: "routine-admin",
        title: "Admin Review",
        category: "I",
        startUtc: "2026-10-24T17:30:00Z",
        endUtc: "2026-10-24T18:00:00Z",
      },
    ],
  });

  assertEquals(result.completedItemsCount, 1);
  assertEquals(result.remainingItemsCount, 2);
  assertEquals(result.highestCompletedCategory, "E");
  assertEquals(result.highestRemainingStakes, "J"); // Confirms J is recognized as highest stakes
});

Deno.test("Remaining - WN-03: Difficult conversation (D) in 2h with HR 12% elevated emits decisionLeakageRisk", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const result = evaluateRemaining({
    nowUtc: now,
    items: [
      {
        id: "diff-convo",
        title: "Executive Performance Dispute",
        category: "D",
        startUtc: "2026-10-24T16:00:00Z",
        endUtc: "2026-10-24T17:00:00Z",
      },
    ],
    intradayHrBpm: 67, // 67 vs 60 resting is 11.6% elevation (> 10%)
    restingHrBaselineBpm: 60,
  });

  assertEquals(result.decisionLeakageRisk, true);
  assertEquals(result.highestRemainingStakes, "D");
});
