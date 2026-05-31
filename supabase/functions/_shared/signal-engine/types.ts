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
  dowHistory: Array<{ dow: number; hrv: number | null; load: DemandLevel | null }>;
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
}