// [KIND: step] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Selector Stage IS2: Filter candidates through Eligibility Policies.
// Source: Part 2 Layer 3 (Section 8.2, IS2).

import type { InterventionCandidate } from "../types.ts";
import { evaluateTimeFitPolicy } from "./policies/time-fit.ts";
import { evaluateModalityPolicy } from "./policies/modality.ts";
import { evaluateReadinessPolicy } from "./policies/readiness.ts";
import { evaluateCrisisPolicy } from "./policies/crisis.ts";

export interface EligibilityParams {
  candidates: InterventionCandidate[];
  availableGapMinutes: number;
  userStateTier?: string;
  isCrisis?: boolean;
  isBodyLoud?: boolean;
}

export interface EligibilityResult {
  eligible: InterventionCandidate[];
  rejected: Array<{ interventionId: string; reason: string }>;
}

export function stepFilterEligibility(params: EligibilityParams): EligibilityResult {
  const eligible: InterventionCandidate[] = [];
  const rejected: Array<{ interventionId: string; reason: string }> = [];

  for (const candidate of params.candidates) {
    // 1. Time-Fit Policy
    const timeFit = evaluateTimeFitPolicy(candidate, params.availableGapMinutes);
    if (!timeFit.eligible) {
      rejected.push({ interventionId: candidate.id, reason: timeFit.reason! });
      continue;
    }

    // 2. Modality Policy
    const modality = evaluateModalityPolicy(
      candidate,
      params.availableGapMinutes,
      params.isBodyLoud
    );
    if (!modality.eligible) {
      rejected.push({ interventionId: candidate.id, reason: modality.reason! });
      continue;
    }

    // 3. Readiness Policy
    const readiness = evaluateReadinessPolicy(candidate, params.userStateTier);
    if (!readiness.eligible) {
      rejected.push({ interventionId: candidate.id, reason: readiness.reason! });
      continue;
    }

    // 4. Crisis Safety Policy
    const crisis = evaluateCrisisPolicy(candidate, params.isCrisis ?? false);
    if (!crisis.eligible) {
      rejected.push({ interventionId: candidate.id, reason: crisis.reason! });
      continue;
    }

    eligible.push(candidate);
  }

  return { eligible, rejected };
}
