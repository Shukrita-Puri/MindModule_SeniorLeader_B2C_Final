// [KIND: implementation] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Canonical Location Reading Builder & Idempotency.
// Source: Part 2 Layer 0 (Section 8, 12.1, 12.4).

import type { LocationReading, RawLocationInput } from "./types.ts";
import type { Provenance } from "../../spine/types.ts";

/**
 * Computes deduplication key for location readings (Layer 0, 12.4).
 * Pattern: `user, recordedAtUtc, platform`
 */
export function computeLocationDedupeKey(
  userId: string,
  recordedAtUtc: string,
  platform: "ios" | "android",
): string {
  return `${userId}_${recordedAtUtc}_${platform}`;
}

/**
 * Converts raw mobile telemetry into a canonical LocationReading.
 */
export function toCanonicalLocationReading(input: {
  raw: RawLocationInput;
  provenance: Provenance;
}): LocationReading {
  const { raw, provenance } = input;
  const recordedAtUtc = raw.recordedAtUtc ? new Date(raw.recordedAtUtc).toISOString() : new Date().toISOString();
  const uploadedAtUtc = raw.uploadedAtUtc ? new Date(raw.uploadedAtUtc).toISOString() : new Date().toISOString();
  const platform = raw.platform ?? "ios";
  const deviceTimeZone = raw.deviceTimeZone ?? "UTC";
  const hasCoordinates = typeof raw.lat === "number" && typeof raw.lng === "number";

  return {
    schemaVersion: 1,
    userId: raw.userId,
    recordedAtUtc,
    uploadedAtUtc,
    lat: hasCoordinates ? raw.lat! : null,
    lng: hasCoordinates ? raw.lng! : null,
    accuracyM: typeof raw.accuracyM === "number" ? raw.accuracyM : null,
    deviceTimeZone,
    kind: hasCoordinates ? "fix" : "timezone_only",
    platform,
    provenance,
  };
}
