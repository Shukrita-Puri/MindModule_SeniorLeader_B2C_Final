// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Trajectory Domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateTrajectory } from "./index.ts";

Deno.test("Trajectory - ST-04: Afternoon tier lower than morning with HR drift emits stateChange down and hrDrift", () => {
  const result = evaluateTrajectory({
    currentTier: "managing", // lower than steady
    previousWindowTier: "steady",
    intradayHrBpm: 68,
    restingHrBaselineBpm: 60, // 68 vs 60 is +13.3% drift (>10%)
  });

  assertEquals(result.stateChange, "down");
  assertEquals(result.hrDrift?.isDriftingUp, true);
  assertEquals(result.hrDrift?.percentDrift, 13);
});

Deno.test("Trajectory - First read without prior window has stateChange flat", () => {
  const result = evaluateTrajectory({
    currentTier: "steady",
    previousWindowTier: null,
  });

  assertEquals(result.stateChange, "flat");
  assertEquals(result.hrDrift, null);
  assertEquals(result.stateExpectedVsActual, "expected");
});

Deno.test("Trajectory - State higher than expected trajectory emits better", () => {
  const result = evaluateTrajectory({
    currentTier: "optimal", // index 0
    previousWindowTier: "primed", // index 1
    expectedTrajectoryTier: "managing", // index 3
  });

  assertEquals(result.stateChange, "up");
  assertEquals(result.stateExpectedVsActual, "better");
});
