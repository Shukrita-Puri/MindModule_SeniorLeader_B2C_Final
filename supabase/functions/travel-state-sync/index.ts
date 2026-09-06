/**
 * travel-state-sync
 *
 * Sprint 9 / Phase 9B — scheduled backend producer that keeps
 * `travel_state` fresh enough for Brief / Plan travel reasoning
 * when the client-only `persist-travel-location` producer isn't
 * firing (app closed, background permission revoked, web-only user).
 *
 * FAIL-OPEN CONTRACT (see derive.ts):
 *   • Missing signals → skip; never write a confident false row.
 *   • Advisory signals (timezone diff, calendar travel title) may
 *     promote from not_travelling → travel_planned / arrived only.
 *     They may NOT clear an existing away state.
 *   • Only fresh location fixes (<24h) drive distance classification
 *     and are the only way to transition back to not_travelling.
 *
 * INVOCATION:
 *   POST /functions/v1/travel-state-sync
 *   Body: { userId?: string, mode?: "scheduled" | "manual" }
 *   Sprint 11 auth: `verify_jwt = false` in supabase/config.toml is
 *   INTENTIONAL — we authorize the request in-handler via
 *   `decideTravelSyncAuth` (see ./auth.ts). The handler accepts:
 *     • service-role bearer (dispatcher / internal),
 *     • admin Auth0 JWT (allowlist),
 *     • regular Auth0 JWT for self-sync only (body.userId === sub).
 *   Anything else → 401/403. Do NOT switch this to verify_jwt=true
 *   without removing the in-handler auth (they would both attempt to
 *   read the same Authorization header and duplicate work).
 *
 * FRESHNESS SSOT (Sprint 11):
 *   `travel_state.updated_at` and `meta.last_sync_at` are BOOKKEEPING,
 *   not travel-signal freshness. Any consumer that reads travel_state
 *   MUST use `_shared/travel/freshness.ts::decideTravelFreshness`.
 *   `meta.last_sync_at` = "checked", never "fresh travel signal".
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { detectTravelFromTitle } from "../_shared/events/travel-patterns.ts";
import { decideTravelSync, type TravelState } from "./derive.ts";
import { decideTravelSyncAuth } from "./auth.ts";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { ADMIN_EMAIL_ALLOWLIST } from "../_shared/admin-guard.ts";
import {
  buildTripWindows,
  mergeTripWindows,
  parseTrips,
  toIsoDate,
  upsertLocationWindow,
  type TripEvidenceEvent,
  type TripWindow,
} from "./trip-windows.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform, x-cron-secret",

};

const JOB_KEY = "travel_state_sync";
const DEFAULT_MAX_USERS = 500;

interface ProfileRow {
  id: string;
  home_timezone: string | null;
  current_timezone: string | null;
  home_lat: number | null;
  home_lng: number | null;
  travel_notifications_enabled: boolean | null;
}

interface TravelStateRow {
  user_id: string;
  state: TravelState | null;
  last_known_lat: number | null;
  last_known_lng: number | null;
  last_location_at: string | null;
  distance_from_home_km: number | null;
  last_known_timezone: string | null;
  updated_at: string | null;
  meta: Record<string, unknown> | null;
}

function svc() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * A multi-day trip must stay visible for its whole duration, not just the
 * departure day. We look back 14 days for travel-titled entries and forward
 * 24h for imminent departures. An entry counts as ONGOING when it started in
 * the past and has not ended yet (or, with no end_time, started within 24h).
 */
const CALENDAR_LOOKBACK_DAYS = 14;

async function hasTravelCalendarEvent(
  db: ReturnType<typeof svc>,
  userId: string,
  now: Date,
): Promise<{ matched: boolean; ongoing: boolean }> {
  const from = new Date(now.getTime() - CALENDAR_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("calendar_events")
    .select("title, start_time, end_time")
    .eq("user_id", userId)
    .gte("start_time", from)
    .lte("start_time", to)
    .limit(200);
  if (error || !data) return { matched: false, ongoing: false };

  const nowMs = now.getTime();
  let matched = false;
  let ongoing = false;
  for (const row of data as Array<{ title: string | null; start_time: string | null; end_time: string | null }>) {
    if (!detectTravelFromTitle(row.title).matched) continue;
    const startMs = row.start_time ? Date.parse(row.start_time) : NaN;
    const endMs = row.end_time ? Date.parse(row.end_time) : NaN;

    // Future departure within the next 24h — advisory "planned" signal only.
    if (Number.isFinite(startMs) && startMs > nowMs) {
      matched = true;
      continue;
    }

    // Started already. Active while the end time is in the future, or — with
    // no end time — for 24h after the start.
    const stillActive = Number.isFinite(endMs)
      ? endMs > nowMs
      : Number.isFinite(startMs) && nowMs - startMs <= 24 * 60 * 60 * 1000;
    if (stillActive) {
      matched = true;
      ongoing = true;
    }
  }
  return { matched, ongoing };
}


/**
 * Trip windows (`meta.trips`) — per-DAY travel history.
 *
 * The state row only answers "away right now?". Each run also rebuilds the
 * calendar-derived trip windows for a range around today so a finished trip
 * stays queryable. `mode: "backfill"` widens the range to the whole stored
 * calendar history.
 */
const TRIP_SCAN_BACK_DAYS = 30;
const TRIP_SCAN_FORWARD_DAYS = 30;
const TRIP_BACKFILL_BACK_DAYS = 730;

async function rebuildTripWindows(
  db: ReturnType<typeof svc>,
  userId: string,
  now: Date,
  opts: { backfill: boolean; existingMeta: Record<string, unknown> },
): Promise<{ trips: TripWindow[]; scanned: number }> {
  const backDays = opts.backfill ? TRIP_BACKFILL_BACK_DAYS : TRIP_SCAN_BACK_DAYS;
  const fromMs = now.getTime() - backDays * 24 * 60 * 60 * 1000;
  const toMs = now.getTime() + TRIP_SCAN_FORWARD_DAYS * 24 * 60 * 60 * 1000;

  const { data, error } = await db
    .from("calendar_events")
    .select("title, start_time, end_time, is_all_day")
    .eq("user_id", userId)
    .gte("start_time", new Date(fromMs).toISOString())
    .lte("start_time", new Date(toMs).toISOString())
    .limit(2000);

  const existing = parseTrips(opts.existingMeta);
  if (error || !data) return { trips: existing, scanned: 0 };

  const rebuilt = buildTripWindows(data as TripEvidenceEvent[], { now });
  const merged = mergeTripWindows(existing, rebuilt, {
    from: toIsoDate(fromMs),
    to: toIsoDate(toMs),
  });
  return { trips: merged, scanned: data.length };
}

interface UserResult {
  userId: string;

  action: "write" | "skip";
  source: string;
  reason: string;
  from?: TravelState | null;
  to?: TravelState;
  /** Number of persisted trip windows after this run. */
  trips?: number;
}

async function syncUser(
  db: ReturnType<typeof svc>,
  profile: ProfileRow,
  now: Date,
  opts: { backfill: boolean } = { backfill: false },
): Promise<UserResult> {
  const { data: stateRow } = await db
    .from("travel_state")
    .select("user_id, state, last_known_lat, last_known_lng, last_location_at, distance_from_home_km, last_known_timezone, updated_at, meta")
    .eq("user_id", profile.id)
    .maybeSingle<TravelStateRow>();

  const travelEvent = await hasTravelCalendarEvent(db, profile.id, now);

  const decision = decideTravelSync({
    prev: stateRow?.state ?? null,
    prevDistanceKm: stateRow?.distance_from_home_km ?? null,
    prevLastLocationAt: stateRow?.last_location_at ?? null,
    homeTimezone: profile.home_timezone,
    currentTimezone: profile.current_timezone,
    lastKnownLat: stateRow?.last_known_lat ?? null,
    lastKnownLng: stateRow?.last_known_lng ?? null,
    homeLat: profile.home_lat,
    homeLng: profile.home_lng,
    hasTravelCalendarEventToday: travelEvent.matched,
    travelCalendarEventOngoing: travelEvent.ongoing,

    now,
  });

  // Always refresh sync freshness metadata so consumers can tell we ran,
  // even on skip. This is a cheap update — no state churn.
  const metaBase = (stateRow?.meta ?? {}) as Record<string, unknown>;

  // Per-day trip history lives alongside the bookkeeping keys.
  const { trips: rebuiltTrips, scanned: tripEventsScanned } = await rebuildTripWindows(
    db,
    profile.id,
    now,
    { backfill: opts.backfill, existingMeta: metaBase },
  );

  // A fresh fix away from home records the day as a travel day even with no
  // calendar evidence (domestic intercity travel). It may open, extend or
  // confirm a window — never delete one (fail-open contract).
  const locationAgeMs = stateRow?.last_location_at
    ? now.getTime() - Date.parse(stateRow.last_location_at)
    : Number.POSITIVE_INFINITY;
  const locationFresh = Number.isFinite(locationAgeMs) &&
    locationAgeMs <= 24 * 60 * 60 * 1000 &&
    stateRow?.distance_from_home_km != null;
  const trips = locationFresh
    ? upsertLocationWindow(
      rebuiltTrips,
      toIsoDate(Date.parse(stateRow!.last_location_at!)),
      { away: (stateRow!.distance_from_home_km ?? 0) > 50, now },
    )
    : rebuiltTrips;


  const nextMeta = {
    ...metaBase,
    trips,
    trips_updated_at: now.toISOString(),
    trips_scanned_events: tripEventsScanned,
    last_sync_at: now.toISOString(),
    last_sync_source: decision.source,
    last_sync_action: decision.write ? "write" : "skip",
    last_sync_reason: decision.reason,
  };

  if (!decision.write) {
    if (stateRow) {
      await db
        .from("travel_state")
        .update({ meta: nextMeta, updated_at: now.toISOString() })
        .eq("user_id", profile.id);
    } else if (trips.length > 0) {
      // No state row yet, but we do have durable trip history worth keeping.
      // Create the row at the neutral default — never a confident away state.
      await db.from("travel_state").upsert({
        user_id: profile.id,
        state: "not_travelling",
        meta: nextMeta,
        updated_at: now.toISOString(),
      }, { onConflict: "user_id" });
    }
    console.log("[travel-state-sync][skip]", {
      user_id_prefix: profile.id.slice(0, 8),
      source: decision.source,
      reason: decision.reason,
      prev: stateRow?.state ?? null,
      trips: trips.length,
    });
    return { userId: profile.id, action: "skip", source: decision.source, reason: decision.reason, from: stateRow?.state ?? null, trips: trips.length };
  }

  await db.from("travel_state").upsert({
    user_id: profile.id,
    state: decision.nextState,
    distance_from_home_km: decision.distanceKm ?? stateRow?.distance_from_home_km ?? null,
    last_known_timezone: profile.current_timezone ?? stateRow?.last_known_timezone ?? null,
    last_state_change_at: now.toISOString(),
    meta: nextMeta,
    updated_at: now.toISOString(),
  }, { onConflict: "user_id" });


  console.log("[travel-state-sync][write]", {
    user_id_prefix: profile.id.slice(0, 8),
    source: decision.source,
    reason: decision.reason,
    from: stateRow?.state ?? null,
    to: decision.nextState,
    trips: trips.length,
  });
  return {
    userId: profile.id,
    action: "write",
    source: decision.source,
    reason: decision.reason,
    from: stateRow?.state ?? null,
    to: decision.nextState,
    trips: trips.length,
  };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  const singleUserId = typeof body?.userId === "string" ? body.userId : null;
  const mode = typeof body?.mode === "string" ? body.mode : "scheduled";
  const maxUsers = Number.isFinite(body?.maxUsers) ? Number(body.maxUsers) : DEFAULT_MAX_USERS;
  const now = new Date();

  const db = svc();

  // ── Authorization (Sprint 11 hardening) ──
  // verify_jwt=false in config.toml, so we authorize the call ourselves.
  const authHeader = req.headers.get("Authorization");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isServiceRoleCall =
    !!authHeader && authHeader === `Bearer ${serviceRoleKey}`;

  let callerSub: string | null = null;
  let callerIsAdmin = false;
  if (!isServiceRoleCall) {
    try {
      callerSub = await verifyAuth0JWT(authHeader, req);
    } catch {
      callerSub = null;
    }
    if (callerSub) {
      const { data: profile } = await db
        .from("profiles")
        .select("email")
        .eq("id", callerSub)
        .maybeSingle();
      const email = ((profile as any)?.email ?? "").toString().trim().toLowerCase();
      callerIsAdmin =
        !!email && ADMIN_EMAIL_ALLOWLIST.some((e) => e.toLowerCase() === email);
    }
  }

  const cronSharedSecret = Deno.env.get("CRON_SHARED_SECRET") ?? "";
  const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
  const authDecision = decideTravelSyncAuth({
    authHeader,
    serviceRoleKey,
    bodyUserId: singleUserId,
    callerSub,
    callerIsAdmin,
    cronSecretMatch: !!cronSharedSecret && cronSecretHeader === cronSharedSecret,
  });

  if (!authDecision.allow) {
    console.warn("[travel-state-sync][auth-reject]", {
      reason: authDecision.reason,
      status: authDecision.status,
    });
    return new Response(
      JSON.stringify({ ok: false, error: authDecision.reason }),
      { status: authDecision.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const scopedUserId = authDecision.forceSingleUserId;

  // `backfill` widens the calendar scan to two years of history and drops
  // the signal pre-filter, so trip windows exist for everyone with a calendar.
  const backfill = mode === "backfill";

  console.log("[travel-state-sync][start]", { mode, backfill, singleUser: !!singleUserId, maxUsers });

  let profilesQuery = db
    .from("profiles")
    .select("id, home_timezone, current_timezone, home_lat, home_lng, travel_notifications_enabled")
    .limit(maxUsers);

  if (scopedUserId) {
    profilesQuery = profilesQuery.eq("id", scopedUserId);
  } else if (!backfill) {
    // Only scan users where at least one of the input signals could exist.
    // (home_timezone OR home coordinates OR travel notifications opted in.)
    profilesQuery = profilesQuery.or(
      "home_timezone.not.is.null,home_lat.not.is.null,travel_notifications_enabled.eq.true",
    );
  }

  const { data: profiles, error } = await profilesQuery;
  if (error) {
    console.error("[travel-state-sync] profile scan failed", error.message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: UserResult[] = [];
  let writes = 0;
  let skips = 0;
  let errors = 0;
  let tripWindows = 0;
  const sourceCounts: Record<string, number> = { distance: 0, timezone: 0, calendar: 0, none: 0 };

  for (const profile of (profiles ?? []) as ProfileRow[]) {
    console.log("[travel-state-sync][user]", { user_id_prefix: profile.id.slice(0, 8) });
    try {
      const r = await syncUser(db, profile, now, { backfill });
      results.push(r);
      if (r.action === "write") writes++;
      else skips++;
      tripWindows += r.trips ?? 0;
      sourceCounts[r.source] = (sourceCounts[r.source] ?? 0) + 1;
    } catch (e) {
      errors++;
      console.warn("[travel-state-sync][user][error]", {
        user_id_prefix: profile.id.slice(0, 8),
        error: (e as Error)?.message ?? String(e),
      });
    }
  }

  const summary = {
    scanned: profiles?.length ?? 0,
    writes,
    skips,
    errors,
    tripWindows,
    sourceCounts,
    durationMs: Date.now() - startedAt,
    ranAt: now.toISOString(),
    jobKey: JOB_KEY,
    mode,
  };
  console.log("[travel-state-sync][summary]", summary);


  return new Response(JSON.stringify({ ok: true, summary, results: scopedUserId ? results : undefined }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});