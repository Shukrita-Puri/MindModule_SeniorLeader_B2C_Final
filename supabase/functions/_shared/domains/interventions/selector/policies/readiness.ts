// [KIND: policy] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Readiness Policy for Layer 3 Interventions.
// Source: Part 2 Layer 3 (Section 8.2).

import type { InterventionCandidate } from "../../types.ts";

export function evaluateReadinessPolicy(
  candidate: InterventionCandidate,
  userStateTier?: string
): { eligible: boolean; reason?: string } {
  if (candidate.kind !== "practice") return { eligible: true };

  const arousal = candidate.practice?.arousal;
  const intensity = candidate.practice?.intensity;

  // When readiness is low (depleted, overloaded), exclude high-intensity or activating practices
  if (userStateTier === "depleted" || userStateTier === "overloaded") {
    if (arousal === "energizing" || intensity === "high") {
      return {
        eligible: false,
        reason: "High intensity/activating practices excluded during depleted/overloaded state",
      };
    }
  }

  return { eligible: true };
}
