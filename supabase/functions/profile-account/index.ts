/**
 * profile-account
 *
 * Authenticated read/write surface for the Profile page rows that previously
 * queried PostgREST directly from the browser. The web Supabase client only
 * carries the publishable key (no Auth0 JWT), so every direct table call ran
 * without identity and matched no RLS policy — reads came back empty and
 * writes were rejected. This function verifies the Auth0 JWT in-handler and
 * acts strictly on the caller's own user id.
 *
 * Actions:
 *   • home_status  → { isSet, setAt, timezone, lastSyncAt, travelState }
 *   • linkedin_get → { profileUrl, scrapeStatus, scrapedAt }
 *   • linkedin_set → persists user_external_profiles + profiles.linkedin_url
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
};

const LINKEDIN_RX =
  /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\/in\/[A-Za-z0-9\-_%]+\/?(\?.*)?$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let userId: string;
  try {
    userId = await verifyAuth0JWT(req.headers.get("Authorization"), req);
  } catch {
    return json({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const action = typeof body?.action === "string" ? body.action : "";

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    if (action === "home_status") {
      const [{ data: profile }, { data: travel }] = await Promise.all([
        db
          .from("profiles")
          .select("home_lat, home_lng, home_timezone, home_location_set_at")
          .eq("id", userId)
          .maybeSingle(),
        db
          .from("travel_state")
          .select("state, meta")
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      return json({
        ok: true,
        isSet:
          (profile as any)?.home_lat != null && (profile as any)?.home_lng != null,
        setAt: (profile as any)?.home_location_set_at ?? null,
        timezone: (profile as any)?.home_timezone ?? null,
        lastSyncAt: (travel as any)?.meta?.last_sync_at ?? null,
        travelState: (travel as any)?.state ?? null,
      });
    }

    if (action === "linkedin_get") {
      const { data } = await db
        .from("user_external_profiles")
        .select("profile_url, scrape_status, scraped_at")
        .eq("user_id", userId)
        .eq("source", "linkedin_public_profile")
        .order("scraped_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if ((data as any)?.profile_url) {
        return json({
          ok: true,
          profileUrl: (data as any).profile_url,
          scrapeStatus: (data as any).scrape_status ?? "url_saved",
          scrapedAt: (data as any).scraped_at ?? null,
        });
      }

      const { data: prof } = await db
        .from("profiles")
        .select("linkedin_url")
        .eq("id", userId)
        .maybeSingle();

      return json({
        ok: true,
        profileUrl: (prof as any)?.linkedin_url ?? null,
        scrapeStatus: (prof as any)?.linkedin_url ? "url_saved" : null,
        scrapedAt: null,
      });
    }

    if (action === "linkedin_set") {
      const raw = typeof body?.profileUrl === "string" ? body.profileUrl.trim() : "";
      const normalized = raw && !/^https?:\/\//i.test(raw) ? `https://${raw}` : raw;
      if (!normalized || normalized.length > 500 || !LINKEDIN_RX.test(normalized)) {
        return json({ error: "invalid_linkedin_url" }, 400);
      }

      const now = new Date().toISOString();
      const { error: extErr } = await db
        .from("user_external_profiles")
        .upsert(
          {
            user_id: userId,
            source: "linkedin_public_profile",
            profile_url: normalized,
            scrape_status: "url_saved",
            scraped_at: now,
            updated_at: now,
          },
          { onConflict: "user_id,source,profile_url" },
        );
      if (extErr) {
        console.error("[profile-account] linkedin upsert failed:", extErr.message);
        return json({ error: extErr.message }, 500);
      }

      const { error: profErr } = await db
        .from("profiles")
        .update({ linkedin_url: normalized, updated_at: now })
        .eq("id", userId);
      if (profErr) {
        console.error("[profile-account] profiles mirror failed:", profErr.message);
      }

      return json({
        ok: true,
        profileUrl: normalized,
        scrapeStatus: "url_saved",
        scrapedAt: now,
      });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (err) {
    console.error("[profile-account] fatal:", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
});
