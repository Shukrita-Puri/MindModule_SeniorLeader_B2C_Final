// MRS v2 — golden tests for divergence-flag composite classifier (§3.3).
// Walks the 5×5 phys × demand matrix to pin every cell.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  computeDivergenceFlag,
  computePhysiologicalComposite,
} from './divergence-flag.ts';
import type { DivergenceFlag } from './types.ts';

// Phys composite bands — picked to land cleanly on the spec thresholds.
const physBands = [
  { label: 'phys-null',    value: null as number | null }, // → ALIGNED always
  { label: 'phys-30',      value: 30  }, // ≤ 50 (weak)
  { label: 'phys-50',      value: 50  }, // boundary weak
  { label: 'phys-65',      value: 65  }, // ≥ 65 (strong)
  { label: 'phys-85',      value: 85  }, // strong
];

// Demand bands — picked to cross the spec thresholds (35, 60, 65).
const demandBands = [
  { label: 'demand-0',  value: 0  }, // ≤ 35 (light)
  { label: 'demand-35', value: 35 }, // boundary light
  { label: 'demand-50', value: 50 }, // mid
  { label: 'demand-65', value: 65 }, // ≥ 65 (gap)
  { label: 'demand-85', value: 85 }, // heavy
];

// Expected matrix WITHOUT hrvRecovering (so RECOVERY_UNDERWAY never fires).
// Rules:
//   demand ≥ 65 AND phys ≤ 50 → SUPPLY_DEMAND_GAP
//   phys ≥ 65 AND demand ≤ 35 → LIGHT_DAY_STRONG_STATE
//   else                       → ALIGNED
const expected: DivergenceFlag[][] = [
  // phys=null → ALIGNED across the row
  ['ALIGNED', 'ALIGNED', 'ALIGNED', 'ALIGNED', 'ALIGNED'],
  // phys=30
  ['ALIGNED', 'ALIGNED', 'ALIGNED', 'SUPPLY_DEMAND_GAP', 'SUPPLY_DEMAND_GAP'],
  // phys=50 (boundary — still ≤ 50)
  ['ALIGNED', 'ALIGNED', 'ALIGNED', 'SUPPLY_DEMAND_GAP', 'SUPPLY_DEMAND_GAP'],
  // phys=65 (boundary — ≥ 65)
  ['LIGHT_DAY_STRONG_STATE', 'LIGHT_DAY_STRONG_STATE', 'ALIGNED', 'ALIGNED', 'ALIGNED'],
  // phys=85
  ['LIGHT_DAY_STRONG_STATE', 'LIGHT_DAY_STRONG_STATE', 'ALIGNED', 'ALIGNED', 'ALIGNED'],
];

Deno.test('divergence-flag: 5×5 composite matrix (no recovery)', () => {
  for (let i = 0; i < physBands.length; i++) {
    for (let j = 0; j < demandBands.length; j++) {
      const got = computeDivergenceFlag({
        physComposite: physBands[i].value,
        demandScore: demandBands[j].value,
        hrvRecovering: false,
      });
      assertEquals(
        got,
        expected[i][j],
        `${physBands[i].label} × ${demandBands[j].label} → expected ${expected[i][j]}, got ${got}`,
      );
    }
  }
});

Deno.test('divergence-flag: null physComposite always returns ALIGNED', () => {
  for (const recovering of [true, false]) {
    assertEquals(
      computeDivergenceFlag({ physComposite: null, demandScore: 85, hrvRecovering: recovering }),
      'ALIGNED',
    );
  }
});

Deno.test('divergence-flag: RECOVERY_UNDERWAY needs phys≥55 + recovering + demand≥60', () => {
  // Hits all three → RECOVERY_UNDERWAY (priority over SUPPLY_DEMAND_GAP boundary).
  assertEquals(
    computeDivergenceFlag({ physComposite: 58, demandScore: 70, hrvRecovering: true }),
    'RECOVERY_UNDERWAY',
  );
  // Same vitals but not recovering → falls back (phys=58 > 50 so not gap → ALIGNED).
  assertEquals(
    computeDivergenceFlag({ physComposite: 58, demandScore: 70, hrvRecovering: false }),
    'ALIGNED',
  );
  // Recovering but phys < 55 → not RECOVERY_UNDERWAY, falls into SUPPLY_DEMAND_GAP.
  assertEquals(
    computeDivergenceFlag({ physComposite: 45, demandScore: 70, hrvRecovering: true }),
    'SUPPLY_DEMAND_GAP',
  );
  // Recovering + strong but demand low → LIGHT_DAY_STRONG_STATE wins (rule 3).
  assertEquals(
    computeDivergenceFlag({ physComposite: 70, demandScore: 20, hrvRecovering: true }),
    'LIGHT_DAY_STRONG_STATE',
  );
});

Deno.test('divergence-flag: ALIGNED when |phys − demand| ≤ 25 in mid-band', () => {
  for (const [phys, demand] of [[40, 50], [55, 55], [60, 40], [50, 60]]) {
    assertEquals(
      computeDivergenceFlag({ physComposite: phys, demandScore: demand, hrvRecovering: false }),
      'ALIGNED',
      `phys=${phys} demand=${demand}`,
    );
  }
});

// ─── computePhysiologicalComposite ──────────────────────────────────────

Deno.test('phys-composite: returns null when no component is available', () => {
  assertEquals(computePhysiologicalComposite({}), null);
  assertEquals(
    computePhysiologicalComposite({ rhrTrend: 'unknown' }),
    null,
  );
});

Deno.test('phys-composite: HRV-only collapses to HRV component', () => {
  // 0% deviation → 55. +15% → 95. −15% → 15.
  assertEquals(computePhysiologicalComposite({ hrvDeviationPct: 0 }), 55);
  assertEquals(computePhysiologicalComposite({ hrvDeviationPct: 15 }), 95);
  assertEquals(computePhysiologicalComposite({ hrvDeviationPct: -15 }), 15);
});

Deno.test('phys-composite: weighted blend (HRV 50% / Sleep 35% / RHR 15%)', () => {
  // HRV +10 → 82, Sleep 70, RHR declining → 75
  // (82*0.50 + 70*0.35 + 75*0.15) / 1.00 = 41 + 24.5 + 11.25 = 76.75 → 77
  assertEquals(
    computePhysiologicalComposite({
      hrvDeviationPct: 10,
      sleepScore: 70,
      rhrTrend: 'declining',
    }),
    77,
  );
});

Deno.test('phys-composite: sleepScore wins over sleepHours when both present', () => {
  // sleepHours=4 (would map to 25) but sleepScore=90 — score wins.
  // HRV null, sleep=90 only → 90.
  assertEquals(
    computePhysiologicalComposite({ sleepScore: 90, sleepHours: 4 }),
    90,
  );
});