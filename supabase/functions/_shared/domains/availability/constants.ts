// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Availability Domain Constants.
// Source: Part 2 Layer 2 (Section 4.2).

/** Distance threshold in km for inferring an unlabelled travel-based vacation (AV5). */
export const INFERRED_VACATION_TRAVEL_AWAY_KM = 100;

/** Maximum allowable work meetings on an inferred vacation day, and must not be high-stakes (AV5). */
export const INFERRED_VACATION_MAX_WORK_MEETINGS = 1;

/** Number of consecutive quiet weekdays that trigger a possible leave check (AV6). */
export const QUIET_RUN_WEEKDAYS = 4;

/** Canonical PTO / out-of-office title regex marker (AV1). */
export const PTO_TITLE_RX =
  /\b(ooo|out\s*of\s*office|pto|vacation|annual\s+leave|on\s+leave|holiday|public\s+holiday|bank\s+holiday|national\s+holiday|staycation)\b/i;

/** Personal holiday title regex marker (AV1). */
export const PERSONAL_HOLIDAY_TITLE_RX =
  /\b(vacation|annual\s+leave|on\s+leave|public\s+holiday|bank\s+holiday|national\s+holiday|holiday|staycation)\b/i;
