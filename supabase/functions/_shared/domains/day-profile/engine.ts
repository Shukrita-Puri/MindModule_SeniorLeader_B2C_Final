// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Day Profile Composer Engine.
// Source: Part 2 Layer 2 (Section 4.11).

import type { DayProfile } from "./types.ts";
import type { TimeLocaleFacts } from "../time/types.ts";
import type { AvailabilityFacts } from "../availability/types.ts";
import type { TravelFacts } from "../travel/types.ts";
import type { ConferenceFacts } from "../conference/types.ts";
import type { LoadFacts } from "../load/types.ts";
import type { MixFacts } from "../mix/types.ts";
import type { CrisisFacts } from "../crisis/types.ts";
import type { WeekAheadFacts } from "../week-ahead/types.ts";
import type { ImportanceFacts } from "../importance/types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import { stepComputeContextualFacts } from "./steps/dp1-contextual-facts.ts";
import { stepComposeHeadline } from "./steps/dp2-headline.ts";

export interface DayProfileComposerInput {
  timeLocale: TimeLocaleFacts;
  availability: AvailabilityFacts;
  travel: TravelFacts;
  conference: ConferenceFacts;
  load: LoadFacts;
  mix: MixFacts;
  crisis: CrisisFacts;
  weekAhead: WeekAheadFacts;
  importance: ImportanceFacts;
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  tacticalStakesBuildUpCount?: number;
  tacticalConsecutiveHeavyDays?: number;
  upcomingHighStakesCountNext2Days?: number;
  yesterdayWasTravelOrLeaveEnd?: boolean;
}

export class DayProfileComposer {
  /**
   * Composes all Pass 2 day engine facts into one immutable Day Profile.
   */
  public compose(input: DayProfileComposerInput): DayProfile {
    const contextualFacts = stepComputeContextualFacts({
      load: input.load,
      mix: input.mix,
      travel: input.travel,
      availability: input.availability,
      items: input.items,
      stamps: input.stamps,
      tacticalStakesBuildUpCount: input.tacticalStakesBuildUpCount,
      tacticalConsecutiveHeavyDays: input.tacticalConsecutiveHeavyDays,
      upcomingHighStakesCountNext2Days: input.upcomingHighStakesCountNext2Days,
      yesterdayWasTravelOrLeaveEnd: input.yesterdayWasTravelOrLeaveEnd,
    });

    const { headline, character } = stepComposeHeadline({
      availability: input.availability,
      travel: input.travel,
      conference: input.conference,
      load: input.load,
      mix: input.mix,
      crisis: input.crisis,
      weekAhead: input.weekAhead,
      contextualFacts,
    });

    const anchorItem = input.importance.topItemAnchor;

    return {
      localDate: input.timeLocale.localDate,
      frame: input.availability.frame,
      headline,
      character,
      anchorItem,
      timeLocale: input.timeLocale,
      availability: input.availability,
      travel: input.travel,
      conference: input.conference,
      load: input.load,
      mix: input.mix,
      crisis: input.crisis,
      weekAhead: input.weekAhead,
      contextualFacts,
      toCanonicalDayContext() {
        return {
          localDate: input.timeLocale.localDate,
          frame: input.availability.frame,
          headline,
          character,
          isWorkingDay: input.availability.isWorkingDay,
          isTravelling: input.travel.isTravelling,
          isConferenceDay: input.conference.isConferenceDay,
          loadLevel: input.load.level,
          anchorItemId: anchorItem?.anchorId ?? null,
          anchorItemTitle: anchorItem?.title ?? null,
          recoveryOwed: contextualFacts.recoveryOwed,
          reentryRisk: contextualFacts.reentryRisk,
        };
      },
    };
  }
}

export const dayProfileComposer = new DayProfileComposer();

import { timeEngine } from "../time/index.ts";
import { availabilityEngine } from "../availability/index.ts";
import { travelEngine } from "../travel/index.ts";
import { conferenceEngine } from "../conference/index.ts";
import { loadEngine } from "../load/index.ts";
import { mixEngine } from "../mix/index.ts";
import { crisisEngine } from "../crisis/index.ts";
import { weekAheadEngine } from "../week-ahead/index.ts";
import { importanceEngine } from "../importance/index.ts";

export interface EvaluateDayProfileInput {
  localDate: string;
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  userLocale?: string;
  homeCountry?: string;
  nowUtc?: Date;
  isVacationDeclared?: boolean;
}

export function evaluateDayProfile(input: EvaluateDayProfileInput): DayProfile {
  const now = input.nowUtc ?? new Date();

  // 1. Time
  const timeLocale = timeEngine.evaluate(
    {
      homeCountry: input.homeCountry ?? "GB",
      homeTimezone: "UTC",
    },
    now
  );

  // 2. Availability
  const availability = availabilityEngine.evaluateStage1({
    timeLocale,
    items: input.items,
    declaredLeave: input.isVacationDeclared ?? false,
  });

  // 3. Travel
  const travel = travelEngine.evaluate({
    localDate: input.localDate,
    items: input.items,
    stamps: input.stamps,
    nowUtc: now,
  });

  // 4. Conference
  const conference = conferenceEngine.evaluate({
    localDate: input.localDate,
    items: input.items,
    stamps: input.stamps,
    isTravellingAway: travel.isTravelling,
  });

  // 5. Load
  const load = loadEngine.evaluate({
    items: input.items,
    stamps: input.stamps,
    availability,
    travelFacts: travel,
    conferenceFacts: conference,
  });

  // 6. Mix
  const mix = mixEngine.evaluate({
    workMeetings: input.items,
    stamps: input.stamps,
  });

  // 7. Crisis
  const crisis = crisisEngine.evaluate({
    items: input.items,
    stamps: input.stamps,
    nowUtc: now,
  });

  // 8. Week-Ahead
  const weekAhead = weekAheadEngine.evaluate({
    timeLocale,
    availability,
  });

  // 9. Importance Base
  const importance = importanceEngine.evaluate({
    items: input.items,
    stamps: input.stamps,
    nowUtc: now,
  });

  // 10. Compose
  return dayProfileComposer.compose({
    timeLocale,
    availability,
    travel,
    conference,
    load,
    mix,
    crisis,
    weekAhead,
    importance,
    items: input.items,
    stamps: input.stamps,
  });
}
