import { requireAdmin, adminCorsHeaders, writeAdminAudit } from "../_shared/admin-guard.ts";
import {
  defaultExecutiveHomeCronConfig,
  mergeExecutiveHomeCronConfig,
  nextExpectedRunAt,
  validateWindowConfig,
} from "./scheduler-local.ts";

const cors = adminCorsHeaders();
const JOB_KEY = "executive_home_cards";
const NOTIFICATION_JOB_KEY = "notification_evaluator";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function startOfTodayIso() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

async function loadExecutiveHomeConfig(db: any) {
  const fallback = defaultExecutiveHomeCronConfig();
  try {
    const { data, error } = await db
      .from("admin_cron_job_configs")
      .select("id, job_key, job_name, description, function_name, enabled, schedule_mode, cron_expression, dispatcher_interval_minutes, timezone_mode, timezone, run_windows, config_json, max_users_per_run, retry_attempts, retry_delay_seconds, last_updated_by, last_updated_by_email, created_at, updated_at")
      .eq("job_key", JOB_KEY)
      .maybeSingle();
    if (error) {
      console.warn("[admin-jobs-summary] config load failed", error.message);
      return { id: null, description: null, timezone: "UTC", runWindows: [], lastUpdatedBy: null, lastUpdatedByEmail: null, updatedAt: null, ...fallback };
    }
    return {
      id: (data as any)?.id ?? null,
      description: (data as any)?.description ?? null,
      timezone: (data as any)?.timezone ?? "UTC",
      runWindows: Array.isArray((data as any)?.run_windows) ? (data as any).run_windows : [],
      lastUpdatedBy: (data as any)?.last_updated_by ?? null,
      lastUpdatedByEmail: (data as any)?.last_updated_by_email ?? null,
      updatedAt: (data as any)?.updated_at ?? null,
      ...mergeExecutiveHomeCronConfig(data ?? null),
    };
  } catch (err) {
    console.warn("[admin-jobs-summary] config lookup threw", err);
    return { id: null, description: null, timezone: "UTC", runWindows: [], lastUpdatedBy: null, lastUpdatedByEmail: null, updatedAt: null, ...fallback };
  }
}

async function loadNotificationConfig(db: any) {
  try {
    const { data, error } = await db
      .from("admin_cron_job_configs")
      .select("id, job_key, job_name, description, function_name, enabled, schedule_mode, cron_expression, dispatcher_interval_minutes, timezone, run_windows, config_json, last_updated_by, last_updated_by_email, updated_at")
      .eq("job_key", NOTIFICATION_JOB_KEY)
      .maybeSingle();
    if (error || !data) return null;
    const d = data as Record<string, any>;
    return {
      id: d.id,
      jobKey: d.job_key,
      jobName: d.job_name,
      description: d.description ?? null,
      functionName: d.function_name,
      enabled: d.enabled !== false,
      scheduleMode: d.schedule_mode ?? "dispatcher",
      cronExpression: d.cron_expression ?? null,
      dispatcherIntervalMinutes: d.dispatcher_interval_minutes ?? null,
      timezone: d.timezone ?? "UTC",
      runWindows: Array.isArray(d.run_windows) ? d.run_windows : [],
      config: d.config_json ?? {},
      lastUpdatedBy: d.last_updated_by ?? null,
      lastUpdatedByEmail: d.last_updated_by_email ?? null,
      updatedAt: d.updated_at ?? null,
    };
  } catch (err) {
    console.warn("[admin-jobs-summary] notification config lookup threw", err);
    return null;
  }
}

function isValidCronExpression(expr: unknown): expr is string {
  if (typeof expr !== "string") return false;
  const trimmed = expr.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return false;
  return /^[0-9*,/\-A-Za-z? ]+$/.test(trimmed);
}

async function invokeBuildJob(body: Record<string, unknown>) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${supabaseUrl}/functions/v1/build-executive-home-cards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((payload as any)?.error ?? `build-executive-home-cards HTTP ${res.status}`);
  }
  return payload;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "update_config") {
      const current = await loadExecutiveHomeConfig(db);
      const nextWindows = {
        morning: String(body.morning ?? current.configJson.windows.morning),
        afternoon: String(body.afternoon ?? current.configJson.windows.afternoon),
        evening: String(body.evening ?? current.configJson.windows.evening),
      };
      const validationErrors = validateWindowConfig(nextWindows);
      if (validationErrors.length > 0) {
        return json({ error: "invalid_config", details: validationErrors }, 400);
      }

      const maxUsersPerRun = Number(body.maxUsersPerRun ?? current.maxUsersPerRun);
      if (!Number.isFinite(maxUsersPerRun) || maxUsersPerRun < 1 || maxUsersPerRun > 1000) {
        return json({ error: "invalid_config", details: ["Max users per run must be between 1 and 1000."] }, 400);
      }

      const timezone = typeof body.timezone === "string" && body.timezone.trim().length > 0
        ? body.timezone.trim()
        : current.timezone ?? "UTC";

      const cronExpression = typeof body.scheduleCron === "string"
        ? body.scheduleCron.trim()
        : (current.cronExpression ?? null);
      if (cronExpression && !isValidCronExpression(cronExpression)) {
        return json({ error: "invalid_config", details: ["Cron expression is invalid."] }, 400);
      }

      const updatePayload = {
        job_key: JOB_KEY,
        job_name: current.jobName,
        function_name: current.functionName,
        enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
        schedule_mode: "dispatcher",
        cron_expression: cronExpression,
        dispatcher_interval_minutes: Number(body.dispatcherIntervalMinutes ?? current.dispatcherIntervalMinutes),
        timezone_mode: "user_timezone",
        timezone,
        run_windows: Array.isArray(body.runWindows) ? body.runWindows : (current.runWindows ?? []),
        max_users_per_run: maxUsersPerRun,
        retry_attempts: Number(body.retryAttempts ?? current.retryAttempts),
        retry_delay_seconds: Number(body.retryDelaySeconds ?? current.retryDelaySeconds),
        config_json: {
          ...current.configJson,
          windows: nextWindows,
          runOnWeekends: typeof body.runOnWeekends === "boolean" ? body.runOnWeekends : current.configJson.runOnWeekends,
          respectTravelTimezone: typeof body.respectTravelTimezone === "boolean" ? body.respectTravelTimezone : current.configJson.respectTravelTimezone,
          dryRun: typeof body.dryRun === "boolean" ? body.dryRun : Boolean(current.configJson.dryRun),
        },
        last_updated_by: admin!.adminSub,
        last_updated_by_email: admin!.adminEmail,
      };

      const { error } = await db
        .from("admin_cron_job_configs")
        .upsert(updatePayload, { onConflict: "job_key" });
      if (error) return json({ error: error.message }, 500);

      const nextConfig = await loadExecutiveHomeConfig(db);
      await writeAdminAudit(db, {
        admin: admin!,
        action: "ADMIN_CRON_CONFIG_UPDATED",
        route: "/admin/jobs",
        metadata: {
          job_key: JOB_KEY,
          old_config: { enabled: current.enabled, config: current.configJson, cron: current.cronExpression, timezone: current.timezone },
          new_config: { enabled: nextConfig.enabled, config: nextConfig.configJson, cron: nextConfig.cronExpression, timezone: nextConfig.timezone },
        },
      });
      return json({ ok: true, config: nextConfig });
    }

    if (action === "update_notification_config") {
      const current = await loadNotificationConfig(db);
      const enabled = typeof body.enabled === "boolean" ? body.enabled : (current?.enabled ?? true);
      const cronExpression = typeof body.scheduleCron === "string" ? body.scheduleCron.trim() : (current?.cronExpression ?? null);
      if (cronExpression && !isValidCronExpression(cronExpression)) {
        return json({ error: "invalid_config", details: ["Cron expression is invalid."] }, 400);
      }
      const timezone = typeof body.timezone === "string" && body.timezone.trim().length > 0
        ? body.timezone.trim()
        : (current?.timezone ?? "UTC");

      const payload = {
        job_key: NOTIFICATION_JOB_KEY,
        job_name: current?.jobName ?? "Notification Evaluator",
        function_name: current?.functionName ?? "smart-nudges",
        enabled,
        schedule_mode: "dispatcher",
        cron_expression: cronExpression,
        dispatcher_interval_minutes: current?.dispatcherIntervalMinutes ?? 5,
        timezone_mode: "user_timezone",
        timezone,
        run_windows: Array.isArray(body.runWindows) ? body.runWindows : (current?.runWindows ?? []),
        config_json: { ...(current?.config ?? {}), ...(typeof body.config === "object" && body.config ? body.config : {}) },
        last_updated_by: admin!.adminSub,
        last_updated_by_email: admin!.adminEmail,
      };

      const { error } = await db.from("admin_cron_job_configs").upsert(payload, { onConflict: "job_key" });
      if (error) return json({ error: error.message }, 500);

      const nextConfig = await loadNotificationConfig(db);
      await writeAdminAudit(db, {
        admin: admin!,
        action: "ADMIN_CRON_CONFIG_UPDATED",
        route: "/admin/jobs",
        metadata: {
          job_key: NOTIFICATION_JOB_KEY,
          old_config: current ? { enabled: current.enabled, cron: current.cronExpression, timezone: current.timezone } : null,
          new_config: nextConfig ? { enabled: nextConfig.enabled, cron: nextConfig.cronExpression, timezone: nextConfig.timezone } : null,
        },
      });
      return json({ ok: true, config: nextConfig });
    }

    if (action === "run_job") {
      const dryRun = body.dryRun === true;
      const userId = typeof body.userId === "string" && body.userId.trim().length > 0 ? body.userId.trim() : undefined;
      const window = ["morning", "afternoon", "evening"].includes(body.window) ? body.window : undefined;
      const localDate = typeof body.localDate === "string" && body.localDate.trim().length > 0 ? body.localDate.trim() : undefined;

      const payload = await invokeBuildJob({
        mode: dryRun ? "dry_run" : (userId ? "manual_replay" : "scheduled"),
        userId,
        window,
        localDate,
      });
      return json({ ok: true, result: payload });
    }

    return json({ error: "unsupported_action" }, 400);
  }

  const url = new URL(req.url);
  const filterStatus = (url.searchParams.get("status") ?? "").trim();
  const filterUserId = (url.searchParams.get("userId") ?? "").trim();
  const filterLocalDate = (url.searchParams.get("localDate") ?? "").trim();
  const filterWindow = (url.searchParams.get("window") ?? "").trim();
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "50") || 50));

  const todayIso = startOfTodayIso();
  const [config, notificationConfig] = await Promise.all([
    loadExecutiveHomeConfig(db),
    loadNotificationConfig(db),
  ]);

  const sources: Array<{ name: string; available: boolean; reason?: string }> = [];

  const safe = async <T,>(
    p: PromiseLike<{ data: T | null; error: unknown; count?: number | null }>,
    label: string,
  ): Promise<{ data: T | null; count: number | null; error: string | null }> => {
    try {
      const res = await p;
      if (res.error) {
        const msg = (res.error as { message?: string }).message ?? String(res.error);
        console.warn(`[admin-jobs-summary] ${label} skipped:`, msg);
        return { data: null, count: null, error: msg };
      }
      return { data: (res.data ?? null) as T | null, count: res.count ?? null, error: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[admin-jobs-summary] ${label} threw:`, msg);
      return { data: null, count: null, error: msg };
    }
  };

  let runsQuery = db
    .from("executive_home_card_runs")
    .select("id, run_id, user_id, local_date, effective_timezone, window, mode, status, mrs_status, brief_status, plan_status, skipped_reason, error, duration_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filterStatus) runsQuery = runsQuery.eq("status", filterStatus);
  if (filterUserId) runsQuery = runsQuery.eq("user_id", filterUserId);
  if (filterLocalDate) runsQuery = runsQuery.eq("local_date", filterLocalDate);
  if (filterWindow) runsQuery = runsQuery.eq("window", filterWindow);

  const [
    runsResult,
    latestRun,
    latestSuccess,
    latestFailure,
    todayRuns,
    todayFailed,
    avgDurRows,
    notificationLatest,
  ] = await Promise.all([
    safe<Array<Record<string, unknown>>>(runsQuery, "recent_runs"),
    safe(db.from("executive_home_card_runs").select("created_at, status").order("created_at", { ascending: false }).limit(1).maybeSingle(), "latest_run"),
    safe(db.from("executive_home_card_runs").select("created_at").eq("status", "success").order("created_at", { ascending: false }).limit(1).maybeSingle(), "latest_success"),
    safe(db.from("executive_home_card_runs").select("created_at, error").eq("status", "error").order("created_at", { ascending: false }).limit(1).maybeSingle(), "latest_failure"),
    safe(db.from("executive_home_card_runs").select("id", { count: "exact", head: true }).gte("created_at", todayIso), "today_runs"),
    safe(db.from("executive_home_card_runs").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", todayIso), "today_failed"),
    safe<Array<{ duration_ms?: number | null }>>(db.from("executive_home_card_runs").select("duration_ms").not("duration_ms", "is", null).gte("created_at", todayIso).limit(500), "avg_duration"),
    safe(db.from("notification_evaluator_runs").select("started_at, finished_at, top_level_error").order("started_at", { ascending: false }).limit(1).maybeSingle(), "notification_latest"),
  ]);

  sources.push({
    name: "executive_home_card_runs",
    available: !latestRun.error,
    ...(latestRun.error ? { reason: latestRun.error } : {}),
  });
  sources.push({
    name: "notification_evaluator_runs",
    available: !notificationLatest.error,
    ...(notificationLatest.error ? { reason: notificationLatest.error } : {}),
  });

  const durationRows = (avgDurRows.data ?? []) as Array<{ duration_ms?: number | null }>;
  const averageDurationMs = durationRows.length
    ? Math.round(durationRows.reduce((sum, row) => sum + Number(row.duration_ms ?? 0), 0) / durationRows.length)
    : null;

  const executiveJob = {
    jobKey: JOB_KEY,
    jobName: config.jobName,
    functionName: config.functionName,
    enabled: config.enabled,
    scheduleType: config.scheduleMode,
    cronExpression: config.cronExpression,
    dispatcherIntervalMinutes: config.dispatcherIntervalMinutes,
    lastRunTime: (latestRun.data as any)?.created_at ?? null,
    lastSuccessTime: (latestSuccess.data as any)?.created_at ?? null,
    lastFailureTime: (latestFailure.data as any)?.created_at ?? null,
    nextExpectedRun: nextExpectedRunAt(new Date(), config.dispatcherIntervalMinutes),
    currentStatus: !config.enabled
      ? "disabled"
      : (latestRun.data as any)?.status === "running"
        ? "running"
        : (latestRun.data as any)?.status ?? "idle",
    totalRunsToday: todayRuns.count ?? 0,
    failedRunsToday: todayFailed.count ?? 0,
    averageDurationMs,
    lastErrorMessage: (latestFailure.data as any)?.error ?? null,
    editable: true,
    config,
  };

  const notificationJob = {
    jobKey: "notifications",
    jobName: "Notification Evaluator",
    functionName: "smart-nudges",
    enabled: notificationConfig?.enabled ?? true,
    scheduleType: "dispatcher",
    cronExpression: notificationConfig?.cronExpression ?? null,
    dispatcherIntervalMinutes: notificationConfig?.dispatcherIntervalMinutes ?? null,
    lastRunTime: (notificationLatest.data as any)?.started_at ?? null,
    lastSuccessTime: (notificationLatest.data as any)?.top_level_error
      ? null
      : ((notificationLatest.data as any)?.finished_at ?? (notificationLatest.data as any)?.started_at ?? null),
    lastFailureTime: (notificationLatest.data as any)?.top_level_error
      ? ((notificationLatest.data as any)?.finished_at ?? (notificationLatest.data as any)?.started_at ?? null)
      : null,
    nextExpectedRun: null,
    currentStatus: notificationConfig && notificationConfig.enabled === false
      ? "disabled"
      : (notificationLatest.data as any)?.top_level_error
        ? "failed"
        : ((notificationLatest.data as any)?.finished_at ? "success" : "idle"),
    totalRunsToday: null,
    failedRunsToday: null,
    averageDurationMs: null,
    lastErrorMessage: (notificationLatest.data as any)?.top_level_error ?? null,
    editable: true,
    config: notificationConfig,
  };

  const totalRunningJobs = executiveJob.currentStatus === "running" ? 1 : 0;
  const failedJobs24h = todayFailed.count ?? 0;
  const successfulJobs24h = Math.max(0, (todayRuns.count ?? 0) - failedJobs24h);

  const persistedConfigs = [
    {
      jobKey: config.jobKey,
      jobName: config.jobName,
      description: (config as any).description ?? null,
      enabled: config.enabled,
      scheduleCron: config.cronExpression,
      timezone: (config as any).timezone ?? "UTC",
      runWindows: (config as any).runWindows ?? [],
      config: config.configJson,
      updatedAt: (config as any).updatedAt ?? null,
      lastUpdatedByEmail: (config as any).lastUpdatedByEmail ?? null,
    },
    ...(notificationConfig
      ? [{
          jobKey: notificationConfig.jobKey,
          jobName: notificationConfig.jobName,
          description: notificationConfig.description,
          enabled: notificationConfig.enabled,
          scheduleCron: notificationConfig.cronExpression,
          timezone: notificationConfig.timezone,
          runWindows: notificationConfig.runWindows,
          config: notificationConfig.config,
          updatedAt: notificationConfig.updatedAt,
          lastUpdatedByEmail: notificationConfig.lastUpdatedByEmail,
        }]
      : []),
  ];

  console.log("[admin-jobs-summary] responding", {
    totalRunningJobs,
    failedJobs24h,
    successfulJobs24h,
    sources: sources.map((s) => ({ name: s.name, available: s.available })),
    recentRuns: (runsResult.data ?? []).length,
  });

  return json({
    generatedAt: new Date().toISOString(),
    summary: {
      totalRunningJobs,
      successfulJobs24h,
      failedJobs24h,
      lastExecutiveHomeBuildAt: executiveJob.lastSuccessTime ?? executiveJob.lastRunTime ?? null,
      lastNotificationJobAt: notificationJob.lastRunTime ?? null,
    },
    // Legacy field kept for older frontend builds.
    counts: {
      running: totalRunningJobs,
      failed24h: failedJobs24h,
      success24h: successfulJobs24h,
    },
    jobs: [executiveJob, notificationJob],
    recentRuns: runsResult.data ?? [],
    configs: persistedConfigs,
    sources,
  });
});
