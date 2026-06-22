import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("generate-mastery-plan reads weekly_plan_snapshots for the current local week only", () => {
  assert(SRC.includes("from('weekly_plan_snapshots')"), "no read of weekly_plan_snapshots");
  assert(SRC.includes(".eq('week_start_date', weekStart)"), "must scope read to current weekStart");
  assert(SRC.includes("[week_ahead.read.hit]"), "missing hit log");
  assert(SRC.includes("[week_ahead.read.miss]"), "missing miss log");
});

Deno.test("generate-mastery-plan exposes weeklyPlanSnapshot as advisory context only", () => {
  assert(SRC.includes("weeklyPlanSnapshot"), "missing weeklyPlanSnapshot on SharedContext");
  // Must NOT be wired into hard selectors. Guardrail: the field name does
  // not appear inside event selection / slot allocator / pill builders.
  const guarded = [
    "selectJitCandidates(",
    "buildSlotContext(",
    "signal_pills",
  ];
  for (const needle of guarded) {
    if (!SRC.includes(needle)) continue;
    const idx = SRC.indexOf(needle);
    const window = SRC.slice(Math.max(0, idx - 400), idx + 400);
    assert(
      !window.includes("weeklyPlanSnapshot"),
      `weeklyPlanSnapshot leaked into hard selector near "${needle}"`,
    );
  }
});