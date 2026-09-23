import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTravelOccurrences,
  confirmTravelDay,
  MAX_TRIP_DAYS,
} from "./travel-occurrences.ts";

const flight = (date: string, title = "Flight to New York (BA 183)") => ({
  date,
  kind: "flight" as const,
  title,
});
const stay = (date: string) => ({
  date,
  kind: "stay" as const,
  title: "Stay at Hotel",
});

Deno.test("home readings covering the whole day are not travel", () => {
  const v = confirmTravelDay(
    "2026-06-01",
    { date: "2026-06-01", maxDistanceKm: 12, lastReadingHour: 22, readingCount: 6 },
    [],
  );
  assertEquals(v.travel, false);
  assertEquals(v.reason, "location-full-day-within-home-radius");
});

Deno.test("full-day home readings do overrule a calendar flight", () => {
  const v = confirmTravelDay(
    "2026-06-01",
    { date: "2026-06-01", maxDistanceKm: 12, lastReadingHour: 23, readingCount: 5 },
    [flight("2026-06-01")],
  );
  assertEquals(v.travel, false);
});

Deno.test("sparse home readings cannot veto a flight", () => {
  const v = confirmTravelDay(
    "2026-08-09",
    { date: "2026-08-09", maxDistanceKm: 20, lastReadingHour: 18, readingCount: 3 },
    [flight("2026-08-09")],
  );
  assertEquals(v.travel, true);
  assertEquals(v.source, "calendar_only");
});

Deno.test("a single away reading confirms travel on its own", () => {
  const v = confirmTravelDay(
    "2026-08-10",
    { date: "2026-08-10", maxDistanceKm: 5500, lastReadingHour: 9, readingCount: 1 },
    [],
  );
  assertEquals(v.travel, true);
  assertEquals(v.source, "location_detected");
});

Deno.test("an online invite or conference title is never travel", () => {
  const v = confirmTravelDay("2026-09-17", null, [
    { date: "2026-09-17", kind: "conference_title", title: "AI:ROI Summit" },
  ]);
  assertEquals(v.travel, false);
  assertEquals(v.reason, "conference-title-only-not-travel");
});

Deno.test("a flight with no location data still counts", () => {
  const v = confirmTravelDay("2026-08-17", null, [flight("2026-08-17", "Flight to LHR")]);
  assertEquals(v.travel, true);
});

Deno.test("days between outbound and return are one trip, filled days marked", () => {
  const out = buildTravelOccurrences({
    locationDays: [],
    calendarEvidence: [flight("2026-08-09"), stay("2026-08-09"), flight("2026-08-17")],
  });
  assertEquals(out.trips.length, 1);
  assertEquals(out.trips[0].start, "2026-08-09");
  assertEquals(out.trips[0].end, "2026-08-17");
  assertEquals(out.trips[0].days, 9);
  assertEquals(out.trips[0].evidenceDays, ["2026-08-09", "2026-08-17"]);
  assertEquals(out.trips[0].filledDays.length, 7);
});

Deno.test("a covered at-home day inside the window splits the trip", () => {
  const out = buildTravelOccurrences({
    locationDays: [
      { date: "2026-08-12", maxDistanceKm: 4, lastReadingHour: 22, readingCount: 7 },
    ],
    calendarEvidence: [flight("2026-08-09"), stay("2026-08-09"), flight("2026-08-17")],
  });
  assertEquals(out.trips.length, 2);
});

Deno.test("unrelated travel weeks apart is never one trip", () => {
  const out = buildTravelOccurrences({
    locationDays: [],
    calendarEvidence: [flight("2026-03-02"), flight("2026-05-20")],
  });
  assertEquals(out.trips.length, 2);
  assertEquals(out.trips.every((t) => t.days <= MAX_TRIP_DAYS), true);
});

Deno.test("previously confirmed travel is carried forward", () => {
  const out = buildTravelOccurrences({
    locationDays: [],
    calendarEvidence: [],
    carriedForwardDays: [
      {
        date: "2025-12-04",
        travel: true,
        source: "location_detected",
        reason: "location-distance>50km",
        titles: [],
      },
    ],
  });
  assertEquals(out.days.filter((d) => d.travel).length, 1);
});
