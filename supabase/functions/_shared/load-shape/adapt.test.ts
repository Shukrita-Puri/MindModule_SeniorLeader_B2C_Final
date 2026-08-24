import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stakesLevelFromScore, toLoadShapeEvents } from "./adapt.ts";

function row(title: string, startIso: string, endIso: string) {
  return {
    title,
    start_time: startIso,
    end_time: endIso,
    attendees_count: 4,
    is_organizer: true,
    is_recurring: false,
  };
}

Deno.test("toLoadShapeEvents resolves categories through enrichEvent", () => {
  const events = toLoadShapeEvents([
    row("Board Prep Test", "2026-03-02T09:00:00Z", "2026-03-02T10:00:00Z"),
    row("Investor pitch", "2026-03-02T11:00:00Z", "2026-03-02T12:00:00Z"),
  ]);
  assertEquals(events.length, 2);
  for (const e of events) {
    assert(/^[A-H]$/.test(e.category), `unexpected category ${e.category}`);
    assert(e.startTime instanceof Date);
    assert(["low", "medium", "high", "critical"].includes(e.stakesLevel));
  }
});

Deno.test("toLoadShapeEvents drops rows with invalid or inverted time ranges", () => {
  const events = toLoadShapeEvents([
    row("Board meeting", "2026-03-02T10:00:00Z", "2026-03-02T09:00:00Z"),
    row("Board meeting", "not-a-date", "2026-03-02T10:00:00Z"),
    { title: "Board meeting" },
    null,
  ]);
  assertEquals(events, []);
});

Deno.test("toLoadShapeEvents maps the G.travel resolver alias to the locked G.travel_day", () => {
  const events = toLoadShapeEvents([
    row("Travel day to Zurich", "2026-03-02T06:00:00Z", "2026-03-02T18:00:00Z"),
  ]);
  for (const e of events) {
    assert(
      (e.subcategory as string) !== "G.travel",
      "resolver alias leaked into the shape input",
    );
  }
});

Deno.test("flight rows carry a duration for the long-haul arc", () => {
  const events = toLoadShapeEvents([
    row("Flight BA117 to JFK", "2026-03-02T08:00:00Z", "2026-03-02T16:00:00Z"),
  ]);
  const flight = events.find((e) => e.subcategory === "G.flight");
  if (flight) assert((flight.flightDurationMinutes ?? 0) > 0);
});

Deno.test("stakesLevelFromScore bands the shared score, null-safe", () => {
  assertEquals(stakesLevelFromScore(null), "low");
  assertEquals(stakesLevelFromScore(NaN), "low");
  assertEquals(stakesLevelFromScore(10), "low");
  assertEquals(stakesLevelFromScore(75), "medium");
  assertEquals(stakesLevelFromScore(95), "high");
  assertEquals(stakesLevelFromScore(140), "critical");
});
