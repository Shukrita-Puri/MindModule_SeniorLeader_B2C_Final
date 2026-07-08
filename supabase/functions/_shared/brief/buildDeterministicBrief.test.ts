// Sprint C — buildDeterministicBrief signal-grounded template tests.

import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDeterministicBrief,
  decideBriefFallback,
  DETERMINISTIC_BODY_MAX_WORDS,
  type DeterministicBriefParams,
} from "./deterministic-fallback.ts";

function base(overrides: Partial<DeterministicBriefParams> = {}): DeterministicBriefParams {
  return {
    timeOfDay: 'morning',
    bandValence: 'mid',
    safeTier: 'managing',
    innerReadinessScore: 60,
    hasWearable: true,
    hrvDeviation: 0,
    sleepDuration: 450,
    sleepDeviation: 0,
    sleepHardFloor: false,
    rhrDeviation: 0,
    calendarLoad: 'medium',
    todayHighStakes: [],
    nextHighStakesEvent: null,
    hasBackToBack: false,
    avgScore7d: null,
    scoreTrajectory7d: 'stable',
    hrvEventCorrelation: null,
    checkInOutcome: null,
    clarityLevel: null,
    confidenceLevel: null,
    tomorrowLoad: null,
    tomorrowHighStakesTitles: [],
    ...overrides,
  };
}

function wc(body: string): number {
  return body.split(/\s+/).filter(Boolean).length;
}

Deno.test("sleep + calendar → topSignal wearable_x_calendar with numeric evidence", () => {
  const out = buildDeterministicBrief(base({
    hrvDeviation: -15,
    sleepDuration: 330,
    sleepHardFloor: true,
    calendarLoad: 'high',
    todayHighStakes: ['Board Meeting'],
  }));
  assert(out, 'expected deterministic output');
  assertEquals(out!.topSignal, 'wearable_x_calendar');
  assertStringIncludes(out!.body, 'Board Meeting');
  assertStringIncludes(out!.body, '15');
  assert(wc(out!.body) <= DETERMINISTIC_BODY_MAX_WORDS);
});

Deno.test("HRV deficit standalone → hrv_deficit with % delta", () => {
  const out = buildDeterministicBrief(base({ hrvDeviation: -18 }));
  assertEquals(out!.topSignal, 'hrv_deficit');
  assertStringIncludes(out!.body, '-18');
});

Deno.test("hrvEventCorrelation with count>=3 & delta>=10 → hrv_event_correlation top signal", () => {
  const out = buildDeterministicBrief(base({
    hrvEventCorrelation: 'HRV down avg 15% before Board meetings, 4 occurrences',
  }));
  assertEquals(out!.topSignal, 'hrv_event_correlation');
  assertStringIncludes(out!.body, 'Board');
  assertStringIncludes(out!.body, '15%');
  assertStringIncludes(out!.body, '4');
});

Deno.test("hrvEventCorrelation with count<3 → does NOT trigger correlation branch", () => {
  const out = buildDeterministicBrief(base({
    hrvEventCorrelation: 'HRV down avg 15% before Board meetings, 2 occurrences',
  }));
  assert(out!.topSignal !== 'hrv_event_correlation');
});

Deno.test("check-in strongest signal → check_in with numeric levels", () => {
  const out = buildDeterministicBrief(base({
    clarityLevel: 2,
    confidenceLevel: 2,
  }));
  assertEquals(out!.topSignal, 'check_in');
  assertStringIncludes(out!.body, '2/5');
});

Deno.test("evening + tomorrow heavy → tomorrow_heavy_evening", () => {
  const out = buildDeterministicBrief(base({
    timeOfDay: 'evening',
    tomorrowLoad: 'high',
    tomorrowHighStakesTitles: ['QBR'],
  }));
  assertEquals(out!.topSignal, 'tomorrow_heavy_evening');
  assertStringIncludes(out!.body, 'QBR');
});

Deno.test("neutral day → baseline_state, non-empty body under cap", () => {
  const out = buildDeterministicBrief(base());
  assertEquals(out!.topSignal, 'baseline_state');
  assert(wc(out!.body) > 0);
  assert(wc(out!.body) <= DETERMINISTIC_BODY_MAX_WORDS);
});

Deno.test("body always ends with a period and includes close beat", () => {
  const out = buildDeterministicBrief(base({ calendarLoad: 'high' }));
  assert(out!.body.trim().endsWith('.'));
  assertStringIncludes(out!.body, 'Small, deliberate, done.');
});

Deno.test("banned wellness tokens never emitted by builder", () => {
  const cases: Array<Partial<DeterministicBriefParams>> = [
    { hrvDeviation: -20, sleepHardFloor: true, calendarLoad: 'high', todayHighStakes: ['Board'] },
    { clarityLevel: 1 },
    { timeOfDay: 'evening', tomorrowLoad: 'high' },
    { hrvEventCorrelation: 'HRV down avg 22% before 1:1 meetings, 5 occurrences' },
  ];
  const banned = /(mindful|recharge|self-care|wellness|journey|breathe)/i;
  for (const c of cases) {
    const out = buildDeterministicBrief(base(c));
    assert(out, 'expected output');
    assert(!banned.test(out!.body), `banned token leaked: ${out!.body}`);
  }
});

Deno.test("integration — deterministic builder output passes decideBriefFallback validator", () => {
  const out = buildDeterministicBrief(base({ hrvDeviation: -15 }))!;
  const d = decideBriefFallback({
    cachedSnapshotPresent: false,
    llmBriefPresent: false,
    awaitingSignals: false,
    innerStateIsAwaiting: false,
    deterministicPhrase: out.phrase,
    deterministicBody: out.body,
  });
  assertEquals(d, { use: true, reason: 'llm_miss_signals_ready' });
});

Deno.test("caller contract — awaitingSignals blocks fallback even with valid builder body", () => {
  const out = buildDeterministicBrief(base({ hrvDeviation: -15 }))!;
  const d = decideBriefFallback({
    cachedSnapshotPresent: false,
    llmBriefPresent: false,
    awaitingSignals: true,
    innerStateIsAwaiting: false,
    deterministicPhrase: out.phrase,
    deterministicBody: out.body,
  });
  assertEquals(d.use, false);
});

Deno.test("no new DB / signal-assembly calls — builder is pure over its params", () => {
  const src = Deno.readTextFileSync(
    new URL('./deterministic-fallback.ts', import.meta.url),
  );
  assert(!/\bfetch\s*\(/.test(src), 'builder must not fetch()');
  assert(!/supabase|createClient|\.from\(|\.rpc\(/i.test(src), 'builder must not touch DB');
});

Deno.test("imminent high-stakes < 90min → imminent_high_stakes with event title & minutes", () => {
  const out = buildDeterministicBrief(base({
    nextHighStakesEvent: { title: 'Investor Call', minutesUntil: 45 },
  }));
  assertEquals(out!.topSignal, 'imminent_high_stakes');
  assertStringIncludes(out!.body, 'Investor Call');
  assertStringIncludes(out!.body, '45');
});
