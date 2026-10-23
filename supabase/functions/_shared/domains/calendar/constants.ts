// [KIND: constants] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Domain constants for Layer 0 Calendar.
// Source: Part 2 Layer 0 (Section 4, 12.1, 12.6), Part 4 Tree (calendar/).

/**
 * Provider precedence order by client shell.
 * Reason: On iOS, Apple Calendar represents the on-device primary source of truth,
 * while on Web/Backend, direct Google/Microsoft cloud connections take precedence (Layer 0, Section 4).
 */
export const PLATFORM_PROVIDER_PRECEDENCE: Record<"ios" | "web" | "unknown", string[]> = {
  ios: ["apple", "google", "microsoft"],
  web: ["google", "microsoft", "apple"],
  unknown: ["google", "microsoft", "apple"],
};

/**
 * Maximum time discrepancy (in minutes) to consider two events the same timeslot for identity deduplication.
 * Reason: 15-minute tolerance accommodates minor cross-calendar sync boundary offsets (Spine Section 4).
 */
export const TIMESLOT_DEDUPE_TOLERANCE_MINUTES = 15;

/**
 * Maximum lookback/retention period for calendar events in days.
 * Reason: 365 days covers 1 full annual cycle for Layer 4 annual seasonality and historical patterns (Spine 9.1, Layer 0 12.6).
 */
export const CALENDAR_RETENTION_DAYS = 365;

/**
 * Maximum title length retained for normalization and classification.
 * Reason: 256 characters is sufficient for any corporate meeting subject without excessive memory overhead.
 */
export const MAX_NORMALIZED_TITLE_LEN = 256;
