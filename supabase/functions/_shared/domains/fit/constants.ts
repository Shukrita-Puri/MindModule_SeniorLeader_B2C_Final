// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 2 Fit Domain.
// Source: Part 2 Layer 2 (Section 5.1.4).

/** The maximum tier threshold at or below which high demand creates a readiness-demand gap. */
export const GAP_TRIGGER_TIERS = ["managing", "depleted", "overloaded"] as const;

/** Categories considered demanding or high stakes in the calendar stream. */
export const HIGH_DEMAND_CATEGORIES = ["A", "B", "C", "D", "J"] as const;
