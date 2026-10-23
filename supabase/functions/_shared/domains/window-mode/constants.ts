// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 2 Window-Mode Domain.
// Source: Part 2 Layer 2 (Section 5.4, WN-06).

/** Quiet hours start 30 minutes prior to wearable target bedtime (WN-06). */
export const QUIET_HOURS_LEAD_MINUTES = 30;

/** Default quiet hours start time (local hour) when wearable bedtime is not calibrated. */
export const DEFAULT_QUIET_HOURS_LOCAL_HOUR = 22;
export const DEFAULT_QUIET_HOURS_LOCAL_MINUTE = 0;
