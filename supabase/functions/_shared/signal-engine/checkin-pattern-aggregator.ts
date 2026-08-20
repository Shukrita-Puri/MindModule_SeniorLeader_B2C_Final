/**
 * checkin-pattern-aggregator.ts — SSOT for Mind check-in pattern aggregations.
 *
 * v3 contract:
 *  • Pure functions. No DB calls. Caller pre-fetches rows.
 *  • Powers both Insights "Performance Patterns" (via the rhythm edge
 *    function, future refactor) and Signal Pills v3 bracketed qualifiers
 *    (via compute-outer-readiness).
 *  • Same numeric primitives → identical streak/DoW numbers in both
 *    surfaces. If the two ever diverge it's a bug here, not in callers.
 *
 * Tier-driving rule (v3, MOMENT-ONLY):
 *  Qualifiers are DISPLAY-ONLY enrichment. They never change a pill's
 *  tier — today's value alone drives the tier. Bracketed text only adds
 *  perspective ("Clarity 4 (5-day peak)").
 */

// ── Shared types ───────────────────────────────────────────────────────
import { dayOfWeekFromIsoDate } from './day-kind-detector.ts';

export type MindDim = 'clarity' | 'emotion' | 'pressure' | 'regulation';

/** Last-7d (or longer) row from daily_checkins. Caller maps DB rows. */
export interface CheckinRow {
  checkin_date: string;            // 'YYYY-MM-DD'
  time_window?: 'morning' | 'afternoon' | 'evening' | null;
  clarity_level?: number | null;
  emotion_level?: number | null;
  pressure_level?: number | null;  // 1=composed … 5=under load
  regulation_level?: number | null;
}

/** Pre-fetched wearable_data row (last N days). */
export interface WearableRow {
  summary_date: string;            // 'YYYY-MM-DD'
  hrv?: number | null;
  resting_heart_rate?: number | null;
  sleep_score?: number | null;
  total_sleep_minutes?: number | null;
  sleep_efficiency?: number | null;
}

/** Compact qualifier returned per Mind dim. All fields nullable. */
export interface MindQualifier {
  /** today − avg of prior 3 calendar-day values (same dim). null if <3 priors. */
  delta3d: number | null;
  /** today − avg of prior same-day-of-week values (up to last 3). null if <2 priors. */
  vsDow: number | null;
  /**
   * Consecutive calendar-day streak (ending today) at the "positive" band.
   *   - clarity/emotion/regulation → value ≥ 4
   *   - pressure (inverted)         → value ≤ 2
   * 0 when today is not in the positive band.
   */
  peakStreak: number;
}

export interface WearableQualifier {
  hrv: {
    delta3d: number | null;
    vsBaselinePct: number | null;
    /** Consecutive recent days in the negative band (HRV ≤ baseline×0.9). null if <3. */
    streakLowDays: number | null;
    /** True if ≥2 of last 3 same-DoW values fell in the negative band. */
    dowLow: boolean;
  };
  sleep: {
    durationDelta7d: number | null;
    scoreVsBaseline: number | null;
    /** Consecutive recent days where sleep_score ≤ 60. null if <3. */
    streakLowDays: number | null;
    /** True if ≥2 of last 3 same-DoW sleep_scores fell ≤ 60. */
    dowLow: boolean;
  };
  sleep_efficiency: {
    /** today − avg(prior 7d) sleep_efficiency, in efficiency points. */
    delta7d: number | null;
    /** Consecutive recent days where sleep_efficiency ≤ 75. null if <3. */
    streakLowDays: number | null;
    /** True if ≥2 of last 3 same-DoW efficiency values fell ≤ 75. */
    dowLow: boolean;
  };
  rhr: { vsBaselinePct: number | null };
}

export interface PillQualifiers {
  clarity: MindQualifier;
  emotion: MindQualifier;
  pressure: MindQualifier;
  regulation: MindQualifier;
  hrv: WearableQualifier['hrv'];
  sleep: WearableQualifier['sleep'];
  sleep_efficiency: WearableQualifier['sleep_efficiency'];
  rhr: WearableQualifier['rhr'];
}

// ── Helpers ────────────────────────────────────────────────────────────

const DIM_FIELD: Record<MindDim, keyof CheckinRow> = {
  clarity: 'clarity_level',
  emotion: 'emotion_level',
  pressure: 'pressure_level',
  regulation: 'regulation_level',
};

function avg(nums: number[]): number | null {
  const v = nums.filter((n) => typeof n === 'number' && !Number.isNaN(n));
  if (v.length === 0) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function r1(n: number | null): number | null {
  return n == null ? null : Math.round(n * 10) / 10;
}

/**
 * Reduce a per-day series for one Mind dim: pick the latest non-null value
 * per `checkin_date`. Returns rows ordered newest → oldest.
 */
function dailyValues(rows: CheckinRow[], dim: MindDim): Array<{ date: string; value: number; dow: number }> {
  const field = DIM_FIELD[dim];
  const byDate = new Map<string, number>();
  // rows may be unsorted; keep first non-null per date (caller passes desc-by-date)
  for (const r of rows) {
    const v = (r as any)[field];
    if (r.checkin_date && typeof v === 'number' && !byDate.has(r.checkin_date)) {
      byDate.set(r.checkin_date, v);
    }
  }
  const out = [...byDate.entries()]
    .map(([date, value]) => ({ date, value, dow: dayOfWeekFromIsoDate(date) }))
    .sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

function mindDimQualifier(rows: CheckinRow[], dim: MindDim): MindQualifier {
  const series = dailyValues(rows, dim);
  if (series.length === 0) return { delta3d: null, vsDow: null, peakStreak: 0 };

  const today = series[0];
  const prior = series.slice(1);

  // delta3d
  const prior3 = prior.slice(0, 3).map((p) => p.value);
  const a3 = prior3.length >= 3 ? avg(prior3) : null;
  const delta3d = a3 == null ? null : r1(today.value - a3);

  // vsDow
  const sameDow = prior.filter((p) => p.dow === today.dow).slice(0, 3).map((p) => p.value);
  const aDow = sameDow.length >= 2 ? avg(sameDow) : null;
  const vsDow = aDow == null ? null : r1(today.value - aDow);

  // peakStreak — walk from today backwards on contiguous calendar dates
  const positive = (v: number) => (dim === 'pressure' ? v <= 2 : v >= 4);
  let streak = 0;
  if (positive(today.value)) {
    streak = 1;
    let cursor = today.date;
    for (let i = 1; i < series.length; i++) {
      const expectPrev = subDay(cursor);
      if (series[i].date === expectPrev && positive(series[i].value)) {
        streak++;
        cursor = expectPrev;
      } else {
        break;
      }
    }
  }

  return { delta3d, vsDow, peakStreak: streak };
}

function subDay(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function wearableQualifiers(
  rows: WearableRow[],
  baselines: { hrv?: number | null; rhr?: number | null; sleep?: number | null }
): WearableQualifier {
  const sorted = rows
    .filter((r) => !!r.summary_date)
    .slice()
    .sort((a, b) => b.summary_date.localeCompare(a.summary_date));

  const today = sorted[0];
  const prior = sorted.slice(1);
  const prior3 = prior.slice(0, 3);
  const prior7 = prior.slice(0, 7);

  // HRV: today − avg(prior 3); vs baseline %
  const hrvToday = today?.hrv ?? null;
  const hrvPrior3 = prior3.map((r) => r.hrv).filter((n): n is number => typeof n === 'number');
  const hrvA3 = hrvPrior3.length >= 3 ? avg(hrvPrior3) : null;
  const hrvDelta3d = hrvToday != null && hrvA3 != null ? Math.round(hrvToday - hrvA3) : null;
  const hrvVsBase = hrvToday != null && baselines.hrv != null && baselines.hrv > 0
    ? Math.round(((hrvToday - baselines.hrv) / baselines.hrv) * 100)
    : null;

  // Sleep: duration delta over prior 7 days; score vs baseline pts
  const sleepToday = today?.total_sleep_minutes ?? null;
  const sleepPrior7 = prior7.map((r) => r.total_sleep_minutes).filter((n): n is number => typeof n === 'number');
  const sleepA7 = sleepPrior7.length >= 3 ? avg(sleepPrior7) : null;
  const sleepDurationDelta7d = sleepToday != null && sleepA7 != null ? Math.round(sleepToday - sleepA7) : null;
  const scoreToday = today?.sleep_score ?? null;
  const scoreVsBase = scoreToday != null && baselines.sleep != null ? Math.round(scoreToday - baselines.sleep) : null;

  // RHR: vs baseline %
  const rhrToday = today?.resting_heart_rate ?? null;
  const rhrVsBase = rhrToday != null && baselines.rhr != null && baselines.rhr > 0
    ? Math.round(((rhrToday - baselines.rhr) / baselines.rhr) * 100)
    : null;

  // ── Streak / DoW enrichment (display-only) ────────────────────────────
  // Reuses the same band engine that powers Insights Performance Patterns
  // so the homepage pill brackets and Insights bullets cite the same
  // "5-day streak below baseline" / "Mondays trend low" numbers.
  const computeBaselines = {
    hrv: baselines.hrv ?? null,
    sleep_score: baselines.sleep ?? null,
    sleep_duration: null,
    sleep_efficiency: null,
  };
  const negStreak = (dim: WearableDim): number | null => {
    const series = buildWearableDailySeries(sorted as WearableRow[], dim, computeBaselines);
    if (series.length === 0) return null;
    let n = 0;
    for (const p of series) {
      if (p.negative) n++;
      else break;
    }
    return n >= 3 ? n : null;
  };
  const dowLowFlag = (dim: WearableDim): boolean => {
    const series = buildWearableDailySeries(sorted as WearableRow[], dim, computeBaselines);
    if (series.length === 0) return false;
    const todayDi = series[0].di;
    const sameDow = series.slice(1).filter((p) => p.di === todayDi).slice(0, 3);
    if (sameDow.length < 2) return false;
    return sameDow.filter((p) => p.negative).length >= 2;
  };

  const hrvStreak = negStreak('hrv');
  const hrvDow = dowLowFlag('hrv');
  const sleepStreak = negStreak('sleep_score');
  const sleepDow = dowLowFlag('sleep_score');
  const effStreak = negStreak('sleep_efficiency');
  const effDow = dowLowFlag('sleep_efficiency');

  // Sleep efficiency: today − avg(prior 7d)
  const effToday = today?.sleep_efficiency ?? null;
  const effPrior7 = prior7.map((r) => r.sleep_efficiency).filter((n): n is number => typeof n === 'number');
  const effA7 = effPrior7.length >= 3 ? avg(effPrior7) : null;
  const effDelta7d = effToday != null && effA7 != null ? Math.round(effToday - effA7) : null;

  return {
    hrv: { delta3d: hrvDelta3d, vsBaselinePct: hrvVsBase, streakLowDays: hrvStreak, dowLow: hrvDow },
    sleep: { durationDelta7d: sleepDurationDelta7d, scoreVsBaseline: scoreVsBase, streakLowDays: sleepStreak, dowLow: sleepDow },
    sleep_efficiency: { delta7d: effDelta7d, streakLowDays: effStreak, dowLow: effDow },
    rhr: { vsBaselinePct: rhrVsBase },
  };
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Build the compact qualifier bundle for Signal Pills v3.
 * Inputs are pre-fetched rows + optional wearable baselines.
 * Returns a fully-populated bundle (fields are nullable when gates fail).
 */
export function getPillQualifiers(
  checkinsLast14d: CheckinRow[],
  wearableLast14d: WearableRow[],
  baselines: { hrv?: number | null; rhr?: number | null; sleep?: number | null } = {}
): PillQualifiers {
  const wq = wearableQualifiers(wearableLast14d, baselines);
  return {
    clarity: mindDimQualifier(checkinsLast14d, 'clarity'),
    emotion: mindDimQualifier(checkinsLast14d, 'emotion'),
    pressure: mindDimQualifier(checkinsLast14d, 'pressure'),
    regulation: mindDimQualifier(checkinsLast14d, 'regulation'),
    hrv: wq.hrv,
    sleep: wq.sleep,
    sleep_efficiency: wq.sleep_efficiency,
    rhr: wq.rhr,
  };
}

// ── Dev-only coherence assertion ───────────────────────────────────────

export type PillTier = 'green' | 'amber' | 'red' | 'neutral';
export type CoherencePill = { key: string; tier: PillTier };

// ── Wearable rhythm series (for Insights Performance Patterns) ─────────
//
// These helpers convert a 30-day wearable_data history into the same
// `{ dateStr, di, tw, positive, negative }` shape that the rhythm edge
// function's `mineSeries` consumes for Mind dimensions. This means a single
// statistical engine drives DOW / consecutive-run findings across both
// check-in dims and wearable dims.
//
// Bands (positive = "good day", negative = "bad day"):
//   hrv               positive: value ≥ baseline           negative: value ≤ baseline × 0.90
//   sleep_score       positive: ≥ 75                       negative: ≤ 60
//   sleep_duration    positive: ≥ 420 min (7h)             negative: ≤ 360 min (6h)
//   sleep_efficiency  positive: ≥ 85                       negative: ≤ 75

// v4 additions (perform-best card):
//   rhr  (inverted)   positive: value ≤ baseline           negative: value ≥ baseline × 1.05
//   hr   (inverted)   positive: value ≤ baseline           negative: value ≥ baseline × 1.05
export type WearableDim =
  | 'hrv' | 'sleep_score' | 'sleep_duration' | 'sleep_efficiency' | 'rhr' | 'hr';

export interface WearableSeriesPoint {
  dateStr: string;
  di: number;                // 0=Mon … 6=Sun (rhythm-fn convention)
  tw: 0 | 1 | 2;             // always 0 — wearables write one row/night
  positive: boolean;
  negative: boolean;
  value: number;
}

export interface WearableBaselines {
  hrv?: number | null;
  sleep_score?: number | null;
  sleep_duration?: number | null;   // minutes
  sleep_efficiency?: number | null;
  rhr?: number | null;
  hr?: number | null;
}

function getDayIndex(dayOfWeek: number): number {
  // Match performance-rhythm-insights: 0=Mon … 6=Sun
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function valueForDim(row: WearableRow, dim: WearableDim): number | null {
  switch (dim) {
    case 'hrv':              return typeof row.hrv === 'number' ? row.hrv : null;
    case 'sleep_score':      return typeof row.sleep_score === 'number' ? row.sleep_score : null;
    case 'sleep_duration':   return typeof row.total_sleep_minutes === 'number' ? row.total_sleep_minutes : null;
    case 'sleep_efficiency': return typeof row.sleep_efficiency === 'number' ? row.sleep_efficiency : null;
    case 'rhr':              return typeof row.resting_heart_rate === 'number' ? row.resting_heart_rate : null;
    case 'hr':               return typeof row.heart_rate === 'number' ? row.heart_rate : null;
  }
}

function classify(value: number, dim: WearableDim, baselines: WearableBaselines): { positive: boolean; negative: boolean } {
  switch (dim) {
    case 'hrv': {
      const base = baselines.hrv ?? null;
      if (base == null || base <= 0) return { positive: false, negative: false };
      return { positive: value >= base, negative: value <= base * 0.9 };
    }
    case 'sleep_score':
      return { positive: value >= 75, negative: value <= 60 };
    case 'sleep_duration':
      return { positive: value >= 420, negative: value <= 360 };
    case 'sleep_efficiency':
      return { positive: value >= 85, negative: value <= 75 };
    // Inverted dims — lower is better ("well-recovered").
    case 'rhr': {
      const base = baselines.rhr ?? null;
      if (base == null || base <= 0) return { positive: false, negative: false };
      return { positive: value <= base, negative: value >= base * 1.05 };
    }
    case 'hr': {
      const base = baselines.hr ?? null;
      if (base == null || base <= 0) return { positive: false, negative: false };
      return { positive: value <= base, negative: value >= base * 1.05 };
    }
  }
}

 * Build a per-day series for one wearable dim. Caller passes the last 30d
 * of wearable_data rows (any order). Output is one entry per `summary_date`
 * with a non-null value for the requested dim.
 */
export function buildWearableDailySeries(
  rows: WearableRow[],
  dim: WearableDim,
  baselines: WearableBaselines,
): WearableSeriesPoint[] {
  const out: WearableSeriesPoint[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r?.summary_date || seen.has(r.summary_date)) continue;
    const v = valueForDim(r, dim);
    if (v == null) continue;
    seen.add(r.summary_date);
    const { positive, negative } = classify(v, dim, baselines);
    out.push({
      dateStr: r.summary_date,
      di: getDayIndex(dayOfWeekFromIsoDate(r.summary_date)),
      tw: 0,
      positive,
      negative,
      value: v,
    });
  }
  return out;
}

/** Compute simple mean baselines for any wearable dim from a row set. */
export function computeWearableBaselines(rows: WearableRow[]): WearableBaselines {
  const collect = (pick: (r: WearableRow) => number | null | undefined) => {
    const vs = rows.map(pick).filter((n): n is number => typeof n === 'number');
    if (vs.length === 0) return null;
    return vs.reduce((a, b) => a + b, 0) / vs.length;
  };
  return {
    hrv: collect((r) => r.hrv),
    sleep_score: collect((r) => r.sleep_score),
    sleep_duration: collect((r) => r.total_sleep_minutes),
    sleep_efficiency: collect((r) => r.sleep_efficiency),
  };
}

/**
 * MRS-vs-pills coherence guard (dev-only).
 *  • MRS = Depleted but no pill is RED → downgrade weakest AMBER → RED.
 *  • MRS = Optimal but a pill is RED → upgrade RED → AMBER.
 * Returns the (possibly mutated) pills array + a warning string when a
 * correction fired (caller logs only in non-prod).
 *
 * v2 — also returns a structured `adjustments` array so callers can
 * surface the discrepancy on the wire (the previous warning string is
 * kept for backwards compat with consumers that only logged it).
 */
export interface CoherenceAdjustment {
  pill: string;
  from: 'green' | 'amber' | 'red' | 'neutral';
  to:   'green' | 'amber' | 'red' | 'neutral';
  reason:
    | 'mrs_depleted_no_red'
    | 'mrs_optimal_with_red';
}

export function assertPillCoherence(
  mrsTier: string | null | undefined,
  pills: CoherencePill[]
): {
  pills: CoherencePill[];
  warning: string | null;
  inSync: boolean;
  adjustments: CoherenceAdjustment[];
} {
  if (!mrsTier || pills.length === 0) {
    return { pills, warning: null, inSync: true, adjustments: [] };
  }
  const tier = String(mrsTier).toLowerCase();
  const out = pills.map((p) => ({ ...p }));
  let warning: string | null = null;
  const adjustments: CoherenceAdjustment[] = [];

  const reds = out.filter((p) => p.tier === 'red');
  const ambers = out.filter((p) => p.tier === 'amber');

  if (tier === 'depleted' && reds.length === 0) {
    const target = ambers[0] ?? out.find((p) => p.tier !== 'neutral');
    if (target) {
      warning = `coherence_fix: MRS=depleted but no RED pill — escalated ${target.key} (${target.tier}→red)`;
      adjustments.push({
        pill: String(target.key),
        from: target.tier as CoherenceAdjustment['from'],
        to: 'red',
        reason: 'mrs_depleted_no_red',
      });
      target.tier = 'red';
    }
  } else if (tier === 'optimal' && reds.length > 0) {
    warning = `coherence_fix: MRS=optimal with RED pills — downgraded ${reds.map((r) => r.key).join(',')} (red→amber)`;
    for (const r of reds) {
      adjustments.push({
        pill: String(r.key),
        from: 'red',
        to: 'amber',
        reason: 'mrs_optimal_with_red',
      });
      r.tier = 'amber';
    }
  }

  return {
    pills: out,
    warning,
    inSync: adjustments.length === 0,
    adjustments,
  };
}
