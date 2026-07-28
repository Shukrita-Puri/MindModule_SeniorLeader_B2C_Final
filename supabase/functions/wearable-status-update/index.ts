// Native-authoritative Apple Watch sync status writer.
//
// This is the ONLY endpoint that may durably set watch_sync_status /
// watch_last_error on user_integrations. The iOS HealthKitSyncManager
// calls it after every serialized sync attempt (foreground, observer
// wake, or BGTaskScheduler).
//
// Monotonic guard rules (mirrored in the SQL below):
//   1. Writes must include `source: "native-ios"`. Anything else is
//      accepted as an "opportunistic" hint and can NEVER downgrade a
//      newer authoritative status.
//   2. A newer `authoritative_at` timestamp always wins.
//   3. `status = "synced"` beats any non-synced current row regardless
//      of timestamp, so a real sync always heals stale delayed / error
//      states.
//   4. Downgrades (synced → waiting_for_data | sync_delayed) are
//      rejected unless the incoming write is BOTH newer AND from the
//      native source.
//   5. On `synced`, stale error fields are cleared atomically.
//
// The response reports whether the write was applied so the client can
// telemetry-track rejected stale writes without user-facing errors.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { decideWrite } from "./decide-write.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
};

type WatchStatus =
  | "synced"
  | "waiting_for_data"
  | "sync_delayed"
  | "permission_revoked"
  | "error";

type WatchSource = "native-ios" | "js-opportunistic";

interface WatchStatusRequest {
  status: WatchStatus;
  source: WatchSource;
  authoritativeAt: string;      // ISO-8601, must be parseable
  errorCode?: string | null;    // Optional real error (never the legacy marker)
  lastSampleAt?: string | null; // ISO-8601 of most-recent HealthKit sample
  counts?: Record<string, number>; // Optional telemetry, not persisted
}

const LEGACY_INTERNAL_MARKERS = new Set<string>([
  "native_healthkit_fallback_triggered",
]);

const VALID_STATUSES: ReadonlySet<WatchStatus> = new Set<WatchStatus>([
  "synced",
  "waiting_for_data",
  "sync_delayed",
  "permission_revoked",
  "error",
]);

function bad(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Parsed + validated request payload. */
function parseBody(raw: unknown): WatchStatusRequest | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "body must be a JSON object" };
  const b = raw as Record<string, unknown>;
  const status = String(b.status ?? "") as WatchStatus;
  if (!VALID_STATUSES.has(status)) return { error: `invalid status: ${status}` };
  const source = String(b.source ?? "") as WatchSource;
  if (source !== "native-ios" && source !== "js-opportunistic") {
    return { error: `invalid source: ${source}` };
  }
  const authoritativeAt = String(b.authoritativeAt ?? "");
  const parsed = Date.parse(authoritativeAt);
  if (Number.isNaN(parsed)) return { error: "authoritativeAt must be ISO-8601" };
  let errorCode: string | null = null;
  if (b.errorCode != null) {
    const ec = String(b.errorCode).trim();
    if (ec.length > 0 && !LEGACY_INTERNAL_MARKERS.has(ec)) errorCode = ec;
  }
  const lastSampleAt =
    b.lastSampleAt == null ? null : String(b.lastSampleAt);
  return {
    status,
    source,
    authoritativeAt,
    errorCode,
    lastSampleAt: lastSampleAt,
    counts: (b.counts as Record<string, number> | undefined) ?? undefined,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return bad("method not allowed", 405);

  try {
    const authResult = await authenticateRequest(req, corsHeaders);
    if (authResult.errorResponse) return authResult.errorResponse;
    const userId = authResult.userId;

    const rawBody = await req.json().catch(() => null);
    const parsed = parseBody(rawBody);
    if ("error" in parsed) return bad(parsed.error);
    const body = parsed;

    console.log("[wearable-status-update]", JSON.stringify({
      userId: redactUserId(userId),
      status: body.status,
      source: body.source,
      authoritativeAt: body.authoritativeAt,
      hasErrorCode: !!body.errorCode,
    }));

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load current row for monotonic decision.
    const { data: current, error: readErr } = await db
      .from("user_integrations")
      .select(
        "watch_sync_status, watch_last_error, watch_last_sync_at, watch_last_sample_at, watch_status_source, watch_status_authoritative_at",
      )
      .eq("user_id", userId)
      .maybeSingle();

    if (readErr) {
      console.error("[wearable-status-update] read failed", readErr);
      return bad("read failed", 500);
    }

    const decision = decideWrite(current, body);
    if (!decision.apply) {
      console.log("[wearable-status-update] rejected stale write", JSON.stringify({
        userId: redactUserId(userId),
        reason: decision.reason,
        incomingStatus: body.status,
        currentStatus: current?.watch_sync_status ?? null,
      }));
      return new Response(
        JSON.stringify({ ok: true, applied: false, reason: decision.reason }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Build the update. Successful sync clears any stale error fields
    // AND normalizes the legacy internal marker if it is still on the row.
    const nowIso = body.authoritativeAt;
    const update: Record<string, unknown> = {
      watch_sync_status: body.status,
      watch_last_sync_at: nowIso,
      watch_status_source: body.source,
      watch_status_authoritative_at: nowIso,
      watch_status_updated_at: new Date().toISOString(),
    };
    if (body.lastSampleAt) update.watch_last_sample_at = body.lastSampleAt;
    if (body.status === "synced") {
      update.watch_last_error = null;
      update.watch_last_error_at = null;
    } else if (body.errorCode) {
      update.watch_last_error = body.errorCode;
      update.watch_last_error_at = nowIso;
    }
    // Always heal legacy marker regardless of new status.
    if (
      current?.watch_last_error &&
      LEGACY_INTERNAL_MARKERS.has(current.watch_last_error as string)
    ) {
      update.watch_last_error = update.watch_last_error ?? null;
      update.watch_last_error_at = update.watch_last_error_at ?? null;
    }

    // Upsert (row may not exist yet for first-run devices).
    const { error: writeErr } = await db
      .from("user_integrations")
      .upsert(
        { user_id: userId, ...update },
        { onConflict: "user_id" },
      );

    if (writeErr) {
      console.error("[wearable-status-update] write failed", writeErr);
      return bad("write failed", 500);
    }

    return new Response(
      JSON.stringify({ ok: true, applied: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[wearable-status-update] unexpected", err);
    return bad("unexpected error", 500);
  }
});

// Pure decision logic lives in ./decide-write.ts.