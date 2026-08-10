import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { deriveSleepEfficiency } from "../_shared/wearable/derive-sleep-efficiency.ts";
import {
  loadWearableMergeContext,
  type WearableMergeContext,
  type ReconciliationRecord,
} from "../_shared/wearable/canonical.ts";
import { atomicMergeUpsertWearable } from "../_shared/wearable/atomic-upsert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform, x-outbox-item-id",
};

// Prevent OOM during iOS outbox retry storms. Edge functions share the same
// V8 isolate (150MB limit). Processing >5 heavy Apple HealthKit JSON payloads
// concurrently will reliably crash the isolate yielding 502 Bad Gateway.
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3;
const activeOutboxIds = new Set<string>();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const outboxItemId = req.headers.get("x-outbox-item-id") || req.headers.get("X-Outbox-Item-Id");
  if (outboxItemId) {
    if (activeOutboxIds.has(outboxItemId)) {
      console.warn(`[persist-wearable-data] 429 Shedding concurrent duplicate outbox item: ${outboxItemId}`);
      return new Response(
        JSON.stringify({ error: "too_many_requests", detail: "Duplicate request currently processing. Shedding load." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "2" } }
      );
    }
    activeOutboxIds.add(outboxItemId);
  }

  try {
    if (activeRequests >= MAX_CONCURRENT_REQUESTS) {
      console.warn(`[persist-wearable-data] 429 Too Many Requests (Concurrency limit ${MAX_CONCURRENT_REQUESTS} reached). Shedding load to prevent OOM.`);
      return new Response(
        JSON.stringify({ error: "too_many_requests", detail: "Concurrency limit reached. Please retry later." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "5" } }
      );
    }

    activeRequests++;
    try {
      const authResult = await authenticateRequest(req, corsHeaders);
      if (authResult.errorResponse) return authResult.errorResponse;
      const userId = authResult.userId;

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
    // We insert it BEFORE parsing the body to act as a distributed lock.
    if (outboxItemId) {
      let lockError: { code?: string; message?: string } | null = null;
      try {
        const { error } = await db.from("processed_outbox_items").insert({
          outbox_item_id: outboxItemId,
          user_id: userId,
          function_name: "persist-wearable-data",
        });
        lockError = (error as { code?: string; message?: string } | null) ?? null;
      } catch (e) {
        lockError = { message: (e as Error)?.message };
      }
      if (lockError) {
        // ONLY a unique violation means "already processed". Anything else is a
        // genuine failure and must surface as 5xx so the client retries —
        // returning 200 here would drop the batch permanently.
        if (lockError.code === "23505") {
          console.log(`[persist-wearable-data] Duplicate outbox item ignored:`, outboxItemId);
          return new Response(
            JSON.stringify({ success: true, deduplicated: true, outbox_item_id: outboxItemId }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error(
          `[persist-wearable-data] Outbox lock insert failed (retryable):`,
          lockError.code,
          lockError.message,
        );
        return new Response(
          JSON.stringify({ error: "outbox_lock_failed", retryable: true }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Best-effort cleanup of rows older than 14 days (low probability per call).
      if (Math.random() < 0.02) {
        try {
          const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
          await db.from("processed_outbox_items").delete().lt("created_at", cutoff);
        } catch { /* */ }
      }
    }

    // Now safe to parse the potentially large JSON body
    const body = await req.json();

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
      return new Response(
        JSON.stringify({ success: true, ...results }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ===== LEGACY SINGLE FORMAT — REMOVED =====
    // The old { summary_date, hrv, ... } path is intentionally gone.
    //
    // Why: it defaulted every metric to `null` before the merge step, which
    // meant a partial payload (e.g. HRV-only) could silently erase existing
    // RHR / sleep values already stored for that day. The bulk `samples`
    // path is presence-aware (only sets metrics that are actually provided)
    // and is what every real client uses today (see
    // src/services/wearableSyncService.ts — foreground sync, retry
    // orchestrator, and background/idempotent posts all send `samples`).
    //
    // Any caller that still POSTs the legacy shape now receives a clear
    // 400 so it surfaces immediately in logs instead of quietly nulling
    // canonical data.
    return new Response(
      JSON.stringify({
        error: "unsupported_payload_shape",
        detail: "Legacy single-sample body is no longer accepted. Send { samples: [...] } or { action: 'update_status' | 'disconnect' }.",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    } catch (err) {
      if (outboxItemId) {
        // On failure, release the distributed lock so the native retry orchestrator can try again
        try {
          const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          await db.from("processed_outbox_items").delete().eq("outbox_item_id", outboxItemId);
        } catch { /* */ }
      }
      console.error("[persist-wearable-data] Error:", err);
      return new Response(
        JSON.stringify({ error: "Internal error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      activeRequests--;
    }
  } finally {
    if (outboxItemId) activeOutboxIds.delete(outboxItemId);
  }
});
