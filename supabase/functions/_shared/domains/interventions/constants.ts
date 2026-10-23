// [KIND: constants] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 3 Interventions Domain.
// Source: Part 2 Layer 3 (Section 6, 8, 14, 15, 16).

/** Transition buffer in minutes before/after a meeting where practice cannot run. */
export const PRACTICE_BUFFER_MINUTES = 5;

/** Time-fit ladder duration ceilings in minutes (D-L3-4). */
export const TIME_FIT_RUNG_LIMITS = {
  under_15: 0,       // No app practice fits (< 15 min); own action only
  rung_1: 2,         // 15–29 min free: up to 2 min micro practice
  rung_2: 5,         // 30–59 min free: up to 5 min practice
  rung_3: 15,        // 60–119 min free: up to 15 min practice
  rung_4: 30,        // 120+ min free: up to 30 min practice
} as const;

/** Minimum available gap in minutes required to schedule any Recalibrate practice (RT3). */
export const MIN_APP_PRACTICE_GAP_MINUTES = 15;

/** Maximum number of own-action slots permitted in a 3-slot daily plan (CP3, D-L3-21). */
export const MAX_OWN_ACTIONS_PER_DAY = 1;

/** Maximum number of calendar-changing own actions per day (CP4, D-L3-24). */
export const MAX_CALENDAR_CHANGING_ACTIONS_PER_DAY = 1;

/** Default fallback practices per Recalibrate area (D-L3-18, 8.5). */
export const DEFAULT_PRACTICE_SET = {
  pause: "box-breathing",
  flow: "presence-grounding-new",
  reenergise: "vagus-wind-down",
} as const;

/** Scoring weights for selector ranker (IS4). */
export const SELECTOR_WEIGHTS = {
  capabilityMatch: 35,
  comboExactMatch: 25,
  goalAlignmentBonus: 14,
  favouriteBonus: 20,
  recencyPenalty14Days: -15,
  recencyPenaltyToday: -40,
} as const;
