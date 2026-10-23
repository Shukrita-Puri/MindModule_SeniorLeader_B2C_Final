// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Travel Domain Constants.
// Source: Part 2 Layer 2 (Section 4.3).

/** Distance from home anchor (in km) required for an in-person event to qualify as travel. */
export const TRAVEL_DISTANCE_KM = 50;

/** Duration threshold in hours for a flight leg to be classified as long-haul (Section 4.3). */
export const LONG_HAUL_HOURS = 6;

/** Time-zone shift threshold in hours that produces heavy circadian load (Section 4.5, LD6). */
export const TIMEZONE_SHIFT_HEAVY_HOURS = 3;

/** Proximity in hours after landing where an upcoming meeting is flagged as a landing meeting (Section 4.5, LD6). */
export const LANDING_MEETING_HOURS = 3;
