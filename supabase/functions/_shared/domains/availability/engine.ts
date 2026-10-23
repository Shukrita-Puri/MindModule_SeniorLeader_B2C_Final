// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Availability Domain Engine (Stage 1 & Stage 2).
// Source: Part 2 Layer 2 (Section 4.2).

import type { AvailabilityFacts, RunPosition } from "./types.ts";
import type { TimeLocaleFacts } from "../time/types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import { stepExplicitLeave } from "./steps/av1-leave.ts";
import { stepPublicHoliday } from "./steps/av2-holiday.ts";
import { stepWeekendAndLongWeekend } from "./steps/av3-weekend.ts";
import { stepInferredVacation, type TravelContextForVacation } from "./steps/av5-inferred-vacation.ts";
import { stepAssembleFrame } from "./steps/av7-frame.ts";

export interface AvailabilityStage1Input {
  timeLocale: TimeLocaleFacts;
  items: CanonicalCalendarItem[];
  declaredLeave?: boolean;
  providerOoo?: boolean;
}

export interface AvailabilityStage2Input {
  stage1Facts: AvailabilityFacts;
  workMeetingCount: number;
  hasHighStakesWorkMeeting: boolean;
  stamps: ClassificationStamp[];
  travelContext?: TravelContextForVacation | null;
  consecutiveQuietWeekdays?: number;
  runPosition?: RunPosition | null;
}

export class AvailabilityEngine {
  /**
   * Stage 1: Explicit evidence before travel engine runs (AV1-AV4).
   */
  public evaluateStage1(input: AvailabilityStage1Input): AvailabilityFacts {
    const explicitLeave = stepExplicitLeave({
      declaredLeave: input.declaredLeave,
      providerOoo: input.providerOoo,
      items: input.items,
    });

    const publicHoliday = stepPublicHoliday({
      localDate: input.timeLocale.localDate,
      publicHolidays: input.timeLocale.publicHolidays,
      items: input.items,
      homeCountry: input.timeLocale.homeCountry,
      homeRegion: input.timeLocale.homeRegion,
    });

    const { isWeekend, longWeekend } = stepWeekendAndLongWeekend({
      localDate: input.timeLocale.localDate,
      isWeekendDay: input.timeLocale.isWeekendDay,
      weekendDays: input.timeLocale.weekendDays,
      publicHolidays: input.timeLocale.publicHolidays,
    });

    return stepAssembleFrame({
      explicitLeave,
      inferredLeave: null,
      publicHoliday,
      longWeekend,
      isWeekend,
    });
  }

  /**
   * Stage 2: Incorporates travel and stamp findings to detect inferred vacation (AV5-AV7).
   */
  public evaluateStage2(input: AvailabilityStage2Input): AvailabilityFacts {
    const hasExplicit = Boolean(input.stage1Facts.leave || input.stage1Facts.publicHoliday || input.stage1Facts.longWeekend);

    const inferredLeave = stepInferredVacation({
      hasExplicitFrame: hasExplicit,
      workMeetingCount: input.workMeetingCount,
      hasHighStakesWorkMeeting: input.hasHighStakesWorkMeeting,
      stamps: input.stamps,
      travelContext: input.travelContext,
    });

    return stepAssembleFrame({
      explicitLeave: input.stage1Facts.leave,
      inferredLeave,
      publicHoliday: input.stage1Facts.publicHoliday,
      longWeekend: input.stage1Facts.longWeekend,
      isWeekend: input.stage1Facts.frame === "weekend",
      consecutiveQuietWeekdays: input.consecutiveQuietWeekdays,
      runPosition: input.runPosition,
    });
  }

  /**
   * Full end-to-end evaluation.
   */
  public evaluate(
    stage1Input: AvailabilityStage1Input,
    stage2Context?: Omit<AvailabilityStage2Input, "stage1Facts">,
  ): AvailabilityFacts {
    const stage1 = this.evaluateStage1(stage1Input);
    if (!stage2Context) return stage1;

    return this.evaluateStage2({
      stage1Facts: stage1,
      ...stage2Context,
    });
  }
}

export const availabilityEngine = new AvailabilityEngine();
