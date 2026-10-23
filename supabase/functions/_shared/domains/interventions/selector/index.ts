// [KIND: engine] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Selector Orchestrator: The 5-stage selection pipeline.
// Source: Part 2 Layer 3 (Section 8.2).

import { stepRetrieveCandidates, type RetrieveParams } from "./retrieve.ts";
import { stepFilterEligibility, type EligibilityParams } from "./eligibility.ts";
import { stepRankCandidates, type RankParams } from "./rank.ts";
import { stepSelectIntervention, type SelectParams } from "./select.ts";
import { stepRecordDecision } from "./record.ts";
import type { PracticeDefinition, SelectionRequest, SelectionResult } from "../types.ts";
import { PracticeAdapter } from "../catalogue/practice-adapter.ts";

export interface SelectInterventionInput {
  request: SelectionRequest;
  catalogue?: PracticeDefinition[];
  allowOwnActions?: boolean;
  userStateTier?: string;
  isBodyLoud?: boolean;
}

export function selectIntervention(input: SelectInterventionInput): SelectionResult {
  const catalogue = input.catalogue ?? PracticeAdapter.getCatalogue();
  const need = input.request.targetNeed ?? "settle_before";

  // Stage 1: Retrieve
  const retrieved = stepRetrieveCandidates({
    surface: input.request.feature,
    need,
    catalogue,
    allowOwnActions: input.allowOwnActions ?? true,
  });

  // Stage 2: Eligibility
  const { eligible, rejected } = stepFilterEligibility({
    candidates: retrieved,
    availableGapMinutes: input.request.availableGapMinutes,
    userStateTier: input.userStateTier,
    isCrisis: input.request.isCrisis,
    isBodyLoud: input.isBodyLoud,
  });

  // Stage 3: Rank
  const ranked = stepRankCandidates({
    eligible,
    need,
    userGoals: input.request.userGoals,
    userFavourites: input.request.userFavourites,
    priorCompletedIdsToday: input.request.priorCompletedIdsToday,
    recentCompletedIds14Days: input.request.recentCompletedIds14Days,
  });

  // Stage 4: Select
  const result = stepSelectIntervention({
    slotId: input.request.slotId,
    need,
    ranked,
    rejected,
    anchorCategory: input.request.anchorCategory,
    phase: input.request.phase,
  });

  // Stage 5: Record
  stepRecordDecision(result);

  return result;
}

export * from "./retrieve.ts";
export * from "./eligibility.ts";
export * from "./rank.ts";
export * from "./select.ts";
export * from "./record.ts";
export * from "./default-set.ts";
export * from "./static-route.ts";
