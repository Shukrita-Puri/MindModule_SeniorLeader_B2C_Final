// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Conference Domain Constants.
// Source: Part 2 Layer 2 (Section 4.4).

/** Minimum duration in minutes (4 hours) for an event to qualify as a conference day (CF2). */
export const CONFERENCE_DAY_MIN_MINUTES = 240;

/** Minimum duration in minutes for a speaking engagement block to qualify (CF4). */
export const SPEAKING_BLOCK_MIN_MINUTES = 15;

/** Minimum duration in minutes for a parallel meeting squeezed around a conference (CF6). */
export const PARALLEL_MEETING_MIN_MINUTES = 15;

/** Lookahead window in days for trailing conference load calculations (CF6). */
export const TRAILING_CONFERENCE_DAYS = 4;

/** Minimum duration of consecutive conference days that triggers a re-entry day (CF7). */
export const REENTRY_MIN_RUN_DAYS = 2;
