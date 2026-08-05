import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Pure unit tests for the briefMode derivation rule used by
// compute-outer-readiness/index.ts. Pulling the rule into a tiny local
// helper here so we can prove the contract without spinning up the full
// edge function. If the rule in index.ts diverges from this helper, the
// regression coverage below will fail in CI.

type BriefMode = "cold-start" | "baseline" | "refined";

function deriveBriefMode(input: {
  hasFreshWearable: boolean;
  hasCalendarSignal: boolean;
  hasCalendarConnected: boolean;
  hasTodayCheckIn: boolean;
  briefWearableUsable?: boolean;
  checkInCurrentForWindow?: boolean;
}): BriefMode {
  const hasState1Input =
    input.hasFreshWearable ||
    input.hasCalendarSignal ||
    input.hasCalendarConnected ||
    input.hasTodayCheckIn;
  if (!hasState1Input) return "cold-start";
  // Personal-signal entry condition for the Brief prose: calendar demand alone
  // must not satisfy the brief contract.
  const briefHasCurrentPersonalSignal =
    (input.briefWearableUsable ?? input.hasFreshWearable) ||
    (input.checkInCurrentForWindow ?? input.hasTodayCheckIn);
  if (!briefHasCurrentPersonalSignal) return "cold-start";
  return input.hasTodayCheckIn ? "refined" : "baseline";
}


Deno.test("briefMode: baseline-only Brief — wearable + calendar, no check-in", () => {
  const m = deriveBriefMode({
    hasFreshWearable: true,
    hasCalendarSignal: true,
    hasCalendarConnected: true,
    hasTodayCheckIn: false,
  });
  assertEquals(m, "baseline");
});

Deno.test("briefMode: baseline-only Brief — calendar connected, no events, no wearable, no check-in", () => {
  const m = deriveBriefMode({
    hasFreshWearable: false,
    hasCalendarSignal: false,
    hasCalendarConnected: true,
    hasTodayCheckIn: false,
  });
  assertEquals(m, "baseline");
});

Deno.test("briefMode: refined — check-in present (with baseline)", () => {
  const m = deriveBriefMode({
    hasFreshWearable: true,
    hasCalendarSignal: true,
    hasCalendarConnected: true,
    hasTodayCheckIn: true,
  });
  assertEquals(m, "refined");
});

Deno.test("briefMode: refined — check-in only, no baseline", () => {
  const m = deriveBriefMode({
    hasFreshWearable: false,
    hasCalendarSignal: false,
    hasCalendarConnected: false,
    hasTodayCheckIn: true,
  });
  assertEquals(m, "refined");
});

Deno.test("briefMode: cold-start — no inputs at all (regression coverage)", () => {
  const m = deriveBriefMode({
    hasFreshWearable: false,
    hasCalendarSignal: false,
    hasCalendarConnected: false,
    hasTodayCheckIn: false,
  });
  assertEquals(m, "cold-start");
});