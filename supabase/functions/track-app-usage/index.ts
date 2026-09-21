/**
 * Anonymous app-usage ingestion (admin analytics only).
 *
 * Accepts unauthenticated calls so a first app open can be counted BEFORE
 * sign-in. Writes only to `app_installs` and `app_screen_views`; it reads and
 * mutates nothing any user-facing feature depends on. Every failure path is
 * swallowed into a 200 so the client never retries or surfaces an error.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Known app sections. Anything else is bucketed as `other` so free text can
 *  never be persisted from an untrusted caller. */
const ROUTE_ALLOWLIST = new Set<string>([
  "/",
  "/signup",
  "/login",
  "/onboarding",
  "/executive-home",
  "/plan",
  "/daily-check-in",
  "/check-in-detail",
  "/recalibrate",
  "/insights",
  "/insight-detail",
  "/profile",
  "/connected-data",
  "/refer",
  "/nudge-settings",
  "/nudge-simulator",
  "/practice",
  "/pause",
  "/presence",
  "/power-up",
  "/coach",
  "/paywall",
  "/pricing",
  "/settings",
  "/certificate",
  "/join",
  "/oauth-done",
  "/admin",
]);

function normalizeRoute(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0) return "other";
  const path = raw.split("?")[0].split("#")[0].toLowerCase();
  if (path === "/" || path === "") return "/";
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "/";
  // Onboarding keeps its second segment so step drop-off is visible.
  if (segments[0] === "onboarding" && segments[1]) {
    const step = segments[1].replace(/[^a-z0-9-]/g, "").slice(0, 40);
    return step ? `/onboarding/${step}` : "/onboarding";
  }
  const top = `/${segments[0]}`;
  return ROUTE_ALLOWLIST.has(top) ? top : "other";
}

function clampText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function isValidInstallId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || !isValidInstallId(body.installId)) {
      return json({ ok: false, reason: "invalid_install_id" });
    }
    const installId: string = body.installId;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Optional identity. An absent/invalid token is normal (pre sign-in).
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        userId = await verifyAuth0JWT(authHeader, req);
      } catch {
        userId = null;
      }
    }

    const platform = clampText(body.platform, 20) ?? "unknown";
    const nowIso = new Date().toISOString();

    const installRow: Record<string, unknown> = {
      install_id: installId,
      last_seen_at: nowIso,
      platform,
      app_version: clampText(body.appVersion, 40),
      country: clampText(body.country, 8),
      timezone: clampText(body.timezone, 60),
      locale: clampText(body.locale, 20),
    };
    if (typeof body.notificationOptIn === "boolean") {
      installRow.notification_opt_in = body.notificationOptIn;
    }
    const notificationStatus = clampText(body.notificationStatus, 30);
    if (notificationStatus) installRow.notification_status = notificationStatus;
    const deviceToken = clampText(body.deviceToken, 200);
    if (deviceToken && /^[0-9a-fA-F]{64,128}$/.test(deviceToken)) {
      installRow.device_token = deviceToken.toLowerCase();
    }

    // First write for this install creates the row (first_seen_at defaults to now).
    const { data: existing } = await db
      .from("app_installs")
      .select("install_id, user_id")
      .eq("install_id", installId)
      .maybeSingle();

    if (userId && !(existing as any)?.user_id) {
      installRow.user_id = userId;
      installRow.linked_at = nowIso;
      const { data: profile } = await db
        .from("profiles")
        .select("created_at")
        .eq("id", userId)
        .maybeSingle();
      installRow.signup_at = (profile as any)?.created_at ?? nowIso;
    }

    const { error: installError } = await db
      .from("app_installs")
      .upsert(installRow, { onConflict: "install_id" });
    if (installError) {
      console.warn("[track-app-usage] install upsert failed:", installError.message);
    }

    // Screen views — batched, capped, silently truncated.
    const rawViews = Array.isArray(body.views) ? body.views.slice(0, 50) : [];
    const views = rawViews
      .map((v: any) => {
        const enteredAt = typeof v?.enteredAt === "string" ? new Date(v.enteredAt) : null;
        if (!enteredAt || Number.isNaN(enteredAt.getTime())) return null;
        const durationRaw = Number(v?.durationMs);
        const durationMs = Number.isFinite(durationRaw)
          ? Math.max(0, Math.min(Math.round(durationRaw), 6 * 60 * 60 * 1000))
          : 0;
        return {
          install_id: installId,
          user_id: userId ?? (existing as any)?.user_id ?? null,
          route: normalizeRoute(v?.route),
          entered_at: enteredAt.toISOString(),
          duration_ms: durationMs,
          platform,
          local_date: clampText(v?.localDate, 10),
        };
      })
      .filter((v: any) => v !== null) as Array<Record<string, unknown>>;

    let inserted = 0;
    if (views.length > 0) {
      const { error: viewError } = await db.from("app_screen_views").insert(views);
      if (viewError) {
        console.warn("[track-app-usage] view insert failed:", viewError.message);
      } else {
        inserted = views.length;
      }
    }

    return json({ ok: true, views: inserted, linked: Boolean(installRow.user_id) });
  } catch (err) {
    console.warn("[track-app-usage] unexpected error:", err);
    return json({ ok: false });
  }
});
