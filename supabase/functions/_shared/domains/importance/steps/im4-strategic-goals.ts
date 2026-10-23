// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step IM4: Strategic Goals Alignment (A4 / N-IM4).
// Source: Part 2 Layer 2 (Section 4.9, IM4, N-IM4).

import type { CandidateItem } from "./im1-candidates.ts";
import type { AnchorEvidence } from "../types.ts";
import {
  ONBOARDING_GOAL_CATEGORIES,
  MIN_IMMEDIATE,
  GOAL_ALIGNMENT_MULTIPLIER,
} from "../constants.ts";

export function stepStrategicGoals(
  candidate: CandidateItem,
  immediateStakes: number,
  userProtectionGoals: string[] = [],
): {
  strategic: number; // S
  evidence: AnchorEvidence[];
} {
  const evidence: AnchorEvidence[] = [];
  const cat = candidate.stamp.category ?? "I";

  let strategic = 10; // baseline strategic score

  // Gate check (IM4): Goal alignment counts only when immediate part reaches MIN_IMMEDIATE (25)
  if (immediateStakes < MIN_IMMEDIATE || userProtectionGoals.length === 0) {
    return { strategic, evidence };
  }

  // Check which protection goals match the item's category
  const matchingGoals: string[] = [];
  for (const goalId of userProtectionGoals) {
    const targetCats = ONBOARDING_GOAL_CATEGORIES[goalId.toLowerCase()];
    if (targetCats && targetCats.includes(cat)) {
      matchingGoals.push(goalId);
    }
  }

  if (matchingGoals.length > 0) {
    const bonus = Math.round(immediateStakes * (GOAL_ALIGNMENT_MULTIPLIER - 1.0));
    strategic += bonus + 20;
    evidence.push({
      horizon: "strategic",
      sourceLayer: "T3 declared goal",
      fact: `Aligned with user declared goals: ${matchingGoals.join(", ")}`,
      measure: `+${bonus} pts (multiplier x${GOAL_ALIGNMENT_MULTIPLIER})`,
      confidence: "high",
    });
  }

  return {
    strategic: Math.min(100, strategic),
    evidence,
  };
}
