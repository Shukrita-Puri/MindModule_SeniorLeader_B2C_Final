// [KIND: types] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Travel Domain Types.
// Source: Part 2 Layer 2 (Section 4.3).

export type TripStatus = "confirmed" | "planned" | "not_travelling" | "unknown";

export type TravelPhase =
  | "before_departure"
  | "between_legs"
  | "after_landing"
  | "in_transit"
  | "none";

export interface TravelLeg {
  mode: "flight" | "train" | "car" | "unknown";
  durationMinutes: number;
  haulTier: "short_haul" | "long_haul";
  origin?: string | null;
  destination?: string | null;
  departureUtc?: string | null;
  arrivalUtc?: string | null;
}

export interface TravelFacts {
  isTravelling: boolean;
  tripStatus: TripStatus;
  travelLegs: TravelLeg[];
  travelMinutesToday: number;
  travelPhase: TravelPhase;
  timeZoneShiftHours: number;
  daysAway: number | null;
  totalTripDays: number | null;
  distanceFromHomeKm: number | null;
  reentryRisk: boolean;
  userDeclaredPlace: boolean;
  landingMeeting: boolean;
}
