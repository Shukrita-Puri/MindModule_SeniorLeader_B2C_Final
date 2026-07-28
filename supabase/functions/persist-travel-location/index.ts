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
import { verifyAuth0JWT } from "../_shared/auth.ts";

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
const AWAY_THRESHOLD_KM = 50;
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
    const userId = await verifyAuth0JWT(req.headers.get("Authorization"), req);
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

    // 1. Append ping (only if we actually have coordinates).
    if (lat !== null && lng !== null) {
      await supabase.from("travel_location_pings").insert({
        user_id: userId,
        lat,
        lng,
        accuracy_m,
        source,
        timezone: tz,
        captured_at,
      });
    }

    // 2. Load profile home anchor + prior state.
    const { data: profile } = await supabase
      .from("profiles")
      .select("home_lat, home_lng, home_timezone, current_timezone, travel_notifications_enabled")
      .eq("id", userId)
      .maybeSingle();

    const { data: prevState } = await supabase
      .from("travel_state")
      .select("state, distance_from_home_km, last_known_timezone")
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

    const newState = deriveState({
      prev,
      prevDistanceKm: prevDistance,
      distanceKm: distance,
      tzChanged,
      hasLocation: lat !== null && lng !== null,
    });

    const stateChanged = newState !== prev;
    const now = new Date().toISOString();

    // 3. Upsert travel_state.
    await supabase.from("travel_state").upsert({
      user_id: userId,
      state: newState,
      last_known_lat: lat ?? undefined,
      last_known_lng: lng ?? undefined,
      last_known_accuracy_m: accuracy_m ?? undefined,
      last_location_at: lat !== null && lng !== null ? captured_at : undefined,
      last_known_timezone: tz ?? prevTz ?? undefined,
      last_timezone_change_at: tzChanged ? now : undefined,
      last_state_change_at: stateChanged ? now : undefined,
      distance_from_home_km: distance ?? undefined,
      location_permission_status: permission_status ?? undefined,
      updated_at: now,
    }, { onConflict: "user_id" });

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