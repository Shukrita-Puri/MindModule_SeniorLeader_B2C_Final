// MRS v2 — shared types for the signal engine.
//
// Owned jointly by compute-inner-readiness, compute-outer-readiness,
// build-daily-context, and the Brief / Nudges / Plan consumers. Shape
// changes go through code review.
//
// See docs MindModule_MRS_Platform_v2.docx §3 and §5 for the contract.

export type DivergenceFlag =
  | 'ALIGNED'
  | 'SUPPLY_DEMAND_GAP'      // replaces MASKED_HIGH (calendar > body)
  | 'RECOVERY_UNDERWAY'      // body coming back, calendar still heavy
  | 'LIGHT_DAY_STRONG_STATE' // body strong, calendar light
  // MRS v4 §6 flag 2 — proactive intraday drop vs morning anchor.
  | 'INTRADAY_DECLINE'
  // Retained for backwards-compat reads of older brief_snapshots rows.
  | 'MASKED_HIGH';

export type WeightingMode =
  | 'no_wearable'
  | 'wearable_early'
  | 'aligned'
  | 'supply_demand_gap'
  | 'recovery_window';

export type DemandLevel = 'low' | 'medium' | 'high';
export type HrvTrend = 'improving' | 'stable' | 'declining' | 'unknown';

/** Raw signals the pattern engine consumes — built from db-queries. */
export interface RawSignals {
  /** Today's HRV reading. */
  hrvToday: number | null;
  /** Personal 30-day HRV baseline. */
  hrvBaseline30d: number | null;
  /** HRV samples ordered most-recent-first (last ~14 days). */
  hrvRecent: Array<{ date: string; hrv: number }>;
  /** Per-day load tier for the trailing 3 days (most recent last). */
  loadLast3Days: DemandLevel[];
  /** Wearable HRV samples and daily load joined by day-of-week, last 60d. */
  dowHistory: Array<{
    /** ISO date (YYYY-MM-DD). Optional for backwards-compat with older callers. */
    date?: string;
    dow: number;
    hrv: number | null;
    load: DemandLevel | null;
  }>;
}

/** Pattern engine output — written into daily_context_snapshot.pattern_signals. */
export interface PatternSignals {
  hrv_3day_trend: HrvTrend;
  consecutive_high_load_days: number;
  dow_historical_pattern: {
    typical_hrv_for_dow: number | null;
    typical_load_for_dow: DemandLevel | null;
    samples: number;
  };
  sustained_deficit_flag: boolean;
  /**
   * MRS v2 §3.5 — Resilience-Capacity primary signal.
   *
   * Number of days in the trailing 7-day window where HRV was meaningfully
   * below baseline (≤ −10%) AND the calendar load classified as 'high'.
   * Captures the "sustained demand erodes reserve" pattern without any
   * check-in or coach inputs.
   *
   * `cooccurrence_ratio` is `cooccurrence_count / days_with_both_signals`
   * (0–1). Null when neither signal is present for the window.
   */
  hrv_low_high_demand_cooccurrence_7d: {
    cooccurrence_count: number;
    cooccurrence_ratio: number | null;
    days_observed: number;
  };
}

/** Calendar demand output — replaces felt-state input. */
export interface DemandScore {
  load: DemandLevel;
  pressure: DemandLevel;
  hasHighStakes: boolean;
  /** 0–100 composite. Mapped into the 20/50/80 scoring band by inner-readiness. */
  demandScore: number;
}

/** Strategic context — LLM framing only, never affects the numeric score. */
export interface StrategicContext {
  pressure_profile: string[] | null;
  protection_goals: string[] | null;
  user_archetype: string | null;
}

/** A trimmed view of a classified calendar event used by pattern + demand. */
export interface ClassifiedEventLite {
  start_time: string;
  end_time: string;
  is_organizer: boolean;
  attendees_count: number;
  is_recurring: boolean;
  title?: string | null;
  event_metadata?: Record<string, unknown> | null;
}

/** Full snapshot row written by build-daily-context.ts. */
export interface DailyContextSnapshot {
  user_id: string;
  local_date: string;
  pattern_signals: PatternSignals | null;
  strategic_context: StrategicContext | null;
  calendar_demand_score: number | null;
  demand_load: DemandLevel | null;
  demand_pressure: DemandLevel | null;
  has_high_stakes: boolean;
  inner_score: number | null;
  inner_tier: string | null;
  pillar_mode: string | null;
  weighting_mode: WeightingMode | null;
  supply_demand_gap_flag: DivergenceFlag | null;
  signal_pills: unknown | null;
  // MRS v3 — soft-guard tier cap. `tier_displayed` is what the UI should
  // render (equal to `inner_tier` unless capped). `tier_cap_reason` is the
  // pattern flag that caused the cap, or null when no cap is applied.
  tier_displayed: string | null;
  tier_cap_reason: 'SUSTAINED_DEFICIT' | 'CONSECUTIVE_LOAD' | null;
  // MRS v3 §3.3 — refined-score split. `readiness_score_baseline` is the
  // raw State 1 value (always present once populated); `readiness_score_refined`
  // is null until a Mind Check-in exists for the window. `readiness_state`
  // = 'baseline' | 'refined'. `refined_contribution` = signed integer in
  // [-15, +15] (0 when state='baseline').
  readiness_score_baseline: number | null;
  readiness_score_refined: number | null;
  readiness_state: 'baseline' | 'refined' | null;
  refined_contribution: number | null;
  // MRS v4 §11 — additive columns. `tier_displayed` doubles as the v4
  // `readiness_tier` (already declared above), so no new tier column.
  mrs_window: 'morning' | 'afternoon' | 'evening' | null;
  morning_baseline_score: number | null;
  check_in_count_today: number | null;
  last_check_in_window: 'morning' | 'afternoon' | 'evening' | null;
  weight_provenance: unknown | null;
}