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
  hrv: { delta3d: number | null; vsBaselinePct: number | null };
  sleep: { durationDelta7d: number | null; scoreVsBaseline: number | null };
  rhr: { vsBaselinePct: number | null };
}

export interface PillQualifiers {
  clarity: MindQualifier;
  emotion: MindQualifier;
  pressure: MindQualifier;
  regulation: MindQualifier;
  hrv: WearableQualifier['hrv'];
  sleep: WearableQualifier['sleep'];
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
    .map(([date, value]) => ({ date, value, dow: new Date(date + 'T00:00:00Z').getUTCDay() }))
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

  return {
    hrv: { delta3d: hrvDelta3d, vsBaselinePct: hrvVsBase },
    sleep: { durationDelta7d: sleepDurationDelta7d, scoreVsBaseline: scoreVsBase },
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
    rhr: wq.rhr,
  };
}

// ── Dev-only coherence assertion ───────────────────────────────────────

export type PillTier = 'green' | 'amber' | 'red' | 'neutral';
export type CoherencePill = { key: string; tier: PillTier };

/**
 * MRS-vs-pills coherence guard (dev-only).
 *  • MRS = Depleted but no pill is RED → downgrade weakest AMBER → RED.
 *  • MRS = Optimal but a pill is RED → upgrade RED → AMBER.
 * Returns the (possibly mutated) pills array + a warning string when a
 * correction fired (caller logs only in non-prod).
 */
export function assertPillCoherence(
  mrsTier: string | null | undefined,
  pills: CoherencePill[]
): { pills: CoherencePill[]; warning: string | null } {
  if (!mrsTier || pills.length === 0) return { pills, warning: null };
  const tier = String(mrsTier).toLowerCase();
  const out = pills.map((p) => ({ ...p }));
  let warning: string | null = null;

  const reds = out.filter((p) => p.tier === 'red');
  const ambers = out.filter((p) => p.tier === 'amber');

  if (tier === 'depleted' && reds.length === 0) {
    const target = ambers[0] ?? out.find((p) => p.tier !== 'neutral');
    if (target) {
      warning = `coherence_fix: MRS=depleted but no RED pill — escalated ${target.key} (${target.tier}→red)`;
      target.tier = 'red';
    }
  } else if (tier === 'optimal' && reds.length > 0) {
    warning = `coherence_fix: MRS=optimal with RED pills — downgraded ${reds.map((r) => r.key).join(',')} (red→amber)`;
    for (const r of reds) r.tier = 'amber';
  }

  return { pills: out, warning };
}