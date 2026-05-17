import { assertEquals, assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluate } from "./behaviour-evaluator.ts";
import type { RuleContext, SignalMatrix } from "./brief-context.ts";
import {
  titleDecisionScore,
  attendeeWeight,
  decisionDensity,
} from "./ceo-behaviour/decision-density.ts";
import { ALL_RULES } from "./ceo-behaviour/index.ts";

function emptySignals(over: Partial<SignalMatrix> = {}): SignalMatrix {
  return {
    hrvDeviationPct: null, hrvUnusual: false,
    sleepHours: null, sleepDeviationPct: null, sleepBelow6h: false,
    rhrDeviationPct: null, hrElevatedProxy: false,
    emotionalSelfDeclared: null, mentalSharpness: null, confidence: null,
    timezoneOffsetMinutes: null, timezoneShift48hHours: null, travelDay: false,
    yesterdayScore: null, todayScore: null,
    postPeakWindow: false, isHighVisibilityToday: false,
    emotionalDrainEventInNext4h: null, highStakesEventInNext24h: null,
    morningWasCompressed: false, middayRecoveryDetected: false,
    clarityDropFromTrailingAvg: null,
    ...over,
  };
}

function ctx(over: Partial<RuleContext>, signals: Partial<SignalMatrix> = {}): RuleContext {
  return {
    signals: emptySignals(signals),
    upcomingEvents: [],
    localHour: 10,
    ...over,
  };
}

// ─── Layer 1: title scoring ──────────────────────────────────────────────────
Deno.test("titleDecisionScore: plain decision keyword = 1.0", () => {
  assertEquals(titleDecisionScore({ title: "Hiring decision" }), 1.0);
});

Deno.test("titleDecisionScore: decision + boost keyword = 1.5", () => {
  assertEquals(titleDecisionScore({ title: "Board investment vote" }), 1.5);
});

Deno.test("titleDecisionScore: + committee size adds 0.3", () => {
  assertEquals(
    titleDecisionScore({ title: "Budget approval", attendeeCount: 8 }),
    1.3,
  );
});

Deno.test("titleDecisionScore: + compressed adds 0.2", () => {
  assertEquals(
    titleDecisionScore({ title: "Sign-off review", durationMinutes: 20 }),
    1.2,
  );
});

Deno.test("titleDecisionScore: non-decision = 0", () => {
  assertEquals(titleDecisionScore({ title: "Coffee with Sam" }), 0);
});

// ─── Layer 2: attendee weight ────────────────────────────────────────────────
Deno.test("attendeeWeight: 6+ = committee × 1.5", () => {
  assertEquals(attendeeWeight(6), 1.5);
  assertEquals(attendeeWeight(12), 1.5);
});

Deno.test("attendeeWeight: 2 = 1:1 ask × 0.7", () => {
  assertEquals(attendeeWeight(2), 0.7);
});

Deno.test("attendeeWeight: unknown = 1.0 (no penalty for iOS-aggregated)", () => {
  assertEquals(attendeeWeight(undefined), 1.0);
});

// ─── Layer 3: rolling 4h window ──────────────────────────────────────────────
Deno.test("decisionDensity: silent below 2.5", () => {
  const c = ctx({
    upcomingEvents: [
      { title: "Hiring decision", minutesUntil: 60 },
    ],
  });
  assertEquals(decisionDensity(c), null);
});

Deno.test("decisionDensity: fires medium at score 2.5–3.9", () => {
  const c = ctx({
    upcomingEvents: [
      { title: "Hiring decision", minutesUntil: 30 },           // 1.0
      { title: "Budget approval", minutesUntil: 90, attendeeCount: 8 }, // 1.3 × 1.5 = 1.95
    ],
  });
  const flag = decisionDensity(c);
  assert(flag, "should fire");
  assertEquals(flag?.severity, "medium");
});

Deno.test("decisionDensity: fires high at ≥4.0", () => {
  const c = ctx({
    upcomingEvents: [
      { title: "Board investment vote", minutesUntil: 30, attendeeCount: 8 },  // 1.8 × 1.5 = 2.7
      { title: "Hiring termination decision", minutesUntil: 90, attendeeCount: 8 }, // 1.3 × 1.5 = 1.95
    ],
  });
  const flag = decisionDensity(c);
  assert(flag, "should fire");
  assertEquals(flag?.severity, "high");
});

Deno.test("decisionDensity: ignores events outside 4h window", () => {
  const c = ctx({
    upcomingEvents: [
      { title: "Board investment vote", minutesUntil: 30, attendeeCount: 8 },
      { title: "Strategy budget decision", minutesUntil: 300, attendeeCount: 8 }, // outside
    ],
  });
  const flag = decisionDensity(c);
  // Only one event contributes (2.7) → below 2.5? No, 2.7 ≥ 2.5 → medium
  // The point is: second event is excluded; if it were included we'd be high.
  assert(flag);
  assertEquals(flag?.severity, "medium");
});

Deno.test("decisionDensity: prefers precomputed score from SignalMatrix", () => {
  const c = ctx({}, { decisionDensityScore: 5.0, decisionDensityWindow: "next-4h" });
  const flag = decisionDensity(c);
  assert(flag);
  assertEquals(flag?.severity, "high");
});

Deno.test("decisionDensity: 1:1 ask down-weights to 0.7×", () => {
  // Two decision 1:1s → 1.0 × 0.7 + 1.0 × 0.7 = 1.4 → silent
  const c = ctx({
    upcomingEvents: [
      { title: "Promotion decision", minutesUntil: 60, attendeeCount: 2 },
      { title: "Termination decision", minutesUntil: 120, attendeeCount: 2 },
    ],
  });
  assertEquals(decisionDensity(c), null);
});

// ─── Evaluator integration + scope routing ───────────────────────────────────
Deno.test("evaluate(): decisionDensity surfaces on all three scopes", () => {
  const c = ctx({
    upcomingEvents: [
      { title: "Board investment vote", minutesUntil: 30, attendeeCount: 8 },
      { title: "Hiring decision", minutesUntil: 120, attendeeCount: 8 },
    ],
  });
  for (const scope of ["brief", "plan", "nudge"] as const) {
    const flags = evaluate(c, { scope });
    assert(
      flags.some((f) => f.rule === "decisionDensity"),
      `decisionDensity should fire on ${scope}`,
    );
  }
});

// ─── Stubs return null (API surface only) ────────────────────────────────────
Deno.test("Batch 3 stubs return null across rich context (no false fires)", () => {
  const c = ctx({
    upcomingEvents: [
      { title: "Board investment vote", minutesUntil: 30, attendeeCount: 8 },
      { title: "Layoff conversation", minutesUntil: 120, attendeeCount: 2 },
    ],
    crisisEvent: { title: "Press call", minutesUntil: 60 },
    minutesSinceLastPractice: 48 * 60,
  }, { isHighVisibilityToday: true });

  const flags = evaluate(c);
  const stubRules = [
    "stackedStakes",
    "crisisInjection",
    "contextSwitchingCost",
    "preEventSleepTarget",
    "timeSinceLastRecovery",
    "interpersonalMeetingContext",
    "emptySlotProtection",
    "upwardReporting",
  ];
  for (const r of stubRules) {
    assertFalse(
      flags.some((f) => f.rule === r),
      `${r} must return null until detector lands`,
    );
  }
});

// ─── Registry guard ─────────────────────────────────────────────────────────
Deno.test("ALL_RULES contains every Batch 3 rule, correctly scoped", () => {
  const need: Array<{ rule: string; scopes: string[] }> = [
    { rule: "decisionDensity",            scopes: ["brief", "plan", "nudge"] },
    { rule: "interpersonalMeetingContext", scopes: ["brief", "plan", "nudge"] },
    { rule: "emptySlotProtection",        scopes: ["plan", "nudge"] },
    { rule: "upwardReporting",            scopes: ["brief", "plan", "nudge"] },
    { rule: "stackedStakes",              scopes: ["brief", "plan", "nudge"] },
    { rule: "crisisInjection",            scopes: ["brief", "plan", "nudge"] },
    { rule: "contextSwitchingCost",       scopes: ["brief", "plan", "nudge"] },
    { rule: "preEventSleepTarget",        scopes: ["nudge"] },
    { rule: "timeSinceLastRecovery",      scopes: ["nudge"] },
  ];
  for (const n of need) {
    const entry = ALL_RULES.find((r) => r.fn.name === n.rule);
    assert(entry, `${n.rule} missing from ALL_RULES`);
    assertEquals(
      [...entry!.scopes].sort(),
      [...n.scopes].sort(),
      `${n.rule} scopes mismatch`,
    );
  }
});