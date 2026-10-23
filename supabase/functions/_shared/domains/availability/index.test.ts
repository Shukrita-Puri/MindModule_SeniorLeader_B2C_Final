// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Availability domain.
// Source: Part 2 Layer 2 (Section 4.2, Scenarios AV-01 to AV-12).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { availabilityEngine } from "./engine.ts";
import type { TimeLocaleFacts } from "../time/types.ts";
import { toCanonicalCalendarItem } from "../calendar/canonical.ts";
import type { ClassificationStamp } from "../events/types.ts";

function mockTimeLocale(overrides?: Partial<TimeLocaleFacts>): TimeLocaleFacts {
  return {
    localDate: "2026-08-31",
    weekday: 1, // Monday
    dayBounds: { startIso: "2026-08-31T00:00:00Z", endIso: "2026-08-31T23:59:59Z" },
    effectiveTimezone: "Europe/London",
    homeCountry: "GB",
    homeCountryStatus: "declared",
    homeRegion: "England",
    weekendDays: [0, 6],
    planningDay: 0,
    isWeekendDay: false,
    publicHolidays: [
      { date: "2026-08-31", name: "Summer Bank Holiday", country: "GB", region: "England", source: "dataset" },
    ],
    ...overrides,
  };
}

Deno.test("Availability Domain: Scenario AV-01 Home bank holiday Monday -> long weekend", () => {
  const time = mockTimeLocale();
  const facts = availabilityEngine.evaluateStage1({
    timeLocale: time,
    items: [],
  });

  assertEquals(facts.frame, "long_weekend");
  assertEquals(facts.isWorkingDay, false);
  assertEquals(facts.publicHoliday?.name, "Summer Bank Holiday");
});

Deno.test("Availability Domain: Scenario AV-04 All-day Annual leave, user at home (no travel needed)", () => {
  const time = mockTimeLocale({ publicHolidays: [] });
  const items = [
    toCanonicalCalendarItem({
      userId: "u1",
      raw: {
        title: "Annual leave",
        all_day: true,
        startTime: "2026-08-31T00:00:00Z",
        endTime: "2026-08-31T23:59:59Z",
      },
      provenance: {
        source: "calendar",
        traceId: "t1",
      },
    }),
  ];

  const facts = availabilityEngine.evaluateStage1({
    timeLocale: time,
    items,
  });

  assertEquals(facts.frame, "leave");
  assertEquals(facts.isWorkingDay, false);
  assertEquals(facts.leave?.source, "explicit");
  assertEquals(facts.leave?.confidence, "high");
});

Deno.test("Availability Domain: Scenario AV-08 Inferred vacation (hotel stay + museum booking, no work)", () => {
  const time = mockTimeLocale({ publicHolidays: [] });
  const stamps: ClassificationStamp[] = [
    {
      itemId: "museum_1",
      sourceType: "calendar",
      category: "H",
      categoryConfidence: 0.9,
      subtype: "rhy.recreation",
      subtypeConfidence: 0.9,
      bestCandidateSubtype: null,
      confirmationState: "inferred_high",
      decisionSource: "evidence",
      runnerUp: null,
      reasons: ["Museum booking"],
      findings: [],
      dimensions: { stakes: "low", travelRelated: false, workContext: "personal", durationMinutes: 120 },
      itemDemand: null,
      taxonomyVersion: "1.0",
      classifierVersion: "1.0",
      classifiedAt: "2026-08-31T09:00:00Z",
    },
  ];

  const facts = availabilityEngine.evaluate(
    {
      timeLocale: time,
      items: [],
    },
    {
      workMeetingCount: 0,
      hasHighStakesWorkMeeting: false,
      stamps,
      travelContext: {
        isConfirmedTrip: true,
        distanceFromHomeKm: 250,
        hasStayCoveringToday: true,
        hasWorkMeetingInTrip: false,
        hasConferenceInTrip: false,
      },
    },
  );

  assertEquals(facts.frame, "leave");
  assertEquals(facts.isWorkingDay, false);
  assertEquals(facts.leave?.source, "inferred");
  assertEquals(facts.leave?.confidence, "high"); // 2 kinds of evidence (stay + leisure)
});

Deno.test("Availability Domain: Scenario AV-09 Hotel stay with summit (F) in trip -> NOT leave (work trip)", () => {
  const time = mockTimeLocale({ publicHolidays: [] });

  const facts = availabilityEngine.evaluate(
    {
      timeLocale: time,
      items: [],
    },
    {
      workMeetingCount: 1,
      hasHighStakesWorkMeeting: false,
      stamps: [],
      travelContext: {
        isConfirmedTrip: true,
        distanceFromHomeKm: 300,
        hasStayCoveringToday: true,
        hasWorkMeetingInTrip: false,
        hasConferenceInTrip: true, // summit!
      },
    },
  );

  assertEquals(facts.frame, "workday");
  assertEquals(facts.isWorkingDay, true);
  assertEquals(facts.leave, null);
});
