// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Window Profile Composer.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateWindowProfile } from "./index.ts";

Deno.test("WindowProfile - Morning window sets mode set_up and attaches look-back", () => {
  const result = evaluateWindowProfile({
    modeInput: { localHour: 8, localMinute: 30 },
    items: [
      {
        id: "evt-1",
        title: "Morning Kickoff",
        category: "E",
        startUtc: "2026-10-24T09:00:00Z",
        endUtc: "2026-10-24T09:30:00Z",
      },
    ],
    horizonsInput: {
      yesterdayLivedLoad: "heavy",
      yesterdayRanHeavierThanPlanned: true,
    },
    nowUtc: new Date("2026-10-24T08:30:00Z"),
  });

  assertEquals(result.window, "morning");
  assertEquals(result.mode, "set_up");
  assertEquals(result.horizons.lookBack.recoveryOwed, true);
  assertEquals(result.remaining.remainingItemsCount, 1);
});

Deno.test("WindowProfile - Afternoon protected gap after demanding board meeting", () => {
  const result = evaluateWindowProfile({
    modeInput: { localHour: 15, localMinute: 15 },
    items: [
      {
        id: "board-1",
        title: "Board Meeting",
        category: "A",
        startUtc: "2026-10-24T14:00:00Z",
        endUtc: "2026-10-24T15:00:00Z", // Ended 15m ago
      },
      {
        id: "crisis-sync",
        title: "Emergency Partner Call",
        category: "J",
        startUtc: "2026-10-24T16:30:00Z",
        endUtc: "2026-10-24T17:00:00Z",
      },
    ],
    nowUtc: new Date("2026-10-24T15:15:00Z"),
  });

  assertEquals(result.window, "afternoon");
  assertEquals(result.mode, "execute_and_hold");
  assertEquals(result.phase, "post_anchor");
  assertEquals(result.postDemandingGap, true);
  assertEquals(result.remaining.highestRemainingStakes, "J");
});

Deno.test("WindowProfile - Evening close mode with quiet hours active", () => {
  const result = evaluateWindowProfile({
    modeInput: {
      localHour: 22,
      localMinute: 15,
      wearableBedtime: "22:30", // Quiet hours from 22:00
    },
    items: [],
    nowUtc: new Date("2026-10-24T22:15:00Z"),
  });

  assertEquals(result.window, "evening");
  assertEquals(result.mode, "close");
  assertEquals(result.quietHoursStart, "22:00");
  assertEquals(result.quietHoursActive, true);
});
