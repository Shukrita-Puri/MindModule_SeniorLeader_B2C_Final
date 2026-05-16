import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluate } from "./behaviour-evaluator.ts";
import type { RuleContext, SignalMatrix } from "./brief-context.ts";

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

const ctx = (signals: SignalMatrix, localHour = 9): RuleContext => ({
  signals, upcomingEvents: [], localHour,
});

Deno.test("vetoRisk fires on HRV-22% + sharpness 4 + board day → high severity", () => {
  const flags = evaluate(ctx(emptySignals({
    hrvDeviationPct: -22,
    sleepBelow6h: true,
    sleepHours: 5.6,
    mentalSharpness: 4,
    isHighVisibilityToday: true,
    highStakesEventInNext24h: { title: "2 PM Board Review", minutesUntil: 180 },
  })));
  assert(flags.length >= 2);
  assertEquals(flags[0].severity, "high");
  // boardLevelOutcome OR vetoRisk should be first; both are high.
  assert(["vetoRisk", "boardLevelOutcome"].includes(flags[0].rule));
  const veto = flags.find((f) => f.rule === "vetoRisk");
  assertEquals(veto?.severity, "high");
  assertEquals(veto?.anchorEvent, "2 PM Board Review");
});

Deno.test("decisionLeakageGuard fires on self-decl only when wearable is null", () => {
  const flags = evaluate(ctx(emptySignals({
    emotionalSelfDeclared: "depleted",
    emotionalDrainEventInNext4h: { title: "Layoff comms", minutesUntil: 90 },
  })));
  const guard = flags.find((f) => f.rule === "decisionLeakageGuard");
  assertEquals(guard?.severity, "medium");
  assertEquals(guard?.anchorEvent, "Layoff comms");
});

Deno.test("postPeakHangover fires on yesterday 80 + recovery deficit today", () => {
  const flags = evaluate(ctx(emptySignals({
    yesterdayScore: 82,
    hrvDeviationPct: -12,
  })));
  const pph = flags.find((f) => f.rule === "postPeakHangover");
  assert(pph !== undefined);
});

Deno.test("circadianPriority fires on ≥3h TZ drift", () => {
  const flags = evaluate(ctx(emptySignals({ timezoneShift48hHours: -5, travelDay: true })));
  const cp = flags.find((f) => f.rule === "circadianPriority");
  assertEquals(cp?.severity, "high");
});

Deno.test("no flags when signals are flat", () => {
  const flags = evaluate(ctx(emptySignals()));
  assertEquals(flags.length, 0);
});

Deno.test("secondWind fires on midday recovery after compressed morning", () => {
  const flags = evaluate(ctx(emptySignals({
    morningWasCompressed: true,
    middayRecoveryDetected: true,
  }), 13));
  const sw = flags.find((f) => f.rule === "secondWind");
  assert(sw !== undefined);
});