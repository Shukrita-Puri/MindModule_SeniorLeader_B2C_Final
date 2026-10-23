// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Constants for Layer 2 Gate Domain.
// Source: Part 2 Layer 2 (Section 5.1.6, N-CG1, N-CG2).

/** Hours within which wearable reading maintains full (1.0) quality. */
export const WEARABLE_QUALITY_FULL_HOURS = 12.0;

/** Hours beyond which wearable reading falls to zero quality. */
export const WEARABLE_QUALITY_ZERO_HOURS = 36.0;

/** Tactical pattern count target (N-CG1). */
export const TACTICAL_PATTERN_TARGET = 6;

/** Days of wearable data target in the last 30 days (N-CG1). */
export const TACTICAL_WEARABLE_DAYS_TARGET = 21;

/** Declared strategic goals target (N-CG1). */
export const STRATEGIC_GOALS_TARGET = 2;

/** Strategic goal confirmation days for full quality (180 days). */
export const STRATEGIC_FULL_QUALITY_DAYS = 180;

/** Strategic goal confirmation days for degraded quality (0.3 at 365 days). */
export const STRATEGIC_FLOOR_QUALITY_DAYS = 365;
