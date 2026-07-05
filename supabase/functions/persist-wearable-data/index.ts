import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { deriveSleepEfficiency } from "../_shared/wearable/derive-sleep-efficiency.ts";
import {
  mergeCanonicalWearableRow,
  loadWearableMergeContext,
  type WearableMergeContext,
  type ReconciliationRecord,
} from "../_shared/wearable/canonical.ts";
import { atomicMergeUpsertWearable } from "../_shared/wearable/atomic-upsert.ts";

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

    // Per-request cache: one context load per unique summary_date.
    const ctxCache = new Map<string, WearableMergeContext>();
    const getCtx = async (summaryDate: string): Promise<WearableMergeContext> => {
      const hit = ctxCache.get(summaryDate);
      if (hit) return hit;
      const ctx = await loadWearableMergeContext(db, userId, summaryDate);
      ctxCache.set(summaryDate, ctx);
      return ctx;
    };
    const logReconciliation = async (summaryDate: string, rec: ReconciliationRecord) => {
      try {
        await db.from("wearable_reconciliation_log").insert({
          user_id: userId,
          summary_date: summaryDate,
          metric: rec.metric,
          winning_source: rec.winning_source,
          losing_source: rec.losing_source,
          winning_updated_at: rec.winning_updated_at,
          losing_updated_at: rec.losing_updated_at,
          delta_hours: rec.delta_hours,
          reason: rec.reason,
          details: rec.details,
        });
      } catch (e) {
        console.warn("[persist-wearable-data] reconciliation log insert failed:", (e as Error)?.message);
      }
    };

    // ===== IDEMPOTENCY (X-Outbox-Item-Id) =====
    // Native iOS outbox + JS retry orchestrator both attach an item id.
    // If we have already processed this id, return success immediately
    // so retried/duplicate background uploads cannot create duplicate work.
    const outboxItemId = req.headers.get("x-outbox-item-id") || req.headers.get("X-Outbox-Item-Id");
    if (outboxItemId) {
      const { data: existing } = await db
        .from("processed_outbox_items")
        .select("outbox_item_id")
        .eq("outbox_item_id", outboxItemId)
        .maybeSingle();
      if (existing) {
        console.log("[persist-wearable-data] Duplicate outbox item ignored:", outboxItemId);
        return new Response(
          JSON.stringify({ success: true, deduplicated: true, outbox_item_id: outboxItemId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const recordProcessed = async () => {
      if (!outboxItemId) return;
      try {
        await db.from("processed_outbox_items").insert({
          outbox_item_id: outboxItemId,
          user_id: userId,
          function_name: "persist-wearable-data",
        });
      } catch (e) {
        // Unique-violation = a concurrent retry already inserted; safe to ignore.
        console.warn("[persist-wearable-data] processed_outbox_items insert noop:", (e as Error)?.message);
      }
      // Best-effort cleanup of rows older than 14 days (low probability per call).
      if (Math.random() < 0.02) {
        try {
          const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          await db.from("processed_outbox_items").delete().lt("created_at", cutoff);
        } catch { /* */ }
      }
    };

    /**
     * Helper: upsert integration status.
     * Preserves watch_connected_at after the first real connection.
     */
    const upsertIntegrationStatus = async (payload: Record<string, unknown>) => {
      const requestedConnectedAt = payload.watch_connected_at;
      if (requestedConnectedAt) {
        delete payload.watch_connected_at;
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

      // Set first-connection timestamp only if it is still unset.
      if (requestedConnectedAt) {
        const { error: connectedAtError } = await db
          .from("user_integrations")
          .update({ watch_connected_at: requestedConnectedAt })
          .eq("user_id", userId)
          .is("watch_connected_at", null);

        if (connectedAtError) {
          console.error("[persist-wearable-data] watch_connected_at update error:", connectedAtError);
          throw connectedAtError;
        }
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

      // Distinguish foreground JS sync vs. iOS background native sync for observability
      const syncSource: string = body.source === 'ios-background' ? 'ios-background' : 'foreground';
      console.log(`[persist-wearable-data] Bulk sync source: ${syncSource}, samples: ${body.samples.length}`);

      for (const sample of body.samples) {
        // Allow rows where at least one metric exists (partial availability)
        const hasAnyMetric = sample.hrv != null || sample.resting_heart_rate != null
          || sample.heart_rate != null || sample.total_sleep_minutes != null;
        if (!sample.summary_date || !hasAnyMetric) {
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
          updated_at: new Date().toISOString(),
        };

        // Set each metric only if provided (preserve existing values on partial updates)
        if (sample.hrv != null) row.hrv = sample.hrv;
        if (sample.hrv_samples && Array.isArray(sample.hrv_samples)) row.hrv_samples = sample.hrv_samples;
        if (sample.resting_heart_rate != null) row.resting_heart_rate = sample.resting_heart_rate;
        if (sample.heart_rate != null) row.heart_rate = sample.heart_rate;
        // Per-sample HR readings for the day, used by cause-effect-engine
        // to compute true per-event-window peak HR (not a day-max proxy).
        if (sample.hr_samples && Array.isArray(sample.hr_samples)) row.hr_samples = sample.hr_samples;
        if (sample.total_sleep_minutes != null) row.total_sleep_minutes = sample.total_sleep_minutes;
        if (sample.deep_sleep_minutes != null) row.deep_sleep_minutes = sample.deep_sleep_minutes;
        if (sample.rem_sleep_minutes != null) row.rem_sleep_minutes = sample.rem_sleep_minutes;
        if (sample.sleep_score != null) row.sleep_score = sample.sleep_score;

        // Per-day HealthKit source attribution. `source_apps` is a small map
        // like { hrv: ["com.ouraring.oura"], sleep: ["com.apple.health"] };
        // `source_provider` is the resolved top-level label
        // (apple_health | oura_via_apple_health | apple_watch_via_apple_health | mixed_via_apple_health).
        row.source_apps = sample.source_apps && typeof sample.source_apps === "object"
          ? sample.source_apps
          : {
              ...(sample.hrv != null || sample.hrv_samples ? { hrv: ["apple-healthkit"], hrv_samples: ["apple-healthkit"] } : {}),
              ...(sample.resting_heart_rate != null ? { resting_heart_rate: ["apple-healthkit"] } : {}),
              ...(sample.heart_rate != null ? { heart_rate: ["apple-healthkit"] } : {}),
              ...(sample.hr_samples ? { hr_samples: ["apple-healthkit"] } : {}),
              ...(sample.total_sleep_minutes != null ? { total_sleep_minutes: ["apple-healthkit"] } : {}),
              ...(sample.deep_sleep_minutes != null ? { deep_sleep_minutes: ["apple-healthkit"] } : {}),
              ...(sample.rem_sleep_minutes != null ? { rem_sleep_minutes: ["apple-healthkit"] } : {}),
              ...(sample.sleep_score != null ? { sleep_score: ["apple-healthkit"] } : {}),
            };
        row.source_provider = typeof sample.source_provider === "string" && sample.source_provider.length > 0
          ? sample.source_provider
          : "apple_healthkit";

        if (body.raw_data) {
          row.raw_data = body.raw_data;
        }

        // Derive & persist sleep_efficiency (0–100) using the shared
        // helper. Tries: sample.sleep_efficiency → raw_data.efficiency →
        // raw_data.sleep.efficiency → time_in_bed + total_sleep_minutes.
        if (typeof sample.sleep_efficiency === 'number') {
          row.sleep_efficiency = Math.max(0, Math.min(100, Math.round(sample.sleep_efficiency)));
        } else {
          const eff = deriveSleepEfficiency(body.raw_data ?? sample.raw_data ?? null, sample.total_sleep_minutes ?? null);
          if (eff != null) row.sleep_efficiency = eff;
        }

        const mergeCtx = await getCtx(sample.summary_date);
        const reconRecords: ReconciliationRecord[] = [];
        // Atomic CAS-guarded read → merge → write. Prevents lost updates when
        // sync-oura and this function race on the same summary_date.
        const res = await atomicMergeUpsertWearable(db, userId, sample.summary_date, row, {
          context: mergeCtx,
          onReconciliation: (r) => reconRecords.push(r),
          overrideRawData: body.raw_data ? body.raw_data : undefined,
        });
        for (const r of reconRecords) await logReconciliation(sample.summary_date, r);
        if (!res.ok) {
          console.error("[persist-wearable-data] atomic upsert failed for", sample.summary_date, ":", res.error);
          results.errors++;
        } else {
          results.inserted++;  // upsert – counted as write
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
        // Persist anchor for incremental native reads when provided
        ...(typeof body.healthkit_anchor === 'string' && body.healthkit_anchor.length > 0
          ? { healthkit_anchor: body.healthkit_anchor }
          : {}),
      });

      console.log(`[persist-wearable-data] Bulk result (${syncSource}):`, results);
      await recordProcessed();
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
      heart_rate = null,
      steps = null,
      active_calories = null,
      sleep_score = null,
      total_sleep_minutes = null,
      deep_sleep_minutes = null,
      rem_sleep_minutes = null,
      raw_data = null,
      sleep_efficiency: bodySleepEfficiency = null,
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
      heart_rate,
      steps,
      active_calories,
      sleep_score,
      total_sleep_minutes,
      deep_sleep_minutes,
      rem_sleep_minutes,
      raw_data,
      updated_at: new Date().toISOString(),
      source_provider: "apple_healthkit",
      source_apps: {
        ...(hrv != null ? { hrv: ["apple-healthkit"] } : {}),
        ...(resting_heart_rate != null ? { resting_heart_rate: ["apple-healthkit"] } : {}),
        ...(heart_rate != null ? { heart_rate: ["apple-healthkit"] } : {}),
        ...(total_sleep_minutes != null ? { total_sleep_minutes: ["apple-healthkit"] } : {}),
        ...(deep_sleep_minutes != null ? { deep_sleep_minutes: ["apple-healthkit"] } : {}),
        ...(rem_sleep_minutes != null ? { rem_sleep_minutes: ["apple-healthkit"] } : {}),
        ...(sleep_score != null ? { sleep_score: ["apple-healthkit"] } : {}),
      },
    };

    // Persist sleep_efficiency (explicit body value preferred, else derive).
    if (typeof bodySleepEfficiency === 'number') {
      row.sleep_efficiency = Math.max(0, Math.min(100, Math.round(bodySleepEfficiency)));
    } else {
      const eff = deriveSleepEfficiency(raw_data, total_sleep_minutes);
      if (eff != null) row.sleep_efficiency = eff;
    }

    const { data: existingRow } = await db
      .from("wearable_data")
      .select("hrv, hrv_samples, resting_heart_rate, heart_rate, hr_samples, total_sleep_minutes, deep_sleep_minutes, rem_sleep_minutes, sleep_score, sleep_efficiency, source, source_provider, source_apps, raw_data")
      .eq("user_id", userId)
      .eq("summary_date", summary_date)
      .maybeSingle();
    const legacyCtx = await getCtx(summary_date);
    const legacyRecon: ReconciliationRecord[] = [];
    const mergedRow = mergeCanonicalWearableRow(existingRow as Record<string, unknown> | null, row, {
      context: legacyCtx,
      onReconciliation: (r) => legacyRecon.push(r),
    });
    for (const r of legacyRecon) await logReconciliation(summary_date, r);

    // Use upsert instead of select-then-update/insert to eliminate race conditions
    const { error } = await db
      .from("wearable_data")
      .upsert(mergedRow, { onConflict: "user_id,summary_date" });

    if (error) {
      console.error("[persist-wearable-data] DB error:", error);
      return new Response(
        JSON.stringify({ error: "Failed to persist wearable data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await upsertIntegrationStatus({
      watch_type: "apple",
      watch_connected_at: new Date().toISOString(),
      watch_connection_status: "connected",
      watch_sync_status: "synced",
      watch_last_sync_at: new Date().toISOString(),
      watch_last_sample_at: new Date(`${summary_date}T00:00:00.000Z`).toISOString(),
      watch_last_error: null,
      watch_last_error_at: null,
      watch_disconnected_at: null,
      watch_status_updated_at: new Date().toISOString(),
    });

    await recordProcessed();
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
