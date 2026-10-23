// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step AV5: Inferred Vacation (Stage 2, after Travel).
// Source: Part 2 Layer 2 (Section 4.2, AV5).

import type { LeaveInfo } from "../types.ts";
import type { ClassificationStamp } from "../../events/types.ts";
import {
  INFERRED_VACATION_TRAVEL_AWAY_KM,
  INFERRED_VACATION_MAX_WORK_MEETINGS,
} from "../constants.ts";

export interface TravelContextForVacation {
  isConfirmedTrip: boolean;
  distanceFromHomeKm: number;
  hasStayCoveringToday: boolean;
  hasWorkMeetingInTrip: boolean;
  hasConferenceInTrip: boolean;
}

export function stepInferredVacation(params: {
  hasExplicitFrame: boolean;
  workMeetingCount: number;
  hasHighStakesWorkMeeting: boolean;
  stamps: ClassificationStamp[];
  travelContext?: TravelContextForVacation | null;
}): LeaveInfo | null {
  if (params.hasExplicitFrame) return null;
  if (params.workMeetingCount > INFERRED_VACATION_MAX_WORK_MEETINGS) return null;
  if (params.hasHighStakesWorkMeeting) return null;

  const evidence: string[] = [];

  // Evidence 1: Category H recreation or leisure items
  const leisureItems = params.stamps.filter((s) => s.category === "H");
  if (leisureItems.length > 0) {
    evidence.push(`Found ${leisureItems.length} personal recreation/leisure items (Category H)`);
  }

  // Evidence 2: G stay covering today with no work meeting or F event in trip
  if (params.travelContext?.hasStayCoveringToday &&
      !params.travelContext.hasWorkMeetingInTrip &&
      !params.travelContext.hasConferenceInTrip) {
    evidence.push("Hotel/accommodation stay active with zero conference or work events in trip");
  }

  // Evidence 3: Confirmed trip > 100km from home with no work items
  if (params.travelContext?.isConfirmedTrip &&
      params.travelContext.distanceFromHomeKm > INFERRED_VACATION_TRAVEL_AWAY_KM &&
      params.workMeetingCount === 0) {
    evidence.push(`Confirmed trip ${Math.round(params.travelContext.distanceFromHomeKm)}km away with zero work items`);
  }

  if (evidence.length === 0) return null;

  const confidence: "high" | "medium" = evidence.length >= 2 ? "high" : "medium";

  return {
    source: "inferred",
    inferred: true,
    confidence,
    evidence,
  };
}
