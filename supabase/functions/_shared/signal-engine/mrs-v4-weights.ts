// MRS v4 — window-keyed sub-component weight table (single source of truth
// for §3.2 / §3.3 / §3.4 of docs/MRS_V3_SPECIFICATION.md).
//
// Every weight is expressed in "points out of 100". Sums per window MUST
// equal 100 — the redistribution algorithm relies on this invariant.
//
// `pillar` keeps redistribution INTRA-PILLAR: unearned Physiological weight
// can only move to earned Physiological cells, unearned Demand weight can
// only move to earned Demand cells, and Pattern never gives or receives
// weight (additive context only, never score-bearing).

export type Window = 'morning' | 'afternoon' | 'evening';
export type Pillar = 'physiological' | 'demand' | 'pattern';

export type SubComponentId =
  // Physiological
  | 'hrvMorningDeviation'
  | 'sleepDeviation'
  | 'rhrTrend'
  | 'intradayHrDeviation'
  | 'eveningPhysioRead'
  // Demand
  | 'todayFullDayDemand'
  | 'remainingDayDemand'
  | 'realizedSoFarCost'
  | 'todayRealizedDemand'
  | 'tomorrowOpeningDemand'
  // Pattern
  | 'patternEngineComposite'
  | 'yesterdayCarryover';

export interface WeightCell {
  id: SubComponentId;
  pillar: Pillar;
  /** Target weight in points out of 100. 0 means "not used in this window". */
  weight: number;
}

/**
 * Zero-demand recovery credit — fraction of a Demand cell's maximum score
 * awarded when raw calendar demand is a MEASURED zero.
 *
 * A connected calendar with genuinely zero scheduled demand is earned data,
 * not missing data. Zero load creates real recovery capacity, so the cell
 * receives a bounded positive readiness contribution — deliberately not the
 * full maximum, so an empty calendar can never manufacture a "peak" read.
 *
 * Value selected from the scenario model in `mrs-v4-modelling.ts`.
 */
export const ZERO_DEMAND_CREDIT = 0.5;

/**
 * Morning Demand split across the fixed 30-point Morning Demand allocation.
 * `today + yesterday` MUST equal 30 — the MRS scale never grows.
 * Value selected from the scenario model in `mrs-v4-modelling.ts`.
 */
export const MORNING_DEMAND_SPLIT: { today: number; yesterday: number } = {
  today: 20,
  yesterday: 10,
};

export const MRS_V4_WEIGHTS: Record<Window, WeightCell[]> = {
  morning: [
    { id: 'hrvMorningDeviation',    pillar: 'physiological', weight: 25 },
    { id: 'sleepDeviation',         pillar: 'physiological', weight: 17.5 },
    { id: 'rhrTrend',               pillar: 'physiological', weight: 7.5 },
    { id: 'todayFullDayDemand',     pillar: 'demand',        weight: MORNING_DEMAND_SPLIT.today },
    { id: 'yesterdayCarryover',     pillar: 'demand',        weight: MORNING_DEMAND_SPLIT.yesterday },
    { id: 'patternEngineComposite', pillar: 'pattern',       weight: 20 },
  ],
  afternoon: [
    { id: 'hrvMorningDeviation',    pillar: 'physiological', weight: 15 },
    { id: 'sleepDeviation',         pillar: 'physiological', weight: 10.5 },
    { id: 'rhrTrend',               pillar: 'physiological', weight: 4.5 },
    { id: 'intradayHrDeviation',    pillar: 'physiological', weight: 20 },
    { id: 'remainingDayDemand',     pillar: 'demand',        weight: 21 },
    { id: 'realizedSoFarCost',      pillar: 'demand',        weight: 9 },
    { id: 'patternEngineComposite', pillar: 'pattern',       weight: 20 },
  ],
  evening: [
    { id: 'hrvMorningDeviation',    pillar: 'physiological', weight: 8.75 },
    { id: 'sleepDeviation',         pillar: 'physiological', weight: 6.125 },
    { id: 'rhrTrend',               pillar: 'physiological', weight: 2.625 },
    { id: 'eveningPhysioRead',      pillar: 'physiological', weight: 32.5 },
    { id: 'todayRealizedDemand',    pillar: 'demand',        weight: 18 },
    { id: 'tomorrowOpeningDemand',  pillar: 'demand',        weight: 12 },
    { id: 'patternEngineComposite', pillar: 'pattern',       weight: 20 },
  ],
};

/** Sanity check — every window's weights must sum to 100. */
export function assertWeightSumInvariant(): void {
  for (const [window, cells] of Object.entries(MRS_V4_WEIGHTS)) {
    const sum = cells.reduce((s, c) => s + c.weight, 0);
    // Allow tiny floating-point drift.
    if (Math.abs(sum - 100) > 0.01) {
      throw new Error(`MRS v4 weight table invariant broken for window=${window}: sum=${sum}`);
    }
  }
}