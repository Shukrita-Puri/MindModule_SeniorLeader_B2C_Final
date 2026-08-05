import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeWeeklyDeltaComparison } from "./index.ts";

Deno.test("mixed composition still averages (no suppression)", () => {
  const rows = [
    {
      local_date: "2026-06-17",
      readiness_score_baseline: null,
      readiness_score_refined: 62,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-16",
      readiness_score_baseline: null,
      readiness_score_refined: 60,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-10",
      readiness_score_baseline: 55,
      readiness_score_refined: 60,
      readiness_state: "refined",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-17",
  );

  assertEquals(result.reason, null);
  assertEquals(result.comparisonMetric, "refined");
  assertEquals(result.thisWeekAvg, 61);
  assertEquals(result.lastWeekAvg, 60);
  assertEquals(result.delta, 1);
  assertEquals(result.refinedDelta, 1);
  assertEquals(result.baselineDelta, null);
});

Deno.test("baseline read averages baseline scores across both weeks", () => {
  const rows = [
    {
      local_date: "2026-06-17",
      readiness_score_baseline: 61,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-16",
      readiness_score_baseline: 59,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-10",
      readiness_score_baseline: 55,
      readiness_score_refined: 60,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-09",
      readiness_score_baseline: 54,
      readiness_score_refined: 59,
      readiness_state: "refined",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-17",
  );

  assertEquals(result.comparisonMetric, "baseline");
  assertEquals(result.thisWeekAvg, 60);
  assertEquals(result.lastWeekAvg, 55); // (55 + 54) / 2 rounded
  assertEquals(result.delta, 6);
  assertEquals(result.baselineDelta, 6);
  assertEquals(result.refinedDelta, null);
});

Deno.test("refined read switches both weeks onto refined scores", () => {
  const rows = [
    {
      local_date: "2026-06-17",
      readiness_score_baseline: 61,
      readiness_score_refined: 70,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-16",
      readiness_score_baseline: 59,
      readiness_score_refined: 64,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-10",
      readiness_score_baseline: 55,
      readiness_score_refined: 60,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-09",
      readiness_score_baseline: 54,
      readiness_score_refined: 58,
      readiness_state: "refined",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-17",
  );

  assertEquals(result.comparisonMetric, "refined");
  assertEquals(result.thisWeekAvg, 67);
  assertEquals(result.lastWeekAvg, 59);
  assertEquals(result.delta, 8);
  assertEquals(result.refinedDelta, 8);
  assertEquals(result.baselineDelta, null);
});

Deno.test("last week uses the full Mon-Sun window (no weekday truncation)", () => {
  const rows = [
    {
      local_date: "2026-06-15",
      readiness_score_baseline: 80,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    // Fri/Sat/Sun of the previous week — dropped by the old lastToday bound.
    {
      local_date: "2026-06-12",
      readiness_score_baseline: 40,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-13",
      readiness_score_baseline: 50,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-14",
      readiness_score_baseline: 60,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-08",
      readiness_score_baseline: 20,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-15",
  );

  assertEquals(result.lastWeekScoredDays, 4);
  assertEquals(result.lastWeekAvg, 43); // (20+40+50+60)/4 = 42.5 -> 43
  assertEquals(result.thisWeekAvg, 80);
  assertEquals(result.delta, 38);
});

Deno.test("awaiting rows are excluded, never counted as zero", () => {
  const rows = [
    {
      local_date: "2026-06-17",
      readiness_score_baseline: null,
      readiness_score_refined: null,
      readiness_state: "awaiting",
    },
    {
      local_date: "2026-06-16",
      readiness_score_baseline: 87,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-15",
      readiness_score_baseline: 87,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-11",
      readiness_score_baseline: 65,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-12",
      readiness_score_baseline: 94,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-13",
      readiness_score_baseline: 74,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-17",
  );

  assertEquals(result.thisWeekScoredDays, 2);
  assertEquals(result.thisWeekAvg, 87);
  assertEquals(result.lastWeekAvg, 78); // (65+94+74)/3 = 77.67 -> 78
  assertEquals(result.delta, 9);
});

Deno.test("weekly delta suppresses first-ever week with no prior history", () => {
  const rows = [
    {
      local_date: "2026-06-17",
      readiness_score_baseline: 60,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-17",
  );

  assertEquals(result.reason, "not_enough_history");
  assertEquals(result.baselineDelta, null);
  assertEquals(result.refinedDelta, null);
  assertEquals(result.delta, null);
});

Deno.test("weekly delta allows matching baseline-only compositions", () => {
  const rows = [
    {
      local_date: "2026-06-17",
      readiness_score_baseline: 60,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-16",
      readiness_score_baseline: 50,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-10",
      readiness_score_baseline: 40,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
    {
      local_date: "2026-06-09",
      readiness_score_baseline: 50,
      readiness_score_refined: null,
      readiness_state: "baseline",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-17",
  );

  assertEquals(result.reason, null);
  assertEquals(result.comparisonMetric, "baseline");
  assertEquals(result.baselineDelta, 10);
  assertEquals(result.refinedDelta, null);
});

Deno.test("weekly delta allows matching refined-with-baseline compositions", () => {
  const rows = [
    {
      local_date: "2026-06-17",
      readiness_score_baseline: 60,
      readiness_score_refined: 64,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-16",
      readiness_score_baseline: 58,
      readiness_score_refined: 61,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-10",
      readiness_score_baseline: 52,
      readiness_score_refined: 57,
      readiness_state: "refined",
    },
    {
      local_date: "2026-06-09",
      readiness_score_baseline: 50,
      readiness_score_refined: 55,
      readiness_state: "refined",
    },
  ];

  const result = computeWeeklyDeltaComparison(
    rows,
    "2026-06-15",
    "2026-06-08",
    "2026-06-14",
    "2026-06-17",
  );

  assertEquals(result.reason, null);
  assertEquals(result.comparisonMetric, "refined");
  assertEquals(result.refinedDelta, 7);
  assertEquals(result.baselineDelta, null);
});
