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
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function isFiniteLat(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -90 && v <= 90;
}
function isFiniteLng(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= -180 && v <= 180;
}
function isIanaTz(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z_]+\/[A-Za-z0-9_+\-/]+$/.test(v);
}

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
  const lat = body?.lat;
  const lng = body?.lng;
  const timezone = body?.timezone;
  const force = body?.force === true;
  const clear = body?.clear === true;

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: existing } = await db
    .from("profiles")
    .select("home_lat, home_lng, home_timezone, home_location_set_at")
    .eq("id", userId)
    .maybeSingle();

  if (clear) {
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

  if (!isFiniteLat(lat) || !isFiniteLng(lng)) {
    return new Response(JSON.stringify({ error: "invalid_coords" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const alreadySet = existing?.home_location_set_at != null || existing?.home_lat != null;
  if (alreadySet && !force) {
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
    home_lat: lat,
    home_lng: lng,
    home_location_set_at: now,
    updated_at: now,
  };
  if (isIanaTz(timezone)) patch.home_timezone = timezone;

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
    changed: alreadySet,
    tz: isIanaTz(timezone) ? timezone : null,
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
    JSON.stringify({ ok: true, homeSet: true, changed: alreadySet }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});