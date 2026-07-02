// MRS v4 — deterministic sub-component assembly for the baseline composer.
//
// This file is intentionally pure and small: callers provide already-derived
// signals, this module maps them into v4 sub-component ids with
// score+availability. Missing values stay unavailable so §8.3 redistribution
// owns the math. No neutral-50 fallback is introduced here.

import type { SubScore } from './mrs-v4-compose.ts';
import type { SubComponentId, Window } from './mrs-v4-weights.ts';

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

function fromDemand(demandScore: number | null | undefined): number | null {
  if (typeof demandScore !== 'number' || !Number.isFinite(demandScore)) return null;
  return clampScore(100 - demandScore);
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
  const hrvScore = fromDeviation(signals.eveningHrvDeviationPct ?? signals.hrvDeviationPct);
  const bodyScore = signals.bodyLoadElevated === true ? 35 : signals.bodyLoadElevated === false ? 65 : null;
  if (hrvScore == null && bodyScore == null) return null;
  if (hrvScore == null) return bodyScore;
  if (bodyScore == null) return hrvScore;
  return clampScore((hrvScore + bodyScore) / 2);
}

function sub(id: SubComponentId, score: number | null): SubScore {
  return {
    id,
    score: score == null ? 0 : clampScore(score),
    available: score != null,
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
      sub('todayFullDayDemand', fromDemand(signals.todayFullDayDemand)),
      base.patternEngineComposite,
      sub('yesterdayCarryover', fromDemand(signals.yesterdayCarryoverDemand)),
    ];
  }

  if (window === 'afternoon') {
    return [
      base.hrvMorningDeviation,
      base.sleepDeviation,
      base.rhrTrend,
      sub('intradayHrDeviation', fromDeviation(signals.intradayHrDeviationPct, true)),
      sub('remainingDayDemand', fromDemand(signals.remainingDayDemand)),
      sub('realizedSoFarCost', fromDemand(signals.realizedSoFarCost)),
      base.patternEngineComposite,
    ];
  }

  return [
    base.hrvMorningDeviation,
    base.sleepDeviation,
    base.rhrTrend,
    sub('eveningPhysioRead', fromEveningPhysio(signals) ?? fromAbsoluteHrv(signals.hrvValue)),
    sub('todayRealizedDemand', fromDemand(signals.todayRealizedDemand)),
    sub('tomorrowOpeningDemand', fromDemand(signals.tomorrowOpeningDemand)),
    base.patternEngineComposite,
  ];
}
