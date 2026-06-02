// MRS v2 — Divergence flag (phys × demand) classifier.
//
// Composite math per MRS v2 §3.3:
//   1. RECOVERY_UNDERWAY     — phys ≥ 55 AND HRV recovering (3d improving)
//                              AND demand ≥ 60 (priority over GAP because
//                              body is on the way back up).
//   2. SUPPLY_DEMAND_GAP     — demand ≥ 65 AND phys ≤ 50.
//   3. LIGHT_DAY_STRONG_STATE — phys ≥ 65 AND demand ≤ 35.
//   4. ALIGNED               — everything else (incl. |phys − demand| ≤ 25
//                              and the no-physiological-read case).
//
// `physComposite` is the 0–100 wearable-only composite (HRV + Sleep +
// RHR-trend) computed by `computePhysiologicalComposite` and owned by
// compute-inner-readiness. `demandScore` is the 0–100 calendar demand
// score from demand-scorer. The classifier is a pure function — every
// input must be supplied by the caller.

import type { DivergenceFlag } from './types.ts';

export type RhrTrend = 'declining' | 'stable' | 'rising' | 'unknown';

export interface DivergenceInput {
  /** 0–100 physiological composite. `null` ⇒ no wearable signal ⇒ ALIGNED. */
  physComposite: number | null;
  /** 0–100 calendar demand score (demand-scorer). Defaults to 0 when null. */
  demandScore: number | null;
  /** True when 3-day HRV trend is improving — gates RECOVERY_UNDERWAY. */
  hrvRecovering?: boolean;
}

export function computeDivergenceFlag(input: DivergenceInput): DivergenceFlag {
  if (input.physComposite == null) return 'ALIGNED';
  const phys = clamp(input.physComposite, 0, 100);
  const demand = clamp(input.demandScore ?? 0, 0, 100);
  const recovering = !!input.hrvRecovering;

  if (recovering && phys >= 55 && demand >= 60) return 'RECOVERY_UNDERWAY';
  if (demand >= 65 && phys <= 50) return 'SUPPLY_DEMAND_GAP';
  if (phys >= 65 && demand <= 35) return 'LIGHT_DAY_STRONG_STATE';
  return 'ALIGNED';
}

// ─── Physiological composite (HRV + Sleep + RHR-trend) ──────────────────

export interface PhysiologicalCompositeInput {
  /** % deviation from personal HRV baseline. e.g. +10 = 10% above. */
  hrvDeviationPct?: number | null;
  /** Optional pre-computed sleep score (0–100). Wins over sleepHours. */
  sleepScore?: number | null;
  /** Last-night sleep in hours. Used when sleepScore is missing. */
  sleepHours?: number | null;
  /** 3-day RHR trend. RHR going down ('declining') is a recovery signal. */
  rhrTrend?: RhrTrend | null;
}

/**
 * Weighted physiological composite (HRV 50% / Sleep 35% / RHR-trend 15%).
 * Returns `null` when no component is computable so the classifier can
 * degrade to ALIGNED without manufacturing a number.
 */
export function computePhysiologicalComposite(
  input: PhysiologicalCompositeInput,
): number | null {
  const parts: Array<[value: number, weight: number]> = [];
  const h = hrvComponent(input.hrvDeviationPct ?? null);
  if (h != null) parts.push([h, 0.50]);
  const s = sleepComponent(input.sleepScore ?? null, input.sleepHours ?? null);
  if (s != null) parts.push([s, 0.35]);
  const r = rhrComponent(input.rhrTrend ?? null);
  if (r != null) parts.push([r, 0.15]);
  if (parts.length === 0) return null;
  const totalW = parts.reduce((acc, [, w]) => acc + w, 0);
  const weighted = parts.reduce((acc, [v, w]) => acc + v * w, 0);
  return Math.round(weighted / totalW);
}

function hrvComponent(devPct: number | null): number | null {
  if (devPct == null || !Number.isFinite(devPct)) return null;
  // Linear: +15% → 95, 0% → 55, −15% → 15. Clamp to 0–100.
  return clamp(Math.round(55 + devPct * 2.667), 0, 100);
}

function sleepComponent(score: number | null, hours: number | null): number | null {
  if (typeof score === 'number' && Number.isFinite(score)) {
    return clamp(Math.round(score), 0, 100);
  }
  if (typeof hours === 'number' && Number.isFinite(hours)) {
    if (hours >= 7.5) return 80;
    if (hours >= 6.5) return 60;
    if (hours >= 6.0) return 45;
    return 25;
  }
  return null;
}

function rhrComponent(trend: RhrTrend | null): number | null {
  if (!trend || trend === 'unknown') return null;
  switch (trend) {
    case 'declining': return 75;
    case 'stable':    return 55;
    case 'rising':    return 30;
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ─── Source provenance ───────────────────────────────────────────────────

/**
 * Returns which MRS input dimensions actually contributed to the score.
 * Used by compute-outer-readiness to surface `sourceProvenance.mrs` on
 * the wire so the client can render audit chips beside the score.
 *
 * Wearable is recorded when the physiological composite is non-null.
 * Calendar is recorded when a demand score is present (any value, even 0,
 * is a real reading once calendar is connected — the caller decides
 * whether to pass a null demandScore in cold-start).
 */
export type MrsSource = 'wearable' | 'calendar' | 'pattern' | 'ceo-behaviour' | 'checkin';

export interface DivergenceProvenanceInput extends DivergenceInput {
  hasPatternSignal?: boolean;
  hasCeoBehaviour?: boolean;
  hasCheckin?: boolean;
}

export function divergenceProvenance(input: DivergenceProvenanceInput): {
  sources: MrsSource[];
  primary: MrsSource | null;
  refinedBy: 'checkin' | null;
} {
  const sources: MrsSource[] = [];
  if (input.physComposite != null) sources.push('wearable');
  if (input.demandScore != null) sources.push('calendar');
  if (input.hasPatternSignal) sources.push('pattern');
  if (input.hasCeoBehaviour) sources.push('ceo-behaviour');
  if (input.hasCheckin) sources.push('checkin');
  // Highest-weighted available input wins.
  const order: MrsSource[] = ['wearable', 'calendar', 'pattern', 'ceo-behaviour', 'checkin'];
  const primary = order.find((s) => sources.includes(s)) ?? null;
  return {
    sources,
    primary,
    refinedBy: input.hasCheckin ? 'checkin' : null,
  };
}