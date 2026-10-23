// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Day Profile Composer Types.
// Source: Part 2 Layer 2 (Section 4.11).

import type { TimeLocaleFacts } from "../time/types.ts";
import type { AvailabilityFacts, AvailabilityFrame } from "../availability/types.ts";
import type { TravelFacts } from "../travel/types.ts";
import type { ConferenceFacts } from "../conference/types.ts";
import type { LoadFacts } from "../load/types.ts";
import type { MixFacts } from "../mix/types.ts";
import type { CrisisFacts } from "../crisis/types.ts";
import type { WeekAheadFacts } from "../week-ahead/types.ts";
import type { RankedAnchor } from "../importance/types.ts";

export interface DayProfileContextualFacts {
  stakesBuildUp: boolean;
  multiDayLoad: boolean;
  stakesAhead: boolean;
  upwardReporting: boolean;
  postDemandingGap: boolean;
  dualEmotionalStakes: boolean;
  stackedStakes: boolean;
  reentryRisk: boolean;
  decisionHeavy: boolean;
  recoveryOwed: boolean;
  firstDayBack: boolean;
}

export interface DayProfile {
  localDate: string;
  frame: AvailabilityFrame;
  headline: string;
  character: string;
  anchorItem: RankedAnchor | null;
  timeLocale: TimeLocaleFacts;
  availability: AvailabilityFacts;
  travel: TravelFacts;
  conference: ConferenceFacts;
  load: LoadFacts;
  mix: MixFacts;
  crisis: CrisisFacts;
  weekAhead: WeekAheadFacts;
  contextualFacts: DayProfileContextualFacts;
  toCanonicalDayContext(): Record<string, unknown>;
}

export type DayProfileFacts = DayProfile;
