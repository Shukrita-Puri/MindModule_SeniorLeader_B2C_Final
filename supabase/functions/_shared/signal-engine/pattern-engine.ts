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
import { dayOfWeekFromIsoDate } from './day-kind-detector.ts';

const HRV_TREND_BAND_PCT = 5;       // ±5% defines improving / declining
const SUSTAINED_DEFICIT_PCT = -20;  // > 20% below baseline
const SUSTAINED_DEFICIT_MIN_DAYS = 2;

// Sustained-deficit GRADED read (Resilience pill only). Same signal as the
// boolean flag, computed with a shorter, gap-tolerant window so it can
// actually produce a value on an intermittently-worn ring.
const DEFICIT_SEVERITY_BASELINE_DAYS = 14;
const DEFICIT_SEVERITY_LOOKBACK_DAYS = 5;
const DEFICIT_SEVERITY_MAX_SAMPLES = 3;
const DEFICIT_SEVERITY_MIN_SAMPLES = 2;
const DEFICIT_SEVERITY_RED_PCT = -15;
const DEFICIT_SEVERITY_AMBER_PCT = -7;

// MRS v2 §3.5 — Resilience co-occurrence thresholds.
const COOCCURRENCE_HRV_DEFICIT_PCT = -10; // HRV ≤ −10% vs 30-day baseline
const COOCCURRENCE_WINDOW_DAYS = 7;

// MRS v2 §3.5 — RHR 3-day trend band. Match HRV trend treatment for
// symmetry (±5% defines a meaningful 3-day move).
const RHR_TREND_BAND_PCT = 5;

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
  const todayDow =
    raw.hrvRecent[0]?.date
      ? dayOfWeekFromIsoDate(raw.hrvRecent[0].date)
      : raw.dowHistory.find((r) => typeof r.date === 'string' && r.date)?.date
      ? dayOfWeekFromIsoDate(
        raw.dowHistory.find((r) => typeof r.date === 'string' && r.date)!.date!,
      )
      : raw.dowHistory[0]?.dow ?? new Date().getUTCDay();
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

  // ── E. hrv_low_high_demand_cooccurrence_7d ────────────────────────
  // Resilience-Capacity primary signal: how often the body is under-
  // baseline AND the calendar is hammering, joined day-by-day over the
  // trailing week. See computeHrvLoadCooccurrence for full contract.
  const hrv_low_high_demand_cooccurrence_7d = computeHrvLoadCooccurrence(raw);

  return {
    hrv_3day_trend,
    consecutive_high_load_days,
    dow_historical_pattern: {
      typical_hrv_for_dow,
      typical_load_for_dow,
      samples: dowRows.length,
    },
    sustained_deficit_flag,
    hrv_low_high_demand_cooccurrence_7d,
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
 * MRS v2 §3.5 — Resilience co-occurrence detector.
 *
 * Joins HRV samples (`raw.hrvRecent`) and per-day load tier
 * (`raw.dowHistory` entries that include `date`) by ISO date over the
 * trailing `days` window. Counts the days where:
 *   - HRV deviation vs `raw.hrvBaseline30d` is ≤ COOCCURRENCE_HRV_DEFICIT_PCT
 *     (default −10%), AND
 *   - calendar load tier === 'high'.
 *
 * Returns:
 *   - `cooccurrence_count`  — raw count of matching days
 *   - `days_observed`       — days in the window with BOTH an HRV value
 *                              and a load tier (denominator of the ratio)
 *   - `cooccurrence_ratio`  — count / days_observed, or null when
 *                              days_observed === 0
 *
 * Pure function — null-safe and never throws. Coach inputs are
 * intentionally absent (coach feature suppressed; this is a
 * wearable-pattern correlation only).
 */
export function computeHrvLoadCooccurrence(
  raw: RawSignals,
  days: number = COOCCURRENCE_WINDOW_DAYS,
): { cooccurrence_count: number; cooccurrence_ratio: number | null; days_observed: number } {
  const empty = { cooccurrence_count: 0, cooccurrence_ratio: null, days_observed: 0 };
  const baseline = raw.hrvBaseline30d;
  if (!baseline || baseline <= 0) return empty;

  // Build a date → HRV map from hrvRecent (most-recent-first; trim to window).
  const hrvByDate = new Map<string, number>();
  for (const s of raw.hrvRecent ?? []) {
    if (s.date && Number.isFinite(s.hrv)) hrvByDate.set(s.date, s.hrv);
  }

  // Build a date → load map from dowHistory (date field is optional).
  const loadByDate = new Map<string, 'low' | 'medium' | 'high'>();
  for (const r of raw.dowHistory ?? []) {
    if (r.date && r.load) loadByDate.set(r.date, r.load);
  }

  // Window is the most recent `days` dates we have HRV for. We anchor on
  // HRV because dowHistory may be sparse (calendar-only days).
  const sortedHrvDates = [...hrvByDate.keys()].sort((a, b) => (a < b ? 1 : -1));
  const windowDates = sortedHrvDates.slice(0, days);

  let cooccurrence_count = 0;
  let days_observed = 0;
  for (const date of windowDates) {
    const hrv = hrvByDate.get(date);
    const load = loadByDate.get(date);
    if (hrv == null || load == null) continue;
    days_observed++;
    const dev = ((hrv - baseline) / baseline) * 100;
    if (dev <= COOCCURRENCE_HRV_DEFICIT_PCT && load === 'high') {
      cooccurrence_count++;
    }
  }

  return {
    cooccurrence_count,
    days_observed,
    cooccurrence_ratio: days_observed > 0 ? cooccurrence_count / days_observed : null,
  };
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
export function patternToScore(p: PatternSignals | null): number | null {
  if (!p) return null;
  if (p.consecutive_high_load_days >= 3) return 20;
  if (p.consecutive_high_load_days === 0 && p.hrv_3day_trend === 'improving') return 80;
  switch (p.hrv_3day_trend) {
    case 'declining': return 30;
    case 'improving': return 70;
    case 'stable':    return 50;
    default:          return null;
  }
}

/**
 * MRS v2 §3.5 — RHR 3-day trend classifier (Physical Reserves input).
 *
 * Compares today's RHR vs the value ~3 days back. RHR semantics are
 * inverted from HRV — *declining* RHR is the good signal (parasympathetic
 * recovery), *rising* RHR is the warning.
 *
 * Returns:
 *   - 'declining' — today ≤ −5% vs 3d ago  (recovery)
 *   - 'rising'    — today ≥ +5% vs 3d ago  (load accumulating)
 *   - 'stable'    — within ±5%
 *   - 'unknown'   — insufficient data
 *
 * Input shape mirrors the wearable trail used elsewhere — date + value.
 * Pure / null-safe / never throws.
 */
export function computeRhr3DayTrend(
  samples: Array<{ date: string; rhr: number | null | undefined }>,
): 'declining' | 'stable' | 'rising' | 'unknown' {
  if (!samples || samples.length === 0) return 'unknown';
  const valid = samples
    .filter((s) => s && s.date && s.rhr != null && Number.isFinite(Number(s.rhr)) && Number(s.rhr) > 0)
    .map((s) => ({ date: s.date, rhr: Number(s.rhr) }))
    .sort((a, b) => (new Date(b.date).getTime() - new Date(a.date).getTime()));
  if (valid.length === 0) return 'unknown';
  const today = valid[0]?.rhr;
  const ref = valid[3]?.rhr ?? valid[valid.length - 1]?.rhr;
  if (today == null || ref == null || ref <= 0) return 'unknown';
  const pct = ((today - ref) / ref) * 100;
  if (pct <= -RHR_TREND_BAND_PCT) return 'declining';
  if (pct >= RHR_TREND_BAND_PCT) return 'rising';
  return 'stable';
}
