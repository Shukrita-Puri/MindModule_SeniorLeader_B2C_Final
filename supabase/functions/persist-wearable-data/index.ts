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

    /**
     * Helper: upsert integration status.
     * Preserves watch_connected_at if already set — only writes it on first real connection.
     */
    const upsertIntegrationStatus = async (payload: Record<string, unknown>) => {
      // If caller wants to set watch_connected_at, only do so if not already stored
      if (payload.watch_connected_at) {
        const { data: existing } = await db
          .from("user_integrations")
          .select("watch_connected_at")
          .eq("user_id", userId)
          .maybeSingle();

        if (existing?.watch_connected_at) {
          // Already has a first-connection timestamp — don't overwrite
          delete payload.watch_connected_at;
        }
      }

      const { error } = await db
        .from("user_integrations")
        .upsert({
          user_id: userId,
          updated_at: new Date().toISOString(),
          ...payload,
        }, { onConflict: "user_id" });

      if (error) {
        console.error("[persist-wearable-data] user_integrations upsert error:", error);
        throw error;
      }
    };

    // ===== DISCONNECT =====
    if (body.action === "disconnect") {
      await upsertIntegrationStatus({
        watch_type: null,
        watch_connection_status: "disconnected",
        watch_sync_status: "unknown",
        watch_last_error: null,
        watch_last_error_at: null,
        watch_disconnected_at: new Date().toISOString(),
        watch_status_updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ success: true, disconnected: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== UPDATE STATUS =====
    if (body.action === "update_status") {
      await upsertIntegrationStatus({
        watch_type: body.watch_type ?? "apple",
        watch_connected_at: body.watch_connection_status === "connected" ? new Date().toISOString() : undefined,
        watch_connection_status: body.watch_connection_status ?? "connected",
        watch_sync_status: body.watch_sync_status ?? "unknown",
        watch_last_sync_at: body.watch_last_sync_at ?? null,
        watch_last_sample_at: body.watch_last_sample_at ?? null,
        watch_last_error: body.watch_last_error ?? null,
        watch_last_error_at: body.watch_last_error ? new Date().toISOString() : null,
        watch_disconnected_at: body.watch_connection_status === "disconnected" ? new Date().toISOString() : null,
        watch_status_updated_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ success: true, statusUpdated: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== BULK FORMAT: { samples: [{ summary_date, hrv, hrv_samples }] } =====
    if (body.samples && Array.isArray(body.samples)) {
      const results = { inserted: 0, updated: 0, errors: 0 };
      let latestSummaryDate: string | null = null;

      for (const sample of body.samples) {
        if (!sample.summary_date || sample.hrv == null) {
          results.errors++;
          continue;
        }

        latestSummaryDate = latestSummaryDate && latestSummaryDate > sample.summary_date
          ? latestSummaryDate
          : sample.summary_date;

        const row: Record<string, unknown> = {
          user_id: userId,
          summary_date: sample.summary_date,
          source: "apple-healthkit",
          hrv: sample.hrv,
          updated_at: new Date().toISOString(),
        };

        if (sample.hrv_samples && Array.isArray(sample.hrv_samples)) {
          row.hrv_samples = sample.hrv_samples;
        }

        if (body.raw_data) {
          row.raw_data = body.raw_data;
        }

        // Use upsert instead of select-then-update/insert to eliminate race conditions
        const { error } = await db
          .from("wearable_data")
          .upsert(row, { onConflict: "user_id,summary_date,source" });

        if (error) {
          console.error("[persist-wearable-data] DB error for", sample.summary_date, ":", error);
          results.errors++;
        } else {
          results.inserted++;  // upsert — counted as write
        }
      }

      await upsertIntegrationStatus({
        watch_type: "apple",
        watch_connected_at: new Date().toISOString(),
        watch_connection_status: "connected",
        watch_sync_status: results.errors > 0 ? "sync_delayed" : "synced",
        watch_last_sync_at: new Date().toISOString(),
        watch_last_sample_at: latestSummaryDate ? new Date(`${latestSummaryDate}T00:00:00.000Z`).toISOString() : null,
        watch_last_error: results.errors > 0 ? `partial_persist_errors:${results.errors}` : null,
        watch_last_error_at: results.errors > 0 ? new Date().toISOString() : null,
        watch_disconnected_at: null,
        watch_status_updated_at: new Date().toISOString(),
      });

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

    // Use upsert instead of select-then-update/insert to eliminate race conditions
    const { error } = await db
      .from("wearable_data")
      .upsert(row, { onConflict: "user_id,summary_date,source" });

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
