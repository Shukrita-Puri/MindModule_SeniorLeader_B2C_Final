// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step TR3: Travel Phase and Landing Meeting Detection.
// Source: Part 2 Layer 2 (Section 4.3, TR3, LD6).

import type { TravelLeg, TravelPhase } from "../types.ts";
import type { CanonicalCalendarItem } from "../../calendar/types.ts";
import { LANDING_MEETING_HOURS } from "../constants.ts";

export function stepTravelPhase(params: {
  legs: TravelLeg[];
  workMeetings: CanonicalCalendarItem[];
  nowUtc: Date;
}): {
  travelPhase: TravelPhase;
  hasLandingMeeting: boolean;
} {
  if (params.legs.length === 0) {
    return {
      travelPhase: "none",
      hasLandingMeeting: false,
    };
  }

  const nowMs = params.nowUtc.getTime();
  let phase: TravelPhase = "none";
  let hasLandingMeeting = false;

  for (const leg of params.legs) {
    const depMs = leg.departureUtc ? new Date(leg.departureUtc).getTime() : 0;
    const arrMs = leg.arrivalUtc ? new Date(leg.arrivalUtc).getTime() : 0;

    if (depMs > 0 && arrMs > 0) {
      if (nowMs < depMs && (depMs - nowMs) <= 3 * 60 * 60 * 1000) {
        phase = "before_departure";
      } else if (nowMs >= depMs && nowMs <= arrMs) {
        phase = "in_transit";
      } else if (nowMs > arrMs && (nowMs - arrMs) <= 4 * 60 * 60 * 1000) {
        phase = "after_landing";
      }

      // Check if any work meeting is within 3 hours after landing
      for (const meeting of params.workMeetings) {
        if (!meeting.startUtc) continue;
        const meetingStartMs = new Date(meeting.startUtc).getTime();
        const diffHours = (meetingStartMs - arrMs) / (1000 * 60 * 60);
        if (diffHours >= 0 && diffHours <= LANDING_MEETING_HOURS) {
          hasLandingMeeting = true;
          break;
        }
      }
    }
  }

  return {
    travelPhase: phase,
    hasLandingMeeting,
  };
}
