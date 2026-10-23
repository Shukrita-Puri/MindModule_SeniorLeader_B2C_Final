// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Phase Domain (WN-04).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluatePhase } from "./index.ts";

Deno.test("Phase - WN-04: 15 mins after board meeting emits post-anchor phase and protected postDemandingGap", () => {
  const now = new Date("2026-10-24T15:15:00Z");
  const result = evaluatePhase({
    anchors: [
      {
        id: "board-1",
        title: "Board Meeting",
        category: "A",
        startUtc: "2026-10-24T14:00:00Z",
        endUtc: "2026-10-24T15:00:00Z", // Ended 15 minutes ago
        isHighStakes: true,
      },
      {
        id: "wrap-1",
        title: "Day Wrap Up",
        category: "E",
        startUtc: "2026-10-24T17:00:00Z",
        endUtc: "2026-10-24T17:30:00Z",
      },
    ],
    nowUtc: now,
  });

  assertEquals(result.phase, "post_anchor");
  assertEquals(result.postDemandingGap, true);
  assertEquals(result.precedingAnchor?.title, "Board Meeting");
});

Deno.test("Phase - 30 mins before high stakes item emits pre_anchor phase with minutesToNextHighStakes", () => {
  const now = new Date("2026-10-24T13:30:00Z");
  const result = evaluatePhase({
    anchors: [
      {
        id: "neg-1",
        title: "Contract Negotiation",
        category: "B",
        startUtc: "2026-10-24T14:00:00Z", // in 30 minutes
        endUtc: "2026-10-24T15:00:00Z",
        isHighStakes: true,
      },
    ],
    nowUtc: now,
  });

  assertEquals(result.phase, "pre_anchor");
  assertEquals(result.minutesToNextHighStakes, 30);
  assertEquals(result.nextAnchor?.title, "Contract Negotiation");
});

Deno.test("Phase - Inside event duration emits during_anchor phase", () => {
  const now = new Date("2026-10-24T14:20:00Z");
  const result = evaluatePhase({
    anchors: [
      {
        id: "neg-1",
        title: "Contract Negotiation",
        category: "B",
        startUtc: "2026-10-24T14:00:00Z",
        endUtc: "2026-10-24T15:00:00Z",
      },
    ],
    nowUtc: now,
  });

  assertEquals(result.phase, "during_anchor");
  assertEquals(result.activeAnchor?.title, "Contract Negotiation");
});
