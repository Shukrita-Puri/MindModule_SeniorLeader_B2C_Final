// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Crisis Episode Domain Constants.
// Source: Part 2 Layer 2 (Section 4.7).

/** Lookahead window in hours for short-notice calendar event additions (CR1). */
export const SHORT_NOTICE_HOURS = 24;

/** Rolling observation window in hours for clustering crisis member events (CR2). */
export const EPISODE_WINDOW_HOURS = 72;

/** Inactivity quiet period in hours before an open episode closes (CR6). */
export const EPISODE_CLOSE_QUIET_HOURS = 48;

/** Standard out-of-hours morning threshold in local time (CR1). */
export const OUT_OF_HOURS_BEFORE = "08:00";

/** Standard out-of-hours evening threshold in local time (CR1). */
export const OUT_OF_HOURS_AFTER = "19:00";
