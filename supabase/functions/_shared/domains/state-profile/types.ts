// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 2 State Profile Composer.
// Source: Part 2 Layer 2 (Section 5.2).

import type { PhysiologyFacts, PhysiologyTier, SignalPill } from "../physiology/types.ts";
import type { SelfReportFacts } from "../self-report/types.ts";
import type { AgreementFacts } from "../agreement/types.ts";
import type { FitFacts } from "../fit/types.ts";
import type { TrajectoryFacts } from "../trajectory/types.ts";
import type { GateFacts } from "../gate/types.ts";

export interface StateProfile {
  tier: PhysiologyTier; // Refined tier (the one shown to features)
  basePhysiologyTier: PhysiologyTier; // Raw physiological tier
  score: number | null;
  headline: string; // One-line state phrase (e.g. "Reserves low · ahead of a high-stakes afternoon")
  pills: {
    decisionReadiness: SignalPill;
    physicalReserves: SignalPill;
    resilienceCapacity: SignalPill;
  };
  physiology: PhysiologyFacts;
  selfReport: SelfReportFacts;
  agreement: AgreementFacts;
  fit: FitFacts;
  trajectory: TrajectoryFacts;
  gate: GateFacts;
  isCarriedOver: boolean;
  timestampUtc: string;
}
