/**
 * _shared/personas/ceo/thresholds.ts
 *
 * CEO persona — tunable constants for all behaviour rules.
 *
 * PURPOSE
 * ───────
 * Extracts every inline numeric/string constant from rule bodies so that:
 *  1. A middle-management or student persona can override these without editing 25 rule files.
 *  2. Product decisions about thresholds have a single, documented home.
 *  3. Tests can import and assert against these values.
 *
 * USAGE IN RULES
 * ──────────────
 * import { CEO_THRESHOLDS as T } from './_shared/personas/ceo/thresholds';
 *
 * // instead of inline literals:
 * if (distinctCategories >= T.CONTEXT_SWITCH_MIN_CATEGORIES) { ... }
 *
 * PERSONA SEAM
 * ────────────
 * Rules import from resolvePersonaThresholds(user) which returns these values by default.
 * A future midmanager pack overrides specific keys — nothing else changes.
 */

export const CEO_THRESHOLDS = {

  // ─── Context Switching ────────────────────────────────────────────────────
  /** Hours lookahead window for context-switch detection */
  CONTEXT_SWITCH_WINDOW_HOURS: 4,
  /** Minimum distinct categories to trigger contextSwitchingCost */
  CONTEXT_SWITCH_MIN_CATEGORIES: 3,
  /** Category labels used in copyHint sequence (product|eng terms → A, finance→B, people→C/D) */
  CONTEXT_SWITCH_CATEGORY_LABELS: {
    A: 'product',
    B: 'finance',
    C: 'people',
    D: 'interpersonal',
    E: 'strategy',
    F: 'conference',
    G: 'travel',
    H: 'baseline',
  } as const,

  // ─── Decision Density ─────────────────────────────────────────────────────
  /** Decision keyword bank (Layer 1 — title match) */
  DECISION_KEYWORDS: [
    'board', 'exec', 'leadership', 'investor', 'budget', 'hiring',
    'approve', 'sign-off', 'sign off', 'decision', 'review', 'vote',
    'strategy', 'roadmap', 'M&A', 'acquisition', 'restructure',
  ],
  /**
   * Co-occurrence gate: 'review' and 'kick-off' only count if
   * also matched against a HIGH_STAKES_KEYWORD. Set to false to trust
   * layered score to handle noise (see §7 senior-engineer probe).
   */
  DECISION_KEYWORD_CO_OCCURRENCE_REQUIRED: true,
  /** Attendee count that triggers committee boost (+0.3 severity) */
  DECISION_DENSITY_COMMITTEE_THRESHOLD: 6,
  /** Committee severity boost */
  DECISION_DENSITY_COMMITTEE_BOOST: 0.3,
  /** Duration threshold (minutes) for compressed-block boost */
  DECISION_DENSITY_COMPRESSED_DURATION_MINS: 30,
  /** Compressed block severity boost */
  DECISION_DENSITY_COMPRESSED_BOOST: 0.2,

  // ─── Back-to-Back / Load ──────────────────────────────────────────────────
  /** Gap between meetings (minutes) that qualifies as "back-to-back" */
  BACK_TO_BACK_GAP_MINS: 15,
  /** Hours of back-to-back meetings that triggers backToBackLoadOverride */
  BACK_TO_BACK_TRIGGER_HOURS: 4,
  /** Hours since last app open that triggers notificationIsProduct */
  NOTIFICATION_PRODUCT_OPEN_GAP_HOURS: 72,

  // ─── Circadian / Travel ───────────────────────────────────────────────────
  /** Minimum timezone shift (hours) to trigger circadianPriority */
  CIRCADIAN_TZ_SHIFT_THRESHOLD_HOURS: 3,
  /** Buffer hours added to first high-stakes event after travel */
  CIRCADIAN_REENTRY_BUFFER_HOURS: 1.5,

  // ─── Emotional Drain ──────────────────────────────────────────────────────
  /** Categories that count as emotionally draining */
  EMOTIONAL_DRAIN_CATEGORIES: ['D'] as string[],
  /** Number of drain events in a day to trigger emotionalDrainCumulative */
  EMOTIONAL_DRAIN_CUMULATIVE_THRESHOLD: 2,

  // ─── Board / Governance ───────────────────────────────────────────────────
  /** Hours before board-level event that activates boardReadinessWindow */
  BOARD_READINESS_ADVANCE_HOURS: 48,
  /** Hours lookahead for boardLevelOutcome rule */
  BOARD_LEVEL_OUTCOME_WINDOW_HOURS: 24,
  /** Minutes post-governance to protect from non-critical decisions */
  POST_GOVERNANCE_PROTECTION_MINS: 90,

  // ─── Veto Risk ────────────────────────────────────────────────────────────
  /** Self-declared score above which veto-risk triggers (0–10 scale) */
  VETO_SELF_DECL_HIGH_THRESHOLD: 7,
  /** HRV deviation below which wearable reads as depleted */
  VETO_HRV_DEPLETED_THRESHOLD: -15,

  // ─── Decision Leakage ─────────────────────────────────────────────────────
  /** Emotional proxy score above which leakage guard fires */
  DECISION_LEAKAGE_EMOTIONAL_PROXY_THRESHOLD: 6,

  // ─── Post-Peak Hangover ───────────────────────────────────────────────────
  /** Recovery deficit score that triggers postPeakHangover */
  POST_PEAK_RECOVERY_DEFICIT_THRESHOLD: 4,

  // ─── Conference ───────────────────────────────────────────────────────────
  /** Conference day number above which conferenceDepletion fires */
  CONFERENCE_DEPLETION_DAY_THRESHOLD: 2,

  // ─── Sleep Targeting ──────────────────────────────────────────────────────
  /** Target sleep hours for pre-event sleep nudge */
  PRE_EVENT_SLEEP_TARGET_HOURS: 7.5,
  /** Hours before sleep target that evening nudge fires */
  PRE_EVENT_SLEEP_NUDGE_ADVANCE_HOURS: 3,

  // ─── Sunday / Weekend ─────────────────────────────────────────────────────
  /** Hour (24h local) that sundayReset window opens */
  SUNDAY_RESET_WINDOW_OPEN_HOUR: 18,
  /** Hour (24h local) that sundayReset window closes */
  SUNDAY_RESET_WINDOW_CLOSE_HOUR: 21,
  /** Hour (24h local) that sundayEveningWeekAhead window opens (earlier) */
  SUNDAY_WEEK_AHEAD_WINDOW_OPEN_HOUR: 14,

  // ─── Time-Since-Last-Recovery ─────────────────────────────────────────────
  /** Gap (hours) since last completed practice that upgrades nudge severity */
  TIME_SINCE_RECOVERY_THRESHOLD_HOURS: 36,

} as const;

export type CeoThresholds = typeof CEO_THRESHOLDS;

/**
 * Resolve persona thresholds — defaults to CEO.
 * Future: import midmanager overrides and spread-merge them here.
 */
export function resolvePersonaThresholds(_persona: string = 'ceo'): CeoThresholds {
  // Future: if (_persona === 'midmanager') return { ...CEO_THRESHOLDS, ...MIDMANAGER_OVERRIDES };
  return CEO_THRESHOLDS;
}
