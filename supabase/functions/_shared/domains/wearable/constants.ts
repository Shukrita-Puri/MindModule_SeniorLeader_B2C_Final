// [KIND: constants] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Domain constants for Layer 0 Wearables.
// Source: Part 2 Layer 0 (Section 5, 12.1), Part 4 Tree (wearable/).

import { DEFAULT_RECENCY_GUARD_HOURS } from "./canonical.ts";
export { DEFAULT_RECENCY_GUARD_HOURS };

/**
 * Plausible physiological range bounds for filtering sensor artefacts (Layer 0, Section 5).
 */
export const PHYSIOLOGICAL_BOUNDS = {
  hrv: { min: 5, max: 300, unit: "ms" },        // Sub-5ms is flatline/error; >300ms is ectopic/noise
  restingHr: { min: 30, max: 220, unit: "bpm" }, // Below 30bpm or above 220bpm is sensor glitch
  sleepScore: { min: 0, max: 100, unit: "score" },
  sleepEfficiency: { min: 0, max: 100, unit: "pct" },
} as const;

/**
 * Maximum wearable data retention in days.
 * Reason: 365 days of wearable metrics are retained for Layer 4 annual seasonality (Spine 9.1).
 */
export const WEARABLE_RETENTION_DAYS = 365;
