// [KIND: implementation] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Geodetic Distance & Relocation Logic.
// Source: Part 2 Layer 0 (Section 8), AGENTS.md.

import type { GeoPoint } from "./types.ts";
import {
  FAR_FROM_HOME_DISTANCE_KM,
  TIMEZONE_RELOCATION_GATE_HOURS,
  SUSTAINED_RELOCATION_DAYS,
} from "./constants.ts";

/** Earth radius in kilometers */
const EARTH_RADIUS_KM = 6371.0;

/**
 * Calculates great-circle distance between two geocoordinates using the Haversine formula.
 */
export function haversineDistanceKm(p1: GeoPoint, p2: GeoPoint): number {
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLng = ((p2.lng - p1.lng) * Math.PI) / 180;

  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c * 10) / 10;
}

/**
 * Determines whether a position is >50km away from user's declared home.
 */
export function isFarFromHome(current: GeoPoint | null | undefined, home: GeoPoint | null | undefined): boolean {
  if (!current || !home) return false;
  const dist = haversineDistanceKm(current, home);
  return dist > FAR_FROM_HOME_DISTANCE_KM;
}

/**
 * Evaluates whether an observed location pattern indicates sustained relocation (>30 days not travelling).
 */
export function isSustainedRelocation(opts: {
  daysSinceChange: number | null;
  travelState: string | null;
}): boolean {
  return (
    opts.daysSinceChange !== null &&
    opts.daysSinceChange > SUSTAINED_RELOCATION_DAYS &&
    opts.travelState !== "en_route" &&
    opts.travelState !== "returning"
  );
}
