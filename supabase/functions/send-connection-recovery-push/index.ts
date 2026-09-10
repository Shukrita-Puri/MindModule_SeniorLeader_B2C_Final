/**
 * Delayed push follow-up for unresolved connection problems.
 *
 * Runs as a scheduled batch. For every open `connection_recovery_requests`
 * row where the in-app prompt has been showing for RECOVERY_PUSH_DELAY_DAYS
 * and no push has gone out inside RECOVERY_PUSH_COOLDOWN_DAYS, it sends one
 * alert push pointing at the connections screen.
 *
 * Respects the user's notification preferences and quiet hours, and writes a
 * `notification_log` row so caps and diagnostics stay consistent.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedCronCaller, cronForbiddenResponse } from "../_shared/cron-auth.ts";
import { validateApnsEnvironment } from "../_shared/apns-env.ts";
import { createApnsJwt } from "../_shared/apns-sender.ts";
import {
  RECOVERY_PUSH_COOLDOWN_DAYS,
  RECOVERY_PUSH_DELAY_DAYS,
  type RecoveryIssue,
} from "../_shared/connection-recovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-admin-bypass",
};

const NOTIFICATION_TYPE = "connection_recovery";

const COPY: Record<RecoveryIssue, { subtitle: string; body: string }> = {
  wearable: {
    subtitle: "Watch data has stopped",
    body: "Reconnect your watch so your readiness stays accurate.",
  },
  calendar: {
    subtitle: "Calendar has stopped syncing",
    body: "Reconnect your calendar so your day is read correctly.",
  },
  push: {
    subtitle: "Notifications need attention",
    body: "Turn notifications back on to keep getting timely nudges.",
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendAlert(
  deviceToken: string,
  jwt: string,
  bundleId: string,
  apnsHost: string,
  subtitle: string,
  body: string,
  route: string,
): Promise<{ ok: boolean; status: number; reason: string }> {
  const payload = {
    aps: {
      alert: { title: "Mind Module", subtitle, body },
      sound: "default",
      badge: 1,
      "mutable-content": 1,
      "interruption-level": "active",
    },
    route,
    notification_type: NOTIFICATION_TYPE,
  };
  const res = await fetch(`https://${apnsHost}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      Authorization: `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-collapse-id": NOTIFICATION_TYPE,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true, status: res.status, reason: "ok" };
  const text = await res.text();
  let reason = text || `http_${res.status}`;
  try {
    const parsed = JSON.parse(text);
    if (parsed?.reason) reason = parsed.reason;
  } catch { /* keep raw */ }
  return { ok: false, status: res.status, reason };
}

/** Local-hour quiet-hours check. Falls back to "not quiet" when unknown. */
function isInQuietHours(
  prefs: { dnd_start?: string | null; dnd_end?: string | null } | null,
  timezone: string | null,
): boolean {
  const start = prefs?.dnd_start;
  const end = prefs?.dnd_end;
  if (!start || !end) return false;
  let localHour: number;
  try {
    localHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hour12: false,
        timeZone: timezone || "UTC",
      }).format(new Date()),
    );
  } catch {
    return false;
  }
  const startHour = Number(String(start).slice(0, 2));
  const endHour = Number(String(end).slice(0, 2));
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return false;
  return startHour <= endHour
    ? localHour >= startHour && localHour < endHour
    : localHour >= startHour || localHour < endHour;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isAuthorizedCronCaller(req)) return cronForbiddenResponse(corsHeaders);

  const env = validateApnsEnvironment();
  if (!env.ok) {
    console.error("[connection-recovery-push] APNs env invalid:", env.reason);
    return json({ error: "apns_env_invalid", reason: env.reason }, 500);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const now = Date.now();
  const promptCutoff = new Date(now - RECOVERY_PUSH_DELAY_DAYS * 86_400_000).toISOString();

  const { data: rows, error } = await db
    .from("connection_recovery_requests")
    .select("*")
    .is("resolved_at", null)
    .not("first_prompt_shown_at", "is", null)
    .lte("first_prompt_shown_at", promptCutoff)
    .limit(200);

  if (error) {
    console.error("[connection-recovery-push] read failed", error);
    return json({ error: "read_failed" }, 500);
  }

  const candidates = (rows ?? []).filter((r) => {
    if (!r.push_sent_at) return true;
    const days = (now - new Date(r.push_sent_at).getTime()) / 86_400_000;
    return days >= RECOVERY_PUSH_COOLDOWN_DAYS;
  });

  if (candidates.length === 0) return json({ ok: true, sent: 0, considered: 0 });

  let jwt: string;
  try {
    jwt = await createApnsJwt(
      Deno.env.get("APNS_P8_KEY")!,
      Deno.env.get("APNS_KEY_ID")!,
      Deno.env.get("APNS_TEAM_ID")!,
    );
  } catch (err) {
    console.error("[connection-recovery-push] jwt failed", String(err));
    return json({ error: "apns_jwt_failed" }, 500);
  }

  let sent = 0;
  for (const row of candidates) {
    const userId = row.user_id as string;
    const issue = row.issue as RecoveryIssue;

    // Respect the user's own notification settings and quiet hours.
    const { data: prefs } = await db
      .from("notification_preferences")
      .select("state_aware_nudge_enabled, dnd_start, dnd_end")
      .eq("user_id", userId)
      .maybeSingle();
    if (prefs?.state_aware_nudge_enabled === false) continue;

    const { data: profile } = await db
      .from("profiles")
      .select("current_timezone, home_timezone")
      .eq("id", userId)
      .maybeSingle();
    if (
      isInQuietHours(
        prefs,
        (profile?.current_timezone ?? profile?.home_timezone ?? null) as string | null,
      )
    ) continue;

    const { data: tokens } = await db
      .from("notification_device_tokens")
      .select("device_token, platform")
      .eq("user_id", userId)
      .eq("is_active", true)
      .eq("platform", "ios");

    if (!tokens || tokens.length === 0) continue;

    const copy = COPY[issue] ?? COPY.wearable;
    let anyOk = false;
    let lastStatus = 0;
    let lastReason = "";

    for (const t of tokens) {
      const result = await sendAlert(
        t.device_token as string,
        jwt,
        env.bundleId,
        env.apnsHost,
        copy.subtitle,
        copy.body,
        "/connected-data",
      );
      lastStatus = result.status;
      lastReason = result.reason;
      if (result.ok) anyOk = true;
      if (!result.ok && (result.status === 410 || result.reason === "BadDeviceToken")) {
        await db
          .from("notification_device_tokens")
          .update({ is_active: false })
          .eq("user_id", userId)
          .eq("device_token", t.device_token as string);
      }
    }

    const nowIso = new Date().toISOString();
    await db.from("notification_log").insert({
      user_id: userId,
      notification_type: NOTIFICATION_TYPE,
      sent_at: nowIso,
      payload: {
        issue,
        apns_status: lastStatus,
        apns_reason: lastReason,
      },
    });

    if (anyOk) {
      sent += 1;
      await db
        .from("connection_recovery_requests")
        .update({ push_sent_at: nowIso })
        .eq("id", row.id);
    }
  }

  return json({ ok: true, sent, considered: candidates.length });
});
