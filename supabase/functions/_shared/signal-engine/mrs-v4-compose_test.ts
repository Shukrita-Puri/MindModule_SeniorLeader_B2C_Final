// MRS v4 — tests for §8.3 redistribution + §3.2a sleep-deficit absence guard.
//
// Validates the four §8.4 worked examples plus the wearable-pillar
// availability guard.

import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { composeBaselineV4, redistribute, isSevereSleepDeficit, type SubScore } from './mrs-v4-compose.ts';
import { MRS_V4_WEIGHTS, ZERO_DEMAND_CREDIT, assertWeightSumInvariant, type SubComponentId } from './mrs-v4-weights.ts';
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
  assertEquals(remaining?.score, 20);
  assertEquals(remaining?.available, true);
  assertEquals(realized?.score, 80);
  assertEquals(realized?.available, true);
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

// Zero demand is EARNED data with a bounded recovery credit — never missing.
Deno.test('zero demand is earned and receives the recovery credit', () => {
  const subs = buildMrsV4SubScores('afternoon', {
    remainingDayDemand: 0,
    realizedSoFarCost: 0,
  });
  const remaining = subs.find((s) => s.id === 'remainingDayDemand')!;
  assertEquals(remaining.available, true);
  assertEquals(remaining.rawDemand, 0);
  assertEquals(remaining.zeroDemandCredit, true);
  assertEquals(remaining.score, Math.round(ZERO_DEMAND_CREDIT * 100));
});

Deno.test('null demand is unearned — distinct from zero', () => {
  const subs = buildMrsV4SubScores('afternoon', { remainingDayDemand: null });
  const remaining = subs.find((s) => s.id === 'remainingDayDemand')!;
  assertEquals(remaining.available, false);
  assertEquals(remaining.rawDemand, null);
});

function allMorningSubs(opts: Partial<Record<SubComponentId, SubScore>> = {}): SubScore[] {
  const defaults: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: 55,
    available: true,
  }));
  return defaults.map((s) => opts[s.id] ?? s);
}

// Scenario D — wearable absent, demand available ⇒ MRS null.
Deno.test('scenario D: calendar only (no physiology) → MRS null', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: c.id === 'todayFullDayDemand' ? 60 : 0,
    available: c.id === 'todayFullDayDemand',
  }));
  const r = composeBaselineV4('morning', subs);
  assertEquals(r.awaitingSignals, true);
  assertEquals(r.baseline, null);
  assertEquals(r.weightProvenance.physiological_available, false);
  assertEquals(r.weightProvenance.demand_available, true);
});

// Scenario C — physiology available, calendar unavailable ⇒ MRS null.
Deno.test('scenario C: physiology only (no demand) → MRS null', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => ({
    id: c.id,
    score: c.id === 'hrvMorningDeviation' ? 60 : 0,
    available: c.id === 'hrvMorningDeviation',
  }));
  const r = composeBaselineV4('morning', subs);
  assertEquals(r.awaitingSignals, true);
  assertEquals(r.baseline, null);
  assertEquals(r.weightProvenance.physiological_available, true);
  assertEquals(r.weightProvenance.demand_available, false);
});

// Scenario E — both demand cells measured zero ⇒ MRS forms, no cross-pillar move.
Deno.test('scenario E: both demand cells zero → MRS forms, physio weight untouched', () => {
  const subs: SubScore[] = [
    { id: 'hrvMorningDeviation', score: 40, available: true },
    { id: 'sleepDeviation', score: 0, available: false },
    { id: 'rhrTrend', score: 0, available: false },
    { id: 'todayFullDayDemand', score: 60, available: true, rawDemand: 0, zeroDemandCredit: true },
    { id: 'yesterdayCarryover', score: 60, available: true, rawDemand: 0, zeroDemandCredit: true },
    { id: 'patternEngineComposite', score: 0, available: false },
  ];
  const r = redistribute('morning', subs);
  assertEquals(r.awaitingSignals, false);
  // Missing physio weight stays inside physiology (all 50 on HRV).
  assertEquals(Math.round(r.finalWeights.hrvMorningDeviation), 50);
  assertEquals(Math.round(r.finalWeights.todayFullDayDemand), 20);
  assertEquals(Math.round(r.finalWeights.yesterdayCarryover), 10);
  assertEquals(r.weightProvenance.zero_demand_credit?.length, 2);
});

// Scenario F — one demand cell null ⇒ redistribute WITHIN demand only.
Deno.test('scenario F: one demand cell null → intra-pillar redistribution only', () => {
  const subs: SubScore[] = [
    { id: 'hrvMorningDeviation', score: 55, available: true },
    { id: 'sleepDeviation', score: 55, available: true },
    { id: 'rhrTrend', score: 55, available: true },
    { id: 'todayFullDayDemand', score: 40, available: true },
    { id: 'yesterdayCarryover', score: 0, available: false },
    { id: 'patternEngineComposite', score: 0, available: false },
  ];
  const r = redistribute('morning', subs);
  assertEquals(Math.round(r.finalWeights.todayFullDayDemand), 30); // 20 + 10
  assertEquals(r.finalWeights.hrvMorningDeviation, 25);            // untouched
  assertEquals(r.finalWeights.patternEngineComposite, 0);
});

// Scenario G — one demand cell zero, one non-zero ⇒ no redistribution at all.
Deno.test('scenario G: zero + non-zero demand → both earned, no redistribution', () => {
  const subs: SubScore[] = [
    { id: 'hrvMorningDeviation', score: 55, available: true },
    { id: 'sleepDeviation', score: 55, available: true },
    { id: 'rhrTrend', score: 55, available: true },
    { id: 'todayFullDayDemand', score: 40, available: true },
    { id: 'yesterdayCarryover', score: 60, available: true, rawDemand: 0, zeroDemandCredit: true },
    { id: 'patternEngineComposite', score: 0, available: false },
  ];
  const r = redistribute('morning', subs);
  assertEquals(r.weightProvenance.redistributed_to.length, 0);
  assertEquals(r.finalWeights.todayFullDayDemand, 20);
  assertEquals(r.finalWeights.yesterdayCarryover, 10);
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

// Pattern is additive context only — it can never unlock a baseline.
Deno.test('afternoon: demand+pattern but no physiology → awaiting', () => {
  const earnedIds = new Set(['remainingDayDemand', 'realizedSoFarCost', 'patternEngineComposite']);
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id,
    score: earnedIds.has(c.id) ? 55 : 0,
    available: earnedIds.has(c.id),
  }));
  const r = composeBaselineV4('afternoon', subs);
  assertEquals(r.awaitingSignals, true);
  assertEquals(r.baseline, null);
  assertEquals(r.weightProvenance.earned.some((c) => c.id === 'patternEngineComposite'), false);
});

// Pattern availability never changes the gate.
Deno.test('pattern availability does not gate MRS', () => {
  const withPattern: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55,
    available: c.pillar !== 'pattern' ? true : true,
  }));
  const withoutPattern: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55, available: c.pillar !== 'pattern',
  }));
  assertEquals(
    composeBaselineV4('afternoon', withPattern).baseline,
    composeBaselineV4('afternoon', withoutPattern).baseline,
  );
});

// Scenario B — a single wearable sub + demand is a valid early read.
Deno.test('§4.15 day-1: single wearable sub + demand → baseline available', () => {
  const subs: SubScore[] = [
    { id: 'hrvMorningDeviation', score: 55, available: true },
    { id: 'sleepDeviation', score: 0, available: false },
    { id: 'rhrTrend', score: 0, available: false },
    { id: 'todayFullDayDemand', score: 80, available: true },
    { id: 'yesterdayCarryover', score: 0, available: false },
    { id: 'patternEngineComposite', score: 0, available: false },
  ];
  const result = composeBaselineV4('morning', subs);
  assertEquals(result.awaitingSignals, false);
  assert(result.baseline != null);
});

// Day 4 — rhrTrend is the only earned physio cell: it absorbs the full 50
// physio allocation, and demand keeps its own 30. No cross-pillar movement.
Deno.test('day-4: missing physio weight stays inside physiology', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.morning.map((c) => {
    const earned = c.id === 'todayFullDayDemand' || c.id === 'rhrTrend' || c.id === 'yesterdayCarryover';
    return { id: c.id, score: 50, available: earned };
  });
  const r = redistribute('morning', subs);
  assertEquals(Math.round(r.finalWeights.rhrTrend), 50);
  assertEquals(r.finalWeights.todayFullDayDemand, 20);
  assertEquals(r.finalWeights.yesterdayCarryover, 10);
  assertEquals(r.earnedWeight, 80);
});

// Day 30 — everything available; pattern weight is simply not score-bearing.
Deno.test('day-30 afternoon: pattern weight is dropped, never absorbed', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55, available: true,
  }));
  const r = redistribute('afternoon', subs);
  assertEquals(r.earnedWeight, 80);
  assertEquals(r.finalWeights.patternEngineComposite, 0);
  assertEquals(r.finalWeights.remainingDayDemand, 21);
  assertEquals(r.finalWeights.realizedSoFarCost, 9);
});

// Wearable dies at 2pm — the missing physio weight stays inside physiology.
Deno.test('wearable dies at 2pm: no physio → demand leakage', () => {
  const subs: SubScore[] = MRS_V4_WEIGHTS.afternoon.map((c) => ({
    id: c.id, score: 55,
    available: c.id !== 'intradayHrDeviation',
  }));
  const r = redistribute('afternoon', subs);
  assertEquals(r.earnedWeight, 80);
  assertEquals(r.finalWeights.remainingDayDemand, 21);
  assertEquals(r.finalWeights.realizedSoFarCost, 9);
  // 20 pts of intraday weight redistributed across the three earned physio cells.
  assertEquals(Math.round(r.finalWeights.hrvMorningDeviation), 25);
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

// ───────────────────────────────────────────────────────────────────────────
// MRS v4 — evening double-count + tomorrow demand + yesterday regression
// ───────────────────────────────────────────────────────────────────────────

Deno.test('evening: morning HRV deviation cannot appear in two score-bearing cells', () => {
  const subs = buildMrsV4SubScores('evening', {
    hrvDeviationPct: -20,
    hrvValue: 42,
    todayRealizedDemand: 40,
    tomorrowOpeningDemand: 10,
  });
  const morning = subs.find((s) => s.id === 'hrvMorningDeviation')!;
  const evening = subs.find((s) => s.id === 'eveningPhysioRead')!;
  assertEquals(morning.available, true);
  // No independent evening signal supplied -> cell unavailable (redistribution).
  assertEquals(evening.available, false);
});

Deno.test('evening: independent evening HRV earns eveningPhysioRead', () => {
  const subs = buildMrsV4SubScores('evening', {
    hrvDeviationPct: -20,
    eveningHrvDeviationPct: 10,
    todayRealizedDemand: 40,
  });
  const evening = subs.find((s) => s.id === 'eveningPhysioRead')!;
  const morning = subs.find((s) => s.id === 'hrvMorningDeviation')!;
  assertEquals(evening.available, true);
  assert(evening.score !== morning.score);
});

Deno.test('evening: evening HR elevation earns eveningPhysioRead (inverse)', () => {
  const elevated = buildMrsV4SubScores('evening', { eveningHrDeviationPct: 20 })
    .find((s) => s.id === 'eveningPhysioRead')!;
  const calm = buildMrsV4SubScores('evening', { eveningHrDeviationPct: -5 })
    .find((s) => s.id === 'eveningPhysioRead')!;
  assertEquals(elevated.available, true);
  assert(elevated.score < calm.score);
});

Deno.test('evening: no evening signal at all -> unavailable, MRS still forms', () => {
  const subs = buildMrsV4SubScores('evening', {
    hrvDeviationPct: -5,
    sleepDeviationPct: 0,
    rhrTrend: 'stable',
    todayRealizedDemand: 30,
    tomorrowOpeningDemand: 20,
  });
  assertEquals(subs.find((s) => s.id === 'eveningPhysioRead')!.available, false);
  const r = composeBaselineV4('evening', subs);
  assert(r.baseline != null);
});

Deno.test('evening: tomorrowOpeningDemand is independent of today (X !== Y)', () => {
  const subs = buildMrsV4SubScores('evening', {
    todayRealizedDemand: 80,
    tomorrowOpeningDemand: 20,
  });
  const today = subs.find((s) => s.id === 'todayRealizedDemand')!;
  const tomorrow = subs.find((s) => s.id === 'tomorrowOpeningDemand')!;
  assertEquals(today.rawDemand, 80);
  assertEquals(tomorrow.rawDemand, 20);
  assert(today.score !== tomorrow.score);
});

Deno.test('evening: tomorrow zero/null semantics', () => {
  const zero = buildMrsV4SubScores('evening', { tomorrowOpeningDemand: 0 })
    .find((s) => s.id === 'tomorrowOpeningDemand')!;
  assertEquals(zero.available, true);
  assertEquals(zero.rawDemand, 0);
  assertEquals(zero.zeroDemandCredit, true);
  assertEquals(zero.score, Math.round(ZERO_DEMAND_CREDIT * 100));

  const missing = buildMrsV4SubScores('evening', { tomorrowOpeningDemand: null })
    .find((s) => s.id === 'tomorrowOpeningDemand')!;
  assertEquals(missing.available, false);
  assertEquals(missing.rawDemand, null);
});

Deno.test('morning: yesterday carryover carries yesterday value, not today (X !== Y)', () => {
  const X = 70; // yesterday
  const Y = 25; // today
  const subs = buildMrsV4SubScores('morning', {
    todayFullDayDemand: Y,
    yesterdayCarryoverDemand: X,
  });
  const yday = subs.find((s) => s.id === 'yesterdayCarryover')!;
  const today = subs.find((s) => s.id === 'todayFullDayDemand')!;
  assertEquals(yday.rawDemand, X);
  assertEquals(today.rawDemand, Y);

  const r = redistribute('morning', subs);
  assertEquals(r.finalWeights.yesterdayCarryover, 10);
  assertEquals(r.finalWeights.todayFullDayDemand, 20);
  assertEquals(
    MRS_V4_WEIGHTS.morning.find((c) => c.id === 'yesterdayCarryover')!.pillar,
    'demand',
  );
  assertEquals(
    r.finalWeights.yesterdayCarryover + r.finalWeights.todayFullDayDemand,
    30,
  );
});

Deno.test('morning: yesterday zero/null semantics', () => {
  const zero = buildMrsV4SubScores('morning', { yesterdayCarryoverDemand: 0 })
    .find((s) => s.id === 'yesterdayCarryover')!;
  assertEquals(zero.available, true);
  assertEquals(zero.rawDemand, 0);
  assertEquals(zero.zeroDemandCredit, true);

  const missing = buildMrsV4SubScores('morning', { yesterdayCarryoverDemand: null })
    .find((s) => s.id === 'yesterdayCarryover')!;
  assertEquals(missing.available, false);

  const real = buildMrsV4SubScores('morning', { yesterdayCarryoverDemand: 55 })
    .find((s) => s.id === 'yesterdayCarryover')!;
  assertEquals(real.rawDemand, 55);
  assertEquals(real.score, 45);
});
