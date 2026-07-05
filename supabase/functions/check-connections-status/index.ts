import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import {
  computeQuotaScopeKey,
  isScopeEligibleForSync,
  type QuotaCooldownRow,
} from "../_shared/rules/calendar-quota-scope.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function logIntegrationEvent(event: string, payload: Record<string, unknown> = {}) {
  console.log("[IntegrationTelemetry]", JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...payload,
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.errorResponse) return authResult.errorResponse;
    const userId = authResult.userId;

    console.log("[check-connections-status] Authenticated userId:", redactUserId(userId));

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check calendar connections (users may connect multiple providers)
    const { data: calendarConns, error: calError } = await db
      .from("calendar_connections")
      .select("id, provider, is_active, last_sync, sync_status, last_error, last_error_reason, last_error_at, last_sync_delayed_at, retry_after_seconds, next_retry_at, consecutive_delay_count")
      .eq("user_id", userId)
      .eq("is_active", true);

    console.log("[check-connections-status] Calendar query result:", JSON.stringify({ calendarConns, calError }));
    if (calError) {
      logIntegrationEvent("calendar_connection_status_query_failure", {
        userId,
        errorReason: calError.message,
        errorCode: calError.code,
      });
    }

    // If the calendar-connections query itself failed we MUST NOT fabricate a
    // "disconnected" answer for every provider — that would flip real
    // connected providers to "Not connected" for the duration of any
    // transient DB blip. Instead surface an explicit `error` marker and set
    // per-provider `status: 'unknown'`. Clients that opt into the new field
    // render an error/retry banner; legacy clients still see `connected: false`
    // but the presence of `calendar.error` lets them detect the situation.
    const calendarQueryFailed = !!calError;
    const googleConn = calendarQueryFailed ? null : (calendarConns ?? []).find((c) => c.provider === "google") ?? null;
    const microsoftConn = calendarQueryFailed ? null : (calendarConns ?? []).find((c) => c.provider === "microsoft") ?? null;
    const appleConn = calendarQueryFailed ? null : (calendarConns ?? []).find((c) => c.provider === "apple") ?? null;
    const primaryConn = googleConn ?? microsoftConn ?? appleConn; // backwards-compat single field

    // Additive quota-scope debug surface. Never affects `connected` or
    // `status`; only exposes shared cooldown timing so the UI/debug
    // tools can explain why an otherwise-eligible connection is
    // deferred by the scheduler.
    const scopeKeys = [
      googleConn ? computeQuotaScopeKey({
        provider: 'google',
        clientId: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '',
      }) : null,
      microsoftConn ? computeQuotaScopeKey({
        provider: 'microsoft',
        clientId: Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID') ?? '',
      }) : null,
    ].filter((k): k is string => !!k);
    const cooldownByScope = new Map<string, QuotaCooldownRow>();
    if (scopeKeys.length > 0 && !calendarQueryFailed) {
      const { data: cdRows } = await db
        .from('calendar_quota_cooldowns')
        .select('scope_key, provider, cooldown_until, retry_after_seconds, last_reason, hit_count, updated_at')
        .in('scope_key', scopeKeys);
      for (const r of cdRows ?? []) {
        if (r?.scope_key) cooldownByScope.set(r.scope_key as string, r as QuotaCooldownRow);
      }
    }
    const nowForScope = new Date();
    const scopeDebugFor = (provider: 'google' | 'microsoft'): { quotaCooldownUntil: string | null; quotaCooldownReason: string | null; quotaCooldownHitCount: number | null; quotaCooldownActive: boolean } => {
      const clientId = provider === 'google'
        ? (Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '')
        : (Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID') ?? '');
      const key = computeQuotaScopeKey({ provider, clientId });
      const row = cooldownByScope.get(key) ?? null;
      return {
        quotaCooldownUntil: row?.cooldown_until ?? null,
        quotaCooldownReason: row?.last_reason ?? null,
        quotaCooldownHitCount: row?.hit_count ?? null,
        quotaCooldownActive: !isScopeEligibleForSync(row, nowForScope),
      };
    };

    const providerStatus = (conn: typeof googleConn):
      "connected" | "disconnected" | "unknown" => {
      if (calendarQueryFailed) return "unknown";
      return conn ? "connected" : "disconnected";
    };

    // Check Oura connection (full state model).
    // As with the calendar branch we MUST NOT silently map a query failure to
    // "disconnected" — that would flip real Oura connections to Not connected
    // on any transient DB blip. Surface an explicit error marker instead.
    const { data: ouraConn, error: ouraError } = await db
      .from("oura_connections")
      .select("id, is_active, last_sync, last_sample_at, last_error, last_error_at, connection_status, sync_status, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ouraError) {
      logIntegrationEvent("oura_connection_status_query_failure", {
        userId,
        errorReason: ouraError.message,
        errorCode: ouraError.code,
      });
    }

    const { data: anyWearable, error: wearableError } = await db
      .from("wearable_data")
      .select("id, updated_at, summary_date, source, source_provider, source_apps")
      .eq("user_id", userId)
      .order("summary_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (wearableError) {
      logIntegrationEvent("wearable_data_status_query_failure", {
        userId,
        errorReason: wearableError.message,
        errorCode: wearableError.code,
      });
    }

    const { data: watchIntegration, error: watchIntegrationError } = await db
      .from("user_integrations")
      .select(`
        watch_type,
        watch_connected_at,
        watch_connection_status,
        watch_sync_status,
        watch_last_sync_at,
        watch_last_sample_at,
        watch_last_error,
        watch_last_error_at,
        watch_disconnected_at,
        watch_status_updated_at
      `)
      .eq("user_id", userId)
      .maybeSingle();
    if (watchIntegrationError) {
      logIntegrationEvent("user_integrations_status_query_failure", {
        userId,
        errorReason: watchIntegrationError.message,
        errorCode: watchIntegrationError.code,
      });
    }

    // The Apple Watch branch derives its state from BOTH `wearable_data` (for
    // historical rows / inferred connection) AND `user_integrations` (for the
    // authoritative watch status columns). If either query failed we cannot
    // safely derive "disconnected" or "no historical data" — we must return
    // an explicit unknown/error state.
    const ouraQueryFailed = !!ouraError;
    const appleWatchQueryFailed = !!wearableError || !!watchIntegrationError;

    const hasHistoricalData = wearableError ? null : !!anyWearable;
    const latestWearableSource = (anyWearable as { source?: string | null } | null)?.source ?? null;
    // Detect Oura-via-Apple-Health from latest day. `source_provider` is
    // set by the iOS native bridge when HealthKit sample sources resolve to Oura.
    const sourceProvider = (anyWearable as { source_provider?: string } | null)?.source_provider ?? null;
    const ouraDetectedViaAppleHealth = sourceProvider === "oura_via_apple_health";
    const inferredAppleHistoricalConnection = !watchIntegration
      && hasHistoricalData === true
      && (
        (latestWearableSource?.toLowerCase().includes("apple") ?? false)
        || (sourceProvider?.toLowerCase().includes("apple") ?? false)
      );
    const connectionStatus = appleWatchQueryFailed
      ? "unknown"
      : watchIntegration?.watch_connection_status
      ?? (watchIntegration?.watch_type
        ? "connected"
        : inferredAppleHistoricalConnection
          ? "connected"
          : "disconnected");
    let syncStatus = appleWatchQueryFailed
      ? "unknown"
      : watchIntegration?.watch_sync_status
      ?? (inferredAppleHistoricalConnection ? "sync_delayed" : "unknown");

    if (
      connectionStatus === "connected" &&
      syncStatus !== "waiting_for_data" &&
      watchIntegration?.watch_last_sync_at
    ) {
      const lastSyncMs = new Date(watchIntegration.watch_last_sync_at).getTime();
      if (!Number.isNaN(lastSyncMs)) {
        const hoursSinceSync = (Date.now() - lastSyncMs) / (1000 * 60 * 60);
        if (hoursSinceSync >= 24 && syncStatus === "synced") {
          syncStatus = "sync_delayed";
        }
      }
    }

    // Same 24h stale heuristic for Oura. If the oura_connections query
    // failed we return `unknown` for both fields instead of the false
    // "disconnected" default.
    let ouraConnectionStatus = ouraQueryFailed
      ? "unknown"
      : ouraConn?.connection_status ?? "disconnected";
    let ouraSyncStatus = ouraQueryFailed
      ? "unknown"
      : ouraConn?.sync_status ?? "unknown";
    if (
      !ouraQueryFailed &&
      ouraConn?.is_active &&
      ouraConnectionStatus === "connected" &&
      ouraSyncStatus === "synced" &&
      ouraConn.last_sync
    ) {
      const ms = new Date(ouraConn.last_sync).getTime();
      if (!Number.isNaN(ms) && (Date.now() - ms) / 3_600_000 >= 24) {
        ouraSyncStatus = "sync_delayed";
      }
    }

    console.log("[check-connections-status] Apple Watch:", JSON.stringify({
      connectionStatus, syncStatus, hasHistoricalData,
      latestSummaryDate: anyWearable?.summary_date,
      latestUpdatedAt: anyWearable?.updated_at,
      integration: watchIntegration,
    }));
    logIntegrationEvent("backend_connection_status_checked", {
      userId,
      provider: "apple-health",
      connectionState: connectionStatus,
      syncState: syncStatus,
      metadata: {
        hasHistoricalData,
        historicalDataUsedForActiveConnection: false,
        latestSummaryDate: anyWearable?.summary_date ?? null,
        latestUpdatedAt: anyWearable?.updated_at ?? null,
      },
    });

    const result = {
      calendar: {
        connected: !!primaryConn,
        provider: primaryConn?.provider || null,
        lastSync: primaryConn?.last_sync || null,
        // 'ok' when the connections query succeeded, 'error' when it didn't.
        status: calendarQueryFailed ? "error" : "ok",
        // Present only on transient failure; safe for clients to key off.
        ...(calendarQueryFailed
          ? { error: "query_failed", errorMessage: calError?.message ?? null }
          : {}),
        providers: {
          google: {
            connected: !!googleConn,
            status: providerStatus(googleConn),
            lastSync: googleConn?.last_sync || null,
            syncStatus: googleConn?.sync_status ?? null,
            lastError: googleConn?.last_error ?? null,
            lastErrorReason: googleConn?.last_error_reason ?? null,
            lastErrorAt: googleConn?.last_error_at ?? null,
            lastSyncDelayedAt: googleConn?.last_sync_delayed_at ?? null,
            retryAfterSeconds: (googleConn as { retry_after_seconds?: number | null } | null)?.retry_after_seconds ?? null,
            nextRetryAt: (googleConn as { next_retry_at?: string | null } | null)?.next_retry_at ?? null,
            consecutiveDelayCount: (googleConn as { consecutive_delay_count?: number | null } | null)?.consecutive_delay_count ?? null,
            ...(googleConn ? scopeDebugFor('google') : {}),
          },
          microsoft: {
            connected: !!microsoftConn,
            status: providerStatus(microsoftConn),
            lastSync: microsoftConn?.last_sync || null,
            syncStatus: microsoftConn?.sync_status ?? null,
            lastError: microsoftConn?.last_error ?? null,
            lastErrorReason: microsoftConn?.last_error_reason ?? null,
            lastErrorAt: microsoftConn?.last_error_at ?? null,
            lastSyncDelayedAt: (microsoftConn as { last_sync_delayed_at?: string | null } | null)?.last_sync_delayed_at ?? null,
            retryAfterSeconds: (microsoftConn as { retry_after_seconds?: number | null } | null)?.retry_after_seconds ?? null,
            nextRetryAt: (microsoftConn as { next_retry_at?: string | null } | null)?.next_retry_at ?? null,
            consecutiveDelayCount: (microsoftConn as { consecutive_delay_count?: number | null } | null)?.consecutive_delay_count ?? null,
            ...(microsoftConn ? scopeDebugFor('microsoft') : {}),
          },
          apple: {
            connected: !!appleConn,
            status: providerStatus(appleConn),
            lastSync: appleConn?.last_sync || null,
            syncStatus: appleConn?.sync_status ?? null,
            lastError: appleConn?.last_error ?? null,
          },
        },
      },
      oura: {
        // On query failure we do NOT emit `connected: false`; keep it null so
        // legacy clients that only read the boolean can detect the transient
        // state instead of rendering as "Disconnected".
        connected: ouraQueryFailed
          ? null
          : (!!ouraConn?.is_active && ouraConnectionStatus === "connected"),
        connectionStatus: ouraConnectionStatus,
        syncStatus: ouraSyncStatus,
        hasHistoricalData: wearableError ? null : hasHistoricalData,
        needsReconnect: ouraConnectionStatus === "permission_revoked",
        lastSync: ouraConn?.last_sync || null,
        lastSampleAt: ouraConn?.last_sample_at || null,
        lastError: ouraConn?.last_error || null,
        lastErrorAt: ouraConn?.last_error_at || null,
        statusUpdatedAt: ouraConn?.updated_at || null,
        status: ouraQueryFailed ? "error" : "ok",
        ...(ouraQueryFailed
          ? { error: "query_failed", errorMessage: ouraError?.message ?? null }
          : {}),
      },
      appleWatch: {
        connected: appleWatchQueryFailed ? null : connectionStatus === "connected",
        connectionStatus,
        syncStatus,
        hasHistoricalData,
        needsReconnect: connectionStatus === "permission_revoked" || connectionStatus === "error",
        lastSync: watchIntegration?.watch_last_sync_at || anyWearable?.updated_at || null,
        lastSampleAt: watchIntegration?.watch_last_sample_at || (anyWearable?.summary_date ? new Date(`${anyWearable.summary_date}T00:00:00.000Z`).toISOString() : null),
        watchConnectedAt: watchIntegration?.watch_connected_at || null,
        disconnectedAt: watchIntegration?.watch_disconnected_at || null,
        lastError: watchIntegration?.watch_last_error || null,
        lastErrorAt: watchIntegration?.watch_last_error_at || null,
        statusUpdatedAt: watchIntegration?.watch_status_updated_at || null,
        sourceProvider,
        ouraDetectedViaAppleHealth,
        sourceApps: (anyWearable as { source_apps?: Record<string, string[]> } | null)?.source_apps ?? null,
        status: appleWatchQueryFailed ? "error" : "ok",
        ...(appleWatchQueryFailed
          ? {
              error: "query_failed",
              errorMessage: wearableError?.message ?? watchIntegrationError?.message ?? null,
              erroredSources: [
                wearableError ? "wearable_data" : null,
                watchIntegrationError ? "user_integrations" : null,
              ].filter(Boolean),
            }
          : {}),
      },
    };

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[check-connections-status] Error:", err);
    logIntegrationEvent("backend_connection_status_check_failure", {
      errorReason: err instanceof Error ? err.message : String(err),
    });
    return new Response(
      JSON.stringify({ error: "Failed to check connections" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
