import { requireAdmin, adminCorsHeaders, writeAdminAudit } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function isValidCron(expr: string): boolean {
  const trimmed = expr.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5 || parts.length > 6) return false;
  return /^[0-9*,/\-A-Za-z? ]+$/.test(trimmed);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  const body = await req.json().catch(() => ({}));
  const jobKey = typeof body.jobKey === "string" ? body.jobKey.trim() : "";
  if (!jobKey) return json({ error: "invalid_request", details: ["jobKey is required."] }, 400);

  const { data: existing, error: loadError } = await db
    .from("admin_cron_job_configs")
    .select("*")
    .eq("job_key", jobKey)
    .maybeSingle();
  if (loadError) return json({ error: loadError.message }, 500);
  if (!existing) return json({ error: "unknown_job", details: [`No cron config for ${jobKey}.`] }, 404);

  const updates: Record<string, unknown> = {
    last_updated_by: admin!.adminSub,
    last_updated_by_email: admin!.adminEmail,
  };

  if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
  if (typeof body.scheduleCron === "string" && body.scheduleCron.trim().length > 0) {
    if (!isValidCron(body.scheduleCron)) {
      return json({ error: "invalid_config", details: ["Cron expression is invalid."] }, 400);
    }
    updates.cron_expression = body.scheduleCron.trim();
  }
  if (typeof body.timezone === "string" && body.timezone.trim().length > 0) {
    updates.timezone = body.timezone.trim();
  }
  if (Array.isArray(body.runWindows)) updates.run_windows = body.runWindows;
  if (body.config && typeof body.config === "object" && !Array.isArray(body.config)) {
    updates.config_json = {
      ...(existing.config_json ?? {}),
      ...(body.config as Record<string, unknown>),
    };
  }

  const { data: updated, error: updateError } = await db
    .from("admin_cron_job_configs")
    .update(updates)
    .eq("job_key", jobKey)
    .select("*")
    .maybeSingle();
  if (updateError) return json({ error: updateError.message }, 500);

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_CRON_CONFIG_UPDATED",
    route: "/admin/jobs",
    metadata: {
      job_key: jobKey,
      old_config: {
        enabled: existing.enabled,
        cron: existing.cron_expression,
        timezone: existing.timezone,
        run_windows: existing.run_windows,
        config_json: existing.config_json,
      },
      new_config: {
        enabled: updated?.enabled,
        cron: updated?.cron_expression,
        timezone: updated?.timezone,
        run_windows: updated?.run_windows,
        config_json: updated?.config_json,
      },
      source: "admin-update-cron-job-config",
    },
  });

  return json({
    ok: true,
    config: {
      jobKey: updated?.job_key,
      jobName: updated?.job_name,
      description: updated?.description ?? null,
      enabled: updated?.enabled,
      scheduleCron: updated?.cron_expression ?? null,
      timezone: updated?.timezone ?? "UTC",
      runWindows: Array.isArray(updated?.run_windows) ? updated?.run_windows : [],
      config: updated?.config_json ?? {},
      updatedAt: updated?.updated_at ?? null,
      lastUpdatedByEmail: updated?.last_updated_by_email ?? null,
    },
  });
});