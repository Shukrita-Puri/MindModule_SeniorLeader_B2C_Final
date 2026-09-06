// Availability SSOT v2 — replay of the real 9–17 August New York trip.
// The calendar carries no OOO/PTO title: a multi-day hotel stay, two flights,
// one sightseeing block and a single low-stakes meeting on 13 August. Every
// interior day must still be read as a holiday.
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type AvailabilityEvent,
  classifyAvailability,
} from "./availability-classifier.ts";

const TRIP = { start: "2026-08-09", end: "2026-08-17", source: "calendar", confidence: "high" };

const STAY: AvailabilityEvent = {
  title: "Stay at DoubleTree by Hilton New York Downtown",
  startTime: "2026-08-09T00:00:00Z",
  endTime: "2026-08-17T23:59:00Z",
  isAllDay: true,
};
const SIGHTS: AvailabilityEvent = {
  title: "Statue of Liberty and Ellis Island New York Pedestal Reserve",
  startTime: "2026-08-15T13:00:00Z",
  endTime: "2026-08-15T19:00:00Z",
};
const LOW_STAKES_MEETING: AvailabilityEvent = {
  title: "Chief AI Thursday connects",
  startTime: "2026-08-13T15:00:00Z",
  endTime: "2026-08-13T16:00:00Z",
  attendeesCount: 6,
  stakesLevel: "low",
};

function classify(iso: string, events: AvailabilityEvent[]) {
  return classifyAvailability({
    now: new Date(`${iso}T12:00:00Z`),
    userHomeCountry: "GB",
    userCurrentCountry: "US",
    events,
    tripWindow: TRIP,
    awayDistanceKm: 5570,
  });
}

Deno.test("every interior day of the untitled trip reads as PTO", () => {
  for (const day of ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-14", "2026-08-16"]) {
    const r = classify(day, [STAY]);
    assertEquals(r.state, "PTO", `${day} -> ${r.state} (${r.reason})`);
    assertEquals(r.isRestDay, true);
  }
});

Deno.test("13 August stays off despite one low-stakes meeting", () => {
  const r = classify("2026-08-13", [STAY, LOW_STAKES_MEETING]);
  assertEquals(r.state, "PTO");
  assertEquals(r.isRestDay, true);
});

Deno.test("sightseeing day is leisure evidence, not work", () => {
  const r = classify("2026-08-15", [STAY, SIGHTS]);
  assertEquals(r.state, "PTO");
  assertEquals(r.confidence, "high");
});

Deno.test("17 August — the last day of the run is still off", () => {
  const r = classify("2026-08-17", [STAY]);
  assertEquals(r.state, "PTO");
});

Deno.test("18 August — after the window, a normal workday returns", () => {
  const r = classifyAvailability({
    now: new Date("2026-08-18T12:00:00Z"),
    userHomeCountry: "GB",
    userCurrentCountry: "GB",
    events: [{
      title: "Board review",
      startTime: "2026-08-18T09:00:00Z",
      endTime: "2026-08-18T10:00:00Z",
      attendeesCount: 8,
    }],
    tripWindow: TRIP,
    awayDistanceKm: 0.1,
  });
  assertEquals(r.state, "WORKDAY");
});

Deno.test("two real meetings inside the window override the inference", () => {
  const r = classify("2026-08-12", [
    STAY,
    {
      title: "Investor update",
      startTime: "2026-08-12T09:00:00Z",
      endTime: "2026-08-12T10:00:00Z",
      attendeesCount: 5,
    },
    {
      title: "Pricing decision",
      startTime: "2026-08-12T14:00:00Z",
      endTime: "2026-08-12T15:00:00Z",
      attendeesCount: 4,
    },
  ]);
  assertEquals(r.state, "WORKDAY");
});
