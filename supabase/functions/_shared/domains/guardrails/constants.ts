// [KIND: constants] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 5 Guardrails Domain.
// Source: Part 2 Layer 5 (Section 5.2, D-L5-1).

/** CEO Pack Default Send Window: 06:30 to 21:00 local (D-L5-1). */
export const DEFAULT_SEND_WINDOW = {
  earliestHour: 6,
  earliestMinute: 30,
  latestHour: 21,
  latestMinute: 0,
} as const;

/** Maximum countable push notifications per day (GR-02, GR-19). */
export const DAILY_PUSH_CAP = 3;

/** Minimum spacing between countable pushes in minutes (2 hours). */
export const PUSH_SPACING_MINUTES = 120;

/** Minimum gap in minutes that breaks a back-to-back chain (GR-14, GR-15). */
export const B2B_CHAIN_GAP_MINUTES = 15;

/** Time-to-live ceilings in minutes by push category (Section 5.2). */
export const PUSH_TTL_MINUTES = {
  jit: 45,
  morning: 180,         // 3 hours
  recalibrate: 120,     // 2 hours
  in_flight: 90,        // 90 minutes
  look_ahead: 600,      // 10 hours
  evening: 360,         // 6 hours
} as const;

/** Dense day limits (Section 5.2, GR-06). */
export const DENSE_DAY_MAX_WORDS = 12;
export const DENSE_DAY_MAX_PRACTICE_MINUTES = 2;
