// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 2 Self-Report Domain.
// Source: Part 2 Layer 2 (Section 5.1.2).

/** Maximum number of tier steps a check-in can shift physiological readiness (Section 5.1.2). */
export const MAX_CHECKIN_REFINE_STEPS = 1;

/** Check-in score threshold (1–5 scale) triggering a positive 1-step tier lift. */
export const HIGH_SELF_REPORT_THRESHOLD = 4.0;

/** Check-in score threshold (1–5 scale) triggering a negative 1-step tier drop. */
export const LOW_SELF_REPORT_THRESHOLD = 2.0;
