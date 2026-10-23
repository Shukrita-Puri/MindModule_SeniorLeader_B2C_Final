// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step LD6 & LD7: Travel and Conference Load Impacts.
// Source: Part 2 Layer 2 (Section 4.5, LD6, LD7).

import type { TravelFacts } from "../../travel/types.ts";
import type { ConferenceFacts } from "../../conference/types.ts";
import {
  TIMEZONE_SHIFT_HEAVY_HOURS,
  CONFERENCE_HEAVY_PARALLEL_MEETINGS,
} from "../constants.ts";

export function stepTravelAndConferenceLoad(params: {
  workMeetingCount: number;
  hasHighStakesMeeting: boolean;
  travelFacts?: TravelFacts | null;
  conferenceFacts?: ConferenceFacts | null;
}): {
  isHeavyTravel: boolean;
  isHeavyConference: boolean;
} {
  let isHeavyTravel = false;
  let isHeavyConference = false;

  // Travel load evaluation (LD6)
  if (params.travelFacts?.isTravelling) {
    const hasLongHaul = params.travelFacts.travelLegs.some((l) => l.haulTier === "long_haul");
    const hasBigShift = params.travelFacts.timeZoneShiftHours >= TIMEZONE_SHIFT_HEAVY_HOURS;
    const hasLandingMeeting = params.travelFacts.landingMeeting;

    if (params.workMeetingCount >= 2 || params.hasHighStakesMeeting) {
      isHeavyTravel = true;
    } else if (hasLongHaul || hasBigShift || hasLandingMeeting) {
      isHeavyTravel = true;
    }
  }

  // Conference load evaluation (LD7)
  if (params.conferenceFacts?.isConferenceDay) {
    if (params.conferenceFacts.role === "speaking" ||
        params.conferenceFacts.parallelMeetings >= CONFERENCE_HEAVY_PARALLEL_MEETINGS) {
      isHeavyConference = true;
    }
  }

  return {
    isHeavyTravel,
    isHeavyConference,
  };
}
