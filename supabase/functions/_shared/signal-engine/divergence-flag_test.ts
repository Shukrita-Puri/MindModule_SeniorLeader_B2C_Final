// MRS v4 — divergence-flag.ts tests covering INTRADAY_DECLINE (§6 flag 2)
// and the window-aware physiological composite (§3.2/3.3/3.4).

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  computeIntradayDecline,
  computePhysiologicalCompositeWindow,
} from "./divergence-flag.ts";

Deno.test("INTRADAY_DECLINE — fires on ≥10pt drop + decision leakage", () => {
  const fired = computeIntradayDecline({
    currentWindowBaseline: 60,
    morningBaselineScore: 75,
    decisionLeakageRisk: true,
  });
  assertEquals(fired, true);
});

Deno.test("INTRADAY_DECLINE — fires on ≥10pt drop + body load elevated", () => {
  const fired = computeIntradayDecline({
    currentWindowBaseline: 55,
    morningBaselineScore: 70,
    bodyLoadElevated: true,
  });
  assertEquals(fired, true);
});

Deno.test("INTRADAY_DECLINE — fires on ≥10pt drop + intraday HR ≥ +15%", () => {
  const fired = computeIntradayDecline({
    currentWindowBaseline: 50,
    morningBaselineScore: 65,
    intradayHrDeviationPct: 18,
  });
  assertEquals(fired, true);
});

Deno.test("INTRADAY_DECLINE — silent when drop < 10pts (anchor priority)", () => {
  const fired = computeIntradayDecline({
    currentWindowBaseline: 67,
    morningBaselineScore: 75,
    decisionLeakageRisk: true,
    bodyLoadElevated: true,
  });
  assertEquals(fired, false);
});

Deno.test("INTRADAY_DECLINE — silent when drop exists but no corroborating signal", () => {
  const fired = computeIntradayDecline({
    currentWindowBaseline: 55,
    morningBaselineScore: 75,
    intradayHrDeviationPct: 4,
  });
  assertEquals(fired, false);
});

Deno.test("INTRADAY_DECLINE — null morning anchor never fires", () => {
  const fired = computeIntradayDecline({
    currentWindowBaseline: 30,
    morningBaselineScore: null,
    decisionLeakageRisk: true,
    bodyLoadElevated: true,
    intradayHrDeviationPct: 30,
  });
  assertEquals(fired, false);
});

Deno.test("computePhysiologicalCompositeWindow — afternoon honours intraday HR", () => {
  const score = computePhysiologicalCompositeWindow("afternoon", {
    hrvDeviationPct: 0,
    sleepHours: 7.5,
    rhrTrend: "stable",
    intradayHrDeviationPct: 0,
  });
  // All four components contribute → numeric, not null.
  assertEquals(typeof score, "number");
});

Deno.test("computePhysiologicalCompositeWindow — evening uses evening HRV when present", () => {
  const goodEvening = computePhysiologicalCompositeWindow("evening", {
    hrvDeviationPct: -10, // morning anchor
    hrvEveningDeviationPct: 10, // evening fresh read recovers
    sleepHours: 7.5,
    rhrTrend: "declining",
  });
  const badEvening = computePhysiologicalCompositeWindow("evening", {
    hrvDeviationPct: -10,
    hrvEveningDeviationPct: -10,
    sleepHours: 7.5,
    rhrTrend: "declining",
  });
  // Evening pillar dominates → recovered evening read should score higher.
  if (typeof goodEvening === "number" && typeof badEvening === "number") {
    assertEquals(goodEvening > badEvening, true);
  } else {
    throw new Error("Expected numeric composites");
  }
});

Deno.test("computePhysiologicalCompositeWindow — returns null when nothing measurable", () => {
  const score = computePhysiologicalCompositeWindow("morning", {});
  assertEquals(score, null);
});