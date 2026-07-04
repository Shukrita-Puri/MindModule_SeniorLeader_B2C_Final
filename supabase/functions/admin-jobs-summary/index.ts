import { requireAdmin, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isoHoursAgo(h: number) {
  return new Date(Date.now() - h * 3600 * 1000).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db } = guard;

  const since24 = isoHoursAgo(24);

  const [runningRuns, failed24, success24, latestRun, latestNotifRun, recentRuns, recentNotifRuns] = await Promise.all([
    db.from("executive_home_card_runs").select("id", { count: "exact", head: true }).eq("status", "running"),
    db.from("executive_home_card_runs").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", since24),
    db.from("executive_home_card_runs").select("id", { count: "exact", head: true }).eq("status", "success").gte("created_at", since24),
    db.from("executive_home_card_runs").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("notification_evaluator_runs").select("started_at, finished_at").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    db
      .from("executive_home_card_runs")
      .select("run_id, user_id, local_date, window, mode, status, error, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    db
      .from("notification_evaluator_runs")
      .select("id, evaluator, evaluator_version, environment, started_at, finished_at, processed_user_count, qualified_count, shipped_count, apns_attempted_count, apns_succeeded_count, apns_failed_count, top_level_error")
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const jobs: any[] = [];

  for (const r of recentRuns.data ?? []) {
    const startIso = (r as any).created_at as string | null;
    const start = startIso ? new Date(startIso).getTime() : null;
    jobs.push({
      id: (r as any).run_id,
      name: "build-executive-home-cards",
      source: "executive_home_card_runs",
      status: (r as any).status,
      startedAt: startIso,
      finishedAt: null,
      durationMs: (r as any).duration_ms ?? null,
      recordsProcessed: 1,
      relatedUserId: (r as any).user_id ?? null,
      metadata: { window: (r as any).window, mode: (r as any).mode, local_date: (r as any).local_date },
      error: (r as any).error ?? null,
    });
  }

  for (const r of recentNotifRuns.data ?? []) {
    const startIso = (r as any).started_at as string | null;
    const finIso = (r as any).finished_at as string | null;
    const start = startIso ? new Date(startIso).getTime() : null;
    const fin = finIso ? new Date(finIso).getTime() : null;
    jobs.push({
      id: (r as any).id,
      name: (r as any).evaluator ?? "notification-evaluator",
      source: "notification_evaluator_runs",
      status: (r as any).top_level_error ? "error" : finIso ? "success" : "running",
      startedAt: startIso,
      finishedAt: finIso,
      durationMs: start && fin ? fin - start : null,
      recordsProcessed: (r as any).processed_user_count ?? null,
      relatedUserId: null,
      metadata: {
        environment: (r as any).environment,
        version: (r as any).evaluator_version,
        qualified: (r as any).qualified_count,
        shipped: (r as any).shipped_count,
        apns_attempted: (r as any).apns_attempted_count,
        apns_succeeded: (r as any).apns_succeeded_count,
        apns_failed: (r as any).apns_failed_count,
      },
      error: (r as any).top_level_error ?? null,
    });
  }

  jobs.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));

  return json({
    generatedAt: new Date().toISOString(),
    counts: {
      running: runningRuns.count ?? 0,
      failed24h: failed24.count ?? 0,
      success24h: success24.count ?? 0,
    },
    lastExecutiveHomeBuildAt: (latestRun.data as any)?.created_at ?? null,
    lastNotificationJobAt:
      (latestNotifRun.data as any)?.finished_at ?? (latestNotifRun.data as any)?.started_at ?? null,
    jobs,
  });
});