// Part 4 — Registry contract test.
// Auto-discovers every registered behaviour module via ALL_RULES and asserts
// each one (a) is well-formed structurally, (b) when fired produces a valid
// BehaviourFlag, and (c) participates correctly in the slot-boost pipeline if
// it declared a `slotBoost` descriptor. New behaviour modules added to
// ALL_RULES are validated automatically — no edits needed here.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ALL_RULES } from "./index.ts";
import { deriveSlotBoosts, evaluate } from "../behaviour-evaluator.ts";
import type {
  BehaviourFlag,
  RuleContext,
  RuleScope,
  SignalMatrix,
} from "../brief-context.ts";

const SCOPES: RuleScope[] = ["brief", "plan", "nudge"];
const SEVERITIES = new Set(["low", "medium", "high"]);

function richSignals(): SignalMatrix {
  // Populated enough to plausibly trigger many rules at once; individual rules
  // still self-gate, so most will return null — that's fine for the contract.
  return {
    hrvDeviationPct: -22, hrvUnusual: true,
    sleepHours: 5.6, sleepDeviationPct: -20, sleepBelow6h: true,
    rhrDeviationPct: 12, hrElevatedProxy: true,
    emotionalSelfDeclared: "depleted", mentalSharpness: 4, confidence: 4,
    timezoneOffsetMinutes: 0, timezoneShift48hHours: 5, travelDay: false,
    yesterdayScore: 82, todayScore: 60,
    postPeakWindow: true, isHighVisibilityToday: false,
    emotionalDrainEventInNext4h: { title: "Layoff comms", minutesUntil: 90 },
    highStakesEventInNext24h: { title: "Board Review", minutesUntil: 180 },
    morningWasCompressed: true, middayRecoveryDetected: true,
    clarityDropFromTrailingAvg: -2,
  };
}

function richCtx(): RuleContext {
  return {
    signals: richSignals(),
    upcomingEvents: [
      { title: "Board Review", minutesUntil: 180, stakesLevel: "board", categoryId: "A", attendeeCount: 8 },
      { title: "Investor pitch", minutesUntil: 240, categoryId: "B", attendeeCount: 3 },
      { title: "All-hands keynote", minutesUntil: 60, categoryId: "C", attendeeCount: 200 },
      { title: "1:1 with VP Eng", minutesUntil: 30, categoryId: "D", attendeeCount: 2, isInterpersonal: true },
      { title: "Strategy block", minutesUntil: 120, categoryId: "E", durationMinutes: 120 },
    ],
    localHour: 9,
    dayOfWeek: 2,
    backToBackHoursToday: 5,
    historicalAppOpenRateLow: true,
    conferenceDayNumber: 2,
  };
}

function assertValidFlag(f: BehaviourFlag, ruleId: string) {
  assert(typeof f.rule === "string" && f.rule.length > 0, `${ruleId}: empty rule name`);
  assert(SEVERITIES.has(f.severity), `${ruleId}: invalid severity "${f.severity}"`);
  assert(Array.isArray(f.evidence), `${ruleId}: evidence not an array`);
  assert(typeof f.copyHint === "string" && f.copyHint.trim().length > 0, `${ruleId}: empty copyHint`);
}

Deno.test("registry: every rule has scopes and a callable fn", () => {
  assert(ALL_RULES.length > 0, "ALL_RULES is empty");
  for (const r of ALL_RULES) {
    const id = r.id ?? r.fn.name;
    assert(Array.isArray(r.scopes) && r.scopes.length > 0, `${id}: no scopes`);
    for (const s of r.scopes) assert(SCOPES.includes(s), `${id}: invalid scope "${s}"`);
    assert(typeof r.fn === "function", `${id}: fn not callable`);
  }
});

Deno.test("registry: every rule runs without throwing on a rich context, in every declared scope", () => {
  const ctx = richCtx();
  for (const r of ALL_RULES) {
    const id = r.id ?? r.fn.name;
    let flag: BehaviourFlag | null = null;
    try {
      flag = r.fn(ctx);
    } catch (e) {
      throw new Error(`${id} threw on rich context: ${(e as Error).message}`);
    }
    if (flag) {
      assertEquals(flag.rule, id as BehaviourFlag["rule"],
        `${id}: rule name in flag must match registered id`);
      assertValidFlag(flag, id);
    }
  }
});

Deno.test("registry: evaluate() per scope filters correctly and returns sorted, well-formed flags", () => {
  const ctx = richCtx();
  for (const scope of SCOPES) {
    const flags = evaluate(ctx, { scope });
    // Every returned flag came from a rule that declared this scope.
    const allowed = new Set(
      ALL_RULES.filter((r) => r.scopes.includes(scope)).map((r) => r.id ?? r.fn.name),
    );
    for (const f of flags) {
      assert(allowed.has(f.rule), `evaluate(${scope}): leaked rule "${f.rule}"`);
      assertValidFlag(f, f.rule);
    }
  }
});

Deno.test("registry: declared slotBoosts flow through deriveSlotBoosts when severity matches", () => {
  // For each rule that declares a slotBoost, synthesize a flag at the lowest
  // permitted severity and assert deriveSlotBoosts emits a boost for it.
  for (const r of ALL_RULES) {
    if (!r.slotBoost) continue;
    const id = (r.id ?? r.fn.name) as BehaviourFlag["rule"];
    const sev = (r.slotBoost.severities ?? ["high"])[0];
    const synthetic: BehaviourFlag = {
      rule: id, severity: sev, evidence: ["synthetic"], copyHint: "test",
    };
    const boosts = deriveSlotBoosts([synthetic]);
    const got = boosts.find((b) => b.reason === id);
    assert(got, `${id}: declared slotBoost but deriveSlotBoosts emitted none`);
    assertEquals(got!.slot, r.slotBoost.slot, `${id}: wrong slot`);
    assertEquals(got!.practiceType, r.slotBoost.practiceType, `${id}: wrong practiceType`);
    assert(got!.protocol && got!.mode, `${id}: protocol/mode not resolved via PRACTICE_TYPE_TO_COMBO`);
  }
});