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
 *   Service-role auth (verify_jwt=false; caller is dispatcher or admin).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { detectTravelFromTitle } from "../_shared/events/travel-patterns.ts";
import { decideTravelSync, type TravelState } from "./derive.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

async function hasTravelCalendarEvent(
  db: ReturnType<typeof svc>,
  userId: string,
  now: Date,
): Promise<boolean> {
  const from = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("calendar_events")
    .select("title")
    .eq("user_id", userId)
    .gte("start_time", from)
    .lte("start_time", to)
    .limit(50);
  if (error || !data) return false;
  return data.some((row: { title: string | null }) => detectTravelFromTitle(row.title).matched);
}

interface UserResult {
  userId: string;
  action: "write" | "skip";
  source: string;
  reason: string;
  from?: TravelState | null;
  to?: TravelState;
}

async function syncUser(
  db: ReturnType<typeof svc>,
  profile: ProfileRow,
  now: Date,
): Promise<UserResult> {
  const { data: stateRow } = await db
    .from("travel_state")
    .select("user_id, state, last_known_lat, last_known_lng, last_location_at, distance_from_home_km, last_known_timezone, updated_at, meta")
    .eq("user_id", profile.id)
    .maybeSingle<TravelStateRow>();

  const hasTravelEvent = await hasTravelCalendarEvent(db, profile.id, now);

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
    hasTravelCalendarEventToday: hasTravelEvent,
    now,
  });

  // Always refresh sync freshness metadata so consumers can tell we ran,
  // even on skip. This is a cheap update — no state churn.
  const metaBase = (stateRow?.meta ?? {}) as Record<string, unknown>;
  const nextMeta = {
    ...metaBase,
    last_sync_at: now.toISOString(),
    last_sync_source: decision.source,
    last_sync_action: decision.write ? "write" : "skip",
    last_sync_reason: decision.reason,
  };

  if (!decision.write) {
    // Meta-only touch when a row exists; do NOT create a row from thin air.
    if (stateRow) {
      await db
        .from("travel_state")
        .update({ meta: nextMeta, updated_at: now.toISOString() })
        .eq("user_id", profile.id);
    }
    console.log("[travel-state-sync][skip]", {
      user_id_prefix: profile.id.slice(0, 8),
      source: decision.source,
      reason: decision.reason,
      prev: stateRow?.state ?? null,
    });
    return { userId: profile.id, action: "skip", source: decision.source, reason: decision.reason, from: stateRow?.state ?? null };
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
  });
  return {
    userId: profile.id,
    action: "write",
    source: decision.source,
    reason: decision.reason,
    from: stateRow?.state ?? null,
    to: decision.nextState,
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

  console.log("[travel-state-sync][start]", { mode, singleUser: !!singleUserId, maxUsers });

  let profilesQuery = db
    .from("profiles")
    .select("id, home_timezone, current_timezone, home_lat, home_lng, travel_notifications_enabled")
    .limit(maxUsers);

  if (singleUserId) {
    profilesQuery = profilesQuery.eq("id", singleUserId);
  } else {
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
  const sourceCounts: Record<string, number> = { distance: 0, timezone: 0, calendar: 0, none: 0 };

  for (const profile of (profiles ?? []) as ProfileRow[]) {
    console.log("[travel-state-sync][user]", { user_id_prefix: profile.id.slice(0, 8) });
    try {
      const r = await syncUser(db, profile, now);
      results.push(r);
      if (r.action === "write") writes++;
      else skips++;
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
    sourceCounts,
    durationMs: Date.now() - startedAt,
    ranAt: now.toISOString(),
    jobKey: JOB_KEY,
    mode,
  };
  console.log("[travel-state-sync][summary]", summary);

  return new Response(JSON.stringify({ ok: true, summary, results: singleUserId ? results : undefined }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});