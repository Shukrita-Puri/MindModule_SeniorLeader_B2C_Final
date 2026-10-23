// [KIND: composer] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// State Profile Composer.
// Source: Part 2 Layer 2 (Section 5.2).

import type { PhysiologyFacts } from "../physiology/types.ts";
import type { SelfReportFacts } from "../self-report/types.ts";
import type { AgreementFacts } from "../agreement/types.ts";
import type { FitFacts } from "../fit/types.ts";
import type { TrajectoryFacts } from "../trajectory/types.ts";
import type { GateFacts } from "../gate/types.ts";
import type { StateProfile } from "./types.ts";

export interface ComposeStateProfileInput {
  physiology: PhysiologyFacts;
  selfReport: SelfReportFacts;
  agreement: AgreementFacts;
  fit: FitFacts;
  trajectory: TrajectoryFacts;
  gate: GateFacts;
  nowUtc?: Date;
}

export function composeStateProfile(input: ComposeStateProfileInput): StateProfile {
  const refinedTier = input.selfReport.refinedTier;
  const baseTier = input.physiology.tier;

  // Synthesize one-line state headline
  let headline = "State steady · normal capacity";

  if (!input.gate.isOpen) {
    headline = input.gate.reason ?? "Gate closed · sync required";
  } else if (input.gate.wearableLessMode) {
    headline = "Wearable-less mode · check-in reading active";
  } else if (input.fit.hasGap && input.fit.readinessDemandGap) {
    if (refinedTier === "depleted" || refinedTier === "overloaded") {
      headline = "Reserves low · ahead of a high-stakes afternoon";
    } else {
      headline = "Managing capacity · demanding stretch ahead";
    }
  } else if (input.agreement.hasDivergence) {
    headline = "Body-mind divergence · pacing advised";
  } else if (input.trajectory.hrDrift?.isDriftingUp) {
    headline = "Intraday drift elevated · recovery advised";
  } else if (refinedTier === "optimal" || refinedTier === "primed") {
    headline = "Readiness high · primed for execution";
  } else if (refinedTier === "depleted" || refinedTier === "overloaded") {
    headline = "Readiness depleted · pacing and recovery required";
  }

  const now = input.nowUtc ?? new Date();

  return {
    tier: refinedTier,
    basePhysiologyTier: baseTier,
    score: input.physiology.score,
    headline,
    pills: input.physiology.pills,
    physiology: input.physiology,
    selfReport: input.selfReport,
    agreement: input.agreement,
    fit: input.fit,
    trajectory: input.trajectory,
    gate: input.gate,
    isCarriedOver: input.physiology.isCarriedOver,
    timestampUtc: now.toISOString(),
  };
}
