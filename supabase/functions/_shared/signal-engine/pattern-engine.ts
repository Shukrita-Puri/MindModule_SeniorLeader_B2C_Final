// MRS v2 — Pattern engine.
//
// Derives the four pattern signals used by inner-readiness and the
// Resilience pill. Pure function — DB fetching happens upstream.

import type {
  ClassifiedEventLite,
  DemandLevel,
  HrvTrend,
  PatternSignals,
  RawSignals,
} from './types.ts';
import { computeCalendarDemand } from './demand-scorer.ts';

const HRV_TREND_BAND_PCT = 5;       // ±5% defines improving / declining
const SUSTAINED_DEFICIT_PCT = -20;  // > 20% below baseline
const SUSTAINED_DEFICIT_MIN_DAYS = 2;

/**
 * Compute the four pattern signals.
 * @param raw           RawSignals built from db-queries.
 * @param classifiedToday Today's classified events (optional, only used when
 *                        raw.loadLast3Days is empty, to derive today's load).
 */
export function buildPatternSignals(
  raw: RawSignals,
  classifiedToday: ClassifiedEventLite[] = [],
): PatternSignals {
  // ── A. hrv_3day_trend ─────────────────────────────────────────────
  const hrv_3day_trend = computeHrv3DayTrend(raw.hrvRecent);

  // ── B. consecutive_high_load_days ────────────────────────────────
  let loadLast3 = raw.loadLast3Days.slice(-3);
  if (loadLast3.length === 0 && classifiedToday.length > 0) {
    loadLast3 = [computeCalendarDemand(classifiedToday).load];
  }
  // Count back-to-back high days from most recent.
  let consecutive_high_load_days = 0;
  for (let i = loadLast3.length - 1; i >= 0; i--) {
    if (loadLast3[i] === 'high') consecutive_high_load_days++;
    else break;
  }

  // ── C. dow_historical_pattern ─────────────────────────────────────
  const todayDow = new Date().getUTCDay();
  const dowRows = (raw.dowHistory ?? []).filter((r) => r.dow === todayDow);
  const hrvSamples = dowRows.map((r) => r.hrv).filter((v): v is number => v != null);
  const loadCounts: Record<DemandLevel, number> = { low: 0, medium: 0, high: 0 };
  dowRows.forEach((r) => {
    if (r.load) loadCounts[r.load]++;
  });
  const typical_load_for_dow = pickModeLoad(loadCounts);
  const typical_hrv_for_dow = hrvSamples.length
    ? Math.round(hrvSamples.reduce((a, b) => a + b, 0) / hrvSamples.length)
    : null;

  // ── D. sustained_deficit_flag ─────────────────────────────────────
  const sustained_deficit_flag = detectSustainedDeficit(raw);

  return {
    hrv_3day_trend,
    consecutive_high_load_days,
    dow_historical_pattern: {
      typical_hrv_for_dow,
      typical_load_for_dow,
      samples: dowRows.length,
    },
    sustained_deficit_flag,
  };
}

function computeHrv3DayTrend(samples: Array<{ date: string; hrv: number }>): HrvTrend {
  if (!samples || samples.length === 0) return 'unknown';
  const sorted = [...samples].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const today = sorted[0]?.hrv;
  // 3 days ago = index 3 if present, else last available.
  const ref = sorted[3]?.hrv ?? sorted[sorted.length - 1]?.hrv;
  if (today == null || ref == null || ref <= 0) return 'unknown';
  const pct = ((today - ref) / ref) * 100;
  if (pct >= HRV_TREND_BAND_PCT) return 'improving';
  if (pct <= -HRV_TREND_BAND_PCT) return 'declining';
  return 'stable';
}

function pickModeLoad(counts: Record<DemandLevel, number>): DemandLevel | null {
  const entries = Object.entries(counts) as Array<[DemandLevel, number]>;
  const total = entries.reduce((s, [, n]) => s + n, 0);
  if (total === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function detectSustainedDeficit(raw: RawSignals): boolean {
  if (!raw.hrvBaseline30d || raw.hrvBaseline30d <= 0) return false;
  const sorted = [...(raw.hrvRecent ?? [])].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  let streak = 0;
  for (const s of sorted) {
    const dev = ((s.hrv - raw.hrvBaseline30d) / raw.hrvBaseline30d) * 100;
    if (dev <= SUSTAINED_DEFICIT_PCT) streak++;
    else break;
  }
  return streak >= SUSTAINED_DEFICIT_MIN_DAYS;
}

/**
 * Map patternSignals into the 20/50/70/80 band consumed by inner-readiness as
 * the replacement for the old C×C internal-readiness signal.
 * Rules from MRS v2 §3.1:
 *  - consecutive_high_load_days ≥ 3 → 20 (depleted pattern)
 *  - declining → 30
 *  - stable → 50
 *  - improving → 70
 *  - zero high-load AND improving → 80
 */
export function patternToScore(p: PatternSignals | null): number {
  if (!p) return 50;
  if (p.consecutive_high_load_days >= 3) return 20;
  if (p.consecutive_high_load_days === 0 && p.hrv_3day_trend === 'improving') return 80;
  switch (p.hrv_3day_trend) {
    case 'declining': return 30;
    case 'improving': return 70;
    case 'stable':    return 50;
    default:          return 50;
  }
}