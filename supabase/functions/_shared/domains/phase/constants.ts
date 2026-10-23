// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 2 Phase Domain.
// Source: Part 2 Layer 2 (Section 5.4, WN-04).

/** Lead time in minutes before an anchor event considered 'pre-anchor' prep phase. */
export const PRE_ANCHOR_WINDOW_MINUTES = 45;

/** Maximum gap duration in minutes after a demanding anchor that receives protected gap status (WN-04). */
export const PROTECTED_POST_GAP_MINUTES = 45;

/** Categories considered demanding anchors triggering protected recovery gaps. */
export const DEMANDING_ANCHOR_CATEGORIES = ["A", "B", "C", "D", "J"] as const;
