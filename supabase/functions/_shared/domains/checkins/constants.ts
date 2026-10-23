// [KIND: constants] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Domain constants for Layer 0 Check-ins.
// Source: Part 2 Layer 0 (Section 7, 12.1, 12.4).

export const CHECKIN_WINDOWS = ["morning", "afternoon", "evening"] as const;
export type CheckinWindow = (typeof CHECKIN_WINDOWS)[number];

/**
 * Idempotency rounding window for check-ins in minutes.
 * Reason: Multiple check-ins submitted within the same 15-minute slot represent revisions
 * of the same mental state snapshot and replace the earlier entry (Layer 0, Section 12.4).
 */
export const CHECKIN_ROUNDING_MINUTES = 15;

/**
 * Maximum check-in retention period in days.
 * Reason: 365 days of check-ins are retained for multi-month pattern and longitudinal analysis (Layer 0, 12.6).
 */
export const CHECKIN_RETENTION_DAYS = 365;

/**
 * Dimension scale bounds (1 = composed / minimal, 5 = severe / peak load).
 */
export const CHECKIN_DIMENSION_BOUNDS = { min: 1, max: 5 } as const;
