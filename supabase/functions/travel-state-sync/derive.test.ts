// Sprint 9 / Phase 9B — travel-state-sync classifier tests.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideTravelSync, haversineKm } from "./derive.ts";

const NOW = new Date("2026-07-08T10:00:00Z");

const BASE = {
  prev: null,
  prevDistanceKm: null,
  prevLastLocationAt: null,
  homeTimezone: null,
  currentTimezone: null,
  lastKnownLat: null,
  lastKnownLng: null,
  homeLat: null,
  homeLng: null,
  hasTravelCalendarEventToday: false,
  now: NOW,
};

Deno.test("haversine sanity — LHR↔JFK ~5540km", () => {
  const d = haversineKm({ lat: 51.47, lng: -0.454 }, { lat: 40.641, lng: -73.778 });
  assert(d > 5500 && d < 5600, `expected ~5540, got ${d}`);
});

Deno.test("missing signals + no prior → skip (no confident false row)", () => {
  const d = decideTravelSync({ ...BASE });
  assertEquals(d.write, false);
  assertEquals((d as any).source, "none");
});

Deno.test("timezone diff + prev=not_travelling → promote to arrived", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "not_travelling",
    homeTimezone: "Europe/London",
    currentTimezone: "America/New_York",
  });
  assertEquals(d.write, true);
  assertEquals((d as any).nextState, "arrived");
  assertEquals((d as any).source, "timezone");
});

Deno.test("timezone signal MUST NOT clear an existing away state", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "arrived",
    homeTimezone: "Europe/London",
    currentTimezone: "Europe/London", // matched — could look like 'home'
  });
  assertEquals(d.write, false);
  assertEquals((d as any).reason, "would_overwrite_away");
});

Deno.test("calendar travel title + prev=not_travelling → travel_planned", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "not_travelling",
    hasTravelCalendarEventToday: true,
  });
  assertEquals(d.write, true);
  assertEquals((d as any).nextState, "travel_planned");
  assertEquals((d as any).source, "calendar");
});

Deno.test("distance <25km + prev=arrived → returning home (not_travelling)", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "arrived",
    lastKnownLat: 51.5,
    lastKnownLng: -0.1,
    homeLat: 51.51,
    homeLng: -0.12,
    prevLastLocationAt: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
  });
  assertEquals(d.write, true);
  assertEquals((d as any).nextState, "not_travelling");
  assertEquals((d as any).source, "distance");
});

Deno.test("distance >50km + prev=not_travelling + tzChanged → arrived", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "not_travelling",
    homeTimezone: "Europe/London",
    currentTimezone: "America/New_York",
    lastKnownLat: 40.7,
    lastKnownLng: -74.0,
    homeLat: 51.5,
    homeLng: -0.1,
    prevLastLocationAt: NOW.toISOString(),
  });
  assertEquals(d.write, true);
  assertEquals((d as any).nextState, "arrived");
});

Deno.test("distance >50km + prev=not_travelling, no tz change → en_route", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "not_travelling",
    lastKnownLat: 48.85,
    lastKnownLng: 2.35, // Paris
    homeLat: 51.5,
    homeLng: -0.1, // London
    prevLastLocationAt: NOW.toISOString(),
  });
  assertEquals(d.write, true);
  assertEquals((d as any).nextState, "en_route");
});

Deno.test("stale coords (>24h old) are ignored — falls through to no_signal", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "not_travelling",
    lastKnownLat: 40.7,
    lastKnownLng: -74.0,
    homeLat: 51.5,
    homeLng: -0.1,
    prevLastLocationAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString(),
  });
  assertEquals(d.write, false);
  assertEquals((d as any).reason, "no_signal");
});

Deno.test("stale coords + prev=away → skip with location_stale (never overwrite)", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "arrived",
    lastKnownLat: 40.7,
    lastKnownLng: -74.0,
    homeLat: 51.5,
    homeLng: -0.1,
    prevLastLocationAt: new Date(NOW.getTime() - 48 * 60 * 60 * 1000).toISOString(),
  });
  assertEquals(d.write, false);
  assertEquals((d as any).reason, "location_stale");
});

Deno.test("calendar signal alone must NOT clear existing away state", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "en_route",
    hasTravelCalendarEventToday: false, // no signals
  });
  assertEquals(d.write, false);
  assertEquals((d as any).reason, "would_overwrite_away");
});

Deno.test("state unchanged (fresh coords, prev already correct) → skip", () => {
  const d = decideTravelSync({
    ...BASE,
    prev: "not_travelling",
    lastKnownLat: 51.5,
    lastKnownLng: -0.1,
    homeLat: 51.51,
    homeLng: -0.12,
    prevLastLocationAt: NOW.toISOString(),
  });
  assertEquals(d.write, false);
  assertEquals((d as any).reason, "state_unchanged");
});