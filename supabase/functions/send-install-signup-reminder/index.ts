/**
 * "Finish setting up" reminder for installs that opened the app but never
 * signed up. Keyed to the anonymous install's device token only — it can
 * never reach an account holder, and it is entirely separate from the
 * existing reminder engine (no notification_log caps are consumed).
 *
 * Rules: install has no linked user, opted into (quiet) notifications, has a
 * device token, is iOS, and has reached the fixed day offset for its next
 * reminder measured from its own first-open date (day 2, then day 5). At most
 * MAX_REMINDERS sends ever; a missed run sends late rather than never.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedCronCaller, cronForbiddenResponse } from "../_shared/cron-auth.ts";
import { validateApnsEnvironment } from "../_shared/apns-env.ts";
import { createApnsJwt } from "../_shared/apns-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-admin-bypass",
};

const NOTIFICATION_TYPE = "install_signup_reminder";
/** Days after first open at which reminder 1 and reminder 2 are due. */
const REMINDER_DAY_OFFSETS = [2, 5] as const;
const MAX_REMINDERS = REMINDER_DAY_OFFSETS.length;
const QUIET_START_HOUR = 21;
const QUIET_END_HOUR = 8;

const COPY = [
  {
    subtitle: "Two minutes to set up",
    body: "Finish your setup and get your first readiness brief tomorrow morning.",
  },
  {
    subtitle: "Still worth two minutes",
    body: "Your calibration is unfinished — complete it to see how your week reads.",
  },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isQuietHourFor(timezone: string | null): boolean {
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hour12: false,
        timeZone: timezone || "UTC",
      }).format(new Date()),
    );
    if (!Number.isFinite(hour)) return false;
    return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!isAuthorizedCronCaller(req)) return cronForbiddenResponse(corsHeaders);

  const apns = validateApnsEnvironment();
  if (!apns.ok) {
    console.error("[send-install-signup-reminder]", apns.reason);
    return json({ sent: 0, skipped: 0, reason: apns.reason }, 200);
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const p8 = Deno.env.get("APNS_P8_KEY");
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  if (!p8 || !keyId || !teamId) {
    return json({ sent: 0, skipped: 0, reason: "apns_credentials_missing" });
  }

  try {
    const cutoff = new Date(Date.now() - REMINDER_DELAY_DAYS * 24 * 3600 * 1000).toISOString();
    const { data, error } = await db
      .from("app_installs")
      .select("install_id, timezone, device_token, signup_reminders_sent, last_signup_reminder_at, platform")
      .is("user_id", null)
      .eq("notification_opt_in", true)
      .not("device_token", "is", null)
      .lt("signup_reminders_sent", MAX_REMINDERS)
      .lte("first_seen_at", cutoff)
      .limit(200);

    if (error) return json({ sent: 0, skipped: 0, error: error.message }, 500);

    const candidates = (data ?? []) as any[];
    const jwt = await createApnsJwt(p8, keyId, teamId);
    const cooldownCutoff = Date.now() - COOLDOWN_DAYS * 24 * 3600 * 1000;

    let sent = 0;
    let skipped = 0;

    for (const row of candidates) {
      if (row.platform !== "ios") { skipped += 1; continue; }
      if (row.last_signup_reminder_at && new Date(row.last_signup_reminder_at).getTime() > cooldownCutoff) {
        skipped += 1;
        continue;
      }
      if (isQuietHourFor(row.timezone ?? null)) { skipped += 1; continue; }

      const copy = COPY[Math.min(row.signup_reminders_sent ?? 0, COPY.length - 1)];
      const payload = {
        aps: {
          alert: { title: "Mind Module", subtitle: copy.subtitle, body: copy.body },
          sound: "default",
          "interruption-level": "active",
        },
        route: "/onboarding",
        notification_type: NOTIFICATION_TYPE,
      };

      let ok = false;
      let reason = "unknown";
      let status = 0;
      try {
        const res = await fetch(`https://${apns.apnsHost}/3/device/${row.device_token}`, {
          method: "POST",
          headers: {
            Authorization: `bearer ${jwt}`,
            "apns-topic": apns.bundleId,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-collapse-id": NOTIFICATION_TYPE,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        status = res.status;
        ok = res.ok;
        if (!ok) {
          const text = await res.text();
          reason = text || `http_${res.status}`;
          try {
            const parsed = JSON.parse(text);
            if (parsed?.reason) reason = parsed.reason;
          } catch { /* keep raw */ }
        }
      } catch (err) {
        reason = String(err);
      }

      if (ok) {
        sent += 1;
        await db
          .from("app_installs")
          .update({
            signup_reminders_sent: (row.signup_reminders_sent ?? 0) + 1,
            last_signup_reminder_at: new Date().toISOString(),
          })
          .eq("install_id", row.install_id);
      } else {
        skipped += 1;
        console.warn(`[send-install-signup-reminder] APNs rejected (${status}): ${reason}`);
        // A dead token can never be retried usefully — drop it.
        if (reason === "BadDeviceToken" || reason === "Unregistered") {
          await db
            .from("app_installs")
            .update({ device_token: null, notification_opt_in: false })
            .eq("install_id", row.install_id);
        }
      }
    }

    console.log(`[send-install-signup-reminder] sent=${sent} skipped=${skipped} candidates=${candidates.length}`);
    return json({ sent, skipped, candidates: candidates.length });
  } catch (err) {
    console.error("[send-install-signup-reminder] error", err);
    return json({ sent: 0, skipped: 0, error: err instanceof Error ? err.message : "Unknown" }, 500);
  }
});
