/**
 * hydrate-travel-day.ts — one implementation of "is today a travel day?"
 * for every server surface (Brief, Mastery Plan, Smart Nudges).
 *
 * Reads the persisted `travel_state` row, applies the shared staleness
 * guard (`freshness.ts`), and hands the result to the SSOT predicate in
 * `travel-day.ts`. Distance from the home anchor (>50 km) is primary
 * evidence; a timezone change is sufficient on its own; a stale location
 * fix defers to the state machine.
 *
 * Fail-open: any error returns `travelDay: false` with reason
 * `hydration_failed` so a DB hiccup can never invent travel.
 */

import { decideTravelFreshness } from "./freshness.ts";
import {
  isTravelDayFromDistance,
  travelDayReason,
  type TravelDayInput,
} from "./travel-day.ts";

export interface TravelDayHydration {
  travelDay: boolean;
  reason: string;
  distanceKm: number | null;
  state: string | null;
  freshness: string;
  /** True when the persisted row was fresh enough to trust. */
  used: boolean;
  /** Shape consumed by `SignalCoverageInput.travelState`. */
  travelState: { state: string | null; distanceFromHomeKm: number | null } | null;
}

export function emptyTravelDayHydration(
  reason = "no_row",
): TravelDayHydration {
  return {
    travelDay: false,
    reason,
    distanceKm: null,
    state: null,
    freshness: "missing",
    used: false,
    travelState: null,
  };
}

/** Pure decision step — exported for tests and for callers that already
 *  hold the row (e.g. Smart Nudges fetches it in its parallel batch). */
export function deriveTravelDay(
  row: Record<string, unknown> | null | undefined,
  opts: { now: Date; currentTimezone?: string | null },
): TravelDayHydration {
  if (!row) return emptyTravelDayHydration("no_row");

  const freshness = decideTravelFreshness({
    state: (row.state as string | null) ?? null,
    lastStateChangeAt: (row.last_state_change_at as string | null) ?? null,
    lastLocationAt: (row.last_location_at as string | null) ?? null,
    now: opts.now,
  });

  const distanceKm = typeof row.distance_from_home_km === "number"
    ? row.distance_from_home_km as number
    : null;

  const lastKnownTz = row.last_known_timezone;
  const timezoneChanged = typeof lastKnownTz === "string" &&
    lastKnownTz.length > 0 && !!opts.currentTimezone &&
    lastKnownTz !== opts.currentTimezone;

  const input: TravelDayInput = {
    distanceKm,
    state: (row.state as string | null) ?? null,
    timezoneChanged,
    locationStale: !freshness.used,
  };
  const travelDay = isTravelDayFromDistance(input);

  return {
    travelDay,
    reason: travelDay ? travelDayReason(input) : "none",
    distanceKm,
    state: ((row.state as string | null) ?? null),
    freshness: freshness.reason,
    used: freshness.used,
    travelState: freshness.used
      ? {
        state: (row.state as string | null) ?? null,
        distanceFromHomeKm: distanceKm,
      }
      : null,
  };
}

/**
 * Fetch + derive. `db` is any Supabase client. Never throws.
 * Logs a single structured provenance line shared by all consumers.
 */
export async function hydrateTravelDay(
  // deno-lint-ignore no-explicit-any
  db: any,
  userId: string,
  opts: { now: Date; currentTimezone?: string | null; fn: string },
): Promise<TravelDayHydration> {
  let result: TravelDayHydration;
  try {
    const { data: row } = await db
      .from("travel_state")
      .select(
        "state, distance_from_home_km, last_state_change_at, last_location_at, last_known_timezone",
      )
      .eq("user_id", userId)
      .maybeSingle();
    result = deriveTravelDay(row as Record<string, unknown> | null, {
      now: opts.now,
      currentTimezone: opts.currentTimezone ?? null,
    });
  } catch (err) {
    console.warn(
      `[${opts.fn}] travel_state hydration skipped:`,
      err instanceof Error ? err.message : err,
    );
    result = emptyTravelDayHydration("hydration_failed");
  }

  console.log("[travel-state][consumer]", {
    fn: opts.fn,
    travelDay: result.travelDay,
    reason: result.reason,
    distanceKm: result.distanceKm,
    state: result.state,
    freshness: result.freshness,
    used: result.used,
  });
  return result;
}
