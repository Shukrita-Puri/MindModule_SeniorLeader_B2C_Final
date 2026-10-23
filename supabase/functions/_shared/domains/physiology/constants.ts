// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Physiology Domain Constants.
// Source: Part 2 Layer 2 (Section 5.1.1).

/** HRV drop threshold ratio (15% below baseline) triggering impaired recovery (RD-01). */
export const HRV_DEFICIT_RATIO = 0.15;

/** Sleep duration in hours below which physical reserves are capped (RD-01). */
export const SHORT_SLEEP_HOURS = 6.0;

/** Sleep duration in minutes below which physical reserves are capped. */
export const SHORT_SLEEP_MINUTES = SHORT_SLEEP_HOURS * 60;

/** Freshness cutoff in hours: readings older than 24h are considered stale (RD-03). */
export const WEARABLE_STALE_HOURS = 24;

/** Canonical MRS Tiers in descending order. */
export const CANONICAL_PHYSIOLOGY_TIERS = [
  "optimal",
  "primed",
  "steady",
  "managing",
  "depleted",
  "overloaded",
] as const;
