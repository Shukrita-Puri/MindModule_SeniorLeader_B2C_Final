// [KIND: constants] [LAYER: 0] [TIERS: 2] [AUDIENCE: universal]
// Domain constants for Layer 0 Location.
// Source: Part 2 Layer 0 (Section 8, 12.1, 12.6), AGENTS.md.

/**
 * Distance threshold in kilometers from home location defining "far from home" / local travel.
 * Reason: 50km (>31 miles) distinguishes normal metropolitan commuting from intercity/regional travel (Layer 0, Section 8).
 */
export const FAR_FROM_HOME_DISTANCE_KM = 50;

/**
 * Timezone offset gate for candidate relocation detection in hours.
 * Reason: Shifts of 3 hours or more represent substantive longitudinal disruption (Spine Section 8).
 */
export const TIMEZONE_RELOCATION_GATE_HOURS = 3;

/**
 * Minimum sustained residency in days before prompting home relocation.
 * Reason: 30 days avoids prompting temporary business trips or vacations (plan/relocation-logic.test.ts).
 */
export const SUSTAINED_RELOCATION_DAYS = 30;

/**
 * Raw GPS location reading retention in days.
 * Reason: High-precision coordinates are purged after 90 days for privacy, while synthesized trips persist 365d (Layer 0, 12.6).
 */
export const RAW_LOCATION_RETENTION_DAYS = 90;

/**
 * Trip record retention in days.
 * Reason: 365 days covers 1 full annual cycle for Layer 4 annual seasonality (Spine 9.1).
 */
export const TRIP_RECORD_RETENTION_DAYS = 365;
