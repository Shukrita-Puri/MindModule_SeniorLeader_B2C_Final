import { describe, it, expect } from 'vitest';
import {
  buildSentence, buildSection, confidenceTier, isPositiveFinding,
  buildLiftLines, liftTier,
  type RhythmFinding, type PerformanceLiftPayload,
} from '../patternSentences';

type StatsPatch = Partial<NonNullable<RhythmFinding['stats']>>;
const mk = (over: Omit<Partial<RhythmFinding>, 'stats'> & { stats?: StatsPatch }): RhythmFinding => ({
  kind: 'peak-day',
  dimension: 'clarity',
  text: 'legacy',
  longText: 'legacy long',
  confidence: 0.6,
  observations: 6,
  priorityScore: 1,
  ...over,
  stats: {
    n: 6, dates: [], source: 'check-in', polarity: 'high',
    day: 1, comparisonDay: 4, bestPct: 78, comparePct: 45, gapPp: 33,
    ...(over.stats as object),
  },
} as RhythmFinding);

describe('confidence guard', () => {
  it('tiers by observation count', () => {
    expect(confidenceTier(2)).toBe('insufficient');
    expect(confidenceTier(3)).toBe('emerging');
    expect(confidenceTier(5)).toBe('strong');
  });

  it('drops findings below 3 observations', () => {
    expect(buildSentence(mk({ stats: { n: 2 } }))).toBeNull();
  });

  it('drops findings whose gap is too small', () => {
    expect(buildSentence(mk({ stats: { n: 8, gapPp: 10 } }))).toBeNull();
  });

  it('requires n>=6 and 30pp for a strong peak-day', () => {
    expect(buildSentence(mk({ stats: { n: 6, gapPp: 33 } }))?.tier).toBe('strong');
    expect(buildSentence(mk({ stats: { n: 5, gapPp: 33 } }))?.tier).toBe('emerging');
  });

  it('hedges emerging findings', () => {
    const r = buildSentence(mk({ stats: { n: 3, gapPp: 22 } }));
    expect(r?.tier).toBe('emerging');
    expect(r?.text.startsWith('Early signal —')).toBe(true);
    expect(r?.text).toContain('Pattern still forming');
  });

  it('never prints observation counts in user copy', () => {
    expect(buildSentence(mk({}))?.text).not.toContain('n=');
  });
});

describe('card scope', () => {
  it('keeps peaks, drops troughs', () => {
    expect(isPositiveFinding(mk({}))).toBe(true);
    expect(isPositiveFinding(mk({ kind: 'low-day' }))).toBe(false);
    expect(isPositiveFinding(mk({ kind: 'consecutive-neg' }))).toBe(false);
    expect(buildSentence(mk({ kind: 'low-day' }))).toBeNull();
  });
});

describe('polarity', () => {
  it('uses composed wording for inverted pressure', () => {
    const r = buildSentence(mk({ dimension: 'pressure', stats: { polarity: 'low' } }));
    expect(r?.text).toContain('most composed');
  });

  it('says lowest for inverted wearable dims', () => {
    const r = buildSentence(mk({ dimension: 'rhr', stats: { source: 'wearable', polarity: 'low' } }));
    expect(r?.text).toContain('lowest');
  });

  it('says highest for HRV', () => {
    const r = buildSentence(mk({ dimension: 'hrv', stats: { source: 'wearable', polarity: 'high' } }));
    expect(r?.text).toContain('highest');
  });
});

describe('templates', () => {
  it('renders a day peak with comparison', () => {
    expect(buildSentence(mk({}))?.text).toBe('Tuesdays run your sharpest clarity — 78% vs 45% on Fridays.');
  });

  it('renders a window peak', () => {
    const r = buildSentence(mk({ kind: 'peak-window', stats: { window: 0, comparisonWindow: 2, day: undefined } }));
    expect(r?.text).toContain('Mornings are your sharpest clarity window');
  });

  it('renders a cell peak', () => {
    const r = buildSentence(mk({ kind: 'cell-peak', stats: { day: 1, window: 0 } }));
    expect(r?.text).toContain('Tuesday mornings are your sharpest clarity window');
  });

  it('renders a positive run', () => {
    const r = buildSentence(mk({ kind: 'consecutive-pos', stats: { runLength: 4, n: 4 } }));
    expect(r?.text).toContain('4 Tuesdays in a row');
  });
});

describe('section assembly', () => {
  it('caps at 3, one per dimension, strong before emerging', () => {
    const findings = [
      mk({ dimension: 'clarity', stats: { n: 3, gapPp: 25 }, priorityScore: 5 }),
      mk({ dimension: 'emotion', stats: { n: 8 }, priorityScore: 1 }),
      mk({ dimension: 'regulation', stats: { n: 6 }, priorityScore: 2 }),
      mk({ dimension: 'pressure', stats: { n: 6, polarity: 'low' }, priorityScore: 0.5 }),
      mk({ dimension: 'clarity', kind: 'cell-peak', stats: { n: 9, day: 1, window: 0 }, priorityScore: 9 }),
    ];
    const out = buildSection(findings, 'check-in');
    expect(out).toHaveLength(3);
    expect(out[0].dimension).toBe('clarity');
    expect(out[0].tier).toBe('strong');
    expect(new Set(out.map((o) => o.dimension)).size).toBe(3);
  });

  it('separates wearable scope', () => {
    const findings = [
      mk({ dimension: 'clarity', stats: { n: 6 } }),
      mk({ dimension: 'hrv', stats: { n: 6, source: 'wearable' } }),
    ];
    expect(buildSection(findings, 'wearable').map((r) => r.dimension)).toEqual(['hrv']);
  });
});

describe('wearable time-of-day guard', () => {
  it('never claims a time-of-day window for nightly wearable data', () => {
    const r = buildSentence(mk({
      dimension: 'hr', kind: 'cell-peak',
      stats: { source: 'wearable', polarity: 'low', day: 4, window: 0, n: 4, bestPct: 100, gapPp: 40 },
    }));
    expect(r?.text).not.toContain('morning');
    expect(r?.text).toContain('Fridays');
    expect(r?.text).toContain('nights');
  });

  it('drops wearable peak-window findings entirely', () => {
    expect(buildSentence(mk({
      dimension: 'hrv', kind: 'peak-window',
      stats: { source: 'wearable', polarity: 'high', window: 0, n: 6 },
    }))).toBeNull();
  });
});

describe('absolute peak floor', () => {
  it('drops sub-50% peaks unless the gap is wide, then hedges them', () => {
    expect(buildSentence(mk({ stats: { n: 6, bestPct: 33, comparePct: 22, gapPp: 11 } }))).toBeNull();
    expect(buildSentence(mk({ stats: { n: 8, bestPct: 33, comparePct: 0, gapPp: 33 } }))?.tier).toBe('emerging');
    expect(buildSentence(mk({ stats: { n: 6, bestPct: 60, comparePct: 20 } }))).not.toBeNull();
  });
});

describe('tab-aware Section B ranking', () => {
  const wearable = (dimension: any, priorityScore: number) =>
    mk({ dimension, priorityScore, stats: { n: 8, gapPp: 33, bestPct: 80, comparePct: 47, source: 'wearable', polarity: 'high', day: 2 } });

  it('prefers the active tab affinity dimensions but excludes nothing', () => {
    const findings = [wearable('rhr', 1), wearable('sleep_score', 1), wearable('hrv', 1)];
    const clarity = buildSection(findings, 'wearable', 3, 'dimension', 'clarity');
    const pressure = buildSection(findings, 'wearable', 3, 'dimension', 'pressure');
    expect(clarity[0].dimension).toBe('sleep_score');
    expect(pressure[0].dimension).toBe('rhr');
    expect(clarity).toHaveLength(3);
    expect(pressure).toHaveLength(3);
  });
});

describe('pipeline B lift lines', () => {
  const lift: PerformanceLiftPayload = {
    sleep_to_peak: { deltaPct: 18, n: 7, bestWindow: 'morning' },
    hr_event_lift: [{ categoryName: 'Deep Work', hrDeltaBpm: -6, compositeLift: 16, n: 6 }],
    rhr_recovery_window: { window: 'afternoon', liftPct: 17, n: 6 },
    recovery_streak_to_peak: { avgStreakLength: 2, n: 5 },
    category_lift: [{ categoryName: 'Strategy', compositeLift: 12, n: 4 }],
  };

  it('renders hr_event_lift', () => {
    const lines = buildLiftLines(lift, { tab: 'pressure' }, 5);
    expect(lines.some((l) => l.key === 'hr_event_lift')).toBe(true);
  });

  it('applies the observation guard', () => {
    expect(liftTier(6, 20)).toBe('strong');
    expect(liftTier(3, 12)).toBe('emerging');
    expect(liftTier(2, 40)).toBeNull();
    expect(liftTier(9, 4)).toBeNull();
  });

  it('orders by tab affinity and caps at 3', () => {
    const clarity = buildLiftLines(lift, { tab: 'clarity' }, 3);
    const pressure = buildLiftLines(lift, { tab: 'pressure' }, 3);
    expect(clarity).toHaveLength(3);
    expect(clarity[0].key).toBe('sleep_to_peak');
    expect(pressure[0].key).toBe('rhr_recovery_window');
  });

  it('routes best window and calendar insight through the same pipeline', () => {
    const lines = buildLiftLines(null, { bestWindowLabel: 'Morning', calendarInsight: 'Light week ahead.' }, 3);
    expect(lines.map((l) => l.key)).toEqual(['best_window', 'calendar_insight']);
  });
});
