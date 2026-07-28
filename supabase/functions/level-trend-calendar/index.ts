import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ALLOWED_FIELDS = new Set([
  "clarity_level",
  "mental_sharpness_level",
  "confidence_level",
  "emotion_level",
  "pressure_level",
  "regulation_level",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * level-trend-calendar
 *
 * Read-only endpoint that returns per-slot 1–5 levels for a single
 * `daily_checkins` column, scoped to the authenticated Auth0 user via the
 * service-role client (RLS deny-by-default applies otherwise — Auth0 tokens
 * cannot satisfy `auth.uid()` inside Postgres).
 *
 * Mirrors the auth + service-role pattern used by `performance-rhythm-insights`
 * so the Mind Readiness Rhythm trend calendars (Clarity / Sharpness /
 * Confidence) light up for every authenticated user, exactly the way Energy
 * Trend already does.
 *
 * Body: { field, startDate, endDate, lookbackDays? }
 * Response: { rows: Array<{ checkin_date, time_window, created_at, value }> }
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const field = String(body?.field || "");
    const startDate = String(body?.startDate || "");
    const endDate = String(body?.endDate || "");
    const lookbackDays = typeof body?.lookbackDays === "number"
      ? Math.min(Math.max(1, body.lookbackDays), 180)
      : null;

    if (!ALLOWED_FIELDS.has(field)) {
      return new Response(
        JSON.stringify({ error: `Unsupported field: ${field}` }),
        { status: 400, headers: corsHeaders },
      );
    }
    if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
      return new Response(
        JSON.stringify({ error: "startDate/endDate must be YYYY-MM-DD" }),
        { status: 400, headers: corsHeaders },
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const effectiveStartDate = lookbackDays
      ? new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
      : startDate;

    const { data, error } = await supabase
      .from("daily_checkins")
      .select(`checkin_date, time_window, created_at, ${field}`)
      .eq("user_id", userId)
      .gte("checkin_date", effectiveStartDate)
      .lte("checkin_date", endDate)
      .not(field, "is", null);

    if (error) {
      console.error("[level-trend-calendar] DB error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const rows = (data || []).map((row: any) => ({
      checkin_date: row.checkin_date,
      time_window: row.time_window,
      created_at: row.created_at,
      value: row[field],
    }));

    return new Response(JSON.stringify({ rows }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    console.error("[level-trend-calendar] FATAL:", err?.message || err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
