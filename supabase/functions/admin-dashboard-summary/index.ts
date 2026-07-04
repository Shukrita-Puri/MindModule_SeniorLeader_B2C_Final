import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_CONSOLE_OPENED",
    route: "/admin",
  });

  const todayIso = new Date().toISOString().slice(0, 10);

  try {
    // Run counters in parallel — each uses HEAD + count for cheap totals.
    const [
      totalUsers,
      onboardedUsers,
      wearableUsers,
      calendarUsers,
      todayCardRuns,
      recentFailedRuns,
      activeSubs,
      trialingSubs,
      apnsTokens,
    ] = await Promise.all([
      db.from("profiles").select("id", { count: "exact", head: true }),
      db.from("profiles").select("id", { count: "exact", head: true }).not("onboarding_completed_at", "is", null),
      db.from("wearable_data").select("user_id", { count: "exact", head: true }),
      db.from("calendar_connections").select("user_id", { count: "exact", head: true }),
      // Distinct successful user/window builds today. We fetch the identifying
      // triples and dedupe client-side so historical duplicate scheduled rows
      // don't inflate the count.
      db
        .from("executive_home_card_runs")
        .select("user_id, window")
        .eq("local_date", todayIso)
        .eq("status", "success")
        .limit(10000),
      db
        .from("executive_home_card_runs")
        .select("run_id, user_id, status, error, local_date, window, mode, duration_ms")
        .eq("status", "error")
        .order("run_id", { ascending: false })
        .limit(10),
      db.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "active"),
      db.from("profiles").select("id", { count: "exact", head: true }).eq("subscription_status", "trialing"),
      db.from("notification_device_tokens").select("id", { count: "exact", head: true }).eq("is_active", true),
    ]);

    return json({
      generatedAt: new Date().toISOString(),
      counts: {
        totalUsers: totalUsers.count ?? 0,
        onboardedUsers: onboardedUsers.count ?? 0,
        wearableConnected: wearableUsers.count ?? 0,
        calendarConnected: calendarUsers.count ?? 0,
        executiveHomeCardsToday: (() => {
          const rows = (todayCardRuns.data ?? []) as Array<{ user_id: string; window: string }>;
          const seen = new Set<string>();
          for (const r of rows) seen.add(`${r.user_id}::${r.window}`);
          return seen.size;
        })(),
        subscriptionsActive: activeSubs.count ?? 0,
        subscriptionsTrialing: trialingSubs.count ?? 0,
        activeDeviceTokens: apnsTokens.count ?? 0,
      },
      recentFailedRuns: recentFailedRuns.data ?? [],
    });
  } catch (err) {
    console.error("[admin-dashboard-summary] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});