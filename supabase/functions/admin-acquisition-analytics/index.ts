/**
 * Acquisition & engagement snapshot for the admin console.
 *
 * Strictly read-only. Reads the three new analytics tables plus profiles and
 * onboarding_progress. Touches no feature logic and writes nothing except an
 * admin audit entry (it exposes identified user data).
 */
import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const ONBOARDING_STEPS: Array<{ key: string; label: string }> = [
  { key: "welcome_at", label: "Welcome" },
  { key: "identity_at", label: "Identity" },
  { key: "emotional_awareness_at", label: "Emotional awareness" },
  { key: "stress_response_at", label: "Stress response" },
  { key: "recovery_patterns_at", label: "Recovery patterns" },
  { key: "mental_clarity_at", label: "Mental clarity" },
  { key: "growth_intention_at", label: "Growth intention" },
  { key: "linkedin_at", label: "LinkedIn" },
  { key: "signup_step_at", label: "Sign-up" },
  { key: "results_at", label: "Results" },
  { key: "pricing_at", label: "Pricing" },
  { key: "payment_at", label: "Payment" },
  { key: "connections_at", label: "Connections" },
  { key: "context_confirmed_at", label: "Context confirmed" },
  { key: "onboarding_completed_at", label: "Finished" },
];

function dayKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = [7, 30, 60, 90].includes(daysRaw) ? daysRaw : 30;
  const sinceDate = new Date(Date.now() - days * 24 * 3600 * 1000);
  const since = sinceDate.toISOString();

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_ACQUISITION_ANALYTICS_VIEWED",
    route: "/admin/users",
    metadata: { days },
  });

  try {
    const [installsRes, viewsRes, profilesRes, onboardingRes, downloadsRes] = await Promise.all([
      db
        .from("app_installs")
        .select(
          "install_id, first_seen_at, last_seen_at, platform, country, app_version, notification_opt_in, notification_status, signup_reminders_sent, last_signup_reminder_at, user_id, signup_at",
        )
        .gte("first_seen_at", since)
        .order("first_seen_at", { ascending: false })
        .limit(5000),
      db
        .from("app_screen_views")
        .select("install_id, user_id, route, entered_at, duration_ms, platform")
        .gte("entered_at", since)
        .order("entered_at", { ascending: false })
        .limit(50000),
      db
        .from("profiles")
        .select("id, email, full_name, created_at, onboarding_completed_at, subscription_status, subscription_tier")
        .limit(5000),
      db
        .from("onboarding_progress")
        .select("*")
        .gte("started_at", since)
        .limit(5000),
      db
        .from("app_store_downloads")
        .select("download_date, downloads")
        .gte("download_date", since.slice(0, 10))
        .limit(400),
    ]);

    const installs = (installsRes.data ?? []) as any[];
    const views = (viewsRes.data ?? []) as any[];
    const allProfiles = (profilesRes.data ?? []) as any[];
    const onboarding = (onboardingRes.data ?? []) as any[];
    const downloads = (downloadsRes.data ?? []) as any[];

    const profileById = new Map<string, any>();
    for (const p of allProfiles) profileById.set(p.id, p);

    const profilesInWindow = allProfiles.filter((p) => p.created_at && p.created_at >= since);
    const completedInWindow = allProfiles.filter(
      (p) => p.onboarding_completed_at && p.onboarding_completed_at >= since,
    );
    const subscribedInWindow = profilesInWindow.filter((p) =>
      ["active", "trialing", "trial"].includes(String(p.subscription_status ?? "")),
    );

    // ── Funnel ────────────────────────────────────────────────────────
    const funnel = {
      opens: installs.length,
      signups: profilesInWindow.length,
      onboardingStarted: onboarding.length,
      onboardingFinished: completedInWindow.length,
      subscribed: subscribedInWindow.length,
      manualDownloads: downloads.reduce((sum, d) => sum + (d.downloads ?? 0), 0),
    };

    // ── Daily series ──────────────────────────────────────────────────
    const dayMap = new Map<string, { date: string; opens: number; signups: number; completions: number; downloads: number }>();
    const ensureDay = (date: string) => {
      let row = dayMap.get(date);
      if (!row) {
        row = { date, opens: 0, signups: 0, completions: 0, downloads: 0 };
        dayMap.set(date, row);
      }
      return row;
    };
    for (const i of installs) {
      const d = dayKey(i.first_seen_at);
      if (d) ensureDay(d).opens += 1;
    }
    for (const p of profilesInWindow) {
      const d = dayKey(p.created_at);
      if (d) ensureDay(d).signups += 1;
    }
    for (const p of completedInWindow) {
      const d = dayKey(p.onboarding_completed_at);
      if (d) ensureDay(d).completions += 1;
    }
    for (const d of downloads) {
      const key = String(d.download_date).slice(0, 10);
      ensureDay(key).downloads += d.downloads ?? 0;
    }
    const daily = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // ── Onboarding drop-off ───────────────────────────────────────────
    const onboardingSteps = ONBOARDING_STEPS.map((step) => ({
      key: step.key,
      label: step.label,
      reached: onboarding.filter((row) => row[step.key]).length,
    }));
    const currentStepCounts = new Map<string, number>();
    for (const row of onboarding) {
      if (row.completed_at || row.onboarding_completed_at) continue;
      const key = String(row.current_step ?? "unknown");
      currentStepCounts.set(key, (currentStepCounts.get(key) ?? 0) + 1);
    }
    const stuckAt = [...currentStepCounts.entries()]
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count);

    // ── Page usage ────────────────────────────────────────────────────
    const routeMap = new Map<
      string,
      { route: string; views: number; installs: Set<string>; users: Set<string>; durations: number[]; totalMs: number }
    >();
    for (const v of views) {
      const route = String(v.route ?? "other");
      let entry = routeMap.get(route);
      if (!entry) {
        entry = { route, views: 0, installs: new Set(), users: new Set(), durations: [], totalMs: 0 };
        routeMap.set(route, entry);
      }
      entry.views += 1;
      if (v.install_id) entry.installs.add(v.install_id);
      if (v.user_id) entry.users.add(v.user_id);
      const ms = Number(v.duration_ms ?? 0);
      entry.durations.push(ms);
      entry.totalMs += ms;
    }
    const topPages = [...routeMap.values()]
      .map((e) => ({
        route: e.route,
        views: e.views,
        uniqueInstalls: e.installs.size,
        uniqueUsers: e.users.size,
        avgSeconds: e.views > 0 ? Math.round(e.totalMs / e.views / 1000) : 0,
        medianSeconds: Math.round(median(e.durations) / 1000),
        totalMinutes: Math.round(e.totalMs / 60000),
      }))
      .sort((a, b) => b.views - a.views);

    // ── Per-person engagement ─────────────────────────────────────────
    const userMap = new Map<
      string,
      { userId: string; views: number; totalMs: number; days: Set<string>; routes: Map<string, number>; lastActive: string }
    >();
    for (const v of views) {
      if (!v.user_id) continue;
      let entry = userMap.get(v.user_id);
      if (!entry) {
        entry = { userId: v.user_id, views: 0, totalMs: 0, days: new Set(), routes: new Map(), lastActive: v.entered_at };
        userMap.set(v.user_id, entry);
      }
      entry.views += 1;
      entry.totalMs += Number(v.duration_ms ?? 0);
      const d = dayKey(v.entered_at);
      if (d) entry.days.add(d);
      const route = String(v.route ?? "other");
      entry.routes.set(route, (entry.routes.get(route) ?? 0) + 1);
      if (v.entered_at > entry.lastActive) entry.lastActive = v.entered_at;
    }
    const quietCutoff = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
    const userEngagement = [...userMap.values()]
      .map((e) => {
        const profile = profileById.get(e.userId);
        const topRoute = [...e.routes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
        return {
          userId: e.userId,
          email: profile?.email ?? null,
          name: profile?.full_name ?? null,
          lastActive: e.lastActive,
          activeDays: e.days.size,
          views: e.views,
          totalMinutes: Math.round(e.totalMs / 60000),
          topRoute,
          onboardingFinished: Boolean(profile?.onboarding_completed_at),
          subscriptionStatus: profile?.subscription_status ?? null,
          goingQuiet: e.lastActive < quietCutoff,
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // ── Anonymous installs (opened, never signed up) ───────────────────
    const anonymousInstalls = installs
      .filter((i) => !i.user_id)
      .map((i) => ({
        installId: i.install_id,
        firstSeenAt: i.first_seen_at,
        lastSeenAt: i.last_seen_at,
        platform: i.platform,
        country: i.country,
        appVersion: i.app_version,
        notificationOptIn: Boolean(i.notification_opt_in),
        notificationStatus: i.notification_status ?? null,
        remindersSent: i.signup_reminders_sent ?? 0,
        lastReminderAt: i.last_signup_reminder_at ?? null,
      }))
      .slice(0, 200);

    return json({
      generatedAt: new Date().toISOString(),
      days,
      funnel,
      daily,
      onboardingSteps,
      stuckAt,
      topPages,
      userEngagement,
      anonymousInstalls,
      totals: {
        installsTracked: installs.length,
        screenViewsTracked: views.length,
        anonymousInstalls: installs.filter((i) => !i.user_id).length,
        installsOptedIntoNotifications: installs.filter((i) => i.notification_opt_in).length,
      },
      manualDownloadsByDate: downloads.map((d) => ({
        date: String(d.download_date).slice(0, 10),
        downloads: d.downloads ?? 0,
      })),
    });
  } catch (err) {
    console.error("[admin-acquisition-analytics] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
