// [KIND: test] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Unit tests for Layer 0 Location domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  haversineDistanceKm,
  isFarFromHome,
  isSustainedRelocation,
  toCanonicalLocationReading,
  computeLocationDedupeKey,
} from "./index.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "ios_gps",
  version: "1.0.0",
  traceId: "test_location_trace",
};

Deno.test("Location Domain: Haversine distance and 50km threshold", () => {
  // London coordinates: (51.5074, -0.1278)
  const london = { lat: 51.5074, lng: -0.1278 };
  // Oxford coordinates: (51.7520, -1.2577) ~ 83 km
  const oxford = { lat: 51.7520, lng: -1.2577 };
  // Canary Wharf coordinates: (51.5054, -0.0235) ~ 7 km
  const canaryWharf = { lat: 51.5054, lng: -0.0235 };

  const distToOxford = haversineDistanceKm(london, oxford);
  assertEquals(distToOxford > 80 && distToOxford < 90, true, `Distance to Oxford was ${distToOxford}`);
  assertEquals(isFarFromHome(oxford, london), true, "Oxford (>50km) is far from home");

  const distToCanary = haversineDistanceKm(london, canaryWharf);
  assertEquals(distToCanary < 10, true);
  assertEquals(isFarFromHome(canaryWharf, london), false, "Canary Wharf (<50km) is within local radius");
});

Deno.test("Location Domain: Sustained relocation gate (>30 days)", () => {
  assertEquals(isSustainedRelocation({ daysSinceChange: 35, travelState: "not_travelling" }), true);
  assertEquals(isSustainedRelocation({ daysSinceChange: 20, travelState: "not_travelling" }), false);
  assertEquals(isSustainedRelocation({ daysSinceChange: 35, travelState: "en_route" }), false);
});

Deno.test("Location Domain: Canonical reading creation and dedupe key", () => {
  const reading = toCanonicalLocationReading({
    raw: {
      userId: "user_loc",
      recordedAtUtc: "2026-10-23T12:00:00Z",
      lat: 51.5074,
      lng: -0.1278,
      deviceTimeZone: "Europe/London",
      platform: "ios",
    },
    provenance: mockProvenance,
  });

  assertEquals(reading.userId, "user_loc");
  assertEquals(reading.kind, "fix");
  assertEquals(reading.deviceTimeZone, "Europe/London");

  const dedupeKey = computeLocationDedupeKey("user_loc", "2026-10-23T12:00:00Z", "ios");
  assertEquals(dedupeKey, "user_loc_2026-10-23T12:00:00Z_ios");
});
