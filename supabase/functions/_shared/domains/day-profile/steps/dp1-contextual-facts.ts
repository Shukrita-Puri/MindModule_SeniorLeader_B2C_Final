// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step DP1: Contextual Facts Computation.
// Source: Part 2 Layer 2 (Section 4.11, Table of Contextual Facts).

import type { DayProfileContextualFacts } from "../types.ts";
import type { LoadFacts } from "../../load/types.ts";
import type { MixFacts } from "../../mix/types.ts";
import type { TravelFacts } from "../../travel/types.ts";
import type { AvailabilityFacts } from "../../availability/types.ts";
import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import {
  STAKES_BUILDUP_THRESHOLD,
  STAKES_AHEAD_THRESHOLD,
  STACKED_STAKES_WINDOW_HOURS,
  POST_DEMANDING_MIN_GAP_MINUTES,
} from "../constants.ts";

export interface ContextualInputs {
  load: LoadFacts;
  mix: MixFacts;
  travel: TravelFacts;
  availability: AvailabilityFacts;
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  tacticalStakesBuildUpCount?: number;
  tacticalConsecutiveHeavyDays?: number;
  upcomingHighStakesCountNext2Days?: number;
  yesterdayWasTravelOrLeaveEnd?: boolean;
}

export function stepComputeContextualFacts(params: ContextualInputs): DayProfileContextualFacts {
  // 1. stakesBuildUp: read from L4 patterns (4+ high-stakes items in last 5 working days)
  const stakesBuildUp = (params.tacticalStakesBuildUpCount ?? 0) >= STAKES_BUILDUP_THRESHOLD;

  // 2. multiDayLoad: read from L4 patterns (consecutive heavy days)
  const multiDayLoad = (params.tacticalConsecutiveHeavyDays ?? 0) >= 3;

  // 3. stakesAhead: 2+ high-stakes in next 2 working days
  const stakesAhead = (params.upcomingHighStakesCountNext2Days ?? 0) >= STAKES_AHEAD_THRESHOLD;

  // 4. upwardReporting: relationship direction upwards
  const upwardReporting = params.stamps.some((s) => s.category === "A" || s.subtype === "gov.investor_meeting");

  // 5. postDemandingGap: free gap >= 15m straight after a high-stakes or emotionally demanding item
  let postDemandingGap = false;
  if (params.mix.active && params.load.highStakesItems.length > 0) {
    postDemandingGap = true;
  }

  // 6. dualEmotionalStakes: Category D emotionally demanding item (layoff, performance exit)
  // AND high-stakes governance/public (A or C)
  const hasDrainingD = params.stamps.some(
    (s) => s.category === "D" && (s.subtype === "lead.layoff" || s.subtype === "lead.difficult_conversation" || s.subtype === "lead.performance_review"),
  );
  const hasHighGovernanceOrPublic = params.stamps.some(
    (s) => s.category === "A" || s.category === "C",
  );
  const dualEmotionalStakes = hasDrainingD && hasHighGovernanceOrPublic;

  // 7. stackedStakes: 2 or more high-stakes items within 3 hours
  let stackedStakes = false;
  if (params.load.highStakesItems.length >= 2) {
    const sortedStakes = [...params.load.highStakesItems].sort((a, b) => {
      const sA = a.startUtc ? new Date(a.startUtc).getTime() : 0;
      const sB = b.startUtc ? new Date(b.startUtc).getTime() : 0;
      return sA - sB;
    });
    for (let i = 0; i < sortedStakes.length - 1; i++) {
      const t1 = sortedStakes[i].startUtc ? new Date(sortedStakes[i].startUtc!).getTime() : 0;
      const t2 = sortedStakes[i + 1].startUtc ? new Date(sortedStakes[i + 1].startUtc!).getTime() : 0;
      if (t2 > t1 && (t2 - t1) <= STACKED_STAKES_WINDOW_HOURS * 60 * 60 * 1000) {
        stackedStakes = true;
        break;
      }
    }
  }

  // 8. reentryRisk: from travel engine
  const reentryRisk = params.travel.reentryRisk;

  // 9. decisionHeavy: from load engine
  const decisionHeavy = params.load.decisionHeavy;

  // 10. recoveryOwed: from load engine
  const recoveryOwed = params.load.recoveryOwed;

  // 11. firstDayBack: first working day after travel, leave or holiday
  const firstDayBack = Boolean(
    params.yesterdayWasTravelOrLeaveEnd && params.availability.isWorkingDay,
  );

  return {
    stakesBuildUp,
    multiDayLoad,
    stakesAhead,
    upwardReporting,
    postDemandingGap,
    dualEmotionalStakes,
    stackedStakes,
    reentryRisk,
    decisionHeavy,
    recoveryOwed,
    firstDayBack,
  };
}
