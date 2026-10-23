// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Day Profile Composer Constants.
// Source: Part 2 Layer 2 (Section 4.11).

export const SPINE_DAY_PROFILE_VERSION = "2.0";

/** Threshold count of high-stakes items across last 5 working days triggering stakesBuildUp (Section 4.11). */
export const STAKES_BUILDUP_THRESHOLD = 4;

/** Threshold count of upcoming high-stakes items in next 2 working days triggering stakesAhead (Section 4.11). */
export const STAKES_AHEAD_THRESHOLD = 2;

/** Proximity window in hours where multiple high-stakes items trigger stackedStakes (Section 4.11). */
export const STACKED_STAKES_WINDOW_HOURS = 3;

/** Minimum gap duration in minutes after a high-stakes item to qualify as a post-demanding recovery gap. */
export const POST_DEMANDING_MIN_GAP_MINUTES = 15;
