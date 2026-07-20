// MRS v4 — tests for §8.3 redistribution + §3.2a sleep-deficit absence guard.
//
// Validates the four §8.4 worked examples plus the wearable-pillar
// availability guard.

import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { composeBaselineV4, redistribute, isSevereSleepDeficit, type SubScore } from './mrs-v4-compose.ts';
import { MRS_V4_WEIGHTS, assertWeightSumInvariant, type SubComponentId } from './mrs-v4-weights.ts';
import { buildMrsV4SubScores } from './mrs-v4-subscores.ts';

// All windows' weights must sum to 100.
Deno.test('mrs-v4-weights: every window sums to 100', () => {
  assertWeightSumInvariant();
});

Deno.test('mrs-v4-subscores: demand cells are readiness-oriented', () => {
  const subs = buildMrsV4SubScores('afternoon', {
    remainingDayDemand: 80,
    realizedSoFarCost: 20,
  });
  const remaining = subs.find((s) => s.id === 'remainingDayDemand');
  const realized = subs.find((s) => s.id === 'realizedSoFarCost');
  assertEquals(remaining, { id: 'remainingDayDemand', score: 20, available: true });
  assertEquals(realized, { id: 'realizedSoFarCost', score: 80, available: true });
});

Deno.test('mrs-v4-subscores: missing components stay unavailable for redistribution audit', () => {
  const subs = buildMrsV4SubScores('evening', {
    todayRealizedDemand: 60,
    patternScore: 50,
  });
  const sleep = subs.find((s) => s.id === 'sleepDeviation');
  const eveningPhysio = subs.find((s) => s.id === 'eveningPhysioRead');
  assertEquals(sleep, { id: 'sleepDeviation', score: 0, available: false });
  assertEquals(eveningPhysio, { id: 'eveningPhysioRead', score: 0, available: false });
});

function allMorningSubs(opts: Partial<Record<SubComponentId, SubScore>> = {}): SubScore[] {
  const defaults: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: 55,
    available: true,
  }));
  return defaults.map((s) => opts[s.id] ?? s);
}

// Day 1 — calendar alone unlocks an early baseline via redistribution.
Deno.test('day-1: only calendar available → baseline numeric, awaiting=false', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: c.id === 'todayFullDayDemand' ? 60 : 0,
    available: c.id === 'todayFullDayDemand',
  }));
  const r = composeBaselineV4('morning', subs);
  assertEquals(r.awaitingSignals, false);
  assert(r.baseline != null);
});

// Check-in-only callers may pass an anchor, but without a calendar/wearable
// baseline the composer remains awaiting and the anchor must not be applied by
// higher-level callers.
Deno.test('day-1: no calendar/wearable sub available → awaiting signals', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: 0,
    available: false,
  }));
  const r = composeBaselineV4('morning', subs);
  assertEquals(r.awaitingSignals, true);
  assertEquals(r.baseline, null);
});

// Pattern-only inputs cannot form MRS; MRS is immediate/topical.
Deno.test('afternoon: pattern-only sub available → awaiting signals', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id,
    score: c.id === 'patternEngineComposite' ? 55 : 0,
    available: c.id === 'patternEngineComposite',
  }));
  const r = composeBaselineV4('afternoon', subs);
  assertEquals(r.awaitingSignals, true);
  assertEquals(r.baseline, null);
});

// Pattern may be present as context, but only immediate demand earns MRS.
Deno.test('afternoon: demand+pattern available → baseline numeric from demand only', () => {
  const earnedIds = new Set(['remainingDayDemand', 'realizedSoFarCost', 'patternEngineComposite']);
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id,
    score: earnedIds.has(c.id) ? 55 : 0,
    available: earnedIds.has(c.id),
  }));
  const r = composeBaselineV4('afternoon', subs);
  assertEquals(r.awaitingSignals, false);
  assertEquals(r.baseline, 55);
  assertEquals(r.weightProvenance.earned.some((c) => c.id === 'patternEngineComposite'), false);
});

// Day 1 with a single wearable sub + demand is a valid early read.
Deno.test('§4.15 day-1: single wearable sub + demand → baseline available', () => {
  const subs: SubScore[] = [
    { id: 'hrvMorningDeviation', score: 55, available: true },
    { id: 'sleepDeviation', score: 0, available: false },
    { id: 'rhrTrend', score: 0, available: false },
    { id: 'todayFullDayDemand', score: 80, available: true },
    { id: 'patternEngineComposite', score: 0, available: false },
    { id: 'yesterdayCarryover', score: 0, available: false },
  ];
  const result = composeBaselineV4('morning', subs);
  assertEquals(result.awaitingSignals, false);
  assert(result.baseline != null);
});

// §8.4 Day 4 — rhrTrend joins; yesterdayCarryover is pattern context only.
Deno.test('§8.4 day-4: rhrTrend earned, yesterdayCarryover ignored, others flow to demand', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => {
    const earned = c.id === 'todayFullDayDemand' || c.id === 'rhrTrend' || c.id === 'yesterdayCarryover';
    return { id: c.id, score: 50, available: earned };
  });
  const r = redistribute('morning', subs);
  assertEquals(r.earnedWeight, 37.5);
  // todayFullDayDemand should have absorbed 62.5 (it's the sole demand reservoir).
  assertEquals(Math.round(r.finalWeights.todayFullDayDemand), 93); // 30 + 62.5 = 92.5 → rounded
  assertEquals(r.finalWeights.yesterdayCarryover, 0);
});

// §8.4 day-30 — all immediate signals available; pattern remains non-scoring.
Deno.test('§8.4 day-30 afternoon: immediate weights redistribute pattern weight', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55, available: true,
  }));
  const r = redistribute('afternoon', subs);
  assertEquals(r.earnedWeight, 80);
  assertEquals(r.finalWeights.patternEngineComposite, 0);
  assertEquals(Math.round(r.finalWeights.remainingDayDemand), 35); // 21 + 20*(21/30)
  assertEquals(Math.round(r.finalWeights.realizedSoFarCost), 15); // 9 + 20*(9/30)
});

// §8.4 wearable-dies-at-2pm — intradayHrDeviation and pattern weight flow to demand.
Deno.test('§8.4 wearable dies at 2pm: missing immediate + pattern weight flows to demand 70:30', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55,
    available: c.id !== 'intradayHrDeviation',
  }));
  const r = redistribute('afternoon', subs);
  assertEquals(r.earnedWeight, 60);
  // 40 pts → demand reservoir (remainingDayDemand 21, realizedSoFarCost 9, total 30).
  // pro-rata: remainingDay gets 40 * 21/30 = 28, realized gets 40 * 9/30 = 12.
  assertEquals(Math.round(r.finalWeights.remainingDayDemand), 49); // 21+28
  assertEquals(Math.round(r.finalWeights.realizedSoFarCost), 21); // 9+12
  assertEquals(r.finalWeights.patternEngineComposite, 0);
});

// awaitingSignals — nothing available anywhere.
Deno.test('awaiting signals: zero available → awaiting=true', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id, score: 0, available: false,
  }));
  const r = composeBaselineV4('morning', subs);
  assertEquals(r.awaitingSignals, true);
  assertEquals(r.baseline, null);
  assertEquals(r.weightProvenance.awaiting_signals, true);
});

// §3.2a — absence-is-not-deficit guard.
Deno.test('§3.2a guard: missing sleep data CANNOT trigger override', () => {
  // Null minutes AND null quality AND available=false MUST return false.
  assertEquals(isSevereSleepDeficit({ available: false }), false);
  assertEquals(isSevereSleepDeficit({ available: false, sleepTotalMinutes: 200, sleepQuality: 'poor' }), false);
  // Even if minutes look bad, available=false short-circuits.
  assertEquals(isSevereSleepDeficit({ available: false, sleepTotalMinutes: 60 }), false);
});

// §3.2a — measured-low triggers.
Deno.test('§3.2a: measured low triggers (minutes<300 OR quality=poor)', () => {
  assertEquals(isSevereSleepDeficit({ available: true, sleepTotalMinutes: 250 }), true);
  assertEquals(isSevereSleepDeficit({ available: true, sleepQuality: 'poor' }), true);
  assertEquals(isSevereSleepDeficit({ available: true, sleepTotalMinutes: 480, sleepQuality: 'good' }), false);
});

// §3.2a end-to-end: high-HRV + measured low sleep ⇒ pillar contribution capped.
Deno.test('§3.2a end-to-end: HRV cannot mask measured severe sleep deficit', () => {
  // All phys sub-components reading as high as possible — the worst-case
  // "HRV looks great after a wrecked night" scenario the cap exists to catch.
  const high = allMorningSubs({
    hrvMorningDeviation: { id: 'hrvMorningDeviation', score: 100, available: true },
    sleepDeviation:      { id: 'sleepDeviation',      score: 100, available: true },
    rhrTrend:            { id: 'rhrTrend',            score: 100, available: true },
  });
  const withCap = composeBaselineV4('morning', high, {
    available: true, sleepTotalMinutes: 240, sleepQuality: 'poor',
  });
  const withoutCap = composeBaselineV4('morning', high, { available: false });
  assert(withCap.baseline != null && withoutCap.baseline != null && withCap.baseline < withoutCap.baseline,
    `expected cap to lower baseline; got ${withCap.baseline} vs ${withoutCap.baseline}`);
  assertEquals(withCap.weightProvenance.sleep_deficit_override, true);
  // Without measurement, the override must NOT be recorded.
  assertEquals((withoutCap.weightProvenance as any).sleep_deficit_override, undefined);
});
