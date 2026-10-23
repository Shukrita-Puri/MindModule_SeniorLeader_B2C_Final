// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Mix Domain Constants.
// Source: Part 2 Layer 2 (Section 4.6).

/** Minimum number of work meetings required for mix engine to evaluate (MX1). */
export const MIX_MIN_WORK_MEETINGS = 2;

/** Threshold in minutes between consecutive meetings below which they are considered back-to-back (MX3). */
export const BACK_TO_BACK_GAP_MIN = 15;

/** Total chain duration in hours that qualifies the day as back-to-back (MX3). */
export const BACK_TO_BACK_DAY_HOURS = 3;

/** Total chain duration in hours that triggers dense-day mode (MX3). */
export const DENSE_DAY_CHAIN_HOURS = 4;

/** Strict majority threshold ratio (> 0.5) of work meetings required for predominance (MX4). */
export const PREDOMINANT_MAJORITY = 0.5;

/** Minimum meetings count in a category/subtype required for predominance (MX4). */
export const PREDOMINANT_MIN_MEETINGS = 2;

/** Minimum distinct categories required for a day to be classified as mixed (MX5). */
export const MIXED_MIN_CATEGORIES = 2;

/** Number of context switches triggering high context switching cost (MX6). */
export const SWITCH_HIGH = 3;

/** Number of context switches triggering medium context switching cost (MX6). */
export const SWITCH_MEDIUM = 1;
