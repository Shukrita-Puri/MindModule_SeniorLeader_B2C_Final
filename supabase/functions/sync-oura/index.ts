/**
 * Oura sync.
 *
 * Two invocation modes:
 *  - User-authenticated (Auth0 JWT): sync the caller's connection.
 *  - Admin/cron (x-admin-bypass: SERVICE_ROLE_KEY): sync a specific user.
 *
 * Pulls last 7 days of daily_sleep + sleep + daily_readiness + heartrate from
 * Oura API v2, maps to the canonical wearable_data shape with source='oura',
 * upserts on (user_id, summary_date). Per-column merge: never null-out columns
 * we don't fetch — preserves data from other sources (e.g. Apple Health).
 *
 * Refresh-on-401 + telemetry. Never flips to disconnected on transient errors.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  loadWearableMergeContext,
  type WearableMergeContext,
  type ReconciliationRecord,
} from "../_shared/wearable/canonical.ts";
import { atomicMergeUpsertWearable } from "../_shared/wearable/atomic-upsert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-bypass, x-outbox-item-id",
};

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_TOKEN = "https://api.ouraring.com/oauth/token";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function log(event: string, payload: Record<string, unknown> = {}) {
  console.log(
    `[sync-oura] ${event}`,
    JSON.stringify({ event, ts: new Date().toISOString(), ...payload }),
  );
}

interface ConnectionRow {
  id: string;
  user_id: string;
  access_token_expires_at: string | null;
}

async function getAccessToken(db: ReturnType<typeof createClient>, connId: string): Promise<string | null> {
  const { data, error } = await db.rpc("get_oura_access_token", { _connection_id: connId });
  if (error) {
    log("vault_read_access_failed", { error: error.message });
    return null;
  }
  return data as string | null;
}
async function getRefreshToken(db: ReturnType<typeof createClient>, connId: string): Promise<string | null> {
  const { data, error } = await db.rpc("get_oura_refresh_token", { _connection_id: connId });
  if (error) {
    log("vault_read_refresh_failed", { error: error.message });
    return null;
  }
  return data as string | null;
}

async function refreshAccessToken(
  db: ReturnType<typeof createClient>,
  conn: ConnectionRow,
): Promise<string | null> {
  const refresh = await getRefreshToken(db, conn.id);
  if (!refresh) return null;
  const clientId = Deno.env.get("OURA_CLIENT_ID");
  const clientSecret = Deno.env.get("OURA_CLIENT_SECRET");
  if (!clientId || !clientSecret) return null;

  const res = await fetch(OURA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    log("token_refresh_failed", { status: res.status, body: text.slice(0, 200) });
    if (res.status === 400 || res.status === 401) {
      // Refresh token rejected → permission must be re-granted.
      await db
        .from("oura_connections")
        .update({
          connection_status: "permission_revoked",
          sync_status: "error",
          last_error: "refresh_token_rejected",
          last_error_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }
    return null;
  }
  const tok = await res.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const expiresAt = new Date(Date.now() + ((tok.expires_in ?? 86400) * 1000)).toISOString();
  await db.rpc("store_oura_access_token", {
    _connection_id: conn.id,
    _token: tok.access_token,
    _expires_at: expiresAt,
  });
  if (tok.refresh_token) {
    await db.rpc("store_oura_refresh_token", {
      _connection_id: conn.id,
      _token: tok.refresh_token,
    });
  }
  log("token_refresh_success");
  return tok.access_token;
}

async function ouraFetch(token: string, path: string, params: Record<string, string>): Promise<{ status: number; json?: unknown }> {
  const url = new URL(`${OURA_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) return { status: res.status };
  return { status: 200, json: await res.json() };
}

/** Map Oura responses → per-day partial rows for wearable_data. */
function buildDailyRows(opts: {
  daily_sleep?: { data?: Array<{ day: string; score?: number }> };
  sleep?: { data?: Array<{ day?: string; bedtime_start?: string; total_sleep_duration?: number; deep_sleep_duration?: number; rem_sleep_duration?: number; time_in_bed?: number; efficiency?: number; average_hrv?: number; average_heart_rate?: number; lowest_heart_rate?: number }> };
  daily_readiness?: { data?: Array<{ day: string; contributors?: { resting_heart_rate?: number; hrv_balance?: number } }> };
  heartrate?: { data?: Array<{ timestamp: string; bpm: number; source?: string }> };
}): Array<Record<string, unknown>> {
  const byDay = new Map<string, Record<string, unknown>>();
  const get = (day: string): Record<string, unknown> => {
    let r = byDay.get(day);
    if (!r) {
      r = { summary_date: day };
      byDay.set(day, r);
    }
    return r;
  };

  for (const ds of opts.daily_sleep?.data ?? []) {
    if (!ds?.day) continue;
    if (typeof ds.score === "number") get(ds.day).sleep_score = Math.round(ds.score);
  }

  for (const s of opts.sleep?.data ?? []) {
    const day = s.day ?? (s.bedtime_start ? s.bedtime_start.slice(0, 10) : null);
    if (!day) continue;
    const r = get(day);
    if (typeof s.total_sleep_duration === "number") {
      r.total_sleep_minutes = Math.round(s.total_sleep_duration / 60);
    }
    if (typeof s.deep_sleep_duration === "number") {
      r.deep_sleep_minutes = Math.round(s.deep_sleep_duration / 60);
    }
    if (typeof s.rem_sleep_duration === "number") {
      r.rem_sleep_minutes = Math.round(s.rem_sleep_duration / 60);
    }
    if (typeof s.average_hrv === "number") r.hrv = s.average_hrv;
    if (typeof s.lowest_heart_rate === "number") r.resting_heart_rate = s.lowest_heart_rate;
    if (typeof s.average_heart_rate === "number") r.heart_rate = Math.round(s.average_heart_rate);
    // Sleep efficiency: prefer Oura-reported `efficiency`, else derive
    // from time_in_bed + total_sleep_duration (both in seconds).
    if (typeof s.efficiency === "number") {
      r.sleep_efficiency = Math.max(0, Math.min(100, Math.round(s.efficiency)));
    } else if (
      typeof s.time_in_bed === "number" && s.time_in_bed > 0 &&
      typeof s.total_sleep_duration === "number"
    ) {
      r.sleep_efficiency = Math.max(0, Math.min(100, Math.round((s.total_sleep_duration / s.time_in_bed) * 100)));
    }
  }

  for (const dr of opts.daily_readiness?.data ?? []) {
    if (!dr?.day) continue;
    const r = get(dr.day);
    const rhr = dr.contributors?.resting_heart_rate;
    if (typeof rhr === "number" && r.resting_heart_rate == null) r.resting_heart_rate = rhr;
  }

  // hr_samples: bucket per-day, store as [{t, v}]
  if (opts.heartrate?.data?.length) {
    const samplesByDay = new Map<string, Array<{ t: string; v: number }>>();
    for (const hr of opts.heartrate.data) {
      if (!hr.timestamp || typeof hr.bpm !== "number") continue;
      const day = hr.timestamp.slice(0, 10);
      const arr = samplesByDay.get(day) ?? [];
      arr.push({ t: hr.timestamp, v: Math.round(hr.bpm) });
      samplesByDay.set(day, arr);
    }
    for (const [day, samples] of samplesByDay.entries()) {
      const r = get(day);
      r.hr_samples = samples;
    }
  }

  return Array.from(byDay.values());
}

async function loadConnection(db: ReturnType<typeof createClient>, userId: string): Promise<ConnectionRow | null> {
  const { data, error } = await db
    .from("oura_connections")
    .select("id, user_id, access_token_expires_at, is_active")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    log("connection_lookup_failed", { error: error.message });
    return null;
  }
  return data as ConnectionRow | null;
}

async function persistRows(
  db: ReturnType<typeof createClient>,
  userId: string,
  rows: Array<Record<string, unknown>>,
): Promise<{ written: number; errors: number; latest: string | null }> {
  let written = 0;
  let errors = 0;
  let latest: string | null = null;
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
      log("reconciliation_log_insert_failed", { error: (e as Error)?.message });
    }
  };
  for (const r of rows) {
    const summaryDate = r.summary_date as string | undefined;
    if (!summaryDate) {
      errors++;
      continue;
    }
    // Skip empty rows (no metrics at all).
    const hasMetric =
      r.hrv != null || r.resting_heart_rate != null || r.heart_rate != null
      || r.total_sleep_minutes != null || r.sleep_score != null
      || (Array.isArray(r.hr_samples) && (r.hr_samples as unknown[]).length > 0);
    if (!hasMetric) continue;

    const row: Record<string, unknown> = {
      ...r,
      user_id: userId,
      source: "oura",
      source_provider: "oura",
      source_apps: {
        ...(r.hrv != null ? { hrv: ["oura"] } : {}),
        ...(Array.isArray(r.hrv_samples) ? { hrv_samples: ["oura"] } : {}),
        ...(r.resting_heart_rate != null ? { resting_heart_rate: ["oura"] } : {}),
        ...(r.heart_rate != null ? { heart_rate: ["oura"] } : {}),
        ...(Array.isArray(r.hr_samples) ? { hr_samples: ["oura"] } : {}),
        ...(r.total_sleep_minutes != null ? { total_sleep_minutes: ["oura"] } : {}),
        ...(r.deep_sleep_minutes != null ? { deep_sleep_minutes: ["oura"] } : {}),
        ...(r.rem_sleep_minutes != null ? { rem_sleep_minutes: ["oura"] } : {}),
        ...(r.sleep_score != null ? { sleep_score: ["oura"] } : {}),
        ...(r.sleep_efficiency != null ? { sleep_efficiency: ["oura"] } : {}),
      },
      updated_at: new Date().toISOString(),
    };
    const { data: existingRow } = await db
      .from("wearable_data")
      .select("hrv, hrv_samples, resting_heart_rate, heart_rate, hr_samples, total_sleep_minutes, deep_sleep_minutes, rem_sleep_minutes, sleep_score, sleep_efficiency, source, source_provider, source_apps, raw_data")
      .eq("user_id", userId)
      .eq("summary_date", summaryDate)
      .maybeSingle();
    const mergeCtx = await getCtx(summaryDate);
    const reconRecords: ReconciliationRecord[] = [];
    const mergedRow = mergeCanonicalWearableRow(existingRow as Record<string, unknown> | null, row, {
      context: mergeCtx,
      onReconciliation: (rec) => reconRecords.push(rec),
    });
    for (const rec of reconRecords) await logReconciliation(summaryDate, rec);
    const { error } = await db
      .from("wearable_data")
      .upsert(mergedRow, { onConflict: "user_id,summary_date" });
    if (error) {
      errors++;
      log("upsert_failed", { summary_date: summaryDate, error: error.message });
    } else {
      written++;
      if (!latest || summaryDate > latest) latest = summaryDate;
    }
  }
  return { written, errors, latest };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const isManual = url.searchParams.get("manual") === "true";
    const adminBypass = req.headers.get("x-admin-bypass");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    let userId: string;

    if (adminBypass && adminBypass === serviceKey) {
      const body = await req.json().catch(() => ({})) as { user_id?: string };
      if (!body.user_id) {
        return new Response(JSON.stringify({ error: "user_id required for admin invocation" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = body.user_id;
    } else {
      const auth = await authenticateRequest(req, corsHeaders);
      if (auth.errorResponse) return auth.errorResponse;
      userId = auth.userId;
    }

    if (isManual) log("manual_sync_triggered", { userId });
    log("sync_started", { userId, manual: isManual });

    const db = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const conn = await loadConnection(db, userId);
    if (!conn) {
      log("no_active_connection", { userId });
      return new Response(JSON.stringify({ error: "no_active_oura_connection" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let token = await getAccessToken(db, conn.id);
    const expired = conn.access_token_expires_at && new Date(conn.access_token_expires_at) < new Date();
    if (!token || expired) {
      log("access_token_expired_refreshing");
      token = await refreshAccessToken(db, conn);
    }
    if (!token) {
      return new Response(JSON.stringify({ error: "permission_revoked" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400_000);
    const startDay = ymd(start);
    const endDay = ymd(end);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    async function fetchOrRefresh(path: string, params: Record<string, string>): Promise<unknown | null> {
      const r1 = await ouraFetch(token!, path, params);
      if (r1.status === 200) return r1.json;
      if (r1.status === 401) {
        const newToken = await refreshAccessToken(db, conn);
        if (!newToken) return null;
        token = newToken;
        const r2 = await ouraFetch(token, path, params);
        return r2.status === 200 ? r2.json : null;
      }
      log("oura_api_error", { path, status: r1.status });
      return null;
    }

    const [daily_sleep, sleep, daily_readiness, heartrate] = await Promise.all([
      fetchOrRefresh("daily_sleep", { start_date: startDay, end_date: endDay }),
      fetchOrRefresh("sleep", { start_date: startDay, end_date: endDay }),
      fetchOrRefresh("daily_readiness", { start_date: startDay, end_date: endDay }),
      fetchOrRefresh("heartrate", { start_datetime: startIso, end_datetime: endIso }),
    ]);

    const rows = buildDailyRows({
      daily_sleep: daily_sleep as never,
      sleep: sleep as never,
      daily_readiness: daily_readiness as never,
      heartrate: heartrate as never,
    });

    if (rows.length === 0) {
      // Ring may simply be off-finger — never disconnect on this.
      await db.from("oura_connections").update({
        connection_status: "connected",
        sync_status: "waiting_for_data",
        last_sync: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
      }).eq("id", conn.id);
      log("sync_waiting_for_data", { userId });
      return new Response(JSON.stringify({
        success: true, written: 0, sync_status: "waiting_for_data",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { written, errors, latest } = await persistRows(db, userId, rows);
    const syncStatus = errors > 0 ? "sync_delayed" : "synced";

    await db.from("oura_connections").update({
      connection_status: "connected",
      sync_status: syncStatus,
      last_sync: new Date().toISOString(),
      last_sample_at: latest ? `${latest}T00:00:00.000Z` : null,
      last_error: errors > 0 ? `partial_persist_errors:${errors}` : null,
      last_error_at: errors > 0 ? new Date().toISOString() : null,
    }).eq("id", conn.id);

    log("sync_success", { userId, written, errors, latest, manual: isManual });
    return new Response(JSON.stringify({
      success: true, written, errors, sync_status: syncStatus, latest,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("[sync-oura] fatal:", err);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
