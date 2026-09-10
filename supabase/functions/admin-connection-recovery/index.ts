/**
 * Admin action: re-request a connection recovery (watch / calendar / push).
 *
 * Flags the user so the in-app reconnect prompt shows on their next app open,
 * arms the delayed push follow-up, and increments a retry counter.
 * Rate-limited to one request per user + issue per 24 hours.
 */
import { requireAdmin, adminCorsHeaders, writeAdminAudit } from "../_shared/admin-guard.ts";
import {
  RECOVERY_REQUEST_COOLDOWN_HOURS,
  type RecoveryIssue,
} from "../_shared/connection-recovery.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const VALID_ISSUES: RecoveryIssue[] = ["wearable", "calendar", "push"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  let body: { userId?: string; issue?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const userId = body.userId?.trim();
  const issue = (body.issue ?? "wearable").trim() as RecoveryIssue;

  if (!userId) return json({ error: "Missing userId" }, 400);
  if (!VALID_ISSUES.includes(issue)) return json({ error: "Invalid issue" }, 400);

  const { data: existing, error: readErr } = await db
    .from("connection_recovery_requests")
    .select("*")
    .eq("user_id", userId)
    .eq("issue", issue)
    .maybeSingle();

  if (readErr) {
    console.error("[admin-connection-recovery] read failed:", readErr);
    return json({ error: "Failed to read recovery state" }, 500);
  }

  const now = Date.now();
  if (existing?.last_requested_at && !existing.resolved_at) {
    const elapsedHours =
      (now - new Date(existing.last_requested_at).getTime()) / 3_600_000;
    if (elapsedHours < RECOVERY_REQUEST_COOLDOWN_HOURS) {
      return json({
        error: "rate_limited",
        message: `Already re-requested in the last ${RECOVERY_REQUEST_COOLDOWN_HOURS} hours.`,
        retryAfterHours: Math.ceil(RECOVERY_REQUEST_COOLDOWN_HOURS - elapsedHours),
        request: existing,
      }, 429);
    }
  }

  const nowIso = new Date().toISOString();
  const reopened = Boolean(existing?.resolved_at);
  const payload = {
    user_id: userId,
    issue,
    attempts: (existing && !reopened ? existing.attempts ?? 0 : 0) + 1,
    requested_by: admin?.adminEmail ?? null,
    last_requested_at: nowIso,
    resolved_at: null,
    // A fresh cycle re-arms the prompt.
    ...(reopened
      ? {
        first_prompt_shown_at: null,
        last_prompt_shown_at: null,
        prompt_dismiss_count: 0,
        push_sent_at: null,
      }
      : {}),
  };

  const { data: saved, error: writeErr } = await db
    .from("connection_recovery_requests")
    .upsert(payload, { onConflict: "user_id,issue" })
    .select()
    .single();

  if (writeErr) {
    console.error("[admin-connection-recovery] write failed:", writeErr);
    return json({ error: "Failed to record recovery request" }, 500);
  }

  if (guard.admin) {
    await writeAdminAudit(db, {
      admin: guard.admin,
      action: "connection_recovery_requested",
      targetUserId: userId,
      route: "/admin/diagnostics",
      metadata: { issue, attempts: saved?.attempts ?? null },
    });
  }

  return json({ ok: true, request: saved });
});
