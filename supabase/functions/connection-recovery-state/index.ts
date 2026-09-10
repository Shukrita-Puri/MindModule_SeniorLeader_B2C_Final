/**
 * User-facing connection recovery state.
 *
 * GET  → returns the single reconnect prompt (if any) this user should see now.
 * POST → { action: "shown" | "dismissed" | "acted", issue } records the outcome.
 *
 * Read/write is limited to `connection_recovery_requests` for the caller.
 * Nothing here touches readiness, Brief, Plan, MRS or scoring.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  evaluateConnectionIssues,
  RECOVERY_MAX_PROMPT_SHOWS,
  RECOVERY_PROMPT_SNOOZE_DAYS,
  resolveRecoveryIssue,
  type RecoveryIssue,
} from "../_shared/connection-recovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id, x-mm-client-platform",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const COPY: Record<RecoveryIssue, { title: string; body: string }> = {
  wearable: {
    title: "Your Apple Watch data has stopped coming through",
    body:
      "Reconnect it so your readiness stays accurate. It takes less than a minute.",
  },
  calendar: {
    title: "Your calendar has stopped syncing",
    body:
      "Reconnect it so your day is read correctly before it starts.",
  },
  push: {
    title: "Notifications aren't reaching you",
    body: "Turn them back on so timely nudges arrive when they matter.",
  },
};

async function loadHealth(client: ReturnType<typeof db>, userId: string) {
  const [integration, calendars, tokens] = await Promise.all([
    client
      .from("user_integrations")
      .select(
        "watch_connection_status, watch_sync_status, watch_last_sync_at, watch_last_sample_at, watch_last_error",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("calendar_connections")
      .select("is_active, sync_status, updated_at")
      .eq("user_id", userId),
    client
      .from("notification_device_tokens")
      .select("is_active, platform, updated_at")
      .eq("user_id", userId),
  ]);

  return evaluateConnectionIssues({
    integration: integration.data ?? null,
    calendars: calendars.data ?? [],
    tokens: tokens.data ?? [],
    recentApns: [],
    everHadWearable: Boolean(integration.data),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticateRequest(req, corsHeaders);
  if (auth.errorResponse) return auth.errorResponse;
  const userId = auth.userId!;

  const client = db();

  if (req.method === "POST") {
    let body: { action?: string; issue?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const issue = body.issue as RecoveryIssue | undefined;
    const action = body.action;
    if (!issue || !["wearable", "calendar", "push"].includes(issue)) {
      return json({ error: "Invalid issue" }, 400);
    }

    const nowIso = new Date().toISOString();
    const { data: row } = await client
      .from("connection_recovery_requests")
      .select("*")
      .eq("user_id", userId)
      .eq("issue", issue)
      .maybeSingle();

    const patch: Record<string, unknown> = {
      user_id: userId,
      issue,
      last_prompt_shown_at: nowIso,
      first_prompt_shown_at: row?.first_prompt_shown_at ?? nowIso,
    };
    if (action === "dismissed") {
      patch.prompt_dismiss_count = (row?.prompt_dismiss_count ?? 0) + 1;
    }
    if (action === "acted") {
      patch.prompt_dismiss_count = row?.prompt_dismiss_count ?? 0;
    }

    const { error } = await client
      .from("connection_recovery_requests")
      .upsert(patch, { onConflict: "user_id,issue" });
    if (error) {
      console.error("[connection-recovery-state] write failed", error);
      return json({ error: "Failed to record" }, 500);
    }
    return json({ ok: true });
  }

  // ---- GET: decide whether to prompt --------------------------------------
  const issues = await loadHealth(client, userId);

  const { data: rows } = await client
    .from("connection_recovery_requests")
    .select("*")
    .eq("user_id", userId);

  // Anything healthy again gets resolved.
  const openIssues = new Set(issues.map((i) => i.issue));
  for (const row of rows ?? []) {
    if (!row.resolved_at && !openIssues.has(row.issue as RecoveryIssue)) {
      await resolveRecoveryIssue(client, userId, row.issue as RecoveryIssue);
    }
  }

  if (issues.length === 0) return json({ prompt: null });

  const now = Date.now();
  for (const detected of issues) {
    // Push problems are fixed in iOS settings; we never prompt about them
    // in-app because the prompt itself would be the thing that cannot arrive.
    if (detected.issue === "push") continue;

    const row = (rows ?? []).find((r) => r.issue === detected.issue && !r.resolved_at);
    const shows = row?.first_prompt_shown_at
      ? (row.prompt_dismiss_count ?? 0) + 1
      : 0;
    if (row && shows >= RECOVERY_MAX_PROMPT_SHOWS) continue;
    if (row?.last_prompt_shown_at) {
      const days = (now - new Date(row.last_prompt_shown_at).getTime()) / 86_400_000;
      if (days < RECOVERY_PROMPT_SNOOZE_DAYS) continue;
    }

    return json({
      prompt: {
        issue: detected.issue,
        reason: detected.reason,
        title: COPY[detected.issue].title,
        body: COPY[detected.issue].body,
      },
    });
  }

  return json({ prompt: null });
});
