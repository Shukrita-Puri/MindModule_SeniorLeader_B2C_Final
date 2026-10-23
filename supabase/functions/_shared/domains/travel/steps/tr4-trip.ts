// [KIND: step] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Step TR4: Multi-Day Trip Tracking and Re-entry Risk.
// Source: Part 2 Layer 2 (Section 4.3, TR4).

import type { TripStatus } from "../types.ts";

export interface TripSpanInput {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isConfirmed: boolean;
}

export function stepMultiDayTrip(params: {
  localDate: string;
  hasTravelLegsToday: boolean;
  isAwayByLocation: boolean | null;
  activeTrip?: TripSpanInput | null;
  tomorrowMeetingCount?: number;
}): {
  tripStatus: TripStatus;
  daysAway: number | null;
  totalTripDays: number | null;
  reentryRisk: boolean;
} {
  let tripStatus: TripStatus = "unknown";
  let daysAway: number | null = null;
  let totalTripDays: number | null = null;
  let reentryRisk = false;

  if (params.activeTrip) {
    const s = new Date(`${params.activeTrip.startDate}T00:00:00Z`).getTime();
    const e = new Date(`${params.activeTrip.endDate}T00:00:00Z`).getTime();
    const curr = new Date(`${params.localDate}T00:00:00Z`).getTime();

    totalTripDays = Math.max(1, Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1);

    if (curr >= s && curr <= e) {
      daysAway = Math.max(1, Math.round((curr - s) / (24 * 60 * 60 * 1000)) + 1);
      tripStatus = params.isAwayByLocation === true || params.activeTrip.isConfirmed
        ? "confirmed"
        : "planned";

      // Re-entry risk: return day (last day) from a trip of 3 or more days,
      // and tomorrow's calendar has normal/heavy load (>= 3 meetings)
      if (daysAway === totalTripDays && totalTripDays >= 3) {
        if (params.tomorrowMeetingCount && params.tomorrowMeetingCount >= 3) {
          reentryRisk = true;
        }
      }
    }
  } else if (params.hasTravelLegsToday) {
    tripStatus = params.isAwayByLocation === true ? "confirmed" : "planned";
  } else if (params.isAwayByLocation === false) {
    tripStatus = "not_travelling";
  } else if (params.isAwayByLocation === true) {
    tripStatus = "confirmed";
  }

  return {
    tripStatus,
    daysAway,
    totalTripDays,
    reentryRisk,
  };
}
