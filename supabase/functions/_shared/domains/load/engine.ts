// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Load Domain Engine.
// Source: Part 2 Layer 2 (Section 4.5).

import type { LoadFacts, LoadLevel, LoadReason } from "./types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import type { AvailabilityFacts } from "../availability/types.ts";
import type { TravelFacts } from "../travel/types.ts";
import type { ConferenceFacts } from "../conference/types.ts";
import { stepSortLoadItems } from "./steps/ld1-items.ts";
import { stepVolumeAndWeight } from "./steps/ld3-volume-weight.ts";
import { stepTravelAndConferenceLoad } from "./steps/ld6-travel-conference.ts";
import { stepWorkOnNonWorkingDay } from "./steps/ld9-nonworkday.ts";

export interface LoadEngineInput {
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  availability: AvailabilityFacts;
  travelFacts?: TravelFacts | null;
  conferenceFacts?: ConferenceFacts | null;
}

export class LoadEngine {
  /**
   * Evaluates daily cognitive, volume, weight, travel, conference load, and recovery owed.
   */
  public evaluate(input: LoadEngineInput): LoadFacts {
    const sorted = stepSortLoadItems(input.items, input.stamps);

    const vw = stepVolumeAndWeight(sorted.workMeetings, input.stamps);

    const tc = stepTravelAndConferenceLoad({
      workMeetingCount: sorted.workMeetings.length,
      hasHighStakesMeeting: Boolean(vw.highStakesAnchor),
      travelFacts: input.travelFacts,
      conferenceFacts: input.conferenceFacts,
    });

    const reasons: LoadReason[] = [];

    let isHeavy = false;
    if (vw.isHeavyVolume) {
      isHeavy = true;
      reasons.push("volume");
    }
    if (vw.isHeavyWeight) {
      isHeavy = true;
      reasons.push("weight");
    }
    if (vw.isDecisionHeavy) {
      isHeavy = true;
      reasons.push("decision");
    }
    if (tc.isHeavyTravel) {
      isHeavy = true;
      reasons.push("travel");
    }
    if (tc.isHeavyConference) {
      isHeavy = true;
      reasons.push("conference");
    }

    let level: LoadLevel = "normal";
    let lightReason: string | null = null;

    if (isHeavy) {
      level = "heavy";
    } else if (sorted.isPersonalDay) {
      level = "light";
      lightReason = "Personal day with zero work items";
      reasons.push("personal_day");
    } else if (vw.isLight) {
      level = "light";
      lightReason = vw.lightReason;
      reasons.push(sorted.workMeetings.length === 0 ? "open_day" : "baseline");
    } else {
      level = "normal";
      reasons.push("baseline");
    }

    const { workOnNonWorkingDay, recoveryOwed, recoveryReason } = stepWorkOnNonWorkingDay({
      availability: input.availability,
      workMeetingCount: sorted.workMeetings.length,
      totalWorkMinutes: sorted.totalWorkMinutes,
      hasHighStakesMeeting: Boolean(vw.highStakesAnchor),
      computedLevel: level,
      reasons,
    });

    return {
      level,
      reasons,
      lightReason,
      personalDay: sorted.isPersonalDay,
      halfDay: sorted.isHalfDay,
      highStakesAnchor: vw.highStakesAnchor,
      highStakesItems: vw.highStakesItems,
      decisionHeavy: vw.isDecisionHeavy,
      travelLoad: tc.isHeavyTravel,
      landingMeeting: input.travelFacts?.landingMeeting ?? false,
      workMeetingCount: sorted.workMeetings.length,
      focusMinutes: sorted.totalFocusMinutes,
      workOnNonWorkingDay,
      recoveryOwed,
      recoveryReason,
      decisionDensity: vw.isDecisionHeavy ? 4.0 : 2.0,
    };
  }
}

export const loadEngine = new LoadEngine();
