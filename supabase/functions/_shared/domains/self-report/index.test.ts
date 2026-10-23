// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Self-Report Domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateSelfReport } from "./index.ts";

Deno.test("SelfReport - RD-04: Clear and steady check-in lifts low reading by AT MOST one step", () => {
  // Base tier is managing (index 3). High check-in (5.0) can only lift to steady (index 2), never to primed or optimal.
  const result = evaluateSelfReport({
    baseTier: "managing",
    checkIns: [
      {
        timestampUtc: "2026-10-24T08:30:00Z",
        clarityLevel: 5,
        emotionLevel: 5,
        energyLevel: 5,
        pressureLevel: 5,
        regulationLevel: 5,
        words: ["clear", "steady"],
      },
    ],
  });

  assertEquals(result.refineEffect, "lifted");
  assertEquals(result.refineStepsApplied, 1);
  assertEquals(result.refinedTier, "steady");
  assertEquals(result.selfReportedTier, "optimal");
});

Deno.test("SelfReport - Low check-in hardens tier by AT MOST one step", () => {
  // Base tier is primed. Low check-in (1.0) lowers to steady.
  const result = evaluateSelfReport({
    baseTier: "primed",
    checkIns: [
      {
        timestampUtc: "2026-10-24T14:30:00Z",
        clarityLevel: 1,
        emotionLevel: 2,
        energyLevel: 1,
        pressureLevel: 1,
        regulationLevel: 2,
      },
    ],
  });

  assertEquals(result.refineEffect, "lowered");
  assertEquals(result.refineStepsApplied, 1);
  assertEquals(result.refinedTier, "steady");
});

Deno.test("SelfReport - Without check-in, physiology stands alone", () => {
  const result = evaluateSelfReport({
    baseTier: "depleted",
    checkIns: [],
  });

  assertEquals(result.refineEffect, "none");
  assertEquals(result.refineStepsApplied, 0);
  assertEquals(result.refinedTier, "depleted");
  assertEquals(result.checkIn, null);
});
