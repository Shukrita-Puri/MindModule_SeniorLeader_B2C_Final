// get-wearable-context — authenticated read of the wearable snapshot fields
// that `energyStateEngine` needs on the client.
//
// The browser Supabase client is anon-keyed only. RLS on `wearable_data`
// therefore returns no rows for real users, which caused the Executive
// Home Brief live-path to flicker through cold-start (Wearable source:
// NONE) before the persisted snapshot with the true score loaded. This
// function authenticates the caller via Auth0 and reads with the service
// role, mirroring the exact queries the engine used to run client-side.
//
// Response shape is stable — see `energyStateEngine.ts` for the consumer.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface WearableRow {
  hrv: number | null;
  resting_heart_rate: number | null;
  sleep_score: number | null;
  total_sleep_minutes: number | null;
  summary_date: string | null;
  source?: string | null;
  source_provider?: string | null;
  updated_at?: string | null;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff30 = thirtyDaysAgo.toISOString().split("T")[0];

    const [latestRowRes, latestHrvRowRes, baselineRowsRes, rhrHistoryRes] = await Promise.all([
      db
        .from("wearable_data")
        .select(
          "hrv, resting_heart_rate, sleep_score, total_sleep_minutes, summary_date, source, source_provider, updated_at",
        )
        .eq("user_id", userId)
        .or(
          "hrv.not.is.null,resting_heart_rate.not.is.null,sleep_score.not.is.null,total_sleep_minutes.not.is.null",
        )
        .order("summary_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("wearable_data")
        .select("hrv, summary_date")
        .eq("user_id", userId)
        .not("hrv", "is", null)
        .order("summary_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("wearable_data")
        .select("hrv, summary_date")
        .eq("user_id", userId)
        .gte("summary_date", cutoff30)
        .not("hrv", "is", null),
      db
        .from("wearable_data")
        .select("resting_heart_rate, summary_date")
        .eq("user_id", userId)
        .not("resting_heart_rate", "is", null)
        .order("summary_date", { ascending: false })
        .limit(14),
    ]);

    const baselineRows = (baselineRowsRes.data ?? []) as Array<{ hrv: number | null; summary_date: string | null }>;
    let baseline: number | null = null;
    if (baselineRows.length > 0) {
      const sum = baselineRows.reduce((a, r) => a + (Number(r.hrv) || 0), 0);
      baseline = Math.round(sum / baselineRows.length);
    }

    const uniqueDays = new Set(baselineRows.map((r) => r.summary_date).filter(Boolean));
    const sampleDays = uniqueDays.size;
    const baselineConfidence: "low" | "medium" | "high" =
      sampleDays >= 15 ? "high" : sampleDays >= 7 ? "medium" : "low";

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          latestRow: (latestRowRes.data as WearableRow | null) ?? null,
          latestHrvRow: (latestHrvRowRes.data as { hrv: number | null; summary_date: string | null } | null) ?? null,
          baseline,
          hrvPatternContext: baseline !== null
            ? {
                baseline30d: baseline,
                sampleDays,
                baselineConfidence,
                // Fields below are not required by energyStateEngine's
                // read paths; kept null so consumers that expect the shape
                // (from client-side computeHRVPatternContext) do not crash.
                weekdayAvg: null,
                weekendAvg: null,
                dayOfWeekAvgs: {},
                morningAvg: null,
                afternoonAvg: null,
                eveningAvg: null,
                totalSamples: baselineRows.length,
                patternObservations: [],
              }
            : null,
          rhrHistory: (rhrHistoryRes.data ?? []) as Array<{ resting_heart_rate: number | null; summary_date: string | null }>,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[get-wearable-context] fatal:", (err as Error)?.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
