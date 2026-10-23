// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Open Loops domain.
// Source: Part 2 Layer 2 (Section 4.10, Scenarios OL-01 to OL-03).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { openLoopsEngine } from "./engine.ts";

Deno.test("Open Loops Domain: Scenario OL-01 No communication connector -> Engine off, emits nothing", () => {
  const facts = openLoopsEngine.evaluate();

  assertEquals(facts.active, false);
  assertEquals(facts.openLoopsCount, 0);
  assertEquals(facts.items.length, 0);
});

Deno.test("Open Loops Domain: Dormant flag prevents active execution until explicitly enabled", () => {
  const facts = openLoopsEngine.evaluate({
    hasCommunicationConnector: true,
    rawSignals: [
      {
        id: "loop_1",
        source: "email",
        title: "Board packet approval pending decision",
        ageHours: 4,
        stakes: "high",
      },
    ],
  });

  assertEquals(facts.active, false); // OPEN_LOOPS_ENABLED = false
});
