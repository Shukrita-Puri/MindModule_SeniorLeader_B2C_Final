// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Step E5: Mind-Only Scope and Charter Check.
// Ensures recommendations strictly respect executive autonomy and mental state scope.
// Source: Part 2 Layer 3 (Section 15.1, 16.5).

import type { InterventionCandidate } from "../types.ts";

export interface CharterCheckResult {
  passed: boolean;
  violations: string[];
}

const FORBIDDEN_WORDS = [
  "coffee",
  "caffeine",
  "sugar",
  "supplement",
  "workout",
  "gym",
  "medication",
  "diet",
  "fasting",
  "hydrate",
];

export function stepCheckCharter(
  candidate: InterventionCandidate,
  context?: { isSensitiveMeeting?: boolean; meetingTime?: string }
): CharterCheckResult {
  const violations: string[] = [];

  const textToCheck = `${candidate.title} ${candidate.ownAction?.action ?? ""}`.toLowerCase();

  // 1. Forbidden physical/medical/nutritional advice check
  for (const word of FORBIDDEN_WORDS) {
    if (textToCheck.includes(word)) {
      violations.push(`Contains forbidden physical/nutritional advice: "${word}"`);
    }
  }

  // 2. Sensitive meeting privacy check: must not expose sensitive meeting topic in action
  if (context?.isSensitiveMeeting) {
    const action = candidate.ownAction?.action ?? "";
    if (action.toLowerCase().includes("dismissal") || action.toLowerCase().includes("disciplinary")) {
      violations.push("Sensitive meeting topic must be referred to by time only, not by subject");
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
