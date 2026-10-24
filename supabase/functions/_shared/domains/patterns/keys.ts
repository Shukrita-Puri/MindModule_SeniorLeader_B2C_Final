// [KIND: step] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// BucketKey and Stable Key derivation for Layer 4.
// Source: Part 2 Layer 4 (Section 5.2, 5.3, N-L4-2).

import type { ClassificationStamp } from "../events/types.ts";

/**
 * Derives the canonical BucketKey from a Layer 1 ClassificationStamp.
 * Never inspects raw title keywords or attendee counts (spine principle "stamp only", N-L4-18).
 */
export function buildBucketKeyFromStamp(stamp: Partial<ClassificationStamp>): string {
  const category = (stamp.category || "unknown").toUpperCase();
  if (stamp.subtype) {
    return `${category}:${stamp.subtype.toLowerCase()}`;
  }
  return category;
}

/**
 * Derives a demand-dimension BucketKey (e.g. demand:emotional:high).
 */
export function buildDemandBucketKey(
  dimension: string,
  band: "low" | "medium" | "high"
): string {
  return `demand:${dimension.toLowerCase()}:${band.toLowerCase()}`;
}

/**
 * Derives the stable unique key for a pattern finding across nightly runs.
 * Enables consistent tracking, prediction verification, and caching.
 */
export function buildStableFindingKey(params: {
  metric: string;
  bucketKey: string;
  lag: string;
  direction: string;
}): string {
  return `${params.metric}_${params.bucketKey}_${params.lag}_${params.direction}`.toLowerCase();
}

/**
 * Derives a shadow or production finding ID.
 */
export function buildFindingId(
  stableKey: string,
  isShadow = true
): string {
  const prefix = isShadow ? "shadow_fnd" : "fnd";
  return `${prefix}_${stableKey}`;
}
