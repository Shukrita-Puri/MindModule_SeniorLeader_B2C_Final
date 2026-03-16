import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.errorResponse) return authResult.errorResponse;
    const userId = authResult.userId;

    const body = await req.json();

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ===== BULK FORMAT: { samples: [{ summary_date, hrv, hrv_samples }] } =====
    if (body.samples && Array.isArray(body.samples)) {
      const results = { inserted: 0, updated: 0, errors: 0 };

      for (const sample of body.samples) {
        if (!sample.summary_date || sample.hrv == null) {
          results.errors++;
          continue;
        }

        const row: Record<string, unknown> = {
          user_id: userId,
          summary_date: sample.summary_date,
          source: "apple-healthkit",
          hrv: sample.hrv,
          updated_at: new Date().toISOString(),
        };

        // Populate hrv_samples JSONB if provided
        if (sample.hrv_samples && Array.isArray(sample.hrv_samples)) {
          row.hrv_samples = sample.hrv_samples;
        }

        // Preserve any raw_data from the request
        if (body.raw_data) {
          row.raw_data = body.raw_data;
        }

        // Check if row exists
        const { data: existing } = await db
          .from("wearable_data")
          .select("id")
          .eq("user_id", userId)
          .eq("summary_date", sample.summary_date)
          .eq("source", "apple-healthkit")
          .maybeSingle();

        let error;
        if (existing?.id) {
          const result = await db
            .from("wearable_data")
            .update(row)
            .eq("id", existing.id);
          error = result.error;
          if (!error) results.updated++;
        } else {
          const result = await db
            .from("wearable_data")
            .insert(row);
          error = result.error;
          if (!error) results.inserted++;
        }

        if (error) {
          console.error("[persist-wearable-data] DB error for", sample.summary_date, ":", error);
          results.errors++;
        }
      }

      console.log("[persist-wearable-data] Bulk result:", results);
      return new Response(
        JSON.stringify({ success: true, ...results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LEGACY SINGLE FORMAT: { summary_date, hrv, ... } =====
    const {
      summary_date,
      hrv = null,
      resting_heart_rate = null,
      steps = null,
      active_calories = null,
      sleep_score = null,
      total_sleep_minutes = null,
      deep_sleep_minutes = null,
      rem_sleep_minutes = null,
      raw_data = null,
    } = body;

    if (!summary_date) {
      return new Response(
        JSON.stringify({ error: "summary_date is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if row exists
    const { data: existing } = await db
      .from("wearable_data")
      .select("id")
      .eq("user_id", userId)
      .eq("summary_date", summary_date)
      .eq("source", "apple-healthkit")
      .maybeSingle();

    const row: Record<string, unknown> = {
      user_id: userId,
      summary_date,
      source: "apple-healthkit",
      hrv,
      resting_heart_rate,
      steps,
      active_calories,
      sleep_score,
      total_sleep_minutes,
      deep_sleep_minutes,
      rem_sleep_minutes,
      raw_data,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existing?.id) {
      const result = await db
        .from("wearable_data")
        .update(row)
        .eq("id", existing.id);
      error = result.error;
    } else {
      const result = await db
        .from("wearable_data")
        .insert(row);
      error = result.error;
    }

    if (error) {
      console.error("[persist-wearable-data] DB error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to persist wearable data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, summary_date }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[persist-wearable-data] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
