// Sprint E — source-level contract for Plan why-line window-signal wiring.
//
// Cannot import the full handler (Supabase env at import). These tests
// pin the wiring rules the reviewer scans for:
//   - derivePlanWindowSignals is reused for the why-line path (no new
//     signal assembly).
//   - composeWhyLine now accepts a windowSignals option and threads it
//     into immediateClause with slotKind / phase / mindset.pause / HRV
//     correlation flags.
//   - immediateClause carries the required Sprint E copy branches.
//   - Deterministic valence guard reuses validateWhyLine and recomposes
//     without window signals on rejection.
//   - LLM input carries the same window fields.
//   - Debug log emitted with the timeOfDay + non-null keys.

import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("Sprint E — reuses derivePlanWindowSignals for the why-line path", () => {
  assertStringIncludes(SRC, "const whyWindowSignals = timeOfDayForWhy ? derivePlanWindowSignals(req, timeOfDayForWhy) : null;");
});

Deno.test("Sprint E — composeWhyLine threads windowSignals into immediateClause", () => {
  assertStringIncludes(SRC, "windowSignals: opts.windowSignals ?? null,");
  assertStringIncludes(SRC, "practiceIsMindsetPause,");
  assertStringIncludes(SRC, "hasHrvEventCorrelation,");
});

Deno.test("Sprint E — deterministic morning veto risk clause present", () => {
  assertStringIncludes(SRC, "Your body reads differently from how you feel — lead from the prep, not the instinct.");
});

Deno.test("Sprint E — deterministic afternoon decision leakage clause present", () => {
  assertStringIncludes(SRC, "Emotional drain is already showing — protect composure before the next decision.");
});

Deno.test("Sprint E — deterministic evening body load clause present", () => {
  assertStringIncludes(SRC, "Body load is elevated from the day — settle before the evening.");
});

Deno.test("Sprint E — deterministic evening recovery-rest clause present", () => {
  assertStringIncludes(SRC, "Today was heavy and tomorrow opens heavy — tonight is genuine recovery.");
});

Deno.test("Sprint E — deterministic mindset.pause state-based clause present", () => {
  assertStringIncludes(SRC, "Reactive thinking is building — pause to separate the noise from the signal before the next call.");
});

Deno.test("Sprint E — deterministic mindset.pause Cat-A/pre clauses present (with + without HRV correlation)", () => {
  assertStringIncludes(SRC, "Past board-style events have pushed recovery off baseline — clear the reactive noise before the room.");
  assertStringIncludes(SRC, "High-stakes call ahead — detach from the prior block and enter with a clear head.");
});

Deno.test("Sprint E — deterministic mindset.pause post-event clause present", () => {
  assertStringIncludes(SRC, "This moment carries emotional charge — offload the residue before it leaks into the next conversation.");
});

Deno.test("Sprint E — deterministic valence guard reuses validateWhyLine + recomposes without windowSignals", () => {
  assertStringIncludes(SRC, "const detVerdict = validateWhyLine({");
  assertStringIncludes(SRC, "windowSignals: null,");
  assertStringIncludes(SRC, "fallback=deterministic_repair reject=");
});

Deno.test("Sprint E — LLM WhyLLMInput carries the new window fields", () => {
  assertStringIncludes(SRC, "decisionLeakageRisk: whyWindowSignals?.decisionLeakageRisk === true ? true : undefined,");
  assertStringIncludes(SRC, "bodyLoadElevated: whyWindowSignals?.bodyLoadElevated === true ? true : undefined,");
  assertStringIncludes(SRC, "recoveryNote: whyWindowSignals?.recoveryNote ?? null,");
  assertStringIncludes(SRC, "vetoRisk: undefined,");
});

Deno.test("Sprint E — debug log emitted with keys", () => {
  assertStringIncludes(SRC, "[Plan][why-window-signals]");
});

Deno.test("Sprint E — no new DB queries added for why-window derivation", () => {
  // Extract the small why-window derivation block and prove it doesn't
  // touch supabaseClient / .from(/ fetch(.
  const start = SRC.indexOf("// Sprint E — reuse the Sprint D window signal derivation.");
  assert(start >= 0, "sprint E block marker missing");
  const end = SRC.indexOf("// Pre-compute today's local date", start);
  const block = SRC.slice(start, end);
  assert(!block.includes("supabaseClient"), "why-window block must not query the DB");
  assert(!block.includes(".from("), "why-window block must not call .from()");
  assert(!block.includes("fetch("), "why-window block must not call fetch()");
});
