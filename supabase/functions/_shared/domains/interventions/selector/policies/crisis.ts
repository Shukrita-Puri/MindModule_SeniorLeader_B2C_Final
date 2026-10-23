// [KIND: policy] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Crisis Safety Policy for Layer 3 Interventions.
// Source: Part 2 Layer 3 (Section 8.2, 14 D-L3-7).

import type { InterventionCandidate } from "../../types.ts";

/** Practice IDs certified as crisis-safe. */
export const CRISIS_SAFE_PRACTICE_IDS = [
  "box-breathing",
  "grounding-touch",
  "eye-of-storm",
  "release-exhale-new",
  "presence-grounding-new",
  "fudoshin-immovable-mind",
] as const;

export function evaluateCrisisPolicy(
  candidate: InterventionCandidate,
  isCrisis: boolean
): { eligible: boolean; reason?: string } {
  if (!isCrisis) return { eligible: true };

  // In crisis mode, only crisis-safe practices or crisis-safe own actions are permitted
  if (candidate.kind === "practice") {
    const isSafe = (CRISIS_SAFE_PRACTICE_IDS as readonly string[]).includes(candidate.id);
    if (!isSafe) {
      return {
        eligible: false,
        reason: "Practice not certified as crisis-safe during active crisis episode",
      };
    }
  }

  return { eligible: true };
}
