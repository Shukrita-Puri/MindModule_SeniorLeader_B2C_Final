// Characterization tests for the extracted signal-pill derivation.
//
// Expected values authored by reading the former inline block in
// compute-outer-readiness/index.ts (former L5879-L6357) plus this module's
// exported constants. Targeted field assertions (no opaque snapshots) so
// any future threshold change is obvious in the diff.
//
// Determinism: derivePills reads no time/env; finalizePills only reads
// APP_ENV for a warn-log gate and does not include it in output. Each
// characterization test therefore runs deterministically; DET-35/36
// re-invoke twice with JSON deep-equal to guard against accidental
// Date.now()/random introduction.

import {
  assertEquals,
  assertNotEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  derivePills,
  finalizePills,
  PILL_TIER_LABELS,
  PILL_NEUTRAL_LABELS,
  DETAIL_AWAITING,
  DETAIL_EARLY_READ,
  type DerivePillsInput,
  type SignalPill,
  type PillKey,
} from "./derive-pills.ts";

function baseInput(overrides: Partial<DerivePillsInput> = {}): DerivePillsInput {
  return {
    hrvValue: null,
    hrvDeviation: null,
    sleepDuration: null,
    sleepScoreVal: null,
    rhrValue: null,
    rhrDeviation: null,
    hrValue: null,
    hrDeviation: null,
    sleepEfficiency: null,
    wearableContextHrvDeviation: null,
    wearableContextPoorSleep: false,
    wearableContextHrvElevated: false,
    clarityLevel: null,
    emotionLevel: null,
    regulationLevel: null,
    pressureLevel: null,
    calendarLoad: null,
    calendarPressure: null,
    highStakesEventsCount: 0,
    rhr3dTrend: "unknown",
    sustainedDeficitFlag: false,
    cooccurrence7d: {
      cooccurrence_count: 0,
      cooccurrence_ratio: null,
      days_observed: 0,
    },
    protectionGoals: [],
    wearableFreshForGate: true,
    checkInFreshForGate: true,
    hasWearable: true,
    wearableDaysConnected: 30,
    ...overrides,
  };
}

function pill(pills: SignalPill[], key: PillKey): SignalPill {
  const p = pills.find((x) => x.key === key);
  if (!p) throw new Error(`missing pill ${key}`);
  return p;
}

// ── Decision Readiness ─────────────────────────────────────────────────

Deno.test("DR-01: no signals -> neutral, no_fresh_wearable, DETAIL_AWAITING", () => {
  const r = derivePills(baseInput());
  const dr = pill(r.pills, "decision_readiness");
  assertEquals(dr.tier, "neutral");
  assertEquals(dr.tierLabel, "Mind Unread");
  assertEquals(dr.isScoreBearing, false);
  assertEquals(dr.hiddenReason, "no_fresh_wearable");
  assertEquals(dr.detail, DETAIL_AWAITING);
  assertEquals(dr.sourceTypes, []);
});

Deno.test("DR-02: HRV deviation -8 (boundary -> green)", () => {
  const r = derivePills(baseInput({ hrvValue: 55, hrvDeviation: -8 }));
  assertEquals(r.cognitiveTier, "green");
  assertEquals(pill(r.pills, "decision_readiness").tierLabel, "Mind Sharp");
});

Deno.test("DR-03: HRV deviation -9 -> amber", () => {
  const r = derivePills(baseInput({ hrvValue: 55, hrvDeviation: -9 }));
  assertEquals(r.cognitiveTier, "amber");
});

Deno.test("DR-04: HRV deviation -20 (boundary -> red)", () => {
  const r = derivePills(baseInput({ hrvValue: 40, hrvDeviation: -20 }));
  assertEquals(r.cognitiveTier, "red");
  assertEquals(pill(r.pills, "decision_readiness").tierLabel, "Mind Foggy");
});

Deno.test("DR-05: HRV absolute fallback value 39 (< 40 -> amber)", () => {
  const r = derivePills(baseInput({ hrvValue: 39 }));
  assertEquals(r.cognitiveTier, "amber");
});

Deno.test("DR-06: sleep duration 359 (< 360 -> red)", () => {
  const r = derivePills(baseInput({ sleepDuration: 359 }));
  assertEquals(r.cognitiveTier, "red");
});

Deno.test("DR-07: sleep duration 419 (< 420 -> amber)", () => {
  const r = derivePills(baseInput({ sleepDuration: 419 }));
  assertEquals(r.cognitiveTier, "amber");
});

Deno.test("DR-08: sleep score 59 (< 60 -> red)", () => {
  const r = derivePills(baseInput({ sleepScoreVal: 59 }));
  assertEquals(r.cognitiveTier, "red");
});

Deno.test("DR-09: sleep score 69 (< 70 -> amber)", () => {
  const r = derivePills(baseInput({ sleepScoreVal: 69 }));
  assertEquals(r.cognitiveTier, "amber");
});

Deno.test("DR-10: clarityLevel 2 (self-report -> red overlay)", () => {
  const r = derivePills(baseInput({ clarityLevel: 2 }));
  assertEquals(r.cognitiveTier, "red");
  const dr = pill(r.pills, "decision_readiness");
  assertEquals(dr.sourceTypes.includes("checkin"), true);
  assertEquals(dr.contributedByCheckIn, true);
});

Deno.test("DR-11: supply-demand cap green + high calendar + bodyDown -> amber", () => {
  const r = derivePills(
    baseInput({
      hrvValue: 60,
      hrvDeviation: 0,
      calendarLoad: "high",
      wearableContextHrvDeviation: -12,
    }),
  );
  assertEquals(r.supplyDemandGapPill, true);
  assertEquals(r.cognitiveTier, "amber");
});

// ── Physical Reserves ──────────────────────────────────────────────────

Deno.test("PR-12: RHR deviation +10 (boundary -> green)", () => {
  const r = derivePills(baseInput({ rhrValue: 60, rhrDeviation: 10 }));
  assertEquals(r.physicalTier, "green");
});

Deno.test("PR-13: RHR deviation +11 (> 10 -> amber)", () => {
  const r = derivePills(baseInput({ rhrValue: 60, rhrDeviation: 11 }));
  assertEquals(r.physicalTier, "amber");
});

Deno.test("PR-14: RHR deviation +21 (> 20 -> red)", () => {
  const r = derivePills(baseInput({ rhrValue: 70, rhrDeviation: 21 }));
  assertEquals(r.physicalTier, "red");
});

Deno.test("PR-15: RHR absolute fallback 91 (> 90 -> red)", () => {
  const r = derivePills(baseInput({ rhrValue: 91 }));
  assertEquals(r.physicalTier, "red");
});

Deno.test("PR-16: HR proxy hrDeviation +21 -> red", () => {
  const r = derivePills(
    baseInput({ rhrValue: 60, rhrDeviation: 0, hrValue: 90, hrDeviation: 21 }),
  );
  assertEquals(r.physicalTier, "red");
});

Deno.test("PR-17: rhr3dTrend rising adds amber", () => {
  const r = derivePills(
    baseInput({ rhrValue: 60, rhrDeviation: 0, rhr3dTrend: "rising" }),
  );
  assertEquals(r.physicalTier, "amber");
});

Deno.test("PR-18: sustained deficit -> red; sleep not in PR contributors", () => {
  const r = derivePills(
    baseInput({ rhrValue: 60, rhrDeviation: 0, sustainedDeficitFlag: true }),
  );
  assertEquals(r.physicalTier, "red");
  const pr = pill(r.pills, "physical_reserves");
  assertEquals("sleepDuration" in pr.contributors, false);
  assertEquals("sleepScore" in pr.contributors, false);
});

Deno.test("PR-19: displayable gate -- pattern-only tier collapses to neutral", () => {
  const r = derivePills(baseInput({ sustainedDeficitFlag: true }));
  const pr = pill(r.pills, "physical_reserves");
  assertEquals(pr.tier, "neutral");
  assertEquals(pr.tierLabel, PILL_NEUTRAL_LABELS.physical_reserves);
  assertEquals(pr.isScoreBearing, false);
});

// ── Resilience Capacity ────────────────────────────────────────────────

Deno.test("RC-20: sleep_efficiency 85 (boundary -> green)", () => {
  const r = derivePills(baseInput({ sleepEfficiency: 85 }));
  assertEquals(r.resilienceTier, "green");
});

Deno.test("RC-21: sleep_efficiency 84 (< 85 -> amber)", () => {
  const r = derivePills(baseInput({ sleepEfficiency: 84 }));
  assertEquals(r.resilienceTier, "amber");
});

Deno.test("RC-22: sleep_efficiency 69 (< 70 -> red)", () => {
  const r = derivePills(baseInput({ sleepEfficiency: 69 }));
  assertEquals(r.resilienceTier, "red");
});

Deno.test("RC-23: emotionLevel 2 -> amber (self-report overlay)", () => {
  const r = derivePills(baseInput({ sleepEfficiency: 90, emotionLevel: 2 }));
  assertEquals(r.resilienceTier, "amber");
  const rc = pill(r.pills, "resilience_capacity");
  assertEquals(rc.sourceTypes.includes("checkin"), true);
});

Deno.test("RC-24: regulation-risk floor (regulation 2 + pressure 4) -> amber", () => {
  const r = derivePills(
    baseInput({ sleepEfficiency: 90, regulationLevel: 2, pressureLevel: 4 }),
  );
  assertEquals(r.regulationRiskPill, true);
  assertEquals(r.resilienceTier, "amber");
});

Deno.test("RC-25: cooccurrence count 3 -> red", () => {
  const r = derivePills(
    baseInput({
      sleepEfficiency: 90,
      cooccurrence7d: {
        cooccurrence_count: 3,
        cooccurrence_ratio: 0.5,
        days_observed: 6,
      },
    }),
  );
  assertEquals(r.resilienceTier, "red");
  const rc = pill(r.pills, "resilience_capacity");
  assertEquals(rc.sourceTypes.includes("pattern"), true);
});

Deno.test("RC-26: protection goals + calendarPressure high -> amber framing", () => {
  const r = derivePills(
    baseInput({
      sleepEfficiency: 90,
      protectionGoals: ["mornings"],
      calendarPressure: "high",
    }),
  );
  assertEquals(r.resilienceTier, "amber");
});

// ── Freshness / cold-start ─────────────────────────────────────────────

Deno.test("FR-27: !wearableFreshForGate -> all pills neutral, DETAIL_AWAITING", () => {
  const r = derivePills(
    baseInput({
      hrvValue: 60,
      hrvDeviation: 0,
      rhrValue: 60,
      rhrDeviation: 0,
      sleepEfficiency: 90,
      wearableFreshForGate: false,
    }),
  );
  for (const p of r.pills) {
    assertEquals(p.tier, "neutral");
    assertEquals(p.isScoreBearing, false);
    assertEquals(p.detail, DETAIL_AWAITING);
    assertEquals(p.hiddenReason, "no_fresh_wearable");
  }
});

Deno.test("FR-28: stale check-in -> DR early read, no check-in credit", () => {
  const r = derivePills(
    baseInput({
      hrvValue: 60,
      hrvDeviation: 0,
      rhrValue: 60,
      rhrDeviation: 0,
      sleepEfficiency: 90,
      clarityLevel: 5,
      emotionLevel: 5,
      checkInFreshForGate: false,
    }),
  );
  const dr = pill(r.pills, "decision_readiness");
  assertEquals(dr.isScoreBearing, true);
  assertEquals(dr.contributedByCheckIn, false);
  assertEquals(dr.detail, DETAIL_EARLY_READ);
});

Deno.test("FR-29: no wearable at all -> freshness missing", () => {
  const r = derivePills(
    baseInput({
      hasWearable: false,
      wearableFreshForGate: false,
      wearableDaysConnected: 0,
    }),
  );
  for (const p of r.pills) {
    assertEquals(p.freshness, "missing");
  }
});

Deno.test("FR-30: cold-start label populated on every pill", () => {
  const r = derivePills(baseInput({ wearableDaysConnected: 5 }));
  for (const p of r.pills) {
    assertNotEquals(p.coldStartLabel, null);
  }
  assertStrictEquals(r.pills[0].coldStartLabel, r.pills[1].coldStartLabel);
});

// ── Contributor ownership ──────────────────────────────────────────────

Deno.test("CN-31: DR owns HRV/sleep/clarity; PR owns RHR/HR only", () => {
  const r = derivePills(
    baseInput({
      hrvValue: 55,
      sleepDuration: 480,
      sleepScoreVal: 80,
      clarityLevel: 4,
      rhrValue: 60,
      hrValue: 70,
    }),
  );
  const dr = pill(r.pills, "decision_readiness").contributors;
  assertEquals(dr.hrvValue, 55);
  assertEquals(dr.sleepDuration, 480);
  assertEquals(dr.sleepScore, 80);
  assertEquals(dr.clarityLevel, 4);
  const pr = pill(r.pills, "physical_reserves").contributors;
  assertEquals(pr.rhrValue, 60);
  assertEquals(pr.hrValue, 70);
  assertEquals("sleepDuration" in pr, false);
  assertEquals("sleepScore" in pr, false);
  assertEquals("clarityLevel" in pr, false);
});

Deno.test("LB-32: PILL_TIER_LABELS matches production vocabulary", () => {
  assertEquals(PILL_TIER_LABELS.decision_readiness.green, "Mind Sharp");
  assertEquals(PILL_TIER_LABELS.decision_readiness.amber, "Mind Mixed");
  assertEquals(PILL_TIER_LABELS.decision_readiness.red, "Mind Foggy");
  assertEquals(PILL_TIER_LABELS.decision_readiness.neutral, "Mind Unread");
  assertEquals(PILL_TIER_LABELS.physical_reserves.green, "Body Steady");
  assertEquals(PILL_TIER_LABELS.physical_reserves.red, "Body Depleted");
  assertEquals(PILL_TIER_LABELS.resilience_capacity.green, "Reserve Strong");
  assertEquals(PILL_TIER_LABELS.resilience_capacity.red, "Reserve Spent");
});

// ── finalizePills ──────────────────────────────────────────────────────

Deno.test("FP-33: finalizePills returns coherence + qualifiers on all pills", () => {
  const derived = derivePills(
    baseInput({
      hrvValue: 60,
      hrvDeviation: 0,
      rhrValue: 60,
      rhrDeviation: 0,
      sleepEfficiency: 90,
    }),
  );
  const finalized = finalizePills({
    pills: derived.pills,
    safeTier: "depleted" as any,
    cognitiveTier: derived.cognitiveTier,
    physicalTier: derived.physicalTier,
    resilienceTier: derived.resilienceTier,
    checkinHistory14d: [],
    wearableHistory14d: [],
    baselines: { hrv: null, rhr: null, sleep: null },
    hrv3dTrend: "unknown",
    rhr3dTrend: "unknown",
  });
  assertEquals(typeof finalized.coherence.inSync, "boolean");
  assertEquals(Array.isArray(finalized.coherence.adjustments), true);
  for (const p of finalized.pills) {
    assertNotEquals(p.qualifiers, undefined);
  }
});

Deno.test("FP-34: RC sleepEfficiency contributor updated from latest wearable row", () => {
  const derived = derivePills(baseInput({ sleepEfficiency: 80 }));
  const finalized = finalizePills({
    pills: derived.pills,
    safeTier: "managing" as any,
    cognitiveTier: derived.cognitiveTier,
    physicalTier: derived.physicalTier,
    resilienceTier: derived.resilienceTier,
    checkinHistory14d: [],
    wearableHistory14d: [
      { summary_date: "2026-07-17", sleep_efficiency: 92 } as any,
    ],
    baselines: { hrv: null, rhr: null, sleep: null },
    hrv3dTrend: "unknown",
    rhr3dTrend: "unknown",
  });
  const rc = pill(finalized.pills, "resilience_capacity");
  assertEquals(rc.contributors.sleepEfficiency, 92);
});

Deno.test("FP-35: canonical finalized payload carries qualifiers + coherence into downstream consumers", () => {
  const derived = derivePills(
    baseInput({
      hrvValue: 60,
      hrvDeviation: 0,
      rhrValue: 60,
      rhrDeviation: 0,
      sleepEfficiency: 90,
    }),
  );
  const preFinalizePayload = derived.pills;
  const finalized = finalizePills({
    pills: preFinalizePayload,
    safeTier: "depleted" as any,
    cognitiveTier: derived.cognitiveTier,
    physicalTier: derived.physicalTier,
    resilienceTier: derived.resilienceTier,
    checkinHistory14d: [],
    wearableHistory14d: [],
    baselines: { hrv: null, rhr: null, sleep: null },
    hrv3dTrend: "unknown",
    rhr3dTrend: "unknown",
  });
  const signalPillsPayload = finalized.pills;
  const echoedSignalPills = signalPillsPayload;
  const baselineSignalPills = signalPillsPayload;
  const refinedSignalPills = signalPillsPayload;

  assertNotEquals(signalPillsPayload, preFinalizePayload);
  const finalDecision = pill(signalPillsPayload, "decision_readiness");
  assertEquals(finalDecision.tier, "red");
  assertNotEquals(finalDecision.qualifiers, undefined);
  assertEquals(pill(echoedSignalPills, "decision_readiness").tier, "red");
  assertNotEquals(pill(echoedSignalPills, "decision_readiness").qualifiers, undefined);
  assertEquals(pill(baselineSignalPills, "decision_readiness").tier, "red");
  assertNotEquals(pill(baselineSignalPills, "decision_readiness").qualifiers, undefined);
  assertEquals(pill(refinedSignalPills, "decision_readiness").tier, "red");
  assertNotEquals(pill(refinedSignalPills, "decision_readiness").qualifiers, undefined);
});

// ── Determinism ────────────────────────────────────────────────────────

Deno.test("DET-36: derivePills deterministic across two invocations", () => {
  const inputs: DerivePillsInput[] = [
    baseInput({ hrvValue: 55, hrvDeviation: -10, clarityLevel: 3 }),
    baseInput({ rhrValue: 65, rhrDeviation: 12, rhr3dTrend: "rising" }),
    baseInput({
      sleepEfficiency: 78,
      emotionLevel: 2,
      regulationLevel: 2,
      pressureLevel: 4,
      calendarPressure: "high",
      protectionGoals: ["mornings"],
      cooccurrence7d: {
        cooccurrence_count: 2,
        cooccurrence_ratio: 0.4,
        days_observed: 5,
      },
    }),
    baseInput({ wearableFreshForGate: false, hasWearable: false }),
  ];
  for (const inp of inputs) {
    const a = derivePills(inp);
    const b = derivePills(inp);
    assertEquals(JSON.stringify(a), JSON.stringify(b));
  }
});

Deno.test("DET-37: finalizePills deterministic across two invocations", () => {
  const build = () =>
    derivePills(
      baseInput({
        hrvValue: 55,
        hrvDeviation: -12,
        rhrValue: 62,
        rhrDeviation: 8,
        sleepEfficiency: 88,
        clarityLevel: 4,
      }),
    );
  const runOnce = () => {
    const d = build();
    return finalizePills({
      pills: d.pills,
      safeTier: "managing" as any,
      cognitiveTier: d.cognitiveTier,
      physicalTier: d.physicalTier,
      resilienceTier: d.resilienceTier,
      checkinHistory14d: [],
      wearableHistory14d: [],
      baselines: { hrv: 60, rhr: 60, sleep: 82 },
      hrv3dTrend: "stable",
      rhr3dTrend: "stable",
    });
  };
  const a = runOnce();
  const b = runOnce();
  assertEquals(JSON.stringify(a.pills), JSON.stringify(b.pills));
  assertEquals(a.coherenceWarning, b.coherenceWarning);
});

Deno.test("DET-38: derivePills does not mutate input", () => {
  const input = baseInput({
    cooccurrence7d: {
      cooccurrence_count: 3,
      cooccurrence_ratio: 0.5,
      days_observed: 6,
    },
    protectionGoals: ["mornings"],
  });
  const before = JSON.stringify(input);
  derivePills(input);
  assertEquals(JSON.stringify(input), before);
});

Deno.test("DET-39: finalizePills does not mutate input pills or nested members", () => {
  const derived = derivePills(
    baseInput({
      hrvValue: 60,
      hrvDeviation: 0,
      rhrValue: 60,
      rhrDeviation: 0,
      sleepEfficiency: 90,
    }),
  );
  const originalPills = derived.pills;
  const before = JSON.stringify(originalPills);
  const finalized = finalizePills({
    pills: originalPills,
    safeTier: "depleted" as any,
    cognitiveTier: derived.cognitiveTier,
    physicalTier: derived.physicalTier,
    resilienceTier: derived.resilienceTier,
    checkinHistory14d: [],
    wearableHistory14d: [],
    baselines: { hrv: null, rhr: null, sleep: null },
    hrv3dTrend: "unknown",
    rhr3dTrend: "unknown",
  });
  assertEquals(JSON.stringify(originalPills), before);
  assertNotEquals(finalized.pills, originalPills);
  assertNotEquals(finalized.pills[0], originalPills[0]);
});

Deno.test("DET-40: derivePills and finalizePills perform no console calls", () => {
  const originalWarn = console.warn;
  const originalLog = console.log;
  const originalError = console.error;
  console.warn = () => {
    throw new Error("console.warn should not be called");
  };
  console.log = () => {
    throw new Error("console.log should not be called");
  };
  console.error = () => {
    throw new Error("console.error should not be called");
  };

  try {
    const derived = derivePills(
      baseInput({
        hrvValue: 60,
        hrvDeviation: 0,
        rhrValue: 60,
        rhrDeviation: 0,
        sleepEfficiency: 90,
      }),
    );
    const finalized = finalizePills({
      pills: derived.pills,
      safeTier: "depleted" as any,
      cognitiveTier: derived.cognitiveTier,
      physicalTier: derived.physicalTier,
      resilienceTier: derived.resilienceTier,
      checkinHistory14d: [],
      wearableHistory14d: [],
      baselines: { hrv: null, rhr: null, sleep: null },
      hrv3dTrend: "unknown",
      rhr3dTrend: "unknown",
    });
    assertEquals(finalized.diagnostics.warnings.length > 0, true);
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    console.error = originalError;
  }
});

// ── Cross-pillar ───────────────────────────────────────────────────────

Deno.test("XP-41: baseline (wearable only) -> no checkin source anywhere", () => {
  const r = derivePills(
    baseInput({ hrvValue: 55, rhrValue: 60, sleepEfficiency: 88 }),
  );
  for (const p of r.pills) {
    assertEquals(p.sourceTypes.includes("checkin"), false);
  }
});

Deno.test("XP-42: refined -> contributedByCheckIn true where check-in contributed", () => {
  const r = derivePills(
    baseInput({
      hrvValue: 55,
      rhrValue: 60,
      sleepEfficiency: 88,
      clarityLevel: 4,
      emotionLevel: 4,
    }),
  );
  const dr = pill(r.pills, "decision_readiness");
  const pr = pill(r.pills, "physical_reserves");
  const rc = pill(r.pills, "resilience_capacity");
  assertEquals(dr.contributedByCheckIn, true);
  assertEquals(pr.contributedByCheckIn, false);
  assertEquals(rc.contributedByCheckIn, true);
});

Deno.test("XP-43: clarity is check-in (self-report), never wearable", () => {
  const r = derivePills(baseInput({ clarityLevel: 4 }));
  const dr = pill(r.pills, "decision_readiness");
  assertEquals(dr.sourceTypes.includes("checkin"), true);
  assertEquals(dr.sourceTypes.includes("wearable"), false);
});
