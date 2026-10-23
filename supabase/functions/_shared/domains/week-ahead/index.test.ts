// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Week-Ahead domain.
// Source: Part 2 Layer 2 (Section 4.8, Scenarios WA-01 to WA-06).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { weekAheadEngine } from "./engine.ts";
import type { TimeLocaleFacts } from "../time/types.ts";
import type { AvailabilityFacts } from "../availability/types.ts";

function mockTime(weekday: number, planningDay: number): TimeLocaleFacts {
  return {
    localDate: "2026-10-25",
    weekday,
    dayBounds: { startIso: "2026-10-25T00:00:00Z", endIso: "2026-10-25T23:59:59Z" },
    effectiveTimezone: "UTC",
    homeCountry: "GB",
    homeCountryStatus: "declared",
    homeRegion: null,
    weekendDays: [0, 6],
    planningDay,
    isWeekendDay: weekday === 0 || weekday === 6,
    publicHolidays: [],
  };
}

function mockAvailability(frame: AvailabilityFacts["frame"], runPosition: AvailabilityFacts["runPosition"] = null): AvailabilityFacts {
  return {
    frame,
    isWorkingDay: frame === "workday",
    leave: null,
    publicHoliday: null,
    longWeekend: null,
    runPosition,
    possibleLeave: false,
  };
}

Deno.test("Week-Ahead Domain: Scenario WA-01 Sunday in Sat-Sun country -> Week-ahead (weekly planning)", () => {
  const time = mockTime(0, 0); // Sunday (0), planning day 0
  const facts = weekAheadEngine.evaluate({
    timeLocale: time,
    availability: mockAvailability("weekend"),
  });

  assertEquals(facts.isActive, true);
  assertEquals(facts.reason, "weekly_planning");
});

Deno.test("Week-Ahead Domain: Scenario WA-02 Saturday in Fri-Sat country -> Week-ahead (weekly planning)", () => {
  const time = mockTime(6, 6); // Saturday (6), planning day 6
  const facts = weekAheadEngine.evaluate({
    timeLocale: time,
    availability: mockAvailability("weekend"),
  });

  assertEquals(facts.isActive, true);
  assertEquals(facts.reason, "weekly_planning");
});

Deno.test("Week-Ahead Domain: Scenario WA-03 Last day of long weekend -> Week-ahead (end of long weekend)", () => {
  const time = mockTime(1, 0); // Monday (1), not planning day
  const facts = weekAheadEngine.evaluate({
    timeLocale: time,
    availability: mockAvailability("long_weekend", "last"),
  });

  assertEquals(facts.isActive, true);
  assertEquals(facts.reason, "end_of_long_weekend");
});

Deno.test("Week-Ahead Domain: Scenario WA-04 Last day of a week's leave, Wednesday -> Week-ahead (end of leave)", () => {
  const time = mockTime(3, 0); // Wednesday
  const facts = weekAheadEngine.evaluate({
    timeLocale: time,
    availability: mockAvailability("leave", "last"),
  });

  assertEquals(facts.isActive, true);
  assertEquals(facts.reason, "end_of_pto");
});

Deno.test("Week-Ahead Domain: Scenario WA-05 Manual override -> Week-ahead (manual override)", () => {
  const time = mockTime(2, 0); // Tuesday
  const facts = weekAheadEngine.evaluate({
    timeLocale: time,
    availability: mockAvailability("workday"),
    manualOverride: true,
  });

  assertEquals(facts.isActive, true);
  assertEquals(facts.reason, "manual_override");
});
