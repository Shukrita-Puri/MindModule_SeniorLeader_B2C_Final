// [KIND: policy] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Modality Policy for Layer 3 Interventions.
// Source: Part 2 Layer 3 (Section 6.5, D-L3-17).

import type { InterventionCandidate } from "../../types.ts";

export function evaluateModalityPolicy(
  candidate: InterventionCandidate,
  availableGapMinutes: number,
  isBodyLoud = false
): { eligible: boolean; reason?: string } {
  if (candidate.kind !== "practice") {
    return { eligible: true };
  }

  const modality = candidate.practice?.sub_type ?? candidate.modality ?? "somatic";
  const duration = candidate.practice?.minutes ?? candidate.minutes ?? 2;

  // Somatic practices are always eligible across time bands
  if (modality === "somatic") {
    return { eligible: true };
  }

  // Mindset practices:
  // 1. Never eligible in gaps under 30 minutes (Section 6.5)
  if (availableGapMinutes < 30) {
    return {
      eligible: false,
      reason: "Mindset practices require at least 30 minutes available; somatic preferred when time is short",
    };
  }

  // 2. When body is loud (high arousal / stress / deficit), somatic must be picked first
  if (isBodyLoud) {
    return {
      eligible: false,
      reason: "Somatic practices preferred when body signals elevated strain/arousal",
    };
  }

  // 3. Longer mindset practices (> 3 min) require at least 60 minutes gap
  if (duration > 3 && availableGapMinutes < 60) {
    return {
      eligible: false,
      reason: "Mindset practices > 3 min require at least 60 minutes available gap",
    };
  }

  return { eligible: true };
}
