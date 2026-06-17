// MRS v4 — tests for §8.3 redistribution + §3.2a sleep-deficit absence guard.
//
// Validates the four §8.4 worked examples plus the day-1 calendar-only DoW
// variance that §0.2 requires.

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

// §8.4 Day 1 — only todayFullDayDemand earned, all others fall back to demand.
Deno.test('§8.4 day-1: only calendar available → demand absorbs everything', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: c.id === 'todayFullDayDemand' ? 60 : 0,
    available: c.id === 'todayFullDayDemand',
  }));
  const r = redistribute('morning', subs);
  assertEquals(r.earnedWeight, 30);
  assertEquals(Math.round(r.finalWeights.todayFullDayDemand), 100);
  assertEquals(r.awaitingSignals, false);
});

// §0.2: day-1 score must differ by demand input — same algorithm, two demand scores.
Deno.test('§0.2 day-1 DoW variance: different demand → different baseline', () => {
  const mondaySubs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: c.id === 'todayFullDayDemand' ? 25 : 0, // heavy day → low score
    available: c.id === 'todayFullDayDemand',
  }));
  const sundaySubs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: c.id === 'todayFullDayDemand' ? 80 : 0, // empty day → high score
    available: c.id === 'todayFullDayDemand',
  }));
  const monday = composeBaselineV4('morning', mondaySubs);
  const sunday = composeBaselineV4('morning', sundaySubs);
  assert(monday.baseline != null && sunday.baseline != null && monday.baseline < sunday.baseline,
    `Expected Monday<Sunday but got ${monday.baseline} vs ${sunday.baseline}`);
});

// §8.4 Day 4 — rhrTrend + yesterdayCarryover join.
Deno.test('§8.4 day-4: rhrTrend + yesterdayCarryover earned, others flow to demand', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => {
    const earned = c.id === 'todayFullDayDemand' || c.id === 'rhrTrend' || c.id === 'yesterdayCarryover';
    return { id: c.id, score: 50, available: earned };
  });
  const r = redistribute('morning', subs);
  assertEquals(r.earnedWeight, 43.5);
  // todayFullDayDemand should have absorbed 56.5 (it's the sole demand reservoir).
  assertEquals(Math.round(r.finalWeights.todayFullDayDemand), 87); // 30 + 56.5 = 86.5 → rounded
});

// §8.4 day-30 — everything available, no redistribution.
Deno.test('§8.4 day-30 afternoon: fully calibrated, weights match target', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55, available: true,
  }));
  const r = redistribute('afternoon', subs);
  assertEquals(r.earnedWeight, 100);
  for (const c of MRS_V4_WEIGHTS.afternoon) {
    assertEquals(r.finalWeights[c.id], c.weight);
  }
});

// §8.4 wearable-dies-at-2pm — intradayHrDeviation unavailable, flows to demand.
Deno.test('§8.4 wearable dies at 2pm: intradayHrDeviation flows to demand 70:30', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55,
    available: c.id !== 'intradayHrDeviation',
  }));
  const r = redistribute('afternoon', subs);
  assertEquals(r.earnedWeight, 80);
  // 20 pts → demand reservoir (remainingDayDemand 21, realizedSoFarCost 9, total 30).
  // pro-rata: remainingDay gets 20 * 21/30 = 14, realized gets 20 * 9/30 = 6.
  assertEquals(Math.round(r.finalWeights.remainingDayDemand), 35); // 21+14
  assertEquals(Math.round(r.finalWeights.realizedSoFarCost), 15);   // 9+6
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
