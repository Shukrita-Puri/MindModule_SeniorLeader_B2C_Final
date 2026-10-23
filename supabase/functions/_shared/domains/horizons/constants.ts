// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 2 Horizons Domain.
// Source: Part 2 Layer 2 (Section 5.4, WN-01, WN-05).

/** High stakes categories for look-ahead anchors. */
export const HIGH_STAKES_LOOKAHEAD_CATEGORIES = ["A", "B", "C", "D", "J"] as const;

/** Minimum sleep duration in minutes to prevent compounding recovery debt. */
export const MIN_RECOVERY_SLEEP_MINUTES = 360; // 6 hours
