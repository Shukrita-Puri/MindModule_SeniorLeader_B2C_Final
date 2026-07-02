// MRS v2 — golden tests for pattern-engine.
// Covers the 3-day HRV trend, consecutive-high-load streak, day-of-week
// mode, and sustained-deficit edge cases.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildPatternSignals,
  computeHrvLoadCooccurrence,
  computeRhr3DayTrend,
  patternToScore,
} from './pattern-engine.ts';
import type { RawSignals } from './types.ts';

function raw(p: Partial<RawSignals> = {}): RawSignals {
  return {
    hrvToday: null,
    hrvBaseline30d: null,
    hrvRecent: [],
    loadLast3Days: [],
    dowHistory: [],
    ...p,
  };
}

Deno.test('pattern-engine: missing HRV → trend=unknown, no throw', () => {
  const out = buildPatternSignals(raw());
  assertEquals(out.hrv_3day_trend, 'unknown');
  assertEquals(out.sustained_deficit_flag, false);
  assertEquals(out.consecutive_high_load_days, 0);
});

Deno.test('pattern-engine: HRV ≥+5% vs 3d-ago → improving', () => {
  const out = buildPatternSignals(
    raw({
      hrvRecent: [
        { date: '2026-05-30', hrv: 60 },
        { date: '2026-05-29', hrv: 58 },
        { date: '2026-05-28', hrv: 57 },
        { date: '2026-05-27', hrv: 50 }, // 3 days ago
      ],
    }),
  );
  assertEquals(out.hrv_3day_trend, 'improving');
});

Deno.test('pattern-engine: HRV ≤−5% vs 3d-ago → declining', () => {
  const out = buildPatternSignals(
    raw({
      hrvRecent: [
        { date: '2026-05-30', hrv: 45 },
        { date: '2026-05-29', hrv: 48 },
        { date: '2026-05-28', hrv: 50 },
        { date: '2026-05-27', hrv: 60 },
      ],
    }),
  );
  assertEquals(out.hrv_3day_trend, 'declining');
});

Deno.test('pattern-engine: HRV within ±5% band → stable', () => {
  const out = buildPatternSignals(
    raw({
      hrvRecent: [
        { date: '2026-05-30', hrv: 51 },
        { date: '2026-05-29', hrv: 50 },
        { date: '2026-05-28', hrv: 50 },
        { date: '2026-05-27', hrv: 50 },
      ],
    }),
  );
  assertEquals(out.hrv_3day_trend, 'stable');
});

Deno.test('pattern-engine: consecutive-high-load counts only trailing streak', () => {
  // [high, low, high, high] → streak of 2 (from the end).
  const out = buildPatternSignals(raw({ loadLast3Days: ['low', 'high', 'high'] }));
  assertEquals(out.consecutive_high_load_days, 2);
});

Deno.test('pattern-engine: all-high 3-day window → streak=3', () => {
  const out = buildPatternSignals(raw({ loadLast3Days: ['high', 'high', 'high'] }));
  assertEquals(out.consecutive_high_load_days, 3);
});

Deno.test('pattern-engine: streak breaks at first non-high', () => {
  const out = buildPatternSignals(raw({ loadLast3Days: ['high', 'high', 'medium'] }));
  assertEquals(out.consecutive_high_load_days, 0);
});

Deno.test('pattern-engine: DOW mode picks most-frequent load', () => {
  const todayDow = new Date().getUTCDay();
  const out = buildPatternSignals(
    raw({
      dowHistory: [
        { dow: todayDow, hrv: 50, load: 'high' },
        { dow: todayDow, hrv: 60, load: 'high' },
        { dow: todayDow, hrv: 70, load: 'medium' },
        { dow: (todayDow + 1) % 7, hrv: 30, load: 'low' }, // ignored
      ],
    }),
  );
  assertEquals(out.dow_historical_pattern.typical_load_for_dow, 'high');
  assertEquals(out.dow_historical_pattern.typical_hrv_for_dow, 60); // avg(50,60,70)
  assertEquals(out.dow_historical_pattern.samples, 3);
});

Deno.test('pattern-engine: DOW with no samples → null fields, samples=0', () => {
  const out = buildPatternSignals(raw());
  assertEquals(out.dow_historical_pattern.typical_load_for_dow, null);
  assertEquals(out.dow_historical_pattern.typical_hrv_for_dow, null);
  assertEquals(out.dow_historical_pattern.samples, 0);
});

Deno.test('pattern-engine: sustained_deficit_flag fires on ≥2 consecutive >20% below', () => {
  const out = buildPatternSignals(
    raw({
      hrvBaseline30d: 100,
      hrvRecent: [
        { date: '2026-05-30', hrv: 70 }, // -30%
        { date: '2026-05-29', hrv: 75 }, // -25%
        { date: '2026-05-28', hrv: 95 }, // streak-breaker
      ],
    }),
  );
  assertEquals(out.sustained_deficit_flag, true);
});

Deno.test('pattern-engine: sustained_deficit_flag stays false at 1 day', () => {
  const out = buildPatternSignals(
    raw({
      hrvBaseline30d: 100,
      hrvRecent: [
        { date: '2026-05-30', hrv: 70 }, // -30%
        { date: '2026-05-29', hrv: 95 }, // breaks streak
      ],
    }),
  );
  assertEquals(out.sustained_deficit_flag, false);
});

Deno.test('pattern-engine: zero baseline never throws → false', () => {
  const out = buildPatternSignals(
    raw({ hrvBaseline30d: 0, hrvRecent: [{ date: '2026-05-30', hrv: 70 }] }),
  );
  assertEquals(out.sustained_deficit_flag, false);
});

Deno.test('patternToScore: depleted (3+ high load) → 20', () => {
  assertEquals(
    patternToScore({
      hrv_3day_trend: 'improving',
      consecutive_high_load_days: 3,
      dow_historical_pattern: { typical_hrv_for_dow: null, typical_load_for_dow: null, samples: 0 },
      sustained_deficit_flag: false,
      hrv_low_high_demand_cooccurrence_7d: { cooccurrence_count: 0, cooccurrence_ratio: null, days_observed: 0 },
    }),
    20,
  );
});

Deno.test('patternToScore: improving + zero high load → 80', () => {
  assertEquals(
    patternToScore({
      hrv_3day_trend: 'improving',
      consecutive_high_load_days: 0,
      dow_historical_pattern: { typical_hrv_for_dow: null, typical_load_for_dow: null, samples: 0 },
      sustained_deficit_flag: false,
      hrv_low_high_demand_cooccurrence_7d: { cooccurrence_count: 0, cooccurrence_ratio: null, days_observed: 0 },
    }),
    80,
  );
});

Deno.test('patternToScore: declining → 30, stable → 50, improving → 70, unknown → 50', () => {
  const base = {
    consecutive_high_load_days: 1,
    dow_historical_pattern: { typical_hrv_for_dow: null, typical_load_for_dow: null, samples: 0 },
    sustained_deficit_flag: false,
    hrv_low_high_demand_cooccurrence_7d: { cooccurrence_count: 0, cooccurrence_ratio: null, days_observed: 0 },
  };
  assertEquals(patternToScore({ ...base, hrv_3day_trend: 'declining' }), 30);
  assertEquals(patternToScore({ ...base, hrv_3day_trend: 'stable' }), 50);
  assertEquals(patternToScore({ ...base, hrv_3day_trend: 'improving' }), 70);
  assertEquals(patternToScore({ ...base, hrv_3day_trend: 'unknown' }), null);
});

Deno.test('patternToScore: null input → unavailable', () => {
  assertEquals(patternToScore(null), null);
});

// ── computeHrvLoadCooccurrence ─────────────────────────────────────────

Deno.test('cooccurrence: no baseline → all-zero, ratio null', () => {
  const out = computeHrvLoadCooccurrence(raw({
    hrvRecent: [{ date: '2026-05-30', hrv: 40 }],
    dowHistory: [{ date: '2026-05-30', dow: 6, hrv: 40, load: 'high' }],
  }));
  assertEquals(out, { cooccurrence_count: 0, cooccurrence_ratio: null, days_observed: 0 });
});

Deno.test('cooccurrence: HRV ≤ −10% AND load=high counts the day', () => {
  const out = computeHrvLoadCooccurrence(raw({
    hrvBaseline30d: 60,
    hrvRecent: [
      { date: '2026-05-30', hrv: 50 }, // −16.7% → deficit
      { date: '2026-05-29', hrv: 55 }, // −8.3%  → not deficit
      { date: '2026-05-28', hrv: 48 }, // −20%   → deficit
    ],
    dowHistory: [
      { date: '2026-05-30', dow: 6, hrv: 50, load: 'high' },
      { date: '2026-05-29', dow: 5, hrv: 55, load: 'high' },
      { date: '2026-05-28', dow: 4, hrv: 48, load: 'medium' },
    ],
  }));
  // Day 30: deficit + high → count.
  // Day 29: not deficit → skip.
  // Day 28: deficit but load=medium → skip.
  assertEquals(out.cooccurrence_count, 1);
  assertEquals(out.days_observed, 3);
  assertEquals(out.cooccurrence_ratio, 1 / 3);
});

Deno.test('cooccurrence: load missing for a date → not counted in denominator', () => {
  const out = computeHrvLoadCooccurrence(raw({
    hrvBaseline30d: 60,
    hrvRecent: [
      { date: '2026-05-30', hrv: 40 },
      { date: '2026-05-29', hrv: 40 },
    ],
    dowHistory: [
      { date: '2026-05-30', dow: 6, hrv: 40, load: 'high' },
      // 2026-05-29 has no load entry — skipped.
    ],
  }));
  assertEquals(out.cooccurrence_count, 1);
  assertEquals(out.days_observed, 1);
  assertEquals(out.cooccurrence_ratio, 1);
});

Deno.test('cooccurrence: window cap respected (default 7 days)', () => {
  const dates = Array.from({ length: 10 }, (_, i) => `2026-05-${String(31 - i).padStart(2, '0')}`);
  const out = computeHrvLoadCooccurrence(raw({
    hrvBaseline30d: 60,
    hrvRecent: dates.map((d) => ({ date: d, hrv: 40 })),
    dowHistory: dates.map((d) => ({ date: d, dow: 0, hrv: 40, load: 'high' as const })),
  }));
  // 10 candidate days but window=7.
  assertEquals(out.days_observed, 7);
  assertEquals(out.cooccurrence_count, 7);
});

Deno.test('cooccurrence: buildPatternSignals exposes 7-day cooccurrence', () => {
  const out = buildPatternSignals(raw({
    hrvBaseline30d: 60,
    hrvRecent: [{ date: '2026-05-30', hrv: 45 }],
    dowHistory: [{ date: '2026-05-30', dow: 6, hrv: 45, load: 'high' }],
  }));
  assertEquals(out.hrv_low_high_demand_cooccurrence_7d.cooccurrence_count, 1);
  assertEquals(out.hrv_low_high_demand_cooccurrence_7d.days_observed, 1);
});
// ─── RHR 3-day trend ────────────────────────────────────────────────────

Deno.test('rhr-trend: empty → unknown', () => {
  assertEquals(computeRhr3DayTrend([]), 'unknown');
});

Deno.test('rhr-trend: today ≤ −5% vs 3d ago → declining (recovery)', () => {
  // today 55, 3d-ago 60 → −8.3% → declining.
  assertEquals(
    computeRhr3DayTrend([
      { date: '2026-01-04', rhr: 55 },
      { date: '2026-01-03', rhr: 57 },
      { date: '2026-01-02', rhr: 58 },
      { date: '2026-01-01', rhr: 60 },
    ]),
    'declining',
  );
});

Deno.test('rhr-trend: today ≥ +5% vs 3d ago → rising (load)', () => {
  // today 65, 3d-ago 60 → +8.3% → rising.
  assertEquals(
    computeRhr3DayTrend([
      { date: '2026-01-04', rhr: 65 },
      { date: '2026-01-03', rhr: 62 },
      { date: '2026-01-02', rhr: 61 },
      { date: '2026-01-01', rhr: 60 },
    ]),
    'rising',
  );
});

Deno.test('rhr-trend: within ±5% → stable', () => {
  assertEquals(
    computeRhr3DayTrend([
      { date: '2026-01-04', rhr: 61 },
      { date: '2026-01-03', rhr: 60 },
      { date: '2026-01-02', rhr: 60 },
      { date: '2026-01-01', rhr: 60 },
    ]),
    'stable',
  );
});

Deno.test('rhr-trend: filters nulls/zeros without throwing', () => {
  // All-invalid → unknown.
  assertEquals(
    computeRhr3DayTrend([
      { date: '2026-01-04', rhr: null },
      { date: '2026-01-03', rhr: 0 },
    ]),
    'unknown',
  );
  // Mixed invalid + 1 valid sample → falls back to single-sample comparison
  // against itself → stable (no throw).
  assertEquals(
    computeRhr3DayTrend([
      { date: '2026-01-04', rhr: null },
      { date: '2026-01-03', rhr: 0 },
      { date: '2026-01-02', rhr: 60 },
    ]),
    'stable',
  );
});
