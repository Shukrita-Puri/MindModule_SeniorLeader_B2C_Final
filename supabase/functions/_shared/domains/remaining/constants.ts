// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 2 Remaining Domain.
// Source: Part 2 Layer 2 (Section 5.4, WN-02, WN-03).

/** Canonical Layer 1 stakes hierarchy in descending priority (I and J strictly included). */
export const CANONICAL_STAKES_ORDER = [
  "J", // Crisis / critical emergency
  "A", // Governance & Board
  "B", // External high-stakes
  "C", // Executive leadership / strategy
  "D", // Difficult people / performance / negotiation
  "G", // Travel
  "F", // Offsite / conference
  "E", // Team sync / operations
  "H", // Social / low-stakes internal
  "I", // Routine admin / low stakes
] as const;

/** Categories susceptible to cognitive decision leakage under elevated physiological load (WN-03). */
export const DECISION_LEAKAGE_CATEGORIES = ["D", "J"] as const;

/** Intraday heart rate elevation threshold over resting baseline (10%) triggering decision leakage risk. */
export const LEAKAGE_HR_ELEVATION_RATIO = 0.10;

/** Maximum gap between consecutive meetings to qualify as back-to-back (15 minutes). */
export const REMAINING_B2B_GAP_THRESHOLD_MINS = 15;
