// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Physiology Domain Engine (RD-01 to RD-06).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluatePhysiology } from "./index.ts";
import { CANONICAL_PHYSIOLOGY_TIERS } from "./constants.ts";

Deno.test("Physiology - RD-01: HRV 15% deficit & short sleep caps tier at managing", () => {
  const now = new Date("2026-10-24T08:00:00Z");
  const result = evaluatePhysiology({
    raw: {
      readingTimestampUtc: "2026-10-24T07:30:00Z",
      hrvMs: 40, // 40 vs baseline 50 is 20% deficit (>= 15%)
      restingHrBpm: 62,
      sleepMinutes: 330, // 5.5 hours (< 360 mins)
      sleepEfficiencyPercent: 82,
    },
    baselines: {
      hrvBaselineMs: 50,
      restingHrBaselineBpm: 60,
      sleepBaselineMinutes: 450,
    },
    nowUtc: now,
  });

  assertEquals(result.freshness, "fresh");
  // Tier should be capped at managing or below
  const tierRank = CANONICAL_PHYSIOLOGY_TIERS.indexOf(result.tier as any);
  const managingRank = CANONICAL_PHYSIOLOGY_TIERS.indexOf("managing");
  assertEquals(tierRank >= managingRank, true); // higher index = lower tier in array
  assertEquals(result.capReason !== null, true);
  assertEquals(result.pills.decisionReadiness.color !== "green", true);
});

Deno.test("Physiology - RD-02: Wearable missing gives null score and uncalibrated tier", () => {
  const now = new Date("2026-10-24T08:00:00Z");
  const result = evaluatePhysiology({
    raw: {
      hrvMs: null,
      restingHrBpm: null,
      sleepMinutes: null,
    },
    nowUtc: now,
  });

  assertEquals(result.score, null);
  assertEquals(result.tier, "uncalibrated");
  assertEquals(result.freshness, "missing");
});

Deno.test("Physiology - RD-03: Wearable not synced since yesterday marked stale, no tier", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const result = evaluatePhysiology({
    raw: {
      readingTimestampUtc: "2026-10-23T06:00:00Z", // 32 hours old (> 24 hours)
      hrvMs: 55,
      restingHrBpm: 58,
      sleepMinutes: 480,
    },
    baselines: {
      hrvBaselineMs: 55,
      restingHrBaselineBpm: 58,
      sleepBaselineMinutes: 450,
    },
    nowUtc: now,
  });

  assertEquals(result.freshness, "stale");
  assertEquals(result.tier, "uncalibrated");
  assertEquals(result.score, null);
});

Deno.test("Physiology - RD-06: Afternoon window with carried over morning readiness", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const result = evaluatePhysiology({
    raw: {
      readingTimestampUtc: "2026-10-24T07:00:00Z",
      hrvMs: 60,
      restingHrBpm: 55,
      sleepMinutes: 450,
    },
    baselines: {
      hrvBaselineMs: 55,
      restingHrBaselineBpm: 58,
      sleepBaselineMinutes: 450,
    },
    nowUtc: now,
    isCarriedOver: true,
  });

  assertEquals(result.isCarriedOver, true);
  assertEquals(result.tier, "optimal");
});
