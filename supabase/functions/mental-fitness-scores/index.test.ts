import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeWeeklyDeltaComparison } from "./index.ts";

Deno.test("weekly delta suppresses check-in-only vs refined composition", () => {
  const rows = [
    { local_date: "2026-06-17", readiness_score_baseline: null, readiness_score_refined: 62, readiness_state: "refined" },
    { local_date: "2026-06-16", readiness_score_baseline: null, readiness_score_refined: 60, readiness_state: "refined" },
    { local_date: "2026-06-10", readiness_score_baseline: 55, readiness_score_refined: 60, readiness_state: "refined" },
  ];

  const result = computeWeeklyDeltaComparison(rows, "2026-06-15", "2026-06-08", "2026-06-14", "2026-06-17");

  assertEquals(result.reason, "composition_mismatch");
  assertEquals(result.baselineDelta, null);
  assertEquals(result.refinedDelta, null);
});

Deno.test("weekly delta suppresses baseline-only vs refined composition", () => {
  const rows = [
    { local_date: "2026-06-17", readiness_score_baseline: 61, readiness_score_refined: null, readiness_state: "baseline" },
    { local_date: "2026-06-16", readiness_score_baseline: 59, readiness_score_refined: null, readiness_state: "baseline" },
    { local_date: "2026-06-10", readiness_score_baseline: 55, readiness_score_refined: 60, readiness_state: "refined" },
    { local_date: "2026-06-09", readiness_score_baseline: 54, readiness_score_refined: 59, readiness_state: "refined" },
  ];

  const result = computeWeeklyDeltaComparison(rows, "2026-06-15", "2026-06-08", "2026-06-14", "2026-06-17");

  assertEquals(result.reason, "composition_mismatch");
  assertEquals(result.baselineDelta, null);
  assertEquals(result.refinedDelta, null);
});

Deno.test("weekly delta suppresses first-ever week with no prior history", () => {
  const rows = [
    { local_date: "2026-06-17", readiness_score_baseline: 60, readiness_score_refined: null, readiness_state: "baseline" },
  ];

  const result = computeWeeklyDeltaComparison(rows, "2026-06-15", "2026-06-08", "2026-06-14", "2026-06-17");

  assertEquals(result.reason, "not_enough_history");
  assertEquals(result.baselineDelta, null);
  assertEquals(result.refinedDelta, null);
});

Deno.test("weekly delta allows matching baseline-only compositions", () => {
  const rows = [
    { local_date: "2026-06-17", readiness_score_baseline: 60, readiness_score_refined: null, readiness_state: "baseline" },
    { local_date: "2026-06-16", readiness_score_baseline: 50, readiness_score_refined: null, readiness_state: "baseline" },
    { local_date: "2026-06-10", readiness_score_baseline: 40, readiness_score_refined: null, readiness_state: "baseline" },
    { local_date: "2026-06-09", readiness_score_baseline: 50, readiness_score_refined: null, readiness_state: "baseline" },
  ];

  const result = computeWeeklyDeltaComparison(rows, "2026-06-15", "2026-06-08", "2026-06-14", "2026-06-17");

  assertEquals(result.reason, null);
  assertEquals(result.comparisonMetric, "baseline");
  assertEquals(result.baselineDelta, 10);
  assertEquals(result.refinedDelta, null);
});

Deno.test("weekly delta allows matching refined-with-baseline compositions", () => {
  const rows = [
    { local_date: "2026-06-17", readiness_score_baseline: 60, readiness_score_refined: 64, readiness_state: "refined" },
    { local_date: "2026-06-16", readiness_score_baseline: 58, readiness_score_refined: 61, readiness_state: "refined" },
    { local_date: "2026-06-10", readiness_score_baseline: 52, readiness_score_refined: 57, readiness_state: "refined" },
    { local_date: "2026-06-09", readiness_score_baseline: 50, readiness_score_refined: 55, readiness_state: "refined" },
  ];

  const result = computeWeeklyDeltaComparison(rows, "2026-06-15", "2026-06-08", "2026-06-14", "2026-06-17");

  assertEquals(result.reason, null);
  assertEquals(result.comparisonMetric, "refined");
  assertEquals(result.refinedDelta, 4);
  assertEquals(result.baselineDelta, null);
});
