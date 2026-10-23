// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Travel domain.
// Source: Part 2 Layer 2 (Section 4.3, Scenarios TR-01 to TR-14).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { travelEngine } from "./engine.ts";
import { toCanonicalCalendarItem } from "../calendar/canonical.ts";
import type { ClassificationStamp } from "../events/types.ts";

const MOCK_HOME = { lat: 51.5074, lng: -0.1278 }; // London

function createMockStamp(itemId: string, category: "G" | "A" | "B" | "C" | "D" | "E" | "F" | "H" | "I" | "J", subtype: string): ClassificationStamp {
  return {
    itemId,
    sourceType: "calendar",
    category,
    categoryConfidence: 0.95,
    subtype: subtype as any,
    subtypeConfidence: 0.95,
    bestCandidateSubtype: null,
    confirmationState: "confirmed",
    decisionSource: "provider_label",
    runnerUp: null,
    reasons: ["Mocked stamp"],
    findings: [],
    dimensions: { stakes: "low", travelRelated: category === "G", workContext: "work", durationMinutes: 120 },
    itemDemand: null,
    taxonomyVersion: "1.0",
    classifierVersion: "1.0",
    classifiedAt: "2026-10-24T00:00:00Z",
  };
}

Deno.test("Travel Domain: Scenario TR-01 In-person event 81km away + location reading away -> Confirmed travel", () => {
  // Reading in Oxford (approx 81km from London)
  const oxfordReading = { lat: 51.7520, lng: -1.2577, timestampUtc: "2026-10-24T12:00:00Z" };

  const facts = travelEngine.evaluate({
    localDate: "2026-10-24",
    items: [],
    stamps: [],
    homeAnchor: MOCK_HOME,
    latestReading: oxfordReading,
  });

  assertEquals(facts.isTravelling, true);
  assertEquals(facts.tripStatus, "confirmed");
  assertEquals(facts.distanceFromHomeKm! > 50, true);
});

Deno.test("Travel Domain: Scenario TR-05 Long-haul overnight flight, landing at 07:00, board meeting at 10:00", () => {
  const flightItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: {
      id: "flight_1",
      title: "Flight to New York (BA 183)",
      startTime: "2026-10-24T23:00:00Z",
      endTime: "2026-10-25T07:00:00Z",
    },
    provenance: { source: "calendar", traceId: "t1" },
  });

  const boardMeetingItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: {
      id: "board_1",
      title: "Board Meeting",
      startTime: "2026-10-25T10:00:00Z",
      endTime: "2026-10-25T12:00:00Z",
    },
    provenance: { source: "calendar", traceId: "t2" },
  });

  const stamps = [
    createMockStamp("flight_1", "G", "trv.long_haul"),
    createMockStamp("board_1", "A", "gov.board_meeting"),
  ];

  const facts = travelEngine.evaluate({
    localDate: "2026-10-25",
    items: [flightItem, boardMeetingItem],
    stamps,
    timeZoneShiftHours: 5,
    nowUtc: new Date("2026-10-25T08:00:00Z"), // 1 hour after landing
  });

  assertEquals(facts.isTravelling, true);
  assertEquals(facts.travelLegs[0].haulTier, "long_haul");
  assertEquals(facts.travelPhase, "after_landing");
  assertEquals(facts.landingMeeting, true);
});

Deno.test("Travel Domain: Scenario TR-10 Return from 5-day trip, tomorrow's calendar dense -> reentryRisk", () => {
  const facts = travelEngine.evaluate({
    localDate: "2026-10-28",
    items: [],
    stamps: [],
    activeTrip: {
      startDate: "2026-10-24",
      endDate: "2026-10-28", // 5 days total, today is day 5
      isConfirmed: true,
    },
    tomorrowMeetingCount: 6, // dense tomorrow
  });

  assertEquals(facts.daysAway, 5);
  assertEquals(facts.totalTripDays, 5);
  assertEquals(facts.reentryRisk, true);
});

Deno.test("Travel Domain: Scenario TR-11 User-declared second home 80km away -> NOT travel", () => {
  const secondHomeReading = { lat: 51.9, lng: -0.5, timestampUtc: "2026-10-24T12:00:00Z" };

  const facts = travelEngine.evaluate({
    localDate: "2026-10-24",
    items: [],
    stamps: [],
    homeAnchor: MOCK_HOME,
    latestReading: secondHomeReading,
    declaredPlaces: [
      {
        name: "Second Home",
        lat: 51.9,
        lng: -0.5,
        radiusKm: 5,
      },
    ],
  });

  assertEquals(facts.isTravelling, false);
  assertEquals(facts.userDeclaredPlace, true);
});
