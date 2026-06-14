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
import { MRS_V4_WEIGHTS, type Window, type SubComponentId } from './mrs-v4-weights.ts';

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

// ─── MRS v4 §6 flag 2 — INTRADAY_DECLINE ─────────────────────────────────
//
// Detects "something changed today that this morning's read didn't anticipate."
// Pure boolean — caller decides where to place it in the flag priority chain
// (§6 puts it at priority 2, after REGULATION_RISK and before
// SUPPLY_DEMAND_GAP).

export interface IntradayDeclineInput {
  /** Baseline computed for the current (afternoon/evening) window. */
  currentWindowBaseline: number | null;
  /** Anchor baseline written by the morning compute today. */
  morningBaselineScore: number | null;
  /** Afternoon decision-leakage flag (from afternoon-context). */
  decisionLeakageRisk?: boolean;
  /** Evening body-load flag (from evening-context). */
  bodyLoadElevated?: boolean;
  /** Afternoon intraday HR % above resting baseline. */
  intradayHrDeviationPct?: number | null;
}

export function computeIntradayDecline(input: IntradayDeclineInput): boolean {
  const { currentWindowBaseline, morningBaselineScore } = input;
  if (currentWindowBaseline == null || morningBaselineScore == null) return false;
  const dropped = currentWindowBaseline <= morningBaselineScore - 10;
  if (!dropped) return false;
  if (input.decisionLeakageRisk) return true;
  if (input.bodyLoadElevated) return true;
  if (typeof input.intradayHrDeviationPct === 'number' && input.intradayHrDeviationPct >= 15) {
    return true;
  }
  return false;
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

// ─── MRS v4 §3.2/3.3/3.4 — window-aware physiological composite ─────────
//
// Same component scorers as the morning-only composite, but reweighted per
// window using the canonical Physiological sub-component weights from
// `mrs-v4-weights.ts`. Two new sub-components are honoured:
//   • `intradayHrDeviationPct` → afternoon (§3.3)
//   • `hrvEveningDeviationPct` → evening (§3.4 — overrides morning HRV
//     when both are present)
//
// Missing sub-components are dropped from the weighted average (the same
// "compute over what we have" rule the morning function uses). Returns
// `null` only when nothing is computable so the divergence classifier can
// degrade to ALIGNED without manufacturing a number.

export interface PhysiologicalCompositeV4Input
  extends PhysiologicalCompositeInput {
  /** Afternoon: HR % above resting baseline. */
  intradayHrDeviationPct?: number | null;
  /** Evening: HRV deviation %. Replaces hrvDeviationPct on evening. */
  hrvEveningDeviationPct?: number | null;
}

function intradayHrComponent(devPct: number | null | undefined): number | null {
  if (devPct == null || !Number.isFinite(devPct)) return null;
  // Linear: 0% → 70, +15% → 30, −5% → 90. Lower HR vs resting = better.
  return clamp(Math.round(70 - devPct * 2.667), 0, 100);
}

export function computePhysiologicalCompositeWindow(
  window: Window,
  input: PhysiologicalCompositeV4Input,
): number | null {
  // Map each Physiological sub-component to its scored value (0..100 or null).
  const scored: Partial<Record<SubComponentId, number>> = {};

  const morningHrv = hrvComponent(input.hrvDeviationPct ?? null);
  const eveningHrv = window === 'evening'
    ? hrvComponent(input.hrvEveningDeviationPct ?? input.hrvDeviationPct ?? null)
    : null;
  if (morningHrv != null) scored.hrvMorningDeviation = morningHrv;

  const sleep = sleepComponent(input.sleepScore ?? null, input.sleepHours ?? null);
  if (sleep != null) scored.sleepDeviation = sleep;

  const rhr = rhrComponent(input.rhrTrend ?? null);
  if (rhr != null) scored.rhrTrend = rhr;

  if (window === 'afternoon') {
    const idHr = intradayHrComponent(input.intradayHrDeviationPct ?? null);
    if (idHr != null) scored.intradayHrDeviation = idHr;
  }
  if (window === 'evening' && eveningHrv != null) {
    scored.eveningPhysioRead = eveningHrv;
  }

  // Pull this window's Physiological sub-component weights from the SSOT
  // table and average over whatever is actually available.
  const physCells = MRS_V4_WEIGHTS[window].filter((c) => c.pillar === 'physiological');
  let weightedSum = 0;
  let weightTotal = 0;
  for (const cell of physCells) {
    const v = scored[cell.id];
    if (typeof v !== 'number') continue;
    weightedSum += v * cell.weight;
    weightTotal += cell.weight;
  }
  if (weightTotal <= 0) return null;
  return Math.round(weightedSum / weightTotal);
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