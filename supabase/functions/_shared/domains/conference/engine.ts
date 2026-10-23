// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Conference Domain Engine.
// Source: Part 2 Layer 2 (Section 4.4).

import type { ConferenceFacts } from "./types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import { stepClassifyConferenceItems } from "./steps/cf1-classify.ts";
import { stepConferenceSpanAndRole, type MultiDayConferenceInput } from "./steps/cf3-span.ts";
import { stepConferenceLoadContext } from "./steps/cf6-load-context.ts";

export interface ConferenceEngineInput {
  localDate: string;
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  userDayTags?: string[];
  isTravellingAway?: boolean;
  activeConferenceSpan?: MultiDayConferenceInput | null;
  yesterdayWasMultiDayConferenceEnd?: boolean;
  tomorrowHasConference?: boolean;
  meetingsNext3DaysCount?: number;
}

export class ConferenceEngine {
  /**
   * Evaluates conference day, sessions, role, place, and load context.
   */
  public evaluate(input: ConferenceEngineInput): ConferenceFacts {
    const { sessions, hasConferenceDayItem, hasTagOverride } = stepClassifyConferenceItems(
      input.items,
      input.stamps,
      input.userDayTags,
    );

    const isConferenceDay = hasConferenceDayItem;

    const { dayNumber, totalDays, role, standaloneSpeaking } = stepConferenceSpanAndRole({
      isConferenceDay,
      sessions,
      localDate: input.localDate,
      activeConferenceSpan: input.activeConferenceSpan,
    });

    const {
      place,
      travelRelated,
      parallelMeetings,
      firstSessionGapMinutes,
      trailingConferenceDays,
      trailingLoad,
      startsTomorrow,
      reentryDay,
    } = stepConferenceLoadContext({
      isConferenceDay,
      items: input.items,
      stamps: input.stamps,
      isTravellingAway: input.isTravellingAway ?? false,
      activeConferenceDaysTotal: totalDays,
      yesterdayWasMultiDayConferenceEnd: input.yesterdayWasMultiDayConferenceEnd,
      tomorrowHasConference: input.tomorrowHasConference,
      meetingsNext3DaysCount: input.meetingsNext3DaysCount,
    });

    let source: "tag" | "stamp" | "none" = "none";
    if (hasTagOverride) source = "tag";
    else if (sessions.length > 0) source = "stamp";

    return {
      isConferenceDay,
      dayNumber,
      totalDays,
      sessions,
      role,
      standaloneSpeaking,
      place,
      travelRelated,
      parallelMeetings,
      firstSessionGapMinutes,
      trailingConferenceDays,
      trailingLoad,
      startsTomorrow,
      reentryDay,
      source,
    };
  }
}

export const conferenceEngine = new ConferenceEngine();
