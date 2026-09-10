import { requireAdmin, adminCorsHeaders } from "../_shared/admin-guard.ts";
import {
  evaluateConnectionIssues,
  RECOVERY_STALE_DAYS,
} from "../_shared/connection-recovery.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function maskToken(tok: string | null | undefined): string | null {
  if (!tok) return null;
  if (tok.length <= 12) return "***";
  return `${tok.substring(0, 12)}...`;
}

/**
 * mode=alerts — cross-user read-only list of users whose watch sync or push
 * delivery is currently broken. No writes, no side effects.
 */
// deno-lint-ignore no-explicit-any
async function listAlerts(db: any) {
  const staleCutoff = new Date(
    Date.now() - RECOVERY_STALE_DAYS * 86_400_000,
  ).toISOString();

  const [integrationsRes, tokensRes, recoveryRes] = await Promise.all([
    db
      .from("user_integrations")
      .select(
        "user_id, watch_connection_status, watch_sync_status, watch_last_sync_at, watch_last_sample_at, watch_last_error",
      )
      .limit(1000),
    db
      .from("notification_device_tokens")
      .select("user_id, is_active, platform, updated_at")
      .limit(2000),
    db
      .from("connection_recovery_requests")
      .select("user_id, issue, attempts, last_requested_at, push_sent_at, resolved_at")
      .is("resolved_at", null)
      .limit(1000),
  ]);

  if (integrationsRes.error || tokensRes.error) {
    console.error(
      "[admin-user-diagnostics] alerts query failed:",
      integrationsRes.error ?? tokensRes.error,
    );
    return json({ error: "Failed to build connection alerts" }, 500);
  }

  const tokensByUser = new Map<string, any[]>();
  for (const t of tokensRes.data ?? []) {
    const list = tokensByUser.get(t.user_id) ?? [];
    list.push(t);
    tokensByUser.set(t.user_id, list);
  }

  const recoveryByUser = new Map<string, any[]>();
  for (const r of recoveryRes.data ?? []) {
    const list = recoveryByUser.get(r.user_id) ?? [];
    list.push(r);
    recoveryByUser.set(r.user_id, list);
  }

  const candidateIds = new Set<string>();
  const alerts: Array<Record<string, unknown>> = [];

  for (const integration of integrationsRes.data ?? []) {
    const userId = integration.user_id as string;
    const issues = evaluateConnectionIssues({
      integration,
      calendars: [],
      tokens: tokensByUser.get(userId) ?? [],
      recentApns: [],
      everHadWearable: true,
    });
    if (issues.length === 0) continue;
    candidateIds.add(userId);
    alerts.push({
      userId,
      issues,
      recovery: recoveryByUser.get(userId) ?? [],
      lastSampleAt: integration.watch_last_sample_at ?? null,
      staleCutoff,
    });
  }

  // Users with tokens but no integration row can still have a push problem.
  for (const [userId, tokens] of tokensByUser) {
    if (candidateIds.has(userId)) continue;
    const issues = evaluateConnectionIssues({
      integration: null,
      calendars: [],
      tokens,
      recentApns: [],
      everHadWearable: false,
    });
    if (issues.length === 0) continue;
    candidateIds.add(userId);
    alerts.push({
      userId,
      issues,
      recovery: recoveryByUser.get(userId) ?? [],
      lastSampleAt: null,
      staleCutoff,
    });
  }

  const ids = [...candidateIds];
  const profilesById = new Map<string, { email: string | null; name: string | null }>();
  if (ids.length > 0) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, email, display_name, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) {
      profilesById.set(p.id, {
        email: p.email ?? null,
        name: p.display_name ?? p.full_name ?? null,
      });
    }
  }

  const enriched = alerts.map((a) => ({
    ...a,
    email: profilesById.get(a.userId as string)?.email ?? null,
    name: profilesById.get(a.userId as string)?.name ?? null,
  }));

  return json({ alerts: enriched, total: enriched.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db } = guard;

  const url = new URL(req.url);

  if (url.searchParams.get("mode") === "alerts") {
    return await listAlerts(db);
  }

  const userId = url.searchParams.get("userId")?.trim();
  if (!userId) {
    return json({ error: "Missing userId query parameter" }, 400);
  }

  const [integrationsRes, tokensRes, recoveryRes] = await Promise.all([
    db
      .from("user_integrations")
      .select(
        "watch_connection_status, watch_sync_status, watch_last_sync_at, watch_last_sample_at, watch_last_error",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("notification_device_tokens")
      .select("id, platform, is_active, updated_at, device_token")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    db
      .from("connection_recovery_requests")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
  ]);

  if (integrationsRes.error) {
    console.error(
      "[admin-user-diagnostics] user_integrations query failed:",
      integrationsRes.error,
    );
    return json({ error: "Failed to read HealthKit integration data" }, 500);
  }

  if (tokensRes.error) {
    console.error(
      "[admin-user-diagnostics] notification_device_tokens query failed:",
      tokensRes.error,
    );
    return json({ error: "Failed to read push notification token data" }, 500);
  }

  const tokens = (tokensRes.data ?? []).map((row: any) => ({
    id: row.id,
    platform: row.platform,
    isActive: row.is_active,
    updatedAt: row.updated_at,
    deviceTokenMasked: maskToken(row.device_token),
  }));

  const issues = evaluateConnectionIssues({
    integration: integrationsRes.data ?? null,
    calendars: [],
    tokens: (tokensRes.data ?? []).map((t: any) => ({
      is_active: t.is_active,
      platform: t.platform,
      updated_at: t.updated_at,
    })),
    recentApns: [],
    everHadWearable: Boolean(integrationsRes.data),
  });

  return json({
    userId,
    healthkit: integrationsRes.data,
    tokens,
    issues,
    recovery: recoveryRes.error ? [] : (recoveryRes.data ?? []),
  });
});
