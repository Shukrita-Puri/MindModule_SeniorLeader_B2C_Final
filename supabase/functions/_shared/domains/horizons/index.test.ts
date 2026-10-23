// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Horizons Domain (WN-01, WN-05).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateHorizons } from "./index.ts";

Deno.test("Horizons - WN-01: Morning after day running heavier than planned emits recoveryOwed true", () => {
  const result = evaluateHorizons({
    yesterdayLivedLoad: "heavy",
    yesterdayRanHeavierThanPlanned: true,
    lastNightSleepMinutes: 340,
  });

  assertEquals(result.lookBack.yesterdayLivedLoad, "heavy");
  assertEquals(result.lookBack.yesterdayRanHeavierThanPlanned, true);
  assertEquals(result.lookBack.recoveryOwed, true);
});

Deno.test("Horizons - WN-05: Evening with heavy tomorrow and board meeting names first high stakes item", () => {
  const result = evaluateHorizons({
    tomorrowPlannedLoad: "heavy",
    tomorrowWeekAheadMode: true,
    tomorrowItems: [
      {
        id: "routine-prep",
        title: "Morning Prep",
        category: "I",
        startTime: "2026-10-25T08:00:00Z",
      },
      {
        id: "board-annual",
        title: "Annual General Board Meeting",
        category: "A",
        startTime: "2026-10-25T10:00:00Z",
        isHighStakes: true,
      },
      {
        id: "investor-dinner",
        title: "Investor Dinner",
        category: "B",
        startTime: "2026-10-25T18:30:00Z",
      },
    ],
  });

  assertEquals(result.lookAhead.tomorrowPlannedLoad, "heavy");
  assertEquals(result.lookAhead.tomorrowWeekAheadMode, true);
  assertEquals(result.lookAhead.firstHighStakesItemTomorrow?.id, "board-annual");
  assertEquals(result.lookAhead.firstHighStakesItemTomorrow?.category, "A");
});
