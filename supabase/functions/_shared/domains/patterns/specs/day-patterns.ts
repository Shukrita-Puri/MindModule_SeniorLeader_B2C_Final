// [KIND: spec] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Day Patterns specifications (days off, sleep regularity, feeling vs body).
// Source: Part 2 Layer 4 (Section 4C, Scenario L4-20).

import type { PatternSpec } from "../types.ts";

export const DAY_PATTERN_SPECS: PatternSpec[] = [
  {
    id: "days_off_restore",
    name: "Days Off Restoration Pattern",
    family: "day_patterns",
    metric: "prs",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "benefit",
  },
  {
    id: "sleep_regularity",
    name: "Bedtime Regularity Impact on Morning Readiness",
    family: "day_patterns",
    metric: "prs",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "benefit",
  },
  {
    id: "feeling_vs_body",
    name: "Subjective Feeling vs Physical State Agreement",
    family: "day_patterns",
    metric: "energy",
    lag: "same_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "benefit",
  },
];

export const ALL_SPECS: PatternSpec[] = [
  ...DAY_PATTERN_SPECS,
];
