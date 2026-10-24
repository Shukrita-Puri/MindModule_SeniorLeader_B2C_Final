// [KIND: infrastructure] [LAYER: shadow] [TIERS: 0] [AUDIENCE: universal]
// Shadow Difference Classifier — Tri-color Auditing.
// Source: Spine Section 12, Decision 26 & Implementation Note.
// Invariant:
//   Green: An intended improvement (e.g. resolving unmapped, fixing false positives).
//   Blue:  An agreed migration (e.g. Category J crisis adoption, Category I operations split).
//   Red:   A regression or unexplained divergence requiring human review.

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
    isHiringCandidate?: boolean;
    isSupplierSync?: boolean;
  },
): DifferenceAuditResult {
  // Exact match -> Green (perfect parity, intended behaviour)
  if (legacyCategory === shadowCategory) {
    return {
      severity: "green",
      reasonCode: "exact_parity",
      explanation: "Legacy and shadow categories match identically.",
      isAcceptableForPromotion: true,
    };
  }

  // Legacy unresolved or missing -> Shadow classified correctly (Intended improvement)
  if (!legacyCategory || legacyCategory === "unresolved" || legacyCategory === "General") {
    return {
      severity: "green",
      reasonCode: "resolved_legacy_unmapped",
      explanation: "Intended improvement: Shadow resolved an event that legacy left unclassified.",
      isAcceptableForPromotion: true,
    };
  }

  // Fixing false positive outside-domain "user selling" rule -> e.g. engineering sync with supplier
  if (legacyCategory === "B" && shadowCategory === "I" && eventContext.isSupplierSync) {
    return {
      severity: "green",
      reasonCode: "corrected_outside_domain_selling_false_positive",
      explanation: "Intended improvement: Outside domain correctly identified as supplier/ops sync, not pitch/selling.",
      isAcceptableForPromotion: true,
    };
  }

  // Board meeting accurately placed in Category A instead of D or E
  if (shadowCategory === "A" && eventContext.isFiduciaryBoard) {
    return {
      severity: "green",
      reasonCode: "board_governance_accuracy_gain",
      explanation: "Intended improvement: Governance assembly accurately classified into Category A.",
      isAcceptableForPromotion: true,
    };
  }

  // Interview falsely classified as B or H now correctly identified as D (Hiring)
  if ((legacyCategory === "B" || legacyCategory === "H") && shadowCategory === "D" && eventContext.isHiringCandidate) {
    return {
      severity: "green",
      reasonCode: "interview_candidate_accuracy_gain",
      explanation: "Intended improvement: Candidate interview accurately classified into Category D (1:1/Hiring).",
      isAcceptableForPromotion: true,
    };
  }

  // Agreed Migration: Category J (Crisis, Risk & Incidents)
  if (shadowCategory === "J" && eventContext.hasCrisisKeywords) {
    return {
      severity: "blue",
      reasonCode: "category_j_crisis_adoption",
      explanation: "Agreed migration: Event migrated into the new Category J due to crisis/incident signatures.",
      isAcceptableForPromotion: true,
    };
  }

  // Agreed Migration: Separation of Category I (Operations) from E (Strategy)
  if (legacyCategory === "E" && shadowCategory === "I") {
    return {
      severity: "blue",
      reasonCode: "category_i_operations_split",
      explanation: "Agreed migration: Routine team/sprint execution split out of strategic thinking into Category I.",
      isAcceptableForPromotion: true,
    };
  }

  // Agreed Migration: Category D (1:1s / Hiring) split out of generic meetings
  if (legacyCategory === "C" && shadowCategory === "D") {
    return {
      severity: "blue",
      reasonCode: "category_d_one_to_one_split",
      explanation: "Agreed migration: 1:1 interaction split out of generic team meeting into Category D.",
      isAcceptableForPromotion: true,
    };
  }

  // Otherwise, flag as a potential regression requiring human review
  return {
    severity: "red",
    reasonCode: "unexplained_divergence",
    explanation: `Regression or unexplained divergence between legacy (${legacyCategory}) and shadow (${shadowCategory}).`,
    isAcceptableForPromotion: false,
  };
}
