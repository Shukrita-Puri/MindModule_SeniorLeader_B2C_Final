// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Mix Domain Engine.
// Source: Part 2 Layer 2 (Section 4.6).

import type { MixFacts } from "./types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import { stepSequenceMeetings } from "./steps/mx1-sequence.ts";
import { stepBackToBack } from "./steps/mx3-back-to-back.ts";
import { stepPredominantAndMixed } from "./steps/mx4-predominant.ts";
import { stepContextSwitching } from "./steps/mx6-switching.ts";
import { MIX_MIN_WORK_MEETINGS } from "./constants.ts";

export interface MixEngineInput {
  workMeetings: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  personalItems?: CanonicalCalendarItem[];
}

export class MixEngine {
  /**
   * Evaluates predominant category/subtype, mixed status, back-to-back chains, and context switching.
   */
  public evaluate(input: MixEngineInput): MixFacts {
    const workMeetings = input.workMeetings;

    // A day with fewer than 2 meetings is light; mix does not run (never "mixed")
    if (workMeetings.length < MIX_MIN_WORK_MEETINGS) {
      return {
        active: false,
        predominant: null,
        mixed: null,
        backToBack: {
          isBackToBackDay: false,
          totalChainHours: 0,
          longestChainHours: 0,
          chains: [],
          reachesDenseDay: false,
        },
        contextSwitching: {
          level: "low",
          switchCount: 0,
          switches: [],
        },
        composition: {
          categoryCounts: {},
          subtypeCounts: {},
          totalWorkMeetings: workMeetings.length,
        },
      };
    }

    const sequenced = stepSequenceMeetings(workMeetings, input.stamps, input.personalItems);
    const backToBack = stepBackToBack(sequenced);
    const { predominant, mixed, categoryCounts, subtypeCounts } = stepPredominantAndMixed(sequenced);
    const contextSwitching = stepContextSwitching(sequenced, Object.keys(categoryCounts).length);

    return {
      active: true,
      predominant,
      mixed,
      backToBack,
      contextSwitching,
      composition: {
        categoryCounts,
        subtypeCounts,
        totalWorkMeetings: workMeetings.length,
      },
    };
  }
}

export const mixEngine = new MixEngine();
