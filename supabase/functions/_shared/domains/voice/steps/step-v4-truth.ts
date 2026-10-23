// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step V4 · Factual Truth and Claim Set Verification.
// Verifies that text does not repeat previous claims or assert false causality.
// Source: Part 2 Layer 5 (Section 6.2 Principle 8, Section 6.9).

import type { CopyCheckViolation, SurfaceContract } from "../types.ts";

export function checkTruth(
  text: string,
  contract: SurfaceContract,
  claimSet?: string[],
): CopyCheckViolation[] {
  const violations: CopyCheckViolation[] = [];
  const lower = text.toLowerCase();

  // 1. Never assert ungrounded causality ("causes", "caused by")
  if (/\b(causes|cause|caused by|resulting in your)\b/i.test(lower)) {
    violations.push({
      code: "unsubstantiated_causation",
      rule: "V4.1 Causality",
      message: 'Never state deterministic causation ("causes"). State patterns with "tends to" or correlation.',
      offendingText: "causes",
    });
  }

  // 2. Claim Set Verification (Avoid duplicate claims already made in earlier surfaces)
  if (contract.checkClaimSet && claimSet && claimSet.length > 0) {
    for (const claim of claimSet) {
      if (claim && claim.length > 4 && lower.includes(claim.toLowerCase())) {
        violations.push({
          code: "duplicate_claim",
          rule: "V4.2 Claim Duplication",
          message: `Text repeats an already established claim: "${claim}"`,
          offendingText: claim,
        });
      }
    }
  }

  return violations;
}
