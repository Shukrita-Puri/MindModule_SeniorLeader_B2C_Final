// [KIND: specification] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Domain types for Layer 0 Location.
// Source: Part 2 Layer 0 (Section 8, 12.1).

import type { Provenance } from "../../spine/types.ts";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface LocationReading {
  schemaVersion: 1;
  userId: string;
  recordedAtUtc: string;
  uploadedAtUtc: string;
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
  deviceTimeZone: string;
  kind: "fix" | "timezone_only";
  platform: "ios" | "android";
  provenance: Provenance;
}

export interface RawLocationInput {
  userId: string;
  recordedAtUtc?: string | null;
  uploadedAtUtc?: string | null;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  deviceTimeZone?: string | null;
  kind?: "fix" | "timezone_only";
  platform?: "ios" | "android";
}

export interface HomeLocationDecision {
  isFarFromHome: boolean;
  distanceKm: number | null;
  isSustainedRelocationCandidate: boolean;
}
