// [KIND: configuration] [LAYER: audience] [TIERS: 3] [AUDIENCE: ceo]
// CEO Audience Pack Entry & Loader Validation.
// Source: Spine Section 11 (Settled Rule: Packs are validated on load).

import { CEO_SETTINGS, type AudiencePackSettings } from "./settings.ts";
import { CEO_PACK_CONSTANTS } from "./constants.ts";

export * from "./settings.ts";
export * from "./constants.ts";

export function validateAudiencePack(pack: AudiencePackSettings): boolean {
  // Rule 1: Weights must sum to 1.0 (with floating point tolerance)
  const weightSum = pack.weights.wS + pack.weights.wU;
  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(`[AUDIENCE_PACK_ERROR] Weights do not sum to 1.0: wS=${pack.weights.wS}, wU=${pack.weights.wU}`);
  }

  // Rule 2: Scheduled weight must be >= unscheduled weight
  if (pack.weights.wS < pack.weights.wU) {
    throw new Error(`[AUDIENCE_PACK_ERROR] Invariant violated: wS (${pack.weights.wS}) must be >= wU (${pack.weights.wU})`);
  }

  // Rule 3: Required terminology entries must be non-empty
  if (!pack.roleTerminology.governanceBody || !pack.roleTerminology.reportingTarget) {
    throw new Error(`[AUDIENCE_PACK_ERROR] Missing required role terminology`);
  }

  return true;
}

// Validate immediately on module evaluation
validateAudiencePack(CEO_SETTINGS);

export function resolveAudiencePack(audienceId: string = "ceo"): AudiencePackSettings {
  if (audienceId.toLowerCase() === "ceo") {
    return CEO_SETTINGS;
  }
  // Fallback to CEO as the only supported pack today (Spine Section 11)
  return CEO_SETTINGS;
}
