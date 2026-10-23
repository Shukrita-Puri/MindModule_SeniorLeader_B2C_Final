// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Fit Domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateFit } from "./index.ts";

Deno.test("Fit - ST-03: Tier managing with board meeting in 90 mins emits readinessDemandGap", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const result = evaluateFit({
    refinedTier: "managing",
    nowUtc: now,
    scheduledItems: [
      {
        id: "evt-1",
        title: "Board Meeting",
        category: "A",
        startUtc: "2026-10-24T15:30:00Z", // In 90 minutes
        isHighStakes: true,
      },
    ],
  });

  assertEquals(result.hasGap, true);
  assertEquals(result.readinessDemandGap?.size, "moderate");
  assertEquals(result.readinessDemandGap?.minutesUntilFirst, 90);
  assertEquals(result.readinessDemandGap?.itemsAhead[0].title, "Board Meeting");
});

Deno.test("Fit - Tier steady with demanding item emits no gap", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const result = evaluateFit({
    refinedTier: "steady",
    nowUtc: now,
    scheduledItems: [
      {
        id: "evt-1",
        title: "Board Meeting",
        category: "A",
        startUtc: "2026-10-24T15:30:00Z",
        isHighStakes: true,
      },
    ],
  });

  assertEquals(result.hasGap, false);
  assertEquals(result.readinessDemandGap, null);
});

Deno.test("Fit - Tier depleted with high demand emits severe gap", () => {
  const now = new Date("2026-10-24T14:00:00Z");
  const result = evaluateFit({
    refinedTier: "depleted",
    nowUtc: now,
    scheduledItems: [
      {
        id: "evt-2",
        title: "Crisis Negotiation",
        category: "J",
        startUtc: "2026-10-24T14:45:00Z",
      },
    ],
  });

  assertEquals(result.hasGap, true);
  assertEquals(result.readinessDemandGap?.size, "severe");
  assertEquals(result.readinessDemandGap?.minutesUntilFirst, 45);
});
