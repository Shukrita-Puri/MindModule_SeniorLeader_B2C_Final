import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTripWindows,
  classifyTripEvidence,
  confirmWindowByLocation,
  eventDaySpan,
  mergeTripWindows,
  parseTrips,
  tripWindowForDate,
  type TripWindow,
} from "./trip-windows.ts";

const NOW = new Date("2026-09-06T20:00:00Z");

Deno.test("classifies flight / stay / offsite evidence", () => {
  assertEquals(classifyTripEvidence("Flight to New York (BA 183)"), "flight");
  assertEquals(classifyTripEvidence("LHR-JFK"), "flight");
  assertEquals(
    classifyTripEvidence("Stay at DoubleTree by Hilton New York Downtown"),
    "stay",
  );
  assertEquals(classifyTripEvidence("Leadership offsite"), "offsite");
  assertEquals(classifyTripEvidence("Travel to Berlin"), "trip");
  assertEquals(classifyTripEvidence("Zaid/ Shukrita- Engineering Catchup"), null);
  assertEquals(classifyTripEvidence("1 day liquid fast"), null);
  assertEquals(classifyTripEvidence(null), null);
});

Deno.test("all-day span trims the exclusive midnight end", () => {
  assertEquals(
    eventDaySpan({
      title: "Stay",
      start_time: "2026-08-09T00:00:00Z",
      end_time: "2026-08-17T00:00:00Z",
      is_all_day: true,
    }),
    { start: "2026-08-09", end: "2026-08-16" },
  );
});

Deno.test("timed overnight flight keeps both days", () => {
  assertEquals(
    eventDaySpan({
      title: "BA 183",
      start_time: "2026-08-09T18:25:00Z",
      end_time: "2026-08-10T02:25:00Z",
    }),
    { start: "2026-08-09", end: "2026-08-10" },
  );
});

Deno.test("Shukrita's August trip becomes ONE high-confidence window", () => {
  const windows = buildTripWindows([
    { title: "Stay at DoubleTree by Hilton New York Downtown", start_time: "2026-08-09T00:00:00Z", end_time: "2026-08-17T00:00:00Z", is_all_day: true },
    { title: "Flight to New York (BA 183)", start_time: "2026-08-09T18:25:00Z", end_time: "2026-08-10T02:25:00Z" },
    { title: "Chief AI Thursday connects", start_time: "2026-08-13T15:00:00Z", end_time: "2026-08-13T16:00:00Z" },
    { title: "Flight to LHR (BA 188)", start_time: "2026-08-17T01:25:00Z", end_time: "2026-08-17T08:30:00Z" },
  ], { now: NOW });

  assertEquals(windows.length, 1);
  assertEquals(windows[0].start, "2026-08-09");
  assertEquals(windows[0].end, "2026-08-17");
  assertEquals(windows[0].confidence, "high");
  assert(windows[0].evidence.includes("flight"));
  assert(windows[0].evidence.includes("stay"));
  assert(tripWindowForDate(windows, "2026-08-12"));
  assertEquals(tripWindowForDate(windows, "2026-08-20"), null);
});

Deno.test("duplicate provider rows do not create duplicate windows", () => {
  const ev = { title: "Flight to Rome (AZ 205)", start_time: "2026-10-01T08:00:00Z", end_time: "2026-10-01T11:00:00Z" };
  const windows = buildTripWindows([ev, { ...ev }], { now: NOW });
  assertEquals(windows.length, 1);
});

Deno.test("separate trips stay separate", () => {
  const windows = buildTripWindows([
    { title: "Flight to Paris (AF 1234)", start_time: "2026-10-01T08:00:00Z", end_time: "2026-10-01T10:00:00Z" },
    { title: "Flight to Tokyo (JL 42)", start_time: "2026-11-01T08:00:00Z", end_time: "2026-11-01T20:00:00Z" },
  ], { now: NOW });
  assertEquals(windows.length, 2);
});

Deno.test("merge preserves non-calendar windows and out-of-range history", () => {
  const existing: TripWindow[] = [
    { start: "2026-01-02", end: "2026-01-05", source: "calendar", evidence: ["flight"], confidence: "high", updated_at: "x" },
    { start: "2026-08-09", end: "2026-08-17", source: "calendar", evidence: ["flight"], confidence: "high", location_confirmed: true, updated_at: "x" },
    { start: "2026-08-20", end: "2026-08-21", source: "manual", evidence: ["trip"], confidence: "medium", updated_at: "x" },
  ];
  const rebuilt: TripWindow[] = [
    { start: "2026-08-09", end: "2026-08-17", source: "calendar", evidence: ["flight", "stay"], confidence: "high", updated_at: "y" },
  ];
  const merged = mergeTripWindows(existing, rebuilt, { from: "2026-08-01", to: "2026-09-30" });

  assertEquals(merged.length, 3);
  assert(merged.some((w) => w.start === "2026-01-02"), "old history kept");
  assert(merged.some((w) => w.source === "manual"), "manual window kept");
  const aug = merged.find((w) => w.start === "2026-08-09")!;
  assertEquals(aug.location_confirmed, true, "confirmation survives a rebuild");
  assertEquals(aug.evidence.length, 2);
});

Deno.test("location confirmation promotes only the containing window", () => {
  const trips: TripWindow[] = [
    { start: "2026-09-01", end: "2026-09-03", source: "calendar", evidence: ["offsite"], confidence: "medium", updated_at: "x" },
    { start: "2026-09-10", end: "2026-09-12", source: "calendar", evidence: ["offsite"], confidence: "medium", updated_at: "x" },
  ];
  const out = confirmWindowByLocation(trips, "2026-09-02");
  assertEquals(out[0].location_confirmed, true);
  assertEquals(out[0].confidence, "high");
  assertEquals(out[1].location_confirmed, undefined);
});

Deno.test("parseTrips tolerates junk meta", () => {
  assertEquals(parseTrips(null), []);
  assertEquals(parseTrips({}), []);
  assertEquals(parseTrips({ trips: "nope" }), []);
  assertEquals(parseTrips({ trips: [{ start: "2026-01-01" }] }), []);
  assertEquals(parseTrips({ trips: [{ start: "2026-01-01", end: "2026-01-02" }] }).length, 1);
});
