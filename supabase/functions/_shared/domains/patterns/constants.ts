// [KIND: constants] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Constants and Thresholds for Layer 4: Patterns and Causality.
// Source: Part 2 Layer 4 (Section 6, 7B, 13, N-L4-12, N-L4-16).

export const PATTERNS_SPINE_VERSION = "spine.v2.20261023";
export const PATTERNS_SPEC_VERSION = "2026-10-23";

/** Minimum occurrences with valid measurement required for an Emerging pattern (N-L4-4, N-L4-12). */
export const MIN_MEASURED_N_EMERGING = 3;

/** Minimum effect magnitude (%) required for an Emerging pattern (10%, per spine addendum 23 Oct & N-L4-12). */
export const MIN_EFFECT_PCT_EMERGING = 10;

/** Minimum occurrences with valid measurement required for a Strong pattern (Section 6). */
export const MIN_MEASURED_N_STRONG = 5;

/** Minimum effect magnitude (%) required for a Strong pattern (15%, Section 6). */
export const MIN_EFFECT_PCT_STRONG = 15;

/** Empirical Bayes shrinkage parameter k = 5 (Section 7B). Pulls low-n rates toward prior. */
export const SHRINKAGE_K = 5;

/** Minimum number of users required before a population rate is used (Section 7B, N-L4-16). Default prior is 0.5 below 20. */
export const MIN_POPULATION_USERS = 20;

/** Maximum lookback window for history evaluation (90 days). */
export const MAX_HISTORY_DAYS = 90;

/** Findings older than 36 hours are considered stale and require nightly refresh (Section 12.2, N-L4-1). */
export const FINDING_FRESHNESS_MAX_HOURS = 36;

/** Minimum occurrences for subtype evaluation before rolling up to category (Section 6, Rollup). */
export const MIN_SUBTYPE_OCCURRENCES_FOR_ROLLUP = 3;

/** Hit rate threshold below which a pattern is demoted from strong or excluded (Section 9). */
export const MIN_PREDICTION_HIT_RATE = 0.5;
