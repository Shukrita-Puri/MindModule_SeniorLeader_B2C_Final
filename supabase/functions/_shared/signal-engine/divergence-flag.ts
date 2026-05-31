// MRS v2 — Divergence flag (phys × demand) classifier.
//
// Pure, deterministic mapping of body state + calendar demand into one of
// the four DivergenceFlag values written to
// `daily_context_snapshot.supply_demand_gap_flag`. Extracted from the
// inline block in compute-outer-readiness so it can be golden-tested in
// isolation (Phase E). Behaviour MUST stay bit-equivalent to the inline
// version — any drift triggers a tuning task, not a quiet override.
//
// Rules (from MRS v2 §3.3 / §3.4):
//   - No HRV reading at all                         → ALIGNED
//   - body weak AND demand high                     → SUPPLY_DEMAND_GAP
//   - body strong AND demand NOT high               → LIGHT_DAY_STRONG_STATE
//   - body strong AND hrv 3d improving AND demand high → RECOVERY_UNDERWAY
//   - everything else                               → ALIGNED
//
// `bodyStrong` := hrvDeviation > +5%  OR  hrv_3day_trend === 'improving'
// `bodyWeak`   := hrvDeviation < −10% OR  hrv_3day_trend === 'declining'
// `demandHigh` := load === 'high' OR pressure === 'high' OR hasHighStakes

import type { DemandLevel, DivergenceFlag, HrvTrend } from './types.ts';

export interface DivergenceInput {
  /** Today's HRV reading. `null` ⇒ no wearable read ⇒ ALIGNED. */
  hrvValue: number | null;
  /** % deviation from personal 30-day baseline. `null` falls back to trend only. */
  hrvDeviationPct: number | null;
  /** Pattern-engine 3-day HRV trend. */
  hrv3dTrend: HrvTrend;
  /** Calendar load tier. */
  calendarLoad: DemandLevel;
  /** Calendar pressure tier. */
  calendarPressure: DemandLevel;
  /** Any high-stakes event detected today. */
  hasHighStakes: boolean;
}

export function computeDivergenceFlag(input: DivergenceInput): DivergenceFlag {
  if (input.hrvValue == null) return 'ALIGNED';

  const bodyStrong =
    (typeof input.hrvDeviationPct === 'number' && input.hrvDeviationPct > 5) ||
    input.hrv3dTrend === 'improving';
  const bodyWeak =
    (typeof input.hrvDeviationPct === 'number' && input.hrvDeviationPct < -10) ||
    input.hrv3dTrend === 'declining';
  const demandHigh =
    input.calendarLoad === 'high' ||
    input.calendarPressure === 'high' ||
    input.hasHighStakes;

  if (bodyWeak && demandHigh) return 'SUPPLY_DEMAND_GAP';
  if (bodyStrong && !demandHigh) return 'LIGHT_DAY_STRONG_STATE';
  if (bodyStrong && input.hrv3dTrend === 'improving' && demandHigh) {
    return 'RECOVERY_UNDERWAY';
  }
  return 'ALIGNED';
}