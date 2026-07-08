/**
 * set-home-location
 *
 * Sprint 10 / Phase 9B — writes the authenticated user's home anchor
 * to profiles.home_lat / home_lng / home_timezone / home_location_set_at.
 *
 * Contract:
 *   • Requires a valid Auth0 JWT.
 *   • If home_location_set_at is already set, refuses to overwrite
 *     unless `force === true`. The client must gate `force:true`
 *     behind an explicit user confirmation.
 *   • Never logs raw lat/lng — only a rounded distance-like signal
 *     ("set=true", "tz=…", "changed=…").
 *   • After a successful write, best-effort fires travel-state-sync
 *     for this user so the classifier can promote to a real state
 *     without waiting for the hourly cron.
 *
 * Sprint 11 auth: `verify_jwt = false` in supabase/config.toml is
 * INTENTIONAL — we verify the caller's Auth0 JWT in-handler via
 * `verifyAuth0JWT` and update only `.eq("id", userId)` where userId is
 * the JWT sub. `body.user_id` is never read. Dev bypass headers are
 * rejected in production by `_shared/auth.ts`.
 *
 * Freshness SSOT: this function writes profiles.*, not travel_state.
 * Any downstream consumer of travel_state MUST use
 * `_shared/travel/freshness.ts::decideTravelFreshness` — do not treat
 * `updated_at` or `meta.last_sync_at` as travel-signal freshness.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { decideHomeLocation } from "./decide.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let userId: string;
  try {
    userId = await verifyAuth0JWT(req.headers.get("Authorization"), req);
  } catch {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: existing } = await db
    .from("profiles")
    .select("home_lat, home_lng, home_timezone, home_location_set_at")
    .eq("id", userId)
    .maybeSingle();

  const decision = decideHomeLocation({
    lat: body?.lat,
    lng: body?.lng,
    timezone: body?.timezone,
    force: body?.force,
    clear: body?.clear,
    existing: existing
      ? {
          home_lat: (existing as any).home_lat ?? null,
          home_lng: (existing as any).home_lng ?? null,
          home_location_set_at: (existing as any).home_location_set_at ?? null,
        }
      : null,
  });

  if (decision.action === "clear") {
    await db
      .from("profiles")
      .update({
        home_lat: null,
        home_lng: null,
        home_location_set_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    console.log("[set-home-location][clear]", { user_id_prefix: userId.slice(0, 8) });
    return new Response(JSON.stringify({ ok: true, cleared: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (decision.action === "invalid") {
    return new Response(JSON.stringify({ error: "invalid_coords" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (decision.action === "refused") {
    console.log("[set-home-location][refused-overwrite]", {
      user_id_prefix: userId.slice(0, 8),
      hadTz: !!existing?.home_timezone,
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: "already_set",
        message: "Home location is already set. Pass force:true to change it.",
      }),
      { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    home_lat: decision.lat,
    home_lng: decision.lng,
    home_location_set_at: now,
    updated_at: now,
  };
  if (decision.timezone) patch.home_timezone = decision.timezone;

  const { error } = await db.from("profiles").update(patch).eq("id", userId);
  if (error) {
    console.error("[set-home-location] update failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log("[set-home-location][set]", {
    user_id_prefix: userId.slice(0, 8),
    changed: decision.changed,
    tz: decision.timezone,
  });

  // Fire travel-state-sync for this user, best-effort.
  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  fetch(`${baseUrl}/functions/v1/travel-state-sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ userId, mode: "manual" }),
  }).catch((e) => console.warn("[set-home-location] sync fire failed", (e as Error).message));

  return new Response(
    JSON.stringify({ ok: true, homeSet: true, changed: decision.changed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});