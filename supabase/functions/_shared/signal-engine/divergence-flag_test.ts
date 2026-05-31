// MRS v2 — golden tests for divergence-flag.
// Walks a 5×5 phys × demand matrix to pin every cell of the classifier.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { computeDivergenceFlag } from './divergence-flag.ts';
import type { DemandLevel, DivergenceFlag, HrvTrend } from './types.ts';

type PhysProfile = {
  label: string;
  hrvValue: number | null;
  hrvDeviationPct: number | null;
  hrv3dTrend: HrvTrend;
};

type DemandProfile = {
  label: string;
  calendarLoad: DemandLevel;
  calendarPressure: DemandLevel;
  hasHighStakes: boolean;
};

const phys: PhysProfile[] = [
  { label: 'no-wearable',     hrvValue: null, hrvDeviationPct: null, hrv3dTrend: 'unknown' },
  { label: 'body-weak-decl',  hrvValue: 40,   hrvDeviationPct: -25,  hrv3dTrend: 'declining' },
  { label: 'body-stable',     hrvValue: 50,   hrvDeviationPct: 0,    hrv3dTrend: 'stable' },
  { label: 'body-strong-imp', hrvValue: 65,   hrvDeviationPct: 10,   hrv3dTrend: 'improving' },
  { label: 'body-strong-flat',hrvValue: 60,   hrvDeviationPct: 8,    hrv3dTrend: 'stable' },
];

const demand: DemandProfile[] = [
  { label: 'idle',     calendarLoad: 'low',    calendarPressure: 'low',    hasHighStakes: false },
  { label: 'light',    calendarLoad: 'low',    calendarPressure: 'medium', hasHighStakes: false },
  { label: 'medium',   calendarLoad: 'medium', calendarPressure: 'medium', hasHighStakes: false },
  { label: 'heavy',    calendarLoad: 'high',   calendarPressure: 'medium', hasHighStakes: false },
  { label: 'stakes',   calendarLoad: 'high',   calendarPressure: 'high',   hasHighStakes: true  },
];

// Expected matrix [phys-row][demand-col]. Captures the canonical decision
// table — every change to compute-outer-readiness's classifier must be
// reflected here, never the other way around.
const expected: DivergenceFlag[][] = [
  // no-wearable      → always ALIGNED
  ['ALIGNED', 'ALIGNED', 'ALIGNED', 'ALIGNED', 'ALIGNED'],
  // body-weak-declining
  ['ALIGNED', 'ALIGNED', 'ALIGNED', 'SUPPLY_DEMAND_GAP', 'SUPPLY_DEMAND_GAP'],
  // body-stable      → never strong/weak
  ['ALIGNED', 'ALIGNED', 'ALIGNED', 'ALIGNED', 'ALIGNED'],
  // body-strong-improving
  ['LIGHT_DAY_STRONG_STATE', 'LIGHT_DAY_STRONG_STATE', 'LIGHT_DAY_STRONG_STATE', 'RECOVERY_UNDERWAY', 'RECOVERY_UNDERWAY'],
  // body-strong-flat (no improving trend → RECOVERY rule doesn't fire)
  ['LIGHT_DAY_STRONG_STATE', 'LIGHT_DAY_STRONG_STATE', 'LIGHT_DAY_STRONG_STATE', 'ALIGNED', 'ALIGNED'],
];

Deno.test('divergence-flag: 5×5 phys × demand matrix golden', () => {
  for (let i = 0; i < phys.length; i++) {
    for (let j = 0; j < demand.length; j++) {
      const got = computeDivergenceFlag({
        hrvValue: phys[i].hrvValue,
        hrvDeviationPct: phys[i].hrvDeviationPct,
        hrv3dTrend: phys[i].hrv3dTrend,
        calendarLoad: demand[j].calendarLoad,
        calendarPressure: demand[j].calendarPressure,
        hasHighStakes: demand[j].hasHighStakes,
      });
      assertEquals(
        got,
        expected[i][j],
        `phys=${phys[i].label} demand=${demand[j].label} → expected ${expected[i][j]}, got ${got}`,
      );
    }
  }
});

Deno.test('divergence-flag: null HRV always returns ALIGNED regardless of trend', () => {
  for (const trend of ['improving', 'declining', 'stable', 'unknown'] as HrvTrend[]) {
    const got = computeDivergenceFlag({
      hrvValue: null,
      hrvDeviationPct: -50,
      hrv3dTrend: trend,
      calendarLoad: 'high',
      calendarPressure: 'high',
      hasHighStakes: true,
    });
    assertEquals(got, 'ALIGNED', `null hrvValue + trend=${trend} should be ALIGNED`);
  }
});

Deno.test('divergence-flag: deviation-only (no trend) drives strong/weak', () => {
  // Strong-by-deviation + light day → LIGHT_DAY_STRONG_STATE.
  assertEquals(
    computeDivergenceFlag({
      hrvValue: 70, hrvDeviationPct: 12, hrv3dTrend: 'unknown',
      calendarLoad: 'low', calendarPressure: 'low', hasHighStakes: false,
    }),
    'LIGHT_DAY_STRONG_STATE',
  );
  // Weak-by-deviation + heavy day → SUPPLY_DEMAND_GAP.
  assertEquals(
    computeDivergenceFlag({
      hrvValue: 30, hrvDeviationPct: -15, hrv3dTrend: 'unknown',
      calendarLoad: 'high', calendarPressure: 'low', hasHighStakes: false,
    }),
    'SUPPLY_DEMAND_GAP',
  );
});

Deno.test('divergence-flag: RECOVERY_UNDERWAY requires improving trend specifically', () => {
  // Strong-by-deviation but not improving → ALIGNED on heavy day.
  assertEquals(
    computeDivergenceFlag({
      hrvValue: 70, hrvDeviationPct: 12, hrv3dTrend: 'stable',
      calendarLoad: 'high', calendarPressure: 'high', hasHighStakes: true,
    }),
    'ALIGNED',
  );
});