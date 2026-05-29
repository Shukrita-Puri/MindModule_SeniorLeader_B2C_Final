import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

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

    console.log("[check-connections-status] Authenticated userId:", userId);

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Check calendar connections (users may connect multiple providers)
    const { data: calendarConns, error: calError } = await db
      .from("calendar_connections")
      .select("id, provider, is_active, last_sync")
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

    const googleConn = (calendarConns ?? []).find((c) => c.provider === "google") ?? null;
    const microsoftConn = (calendarConns ?? []).find((c) => c.provider === "microsoft") ?? null;
    const appleConn = (calendarConns ?? []).find((c) => c.provider === "apple") ?? null;
    const primaryConn = googleConn ?? microsoftConn ?? appleConn; // backwards-compat single field

    // Check Oura connection (full state model)
    const { data: ouraConn } = await db
      .from("oura_connections")
      .select("id, is_active, last_sync, last_sample_at, last_error, last_error_at, connection_status, sync_status, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: anyWearable } = await db
      .from("wearable_data")
      .select("id, updated_at, summary_date")
      .eq("user_id", userId)
      .order("summary_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: watchIntegration } = await db
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

    const hasHistoricalData = !!anyWearable;
    const connectionStatus = watchIntegration?.watch_connection_status
      ?? (watchIntegration?.watch_type ? "connected" : "disconnected");
    let syncStatus = watchIntegration?.watch_sync_status ?? "unknown";

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

    // Same 24h stale heuristic for Oura
    let ouraConnectionStatus = ouraConn?.connection_status ?? "disconnected";
    let ouraSyncStatus = ouraConn?.sync_status ?? "unknown";
    if (
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
        providers: {
          google: {
            connected: !!googleConn,
            lastSync: googleConn?.last_sync || null,
          },
          microsoft: {
            connected: !!microsoftConn,
            lastSync: microsoftConn?.last_sync || null,
          },
          apple: {
            connected: !!appleConn,
            lastSync: appleConn?.last_sync || null,
          },
        },
      },
      oura: {
        connected: !!ouraConn?.is_active && ouraConnectionStatus === "connected",
        connectionStatus: ouraConnectionStatus,
        syncStatus: ouraSyncStatus,
        hasHistoricalData,
        needsReconnect: ouraConnectionStatus === "permission_revoked",
        lastSync: ouraConn?.last_sync || null,
        lastSampleAt: ouraConn?.last_sample_at || null,
        lastError: ouraConn?.last_error || null,
        lastErrorAt: ouraConn?.last_error_at || null,
        statusUpdatedAt: ouraConn?.updated_at || null,
      },
      appleWatch: {
        connected: connectionStatus === "connected",
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
