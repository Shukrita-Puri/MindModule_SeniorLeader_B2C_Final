/**
 * travel-day.ts — SSOT for "is today a travel day?".
 *
 * Previously each consumer inferred travel from a timezone change. That misses
 * every domestic trip: London → Oxford is a real travel day with an identical
 * timezone, so the Brief, Plan and Nudges all treated it as a normal day.
 *
 * Distance from the user's home anchor is the primary evidence; a timezone
 * change remains sufficient on its own (international hop) and the travel
 * state machine's own verdict is honoured when coordinates are unavailable.
 *
 * Pure module. No IO.
 */

/** Beyond this distance from home the day is a travel day. */
export const TRAVEL_DAY_THRESHOLD_KM = 50;

export type TravelStateName =
  | "not_travelling"
  | "travel_planned"
  | "en_route"
  | "arrived"
  | "returning"
  | "location_unknown";

const AWAY_STATES: TravelStateName[] = ["en_route", "arrived", "returning"];

export interface TravelDayInput {
  /** Distance from the home anchor in km, or null when unknown. */
  distanceKm: number | null | undefined;
  /** Latest travel state-machine verdict. */
  state?: string | null;
  /** True when the device timezone differs from the home timezone. */
  timezoneChanged?: boolean;
  /** True when the location fix backing distanceKm is too old to trust. */
  locationStale?: boolean;
}

/**
 * Distance-first travel-day decision. Returns false only when there is no
 * evidence at all — never guesses "travelling" from a stale fix.
 */
export function isTravelDayFromDistance(input: TravelDayInput): boolean {
  const { distanceKm, state, timezoneChanged, locationStale } = input;

  if (timezoneChanged === true) return true;

  if (!locationStale && typeof distanceKm === "number" &&
    Number.isFinite(distanceKm)
  ) {
    return distanceKm > TRAVEL_DAY_THRESHOLD_KM;
  }

  // No trustworthy distance — defer to the persisted state machine.
  return AWAY_STATES.includes((state ?? "") as TravelStateName);
}

/** Human-readable reason, for provenance logging. */
export function travelDayReason(input: TravelDayInput): string {
  if (input.timezoneChanged === true) return "timezone-change";
  if (
    !input.locationStale && typeof input.distanceKm === "number" &&
    Number.isFinite(input.distanceKm)
  ) {
    return input.distanceKm > TRAVEL_DAY_THRESHOLD_KM
      ? `distance>${TRAVEL_DAY_THRESHOLD_KM}km`
      : "within-home-radius";
  }
  if (input.locationStale) return "stale-location-deferred-to-state";
  return "no-location-deferred-to-state";
}
