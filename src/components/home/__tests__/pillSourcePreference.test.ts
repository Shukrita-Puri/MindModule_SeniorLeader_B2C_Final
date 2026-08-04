import { describe, it, expect } from 'vitest';

/**
 * Mirror of the DecisionReadinessBrief snapshot-vs-live pill selection.
 * Duplicated as a pure function here so we can exercise the contract
 * without spinning up the whole PRB React tree. Any drift between the
 * two implementations will be caught by the acceptance tests.
 */
const DISPLAYABLE_KEYS: Record<string, string[]> = {
  decision_readiness: ['hrvValue', 'sleepDuration', 'sleepScore', 'clarityLevel', 'rhrValue'],
  physical_reserves: ['sleepDuration', 'sleepScore', 'rhrValue', 'hrValue'],
  resilience_capacity: [
    'sleepEfficiency',
    'sleep_efficiency',
    'rhrValue',
    'emotionLevel',
    'regulationLevel',
    'pressureLevel',
  ],
};
const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
function total(arr: unknown): number {
  if (!Array.isArray(arr)) return 0;
  let n = 0;
  for (const p of arr as any[]) {
    const keys = DISPLAYABLE_KEYS[p?.key];
    if (!keys) continue;
    const c = (p.contributors ?? {}) as Record<string, unknown>;
    n += keys.reduce((acc, k) => acc + (isNum(c[k]) ? 1 : 0), 0);
  }
  return n;
}
function pickPills(snap: unknown, live: unknown) {
  const preferLive = Array.isArray(live) && total(live) > total(snap);
  return { source: preferLive ? 'live' : (Array.isArray(snap) ? 'snapshot' : 'live-fallback') };
}

describe('PRB pill-source preference · Sprint B', () => {
  it('richer live pills (check-in contributors present) beat a lean snapshot', () => {
    const snap = [
      { key: 'decision_readiness', contributors: { hrvValue: 50 } },
      { key: 'physical_reserves', contributors: {} },
      { key: 'resilience_capacity', contributors: {} },
    ];
    const live = [
      { key: 'decision_readiness', contributors: { hrvValue: 50, sleepDuration: 420, clarityLevel: 4 } },
      { key: 'physical_reserves', contributors: { rhrValue: 58 } },
      { key: 'resilience_capacity', contributors: { emotionLevel: 4, regulationLevel: 3, sleepEfficiency: 88 } },
    ];
    expect(pickPills(snap, live).source).toBe('live');
  });

  it('snapshot wins on ties (score/tier authority preserved)', () => {
    const snap = [
      { key: 'decision_readiness', contributors: { hrvValue: 50, sleepDuration: 420 } },
    ];
    const live = [
      { key: 'decision_readiness', contributors: { hrvValue: 55, sleepScore: 80 } },
    ];
    expect(pickPills(snap, live).source).toBe('snapshot');
  });

  it('empty live payload never wins', () => {
    const snap = [{ key: 'physical_reserves', contributors: { rhrValue: 58 } }];
    const live: any[] = [];
    expect(pickPills(snap, live).source).toBe('snapshot');
  });
});