import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  maxWearableAgeDaysForWindow,
  resolveSignalFreshness,
} from "./signal-freshness.ts";

const base = {
  wearableSourceAgeDays: 1,
  hasWearableData: true,
  hasCheckInRowForWindow: false,
};

Deno.test("morning accepts overnight / prior-day wearable row", () => {
  const f = resolveSignalFreshness({ ...base, window: "morning" });
  assertEquals(f.wearableCurrent, true);
  assertEquals(f.wearableHistoricalOnly, false);
  assertEquals(f.maxWearableAgeDays, 1);
});

Deno.test("afternoon rejects yesterday's wearable row", () => {
  const f = resolveSignalFreshness({ ...base, window: "afternoon" });
  assertEquals(f.wearableCurrent, false);
  assertEquals(f.hrvUsableAsCurrent, false);
  assertEquals(f.wearableHistoricalOnly, true);
});

Deno.test("evening rejects yesterday's wearable row", () => {
  const f = resolveSignalFreshness({ ...base, window: "evening" });
  assertEquals(f.wearableCurrent, false);
  assertEquals(f.sleepUsableAsCurrent, false);
});

Deno.test("same-day row is current in every window", () => {
  for (const window of ["morning", "afternoon", "evening"] as const) {
    const f = resolveSignalFreshness({
      ...base,
      window,
      wearableSourceAgeDays: 0,
    });
    assertEquals(f.wearableCurrent, true);
  }
});

Deno.test("no wearable data is never current", () => {
  const f = resolveSignalFreshness({
    window: "morning",
    wearableSourceAgeDays: null,
    hasWearableData: false,
    hasCheckInRowForWindow: false,
  });
  assertEquals(f.wearableCurrent, false);
  assertEquals(f.wearableHistoricalOnly, false);
});

Deno.test("clarity is only current when a window check-in row exists", () => {
  const without = resolveSignalFreshness({ ...base, window: "afternoon" });
  assertEquals(without.checkInCurrent, false);
  assertEquals(without.clarityUsableAsCurrent, false);
  const withRow = resolveSignalFreshness({
    ...base,
    window: "afternoon",
    hasCheckInRowForWindow: true,
  });
  assertEquals(withRow.clarityUsableAsCurrent, true);
});

Deno.test("morning is the only window with an age-1 allowance", () => {
  assertEquals(maxWearableAgeDaysForWindow("morning"), 1);
  assertEquals(maxWearableAgeDaysForWindow("afternoon"), 0);
  assertEquals(maxWearableAgeDaysForWindow("evening"), 0);
});
