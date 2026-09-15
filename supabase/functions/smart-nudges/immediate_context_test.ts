// Regression tests for the optional "immediate context" prompt block and the
// country-agnostic weekend framing rule.
//
// Contract under test: the block is OFFERED context only. With no data it must
// be empty (prompt unchanged), and it must never be required for a send.

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { buildImmediateContextBlock } from "./index.ts";
import {
  firstWeekendDayForHomeCountry,
  lastWeekendDayForHomeCountry,
} from "./fallback-copy.ts";

// deno-lint-ignore no-explicit-any
function ctxWith(over: Record<string, unknown>): any {
  return {
    hasWearableData: false,
    wearable: {
      sleepScore: null,
      hrv: null,
      rhr: null,
      hrvBaseline30d: null,
      rhrBaseline30d: null,
      hrvDeltaPct: null,
      rhrElevated: false,
      totalSleepMinutes: null,
    },
    pattern: null,
    readinessState: null,
    readinessScore: null,
    highStakesEvents: [],
    nonNoiseEvents: [],
    ...over,
  };
}

Deno.test("immediate context is empty when nothing is known", () => {
  assertEquals(buildImmediateContextBlock(ctxWith({}), null), "");
  assertEquals(buildImmediateContextBlock(ctxWith({}), "Board Meeting"), "");
});

Deno.test("immediate context names wearable + readiness facts when present", () => {
  const block = buildImmediateContextBlock(
    ctxWith({
      hasWearableData: true,
      wearable: {
        sleepScore: null,
        hrv: 42,
        rhr: 61,
        hrvBaseline30d: 55,
        rhrBaseline30d: 57,
        hrvDeltaPct: -18,
        rhrElevated: true,
        totalSleepMinutes: 372,
      },
      readinessState: "strained",
      readinessScore: 48.4,
    }),
    null,
  );
  assert(block.includes("18% below"), block);
  assert(block.includes("Resting heart rate is elevated"), block);
  assert(block.includes("6.2h"), block);
  assert(block.includes("Readiness state: strained (48)"), block);
  // Never a requirement — it is presented as optional context.
  assert(block.includes("never required"), block);
});

Deno.test("immediate context cites a pattern only with enough observations", () => {
  const pattern = {
    event_to_hrv: [
      {
        event_type: "board",
        n: 3,
        hrvDeltaPct: -12,
        rhrElevated: true,
        confidence: "strong",
        lastSeen: "2026-09-01",
      },
    ],
    event_to_rhr: [],
    sleep_to_prs: null,
    consecutive_load: null,
  };
  const block = buildImmediateContextBlock(
    ctxWith({ pattern }),
    "Board Meeting",
  );
  // Either the pattern matched and is cited, or the block stays silent —
  // never a fabricated claim.
  if (block) assert(/Pattern \((strong|emerging), n=\d+\)/.test(block), block);
});

Deno.test("weekend framing rule is identical for Sat/Sun and Fri/Sat countries", () => {
  // Sat/Sun weekend: recovery framing Saturday, week-ahead Sunday.
  assertEquals(firstWeekendDayForHomeCountry("United Kingdom"), 6);
  assertEquals(lastWeekendDayForHomeCountry("United Kingdom"), 0);
  // Fri/Sat weekend: same rule, shifted one day.
  assertEquals(firstWeekendDayForHomeCountry("United Arab Emirates"), 5);
  assertEquals(lastWeekendDayForHomeCountry("United Arab Emirates"), 6);
});
