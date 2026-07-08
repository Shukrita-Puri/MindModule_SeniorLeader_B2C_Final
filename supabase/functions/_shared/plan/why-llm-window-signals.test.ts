// Sprint E — Why-line LLM window-signal prompt tests.
//
// Contract:
//   - WhyLLMInput accepts new window fields.
//   - buildWindowSignalLines emits only non-null / true fields.
//   - Prompt STATE block includes those lines and omits inverted signals.
//   - Existing accepted LLM validator path is unchanged.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildWindowSignalLines,
  validateWhyLine,
  type WhyLLMInput,
  type StateBand,
} from "./why-llm.ts";
import type { SlotAnchor } from "./title-prefixes.ts";

const baseInput: WhyLLMInput = {
  role: "PREPARE",
  eventName: "Q2 Board Meeting",
  category: "A",
  phase: "pre",
  minutesUntilStart: 45,
  hrvDeltaPct: null,
  sleepScore: null,
  rhrTrend: null,
  travelDebtActive: null,
  stressLoad: null,
  burnoutRisk: null,
  mindState: null,
  bodyState: null,
  patternSummary: null,
  growthIntention: null,
};

Deno.test("Sprint E — buildWindowSignalLines emits decisionLeakageRisk only when true", () => {
  assertEquals(buildWindowSignalLines({ ...baseInput }), []);
  assertEquals(
    buildWindowSignalLines({ ...baseInput, decisionLeakageRisk: false }),
    [],
  );
  assertEquals(
    buildWindowSignalLines({ ...baseInput, decisionLeakageRisk: true }),
    ["Window signal: decision leakage risk present"],
  );
});

Deno.test("Sprint E — buildWindowSignalLines emits bodyLoadElevated only when true", () => {
  assertEquals(buildWindowSignalLines({ ...baseInput, bodyLoadElevated: false }), []);
  assertEquals(
    buildWindowSignalLines({ ...baseInput, bodyLoadElevated: true }),
    ["Window signal: body load elevated"],
  );
});

Deno.test("Sprint E — buildWindowSignalLines emits recoveryNote only when non-null", () => {
  assertEquals(buildWindowSignalLines({ ...baseInput, recoveryNote: null }), []);
  assertEquals(
    buildWindowSignalLines({ ...baseInput, recoveryNote: "rest" }),
    ["Window signal: evening recovery note: rest"],
  );
});

Deno.test("Sprint E — buildWindowSignalLines emits vetoRisk only when true", () => {
  assertEquals(buildWindowSignalLines({ ...baseInput, vetoRisk: false }), []);
  assertEquals(
    buildWindowSignalLines({ ...baseInput, vetoRisk: true }),
    ["Window signal: veto risk present"],
  );
});

Deno.test("Sprint E — all window signals off → no lines emitted (unchanged prompt)", () => {
  const lines = buildWindowSignalLines({
    ...baseInput,
    decisionLeakageRisk: false,
    bodyLoadElevated: false,
    recoveryNote: null,
    vetoRisk: false,
  });
  assertEquals(lines.length, 0);
});

Deno.test("Sprint E — validateWhyLine LLM accepted path still passes with window fields set", () => {
  const anchor: SlotAnchor = { eventTitle: "Q2 Board Meeting", categoryId: "A", phase: "pre" };
  const r = validateWhyLine({
    text: "Before the board meeting, this sharpens the decision call you need to make.",
    stateBand: "steady" as StateBand,
    slotAnchor: anchor,
  });
  assert(r.ok);
});

Deno.test("Sprint E — prompt STATE block source-level contract references window lines", async () => {
  const src = await Deno.readTextFile(new URL("./why-llm.ts", import.meta.url));
  assertStringIncludes(src, "buildWindowSignalLines(inp)");
  assertStringIncludes(src, "Window signal: decision leakage risk present");
  assertStringIncludes(src, "Window signal: body load elevated");
  assertStringIncludes(src, "Window signal: evening recovery note:");
  assertStringIncludes(src, "Window signal: veto risk present");
});
