// MRS v4 — deterministic sub-component assembly for the baseline composer.
//
// This file is intentionally pure and small: callers provide already-derived
// signals, this module maps them into v4 sub-component ids with
// score+availability. Missing values stay unavailable so §8.3 redistribution
// owns the math. No neutral-50 fallback is introduced here.

import type { SubScore } from './mrs-v4-compose.ts';
import { ZERO_DEMAND_CREDIT, type SubComponentId, type Window } from './mrs-v4-weights.ts';

type RhrTrend = 'declining' | 'falling' | 'stable' | 'rising' | 'unknown' | null;

export interface MrsV4SubscoreSignals {
  hrvValue?: number | null;
  hrvDeviationPct?: number | null;
  sleepDeviationPct?: number | null;
  sleepScore?: number | null;
  sleepHours?: number | null;
  rhrValue?: number | null;
  rhrTrend?: RhrTrend;
  intradayHrDeviationPct?: number | null;
  eveningHrvDeviationPct?: number | null;
  /** Evening-window mean HR vs RHR baseline (positive = elevated = worse). */
  eveningHrDeviationPct?: number | null;
  bodyLoadElevated?: boolean | null;
  todayFullDayDemand?: number | null;
  remainingDayDemand?: number | null;
  realizedSoFarCost?: number | null;
  todayRealizedDemand?: number | null;
  tomorrowOpeningDemand?: number | null;
  patternScore?: number | null;
  yesterdayCarryoverDemand?: number | null;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fromDeviation(deviationPct: number | null | undefined, inverse = false): number | null {
  if (typeof deviationPct !== 'number' || !Number.isFinite(deviationPct)) return null;
  const raw = inverse ? 55 - deviationPct * 2 : 55 + deviationPct * 2;
  return clampScore(raw);
}

function fromAbsoluteHrv(hrv: number | null | undefined): number | null {
  if (typeof hrv !== 'number' || !Number.isFinite(hrv) || hrv <= 0) return null;
  if (hrv >= 50) return 75;
  if (hrv >= 30) return 55;
  return 35;
}

function fromAbsoluteRhr(rhr: number | null | undefined): number | null {
  if (typeof rhr !== 'number' || !Number.isFinite(rhr) || rhr <= 0) return null;
  if (rhr <= 60) return 75;
  if (rhr <= 75) return 55;
  if (rhr <= 90) return 40;
  return 25;
}

/**
 * Demand → readiness inversion.
 *
 * Staging is explicit:
 *   raw calendar demand = 0  -> cell is EARNED (available: true)
 *                            -> zero-demand recovery rule applies
 *                            -> bounded positive contribution
 * `null`/non-finite = unavailable, and only that case is unearned.
 */
function fromDemand(
  demandScore: number | null | undefined,
): { score: number; rawDemand: number; zeroCredit: boolean } | null {
  if (typeof demandScore !== 'number' || !Number.isFinite(demandScore)) return null;
  const raw = Math.max(0, Math.min(100, demandScore));
  if (raw === 0) {
    // Measured zero demand: bounded recovery credit, never the full maximum.
    return { score: clampScore(ZERO_DEMAND_CREDIT * 100), rawDemand: 0, zeroCredit: true };
  }
  return { score: clampScore(100 - raw), rawDemand: raw, zeroCredit: false };
}

function fromSleep(signals: MrsV4SubscoreSignals): number | null {
  const deviationScore = fromDeviation(signals.sleepDeviationPct);
  if (deviationScore != null) return deviationScore;
  if (typeof signals.sleepScore === 'number' && Number.isFinite(signals.sleepScore)) {
    return clampScore(signals.sleepScore);
  }
  if (typeof signals.sleepHours === 'number' && Number.isFinite(signals.sleepHours)) {
    return clampScore((signals.sleepHours / 8) * 100);
  }
  return null;
}

function fromRhrTrend(trend: RhrTrend): number | null {
  switch (trend) {
    case 'declining':
    case 'falling':
      return 80;
    case 'stable':
      return 55;
    case 'rising':
      return 30;
    default:
      return null;
  }
}

function fromEveningPhysio(signals: MrsV4SubscoreSignals): number | null {
  // MRS v4 — this cell must be EARNED from genuinely evening-window signals.
  // The morning HRV deviation is already scored in `hrvMorningDeviation`;
  // reusing it here would double-count one measurement across 41.25 points.
  const hrvScore = fromDeviation(signals.eveningHrvDeviationPct);
  const hrScore = fromDeviation(signals.eveningHrDeviationPct, true);
  const bodyScore = signals.bodyLoadElevated === true ? 35 : signals.bodyLoadElevated === false ? 65 : null;
  const parts = [hrvScore, hrScore ?? bodyScore].filter((v): v is number => v != null);
  if (parts.length === 0) return null;
  return clampScore(parts.reduce((a, b) => a + b, 0) / parts.length);
}

function sub(id: SubComponentId, score: number | null): SubScore {
  return {
    id,
    score: score == null ? 0 : clampScore(score),
    available: score != null,
  };
}

function demandSub(id: SubComponentId, demandScore: number | null | undefined): SubScore {
  const derived = fromDemand(demandScore);
  if (derived == null) return { id, score: 0, available: false, rawDemand: null };
  return {
    id,
    score: derived.score,
    available: true,
    rawDemand: derived.rawDemand,
    zeroDemandCredit: derived.zeroCredit,
  };
}

export function buildMrsV4SubScores(window: Window, signals: MrsV4SubscoreSignals): SubScore[] {
  const base = {
    hrvMorningDeviation: sub(
      'hrvMorningDeviation',
      fromDeviation(signals.hrvDeviationPct) ?? fromAbsoluteHrv(signals.hrvValue),
    ),
    sleepDeviation: sub('sleepDeviation', fromSleep(signals)),
    rhrTrend: sub('rhrTrend', fromRhrTrend(signals.rhrTrend ?? null) ?? fromAbsoluteRhr(signals.rhrValue)),
    patternEngineComposite: sub('patternEngineComposite', signals.patternScore ?? null),
  } satisfies Partial<Record<SubComponentId, SubScore>>;

  if (window === 'morning') {
    return [
      base.hrvMorningDeviation,
      base.sleepDeviation,
      base.rhrTrend,
      demandSub('todayFullDayDemand', signals.todayFullDayDemand),
      demandSub('yesterdayCarryover', signals.yesterdayCarryoverDemand),
      base.patternEngineComposite,
    ];
  }

  if (window === 'afternoon') {
    return [
      base.hrvMorningDeviation,
      base.sleepDeviation,
      base.rhrTrend,
      sub('intradayHrDeviation', fromDeviation(signals.intradayHrDeviationPct, true)),
      demandSub('remainingDayDemand', signals.remainingDayDemand),
      demandSub('realizedSoFarCost', signals.realizedSoFarCost),
      base.patternEngineComposite,
    ];
  }

  return [
    base.hrvMorningDeviation,
    base.sleepDeviation,
    base.rhrTrend,
    // No morning-HRV fallback: unavailable is correct, §8.3 redistributes.
    sub('eveningPhysioRead', fromEveningPhysio(signals)),
    demandSub('todayRealizedDemand', signals.todayRealizedDemand),
    demandSub('tomorrowOpeningDemand', signals.tomorrowOpeningDemand),
    base.patternEngineComposite,
  ];
}
