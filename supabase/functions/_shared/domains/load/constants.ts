// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Load Domain Constants.
// Source: Part 2 Layer 2 (Section 4.5).

/** Max work meetings for a day to qualify as light (LD3). */
export const LIGHT_MAX_MEETINGS = 1;

/** Personal share threshold of items/hours to qualify as a half-day (LD2). */
export const HALF_DAY_PERSONAL_SHARE = 0.5;

/** Number of work meetings that triggers heavy by volume (LD4). */
export const HEAVY_VOLUME_MEETINGS = 4;

/** Number of work meetings with tight gaps triggering heavy volume (LD4). */
export const HEAVY_VOLUME_TIGHT_MEETINGS = 3;

/** Average gap in minutes for tight volume meetings (LD4). */
export const HEAVY_VOLUME_AVG_GAP_MIN = 20;

/** Stakes weights mapping: low=1, medium=2, high=3, critical=4 (LD5). */
export const STAKES_WEIGHT: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

/** Average stakes score threshold triggering heavy by weight (LD5). */
export const HEAVY_WEIGHT_AVG = 3;

/** High-stakes meetings count triggering heavy by weight (LD5). */
export const HEAVY_WEIGHT_HIGH_STAKES_COUNT = 2;

/** Cognitive demand threshold count triggering decision-heavy day (LD5). */
export const DECISION_HEAVY_MEETINGS = 2;

/** Long haul flight duration in hours (LD6). */
export const LONG_HAUL_HOURS = 6;

/** Timezone shift in hours triggering heavy travel load (LD6). */
export const TIMEZONE_SHIFT_HEAVY_HOURS = 3;

/** Landing meeting proximity in hours triggering heavy load (LD6). */
export const LANDING_MEETING_HOURS = 3;

/** Parallel meetings count on conference day triggering heavy load (LD7). */
export const CONFERENCE_HEAVY_PARALLEL_MEETINGS = 3;

/** Work time in minutes on a non-working day triggering a working weekend / leave (LD9). */
export const WORK_ON_NONWORKDAY_MINUTES = 120;
