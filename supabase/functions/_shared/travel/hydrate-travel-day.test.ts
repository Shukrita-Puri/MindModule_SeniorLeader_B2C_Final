import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveTravelDay, emptyTravelDayHydration } from "./hydrate-travel-day.ts";

const NOW = new Date("2026-09-03T09:00:00Z");
const iso = (hoursAgo: number) =>
  new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString();

Deno.test("fresh fix beyond 50km is a travel day", () => {
  const r = deriveTravelDay({
    state: "arrived",
    distance_from_home_km: 120,
    last_location_at: iso(2),
    last_state_change_at: iso(3),
    last_known_timezone: "Europe/London",
  }, { now: NOW, currentTimezone: "Europe/London" });
  assertEquals(r.travelDay, true);
  assertEquals(r.used, true);
  assertEquals(r.travelState?.distanceFromHomeKm, 120);
});

Deno.test("fresh fix within home radius is not a travel day", () => {
  const r = deriveTravelDay({
    state: "not_travelling",
    distance_from_home_km: 8,
    last_location_at: iso(1),
    last_state_change_at: null,
    last_known_timezone: "Europe/London",
  }, { now: NOW, currentTimezone: "Europe/London" });
  assertEquals(r.travelDay, false);
  assertEquals(r.reason, "none");
});

Deno.test("stale fix defers to the state machine", () => {
  const r = deriveTravelDay({
    state: "arrived",
    distance_from_home_km: 5,
    last_location_at: iso(24 * 40),
    last_state_change_at: iso(24 * 40),
    last_known_timezone: "Europe/London",
  }, { now: NOW, currentTimezone: "Europe/London" });
  assertEquals(r.travelDay, true);
  assertEquals(r.used, false);
  assertEquals(r.travelState, null);
});

Deno.test("timezone change alone is sufficient", () => {
  const r = deriveTravelDay({
    state: "not_travelling",
    distance_from_home_km: null,
    last_location_at: null,
    last_state_change_at: iso(4),
    last_known_timezone: "Europe/London",
  }, { now: NOW, currentTimezone: "America/New_York" });
  assertEquals(r.travelDay, true);
  assertEquals(r.reason, "timezone-change");
});

Deno.test("missing row fails open to no travel", () => {
  const r = deriveTravelDay(null, { now: NOW, currentTimezone: "Europe/London" });
  assertEquals(r, emptyTravelDayHydration("no_row"));
});

// ── Rung 0: persisted trip windows (meta.trips) ──────────────────────────

Deno.test("persisted trip window covering today wins as evidence 'trip'", () => {
  const out = deriveTravelDay(
    {
      state: "not_travelling",
      distance_from_home_km: 0.1,
      last_location_at: null,
      last_state_change_at: null,
      last_known_timezone: "Europe/London",
      meta: {
        trips: [
          { start: "2026-08-09", end: "2026-08-17", source: "calendar", evidence: ["flight"], confidence: "high" },
        ],
      },
    },
    { now: new Date("2026-08-12T09:00:00Z"), currentTimezone: "Europe/London" },
  );
  if (!out.travelDay) throw new Error("expected travel day inside trip window");
  if (out.evidence !== "trip") throw new Error(`expected evidence trip, got ${out.evidence}`);
});

Deno.test("outside every trip window the verdict is unchanged", () => {
  const out = deriveTravelDay(
    {
      state: "not_travelling",
      distance_from_home_km: 0.1,
      last_known_timezone: "Europe/London",
      meta: { trips: [{ start: "2026-08-09", end: "2026-08-17" }] },
    },
    { now: new Date("2026-09-06T09:00:00Z"), currentTimezone: "Europe/London" },
  );
  if (out.travelDay) throw new Error("must not invent travel outside a window");
  if (out.evidence !== "none") throw new Error(`expected none, got ${out.evidence}`);
});

Deno.test("junk meta.trips cannot break hydration", () => {
  for (const meta of [null, {}, { trips: "nope" }, { trips: [{ start: 1 }] }]) {
    const out = deriveTravelDay(
      { state: "not_travelling", distance_from_home_km: 0.1, meta },
      { now: new Date("2026-09-06T09:00:00Z"), currentTimezone: null },
    );
    if (out.travelDay) throw new Error("junk meta must not assert travel");
  }
});
