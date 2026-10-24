// [KIND: spec] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Drain & Lift pattern specifications.
// Source: Part 2 Layer 4 (Section 4C, 5.1).

import type { PatternSpec } from "../types.ts";

export const DRAIN_LIFT_SPECS: PatternSpec[] = [
  {
    id: "event_drain_hrv",
    name: "Overnight HRV Drain after Demanding Event",
    family: "drain_lift",
    metric: "hrv",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
  {
    id: "event_drain_rhr",
    name: "Overnight Resting Heart Rate Elevation",
    family: "drain_lift",
    metric: "rhr",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
  {
    id: "sleep_to_prs",
    name: "Sleep Efficiency Impact on Morning Readiness",
    family: "drain_lift",
    metric: "prs",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "benefit",
  },
  {
    id: "event_to_cognition",
    name: "Cognitive Clarity Drain following High Demands",
    family: "drain_lift",
    metric: "clarity",
    lag: "same_day",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  },
];
