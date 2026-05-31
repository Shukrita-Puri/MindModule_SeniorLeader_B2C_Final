// MRS v2 — daily_context_snapshot upsert helper.
//
// Lightweight: the heavy fetches already live in compute-outer-readiness.
// This module owns the canonical upsert shape so every writer agrees.

import type {
  DailyContextSnapshot,
  DemandLevel,
  DivergenceFlag,
  PatternSignals,
  StrategicContext,
  WeightingMode,
} from './types.ts';

type AnySupabase = {
  from: (table: string) => any;
};

export interface UpsertContextSnapshotInput {
  userId: string;
  localDate: string;
  patternSignals: PatternSignals | null;
  strategicContext: StrategicContext | null;
  calendarDemandScore: number | null;
  demandLoad: DemandLevel | null;
  demandPressure: DemandLevel | null;
  hasHighStakes: boolean;
  innerScore: number | null;
  innerTier: string | null;
  pillarMode: string | null;
  weightingMode: WeightingMode | null;
  supplyDemandGapFlag: DivergenceFlag | null;
  signalPills: unknown | null;
}

/**
 * Upsert the daily context snapshot for (user_id, local_date).
 * Idempotent. Service-role only (writes are blocked by RLS for everyone else).
 * Failures are logged but never thrown — readiness must keep flowing.
 */
export async function upsertDailyContextSnapshot(
  db: AnySupabase,
  input: UpsertContextSnapshotInput,
): Promise<void> {
  try {
    const row: Partial<DailyContextSnapshot> & { user_id: string; local_date: string } = {
      user_id: input.userId,
      local_date: input.localDate,
      pattern_signals: input.patternSignals,
      strategic_context: input.strategicContext,
      calendar_demand_score: input.calendarDemandScore,
      demand_load: input.demandLoad,
      demand_pressure: input.demandPressure,
      has_high_stakes: input.hasHighStakes,
      inner_score: input.innerScore,
      inner_tier: input.innerTier,
      pillar_mode: input.pillarMode,
      weighting_mode: input.weightingMode,
      supply_demand_gap_flag: input.supplyDemandGapFlag,
      signal_pills: input.signalPills,
    };

    const { error } = await db
      .from('daily_context_snapshot')
      .upsert(row, { onConflict: 'user_id,local_date' });

    if (error) {
      console.warn('[daily_context_snapshot] upsert failed:', error.message ?? error);
    }
  } catch (err) {
    console.warn(
      '[daily_context_snapshot] upsert threw:',
      err instanceof Error ? err.message : err,
    );
  }
}