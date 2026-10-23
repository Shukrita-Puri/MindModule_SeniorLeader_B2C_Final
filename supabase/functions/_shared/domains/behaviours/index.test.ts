// [KIND: test] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 5 Behaviours (Signals) Domain.
// Source: Part 2 Layer 5 (Section 4, 12).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateBehaviourSignals } from "./index.ts";

Deno.test("Behaviours - L5-01: Board day approaching emits boardLevelOutcome and prepWindowOpen", () => {
  const bundle = {
    dayProfile: {
      load: { level: "heavy" },
      contextualFacts: { upwardReporting: true },
    },
    windowProfile: {
      minutesToNextHighStakes: 120, // 2 hours away (within 240m)
    },
    importance: {
      topItemAnchor: { category: "A", title: "Q4 Board Meeting" },
    },
  };

  const signals = evaluateBehaviourSignals(bundle);
  const names = signals.map((s) => s.name);

  assertEquals(names.includes("boardLevelOutcome"), true);
  assertEquals(names.includes("prepWindowOpen"), true);
  assertEquals(names.includes("upwardReporting"), true);

  const boardSignal = signals.find((s) => s.name === "boardLevelOutcome");
  assertEquals(boardSignal?.severity, "high");
});

Deno.test("Behaviours - L5-03: Travel landing with timezone shift emits travelLanding & circadianShift", () => {
  const bundle = {
    dayProfile: {
      travel: {
        isTravelling: true,
        travelPhase: "destination",
        timeZoneShiftHours: 4,
      },
      contextualFacts: {},
    },
    windowProfile: {},
  };

  const signals = evaluateBehaviourSignals(bundle);
  const names = signals.map((s) => s.name);

  assertEquals(names.includes("travelLanding"), true);
  assertEquals(names.includes("circadianShift"), true);
});

Deno.test("Behaviours - Crisis Precedence: Active crisis suppresses routine rhythms", () => {
  const bundle = {
    dayProfile: {
      crisis: { isCrisisDay: true, activeEpisode: { state: "open" } },
      weekAhead: { isActive: true, reason: "sunday_reset" },
    },
    windowProfile: {
      window: "morning",
    },
  };

  const signals = evaluateBehaviourSignals(bundle);
  const names = signals.map((s) => s.name);

  assertEquals(names[0], "crisis"); // Rank 1 priority
  assertEquals(names.includes("weekAhead"), false); // Suppressed by crisis
  assertEquals(names.includes("morningAnchor"), false); // Suppressed by crisis
});

Deno.test("Behaviours - Dense Day: 5h back-to-back chain triggers denseDayMode", () => {
  const bundle = {
    dayProfile: {
      mix: {
        backToBack: { longestChainHours: 5.0 },
        contextSwitching: { level: "medium" },
      },
    },
    windowProfile: {},
  };

  const signals = evaluateBehaviourSignals(bundle);
  const denseSignal = signals.find((s) => s.name === "denseDayMode");

  assertEquals(denseSignal !== undefined, true);
  assertEquals(denseSignal?.severity, "medium");
});
