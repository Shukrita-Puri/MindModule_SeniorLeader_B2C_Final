import { describe, it, expect } from 'vitest';
import {
  buildSentence, buildSection, confidenceTier, isPositiveFinding,
  type RhythmFinding,
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

  it('hedges emerging findings', () => {
    const r = buildSentence(mk({ stats: { n: 3 } }));
    expect(r?.tier).toBe('emerging');
    expect(r?.text.startsWith('Early signal —')).toBe(true);
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
    expect(buildSentence(mk({}))?.text).toBe('Tuesdays run your sharpest clarity — 78% vs 45% on Fridays (n=6).');
  });

  it('renders a window peak', () => {
    const r = buildSentence(mk({ kind: 'peak-window', stats: { window: 0, comparisonWindow: 2, day: undefined } }));
    expect(r?.text).toContain('Mornings are your sharpest clarity window');
  });

  it('renders a cell peak', () => {
    const r = buildSentence(mk({ kind: 'cell-peak', stats: { day: 1, window: 0 } }));
    expect(r?.text).toContain('Tuesday mornings are your sharpest window');
  });

  it('renders a positive run', () => {
    const r = buildSentence(mk({ kind: 'consecutive-pos', stats: { runLength: 4, n: 4 } }));
    expect(r?.text).toContain('4 Tuesdays in a row');
  });
});

describe('section assembly', () => {
  it('caps at 3, one per dimension, strong before emerging', () => {
    const findings = [
      mk({ dimension: 'clarity', stats: { n: 3 }, priorityScore: 5 }),
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
      stats: { source: 'wearable', polarity: 'low', day: 4, window: 0, n: 4, bestPct: 100 },
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
