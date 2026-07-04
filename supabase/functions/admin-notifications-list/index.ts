import { requireAdmin, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function maskToken(tok: string | null | undefined): string | null {
  if (!tok) return null;
  if (tok.length <= 6) return "***";
  return `${tok.substring(0, 6)}…(${tok.length})`;
}

function isoHoursAgo(h: number) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db } = guard;

  const url = new URL(req.url);
  const sinceIso = url.searchParams.get("since") ?? isoHoursAgo(24 * 7);
  const statusFilter = url.searchParams.get("status");
  const typeFilter = url.searchParams.get("type");
  const userIdFilter = url.searchParams.get("userId");
  const emailFilter = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);

  // Resolve email → user id if provided
  let resolvedUserId = userIdFilter;
  if (!resolvedUserId && emailFilter) {
    const { data: p } = await db
      .from("profiles")
      .select("id")
      .ilike("email", emailFilter)
      .maybeSingle();
    resolvedUserId = (p as any)?.id ?? null;
  }

  // Notifications
  let notifQuery = db
    .from("notification_log")
    .select("id, user_id, notification_type, variant_id, sent_at, delivered_at, delivery_state, event_reference, tapped, app_opened, target_action_completed, dismissed")
    .gte("sent_at", sinceIso)
    .order("sent_at", { ascending: false })
    .limit(limit);
  if (statusFilter) notifQuery = notifQuery.eq("delivery_state", statusFilter);
  if (typeFilter) notifQuery = notifQuery.eq("notification_type", typeFilter);
  if (resolvedUserId) notifQuery = notifQuery.eq("user_id", resolvedUserId);

  const [notifRes, tokensRes, tracesRes, failed24Res, deviceCountRes] = await Promise.all([
    notifQuery,
    db.from("notification_device_tokens").select("id, user_id, platform, device_token, is_active, created_at, updated_at").eq("is_active", true).order("updated_at", { ascending: false }).limit(500),
    db.from("notification_evaluator_traces").select("id, run_id, evaluator, user_id, local_date, outcome, notification_type, apns_status, apns_reason, notification_log_id, created_at").gte("created_at", sinceIso).order("created_at", { ascending: false }).limit(limit),
    db.from("notification_log").select("id", { count: "exact", head: true }).gte("sent_at", isoHoursAgo(24)).in("delivery_state", ["failed", "error", "undelivered", "bounced"] as any),
    db.from("notification_device_tokens").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const notifAvailable = !notifRes.error;
  const notifRows = (notifRes.data ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    time: r.sent_at,
    deliveredAt: r.delivered_at,
    notificationType: r.notification_type,
    variantId: r.variant_id,
    status: r.delivery_state ?? "unknown",
    channel: "apns",
    eventReference: r.event_reference,
    tapped: r.tapped,
    appOpened: r.app_opened,
    dismissed: r.dismissed,
    completed: r.target_action_completed,
  }));

  // Attach latest apns trace error per notification_log_id (if any)
  const traceByLog = new Map<string, any>();
  for (const t of tracesRes.data ?? []) {
    const key = (t as any).notification_log_id as string | null;
    if (key && !traceByLog.has(key)) traceByLog.set(key, t);
  }
  for (const row of notifRows) {
    const t = traceByLog.get(row.id);
    if (t) {
      (row as any).apnsStatus = t.apns_status;
      (row as any).apnsReason = t.apns_reason;
      (row as any).outcome = t.outcome;
    }
  }

  const devices = (tokensRes.data ?? []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    platform: r.platform,
    tokenMasked: maskToken(r.device_token),
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return json({
    generatedAt: new Date().toISOString(),
    sinceIso,
    filters: { status: statusFilter, type: typeFilter, userId: resolvedUserId, email: emailFilter || null },
    counts: {
      totalReturned: notifRows.length,
      failed24h: failed24Res.count ?? 0,
      activeDeviceTokens: deviceCountRes.count ?? 0,
    },
    notifications: {
      available: notifAvailable,
      reason: notifAvailable ? null : (notifRes.error?.message ?? "notification_log unavailable"),
      rows: notifRows,
    },
    devices,
  });
});