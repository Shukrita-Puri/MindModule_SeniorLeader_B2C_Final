// [KIND: infrastructure] [LAYER: shadow] [TIERS: 0] [AUDIENCE: universal]
// Shadow Difference Classifier — Tri-color Auditing.
// Source: Spine Section 12, Decision 26.
// Invariant: Green (improvement), Blue (taxonomical reclassification), Red (regression).

export type DifferenceSeverity = "green" | "blue" | "red";

export interface DifferenceAuditResult {
  severity: DifferenceSeverity;
  reasonCode: string;
  explanation: string;
  isAcceptableForPromotion: boolean;
}

export function classifyDifference(
  legacyCategory: string | null | undefined,
  shadowCategory: string | null | undefined,
  eventContext: {
    titleLength: number;
    hasCrisisKeywords?: boolean;
    isExternalMeeting?: boolean;
    isFiduciaryBoard?: boolean;
  },
): DifferenceAuditResult {
  // Exact match -> Green (perfect parity)
  if (legacyCategory === shadowCategory) {
    return {
      severity: "green",
      reasonCode: "exact_parity",
      explanation: "Legacy and shadow categories match identically.",
      isAcceptableForPromotion: true,
    };
  }

  // Legacy unresolved or missing -> Shadow classified correctly
  if (!legacyCategory || legacyCategory === "unresolved" || legacyCategory === "General") {
    return {
      severity: "green",
      reasonCode: "resolved_legacy_unmapped",
      explanation: "Shadow resolved an event that legacy left unclassified.",
      isAcceptableForPromotion: true,
    };
  }

  // Adoption of Category J (Crisis, Risk & Incidents)
  if (shadowCategory === "J" && eventContext.hasCrisisKeywords) {
    return {
      severity: "blue",
      reasonCode: "category_j_crisis_adoption",
      explanation: "Event migrated into the new Category J due to crisis/incident signatures.",
      isAcceptableForPromotion: true,
    };
  }

  // Separation of Category I (Operations) from E (Strategy)
  if (legacyCategory === "E" && shadowCategory === "I") {
    return {
      severity: "blue",
      reasonCode: "category_i_operations_split",
      explanation: "Routine team/sprint execution split out of strategic thinking into Operations & Execution.",
      isAcceptableForPromotion: true,
    };
  }

  // Board meeting accurately placed in Category A
  if (shadowCategory === "A" && eventContext.isFiduciaryBoard) {
    return {
      severity: "green",
      reasonCode: "board_governance_accuracy_gain",
      explanation: "Governance assembly accurately classified into Category A.",
      isAcceptableForPromotion: true,
    };
  }

  // Otherwise, flag as a potential regression requiring human review
  return {
    severity: "red",
    reasonCode: "unexplained_divergence",
    explanation: `Unexpected mismatch between legacy (${legacyCategory}) and shadow (${shadowCategory}).`,
    isAcceptableForPromotion: false,
  };
}
