/**
 * persist-travel-location
 *
 * Receives a single location ping (or a TZ-only event) from the iOS
 * LocationBridge and:
 *   1. Appends it to travel_location_pings (audit trail).
 *   2. Recomputes travel_state for the user (state machine).
 *   3. Triggers travel-notifications scheduling/cancellation when the
 *      state transition warrants it.
 *
 * Idempotent — re-sending the same ping is safe.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { authenticateRequest } from "../_shared/auth.ts";
import { tzToCountry } from "../_shared/plan/tz-to-country.ts";
import {
  isTravelDayFromDistance,
  TRAVEL_DAY_THRESHOLD_KM,
} from "../_shared/travel/travel-day.ts";
import {
  parseTrips,
  toIsoDate,
  upsertLocationWindow,
} from "../_shared/travel/trip-windows.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
};

// Haversine distance in km between two coordinates.
function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// Travel state machine — pure function so it's trivially testable.
// Thresholds chosen to be conservative on iOS where significant-change
// callbacks fire ~every 500m. "Away" only triggers >50km from home; that
// way moving across a city is not classed as travel.
const AWAY_THRESHOLD_KM = TRAVEL_DAY_THRESHOLD_KM;
/** A fix older than this is audit-only and may not drive travel state. */
const STALE_PING_MINUTES = 90;
const RETURNING_BUFFER_KM = 25;

type TravelState =
  | "not_travelling"
  | "travel_planned"
  | "en_route"
  | "arrived"
  | "returning"
  | "location_unknown";

interface DeriveInput {
  prev: TravelState;
  prevDistanceKm: number | null;
  distanceKm: number | null;
  tzChanged: boolean;
  hasLocation: boolean;
}

export function deriveState(input: DeriveInput): TravelState {
  const { prev, distanceKm, prevDistanceKm, tzChanged, hasLocation } = input;

  if (!hasLocation && distanceKm === null) return "location_unknown";

  // No home anchor → we can't classify by distance; fall back to TZ only.
  if (distanceKm === null) {
    if (tzChanged) return "arrived";
    return prev === "not_travelling" ? "not_travelling" : prev;
  }

  const isFar = distanceKm > AWAY_THRESHOLD_KM;
  const isNear = distanceKm < RETURNING_BUFFER_KM;

  // Movement direction
  const movingAway =
    prevDistanceKm !== null && distanceKm - prevDistanceKm > 5;
  const movingHome =
    prevDistanceKm !== null && prevDistanceKm - distanceKm > 5;

  if (isFar) {
    if (prev === "not_travelling" || prev === "travel_planned") {
      return movingAway || tzChanged ? "en_route" : "arrived";
    }
    if (prev === "en_route") return tzChanged ? "arrived" : "en_route";
    return "arrived";
  }

  if (isNear) {
    if (prev === "arrived" || prev === "en_route" || prev === "returning") {
      return movingHome ? "returning" : "not_travelling";
    }
    return "not_travelling";
  }

  // Mid-zone (25–50km): keep prior state, classify as returning if heading home
  if (movingHome) return "returning";
  if (movingAway) return "en_route";
  return prev;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.errorResponse) return authResult.errorResponse;
    const userId = authResult.userId;

    const body = await req.json().catch(() => ({}));

    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;
    const accuracy_m = typeof body.accuracy_m === "number" ? body.accuracy_m : null;
    const tz = typeof body.timezone === "string" ? body.timezone : null;
    const source = typeof body.source === "string" ? body.source : "ios-significant";
    const permission_status = typeof body.permission_status === "string"
      ? body.permission_status
      : null;
    const captured_at = typeof body.captured_at === "string"
      ? body.captured_at
      : new Date().toISOString();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Staleness guard: iOS can hand back a cached fix captured hours ago
    // (the Oxford case — a day-old home coordinate reported distance 0.1 km
    // and suppressed travel). A ping older than this is audited but never
    // allowed to drive state.
    const capturedAtMs = Date.parse(captured_at);
    const pingAgeMinutes = Number.isFinite(capturedAtMs)
      ? Math.round((Date.now() - capturedAtMs) / 60000)
      : null;
    const pingIsStale = pingAgeMinutes !== null &&
      pingAgeMinutes > STALE_PING_MINUTES;

    // 1. Append ping (only if we actually have coordinates).
    if (lat !== null && lng !== null) {
      const { error: pingError } = await supabase
        .from("travel_location_pings")
        .insert({
          user_id: userId,
          lat,
          lng,
          accuracy_m,
          source,
          timezone: tz,
          captured_at,
        });
      if (pingError) {
        // Previously swallowed — a failed insert looked identical to success.
        console.error(
          `[persist-travel-location] ping insert failed user=${userId} code=${pingError.code}: ${pingError.message}`,
        );
      }
    }

    // 2. Load profile home anchor + prior state.
    const { data: profile } = await supabase
      .from("profiles")
      .select("home_lat, home_lng, home_timezone, current_timezone, travel_notifications_enabled")
      .eq("id", userId)
      .maybeSingle();

    const { data: prevState } = await supabase
      .from("travel_state")
      .select("state, distance_from_home_km, last_known_timezone, meta")
      .eq("user_id", userId)
      .maybeSingle();

    const prev: TravelState = (prevState?.state as TravelState) ?? "not_travelling";
    const prevDistance = prevState?.distance_from_home_km ?? null;

    let distance: number | null = null;
    if (lat !== null && lng !== null && profile?.home_lat != null && profile?.home_lng != null) {
      distance = distanceKm(
        { lat, lng },
        { lat: profile.home_lat, lng: profile.home_lng },
      );
    }

    const prevTz = prevState?.last_known_timezone ?? profile?.current_timezone ?? null;
    const tzChanged = !!(tz && prevTz && tz !== prevTz);

    const hasCoordinates = lat !== null && lng !== null;
    const now = new Date().toISOString();

    // ── Coordinate-less report (permission sync, web session, TZ-only ping) ──
    // These carry no location evidence, so they must never rewrite travel
    // state. Only permission/timezone bookkeeping is persisted. A brand new
    // user gets `not_travelling` so the scheduled backstop can classify them
    // on its first run — `location_unknown` is reserved for a fresh fix we
    // genuinely cannot resolve.
    if (!hasCoordinates) {
      const patch: Record<string, unknown> = {
        location_permission_status: permission_status ?? undefined,
        last_known_timezone: tz ?? undefined,
        updated_at: now,
      };
      if (tzChanged) patch.last_timezone_change_at = now;

      let writeError: { code?: string; message: string } | null = null;
      if (prevState) {
        const { error } = await supabase
          .from("travel_state")
          .update(patch)
          .eq("user_id", userId);
        writeError = error;
      } else {
        const { error } = await supabase.from("travel_state").insert({
          user_id: userId,
          state: "not_travelling",
          ...patch,
        });
        writeError = error;
      }
      if (writeError) {
        console.error(
          `[persist-travel-location] travel_state bookkeeping write failed user=${userId} code=${writeError.code}: ${writeError.message}`,
        );
        return new Response(
          JSON.stringify({ error: "travel_state write failed" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const heldState: TravelState = prevState ? prev : "not_travelling";
      console.log(
        `[persist-travel-location] user=${userId} no_coordinates source=${source} state_held=${heldState} tz_changed=${tzChanged}`,
      );

      if (tz && tz !== profile?.current_timezone) {
        await supabase
          .from("profiles")
          .update({ current_timezone: tz, updated_at: now })
          .eq("id", userId);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          state: heldState,
          prev_state: prev,
          distance_km: null,
          tz_changed: tzChanged,
          coordinates: false,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const newState = pingIsStale
      ? prev
      : deriveState({
        prev,
        prevDistanceKm: prevDistance,
        distanceKm: distance,
        tzChanged,
        hasLocation: true,
      });
    if (pingIsStale) {
      console.warn(
        `[persist-travel-location] stale ping ignored for state user=${userId} age_min=${pingAgeMinutes} distance_km=${
          distance === null ? "null" : distance.toFixed(1)
        } state_held=${prev}`,
      );
    }

    const stateChanged = newState !== prev;

    // 3. Upsert travel_state. A stale ping must not overwrite the last
    // trusted coordinates or refresh the freshness timestamps.
    // Per-day trip history: a fresh fix away from home records the day as a
    // travel day even when the calendar says nothing (domestic intercity
    // travel). Read-modify-write of the existing meta JSON; windows are only
    // opened, extended or confirmed — never removed.
    const metaBase = ((prevState as { meta?: unknown } | null)?.meta ?? {}) as Record<string, unknown>;
    let nextMeta: Record<string, unknown> = metaBase;
    if (!pingIsStale && distance !== null) {
      const trips = upsertLocationWindow(
        parseTrips(metaBase),
        toIsoDate(Date.parse(captured_at)),
        { away: distance > AWAY_THRESHOLD_KM, now: new Date(now) },
      );
      nextMeta = {
        ...metaBase,
        trips,
        trips_updated_at: now,
        trips_last_source: "location",
      };
    }

    const { error: stateError } = await supabase.from("travel_state").upsert({
      user_id: userId,
      state: newState,
      meta: nextMeta,
      last_known_lat: lat ?? undefined,
      last_known_lng: lng ?? undefined,
      last_known_accuracy_m: accuracy_m ?? undefined,
      last_location_at: !pingIsStale ? captured_at : undefined,
      last_known_timezone: tz ?? prevTz ?? undefined,
      current_country: (newState === "arrived" || newState === "en_route")
        ? tzToCountry(tz)
        : null,
      last_timezone_change_at: tzChanged ? now : undefined,
      last_state_change_at: stateChanged ? now : undefined,
      distance_from_home_km: pingIsStale ? undefined : (distance ?? undefined),
      location_permission_status: permission_status ?? undefined,
      updated_at: now,
    }, { onConflict: "user_id" });
    if (stateError) {
      console.error(
        `[persist-travel-location] travel_state upsert failed user=${userId} code=${stateError.code}: ${stateError.message}`,
      );
      return new Response(
        JSON.stringify({ error: "travel_state write failed" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `[persist-travel-location] user=${userId} state=${prev}->${newState} distance_km=${
        distance === null ? "null" : distance.toFixed(1)
      } tz_changed=${tzChanged} stale=${pingIsStale} age_min=${
        pingAgeMinutes ?? "null"
      } travel_day=${isTravelDayFromDistance({ distanceKm: distance, state: newState })}`,
    );

    // 4. Keep profiles.current_timezone in sync with device TZ.
    if (tz && tz !== profile?.current_timezone) {
      await supabase
        .from("profiles")
        .update({ current_timezone: tz, updated_at: now })
        .eq("id", userId);
    }

    // 5. If state changed and notifications are opted-in, fire the
    // scheduler. We do this async (fire-and-forget) so the location
    // upload stays fast even if the scheduler is slow.
    if (stateChanged && profile?.travel_notifications_enabled !== false) {
      const baseUrl = Deno.env.get("SUPABASE_URL")!;
      fetch(`${baseUrl}/functions/v1/travel-notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          user_id: userId,
          prev_state: prev,
          new_state: newState,
          tz: tz ?? prevTz,
          tz_changed: tzChanged,
        }),
      }).catch((e) => console.warn("[persist-travel-location] scheduler fire failed", e));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        state: newState,
        prev_state: prev,
        distance_km: distance,
        tz_changed: tzChanged,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[persist-travel-location] error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});