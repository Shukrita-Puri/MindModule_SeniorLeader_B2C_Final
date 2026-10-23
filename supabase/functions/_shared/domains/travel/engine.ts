// [KIND: engine] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Travel Domain Engine.
// Source: Part 2 Layer 2 (Section 4.3).

import type { TravelFacts } from "./types.ts";
import type { CanonicalCalendarItem } from "../calendar/types.ts";
import type { ClassificationStamp } from "../events/types.ts";
import { stepExtractTravelLegs } from "./steps/tr1-legs.ts";
import {
  stepLocationCorroboration,
  type LocationReadingInput,
  type HomeAnchorInput,
  type DeclaredPlace,
} from "./steps/tr2-location.ts";
import { stepTravelPhase } from "./steps/tr3-phase.ts";
import { stepMultiDayTrip, type TripSpanInput } from "./steps/tr4-trip.ts";

export interface TravelEngineInput {
  localDate: string;
  items: CanonicalCalendarItem[];
  stamps: ClassificationStamp[];
  latestReading?: LocationReadingInput | null;
  homeAnchor?: HomeAnchorInput | null;
  declaredPlaces?: DeclaredPlace[];
  activeTrip?: TripSpanInput | null;
  tomorrowMeetingCount?: number;
  timeZoneShiftHours?: number;
  nowUtc?: Date;
}

export class TravelEngine {
  /**
   * Evaluates travel status, legs, phases, multi-day span, and re-entry risk.
   */
  public evaluate(input: TravelEngineInput): TravelFacts {
    const now = input.nowUtc ?? new Date();

    const { legs, totalTravelMinutes } = stepExtractTravelLegs(input.items, input.stamps);

    const { distanceFromHomeKm, isAwayByLocation, isUserDeclaredPlace } =
      stepLocationCorroboration({
        latestReading: input.latestReading,
        homeAnchor: input.homeAnchor,
        declaredPlaces: input.declaredPlaces,
      });

    const workMeetings = input.items.filter((item) => {
      const stamp = input.stamps.find((s) => s.itemId === (item.externalId || item.identityKey));
      return stamp && stamp.category !== "H" && stamp.category !== "G";
    });

    const { travelPhase, hasLandingMeeting } = stepTravelPhase({
      legs,
      workMeetings,
      nowUtc: now,
    });

    const { tripStatus, daysAway, totalTripDays, reentryRisk } = stepMultiDayTrip({
      localDate: input.localDate,
      hasTravelLegsToday: legs.length > 0,
      isAwayByLocation,
      activeTrip: input.activeTrip,
      tomorrowMeetingCount: input.tomorrowMeetingCount,
    });

    const isTravelling = tripStatus === "confirmed" || tripStatus === "planned";

    return {
      isTravelling,
      tripStatus,
      travelLegs: legs,
      travelMinutesToday: totalTravelMinutes,
      travelPhase,
      timeZoneShiftHours: input.timeZoneShiftHours ?? 0,
      daysAway,
      totalTripDays,
      distanceFromHomeKm,
      reentryRisk,
      userDeclaredPlace: isUserDeclaredPlace,
      landingMeeting: hasLandingMeeting,
    };
  }
}

export const travelEngine = new TravelEngine();
