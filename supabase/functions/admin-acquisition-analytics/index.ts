/**
 * Acquisition & engagement snapshot for the admin console.
 *
 * Strictly read-only. Reads the three analytics tables plus profiles and
 * onboarding_progress and returns ONE ROW PER PERSON (plus one row per
 * anonymous install that never signed up). Touches no feature logic and writes
 * nothing except an admin audit entry (it exposes identified user data).
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

/** Known app sections, mirrored from track-app-usage's allowlist, so a person's
 *  unused features are visible rather than silently absent. */
const KNOWN_ROUTES = [
  "/",
  "/signup",
  "/login",
  "/onboarding",
  "/executive-home",
  "/plan",
  "/daily-check-in",
  "/check-in-detail",
  "/recalibrate",
  "/insights",
  "/insight-detail",
  "/profile",
  "/connected-data",
  "/refer",
  "/nudge-settings",
  "/practice",
  "/pause",
  "/presence",
  "/power-up",
  "/coach",
  "/paywall",
  "/pricing",
  "/settings",
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

interface RouteAgg {
  route: string;
  views: number;
  durations: number[];
  totalMs: number;
  lastSeen: string;
}

interface PersonAgg {
  views: number;
  totalMs: number;
  days: Set<string>;
  sessions: Set<string>;
  routes: Map<string, RouteAgg>;
  lastActive: string | null;
}

function emptyAgg(): PersonAgg {
  return { views: 0, totalMs: 0, days: new Set(), sessions: new Set(), routes: new Map(), lastActive: null };
}

function addView(agg: PersonAgg, v: any) {
  agg.views += 1;
  const ms = Number(v.duration_ms ?? 0);
  agg.totalMs += ms;
  const d = dayKey(v.entered_at);
  if (d) {
    agg.days.add(d);
    // A "session" = one device on one day. Good enough for avg minutes/session.
    agg.sessions.add(`${v.install_id ?? "none"}|${d}`);
  }
  const route = String(v.route ?? "other");
  let r = agg.routes.get(route);
  if (!r) {
    r = { route, views: 0, durations: [], totalMs: 0, lastSeen: v.entered_at };
    agg.routes.set(route, r);
  }
  r.views += 1;
  r.durations.push(ms);
  r.totalMs += ms;
  if (v.entered_at > r.lastSeen) r.lastSeen = v.entered_at;
  if (!agg.lastActive || v.entered_at > agg.lastActive) agg.lastActive = v.entered_at;
}

function serializePages(agg: PersonAgg) {
  const used = [...agg.routes.values()]
    .map((r) => ({
      route: r.route,
      views: r.views,
      avgSeconds: r.views > 0 ? Math.round(r.totalMs / r.views / 1000) : 0,
      medianSeconds: Math.round(median(r.durations) / 1000),
      totalMinutes: Math.round(r.totalMs / 60000),
      lastSeenAt: r.lastSeen,
    }))
    .sort((a, b) => b.views - a.views);
  const usedRoutes = new Set(used.map((u) => u.route));
  const neverUsed = KNOWN_ROUTES.filter((r) => !usedRoutes.has(r));
  return { used, neverUsed };
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
          "install_id, first_seen_at, last_seen_at, platform, country, timezone, app_version, notification_opt_in, notification_status, signup_reminders_sent, last_signup_reminder_at, user_id, signup_at",
        )
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
      db.from("onboarding_progress").select("*").limit(5000),
      db
        .from("app_store_downloads")
        .select("download_date, downloads")
        .gte("download_date", since.slice(0, 10))
        .limit(400),
    ]);

    const allInstalls = (installsRes.data ?? []) as any[];
    const views = (viewsRes.data ?? []) as any[];
    const allProfiles = (profilesRes.data ?? []) as any[];
    const onboarding = (onboardingRes.data ?? []) as any[];
    const downloads = (downloadsRes.data ?? []) as any[];

    const installsInWindow = allInstalls.filter((i) => i.first_seen_at && i.first_seen_at >= since);

    const onboardingByUser = new Map<string, any>();
    for (const row of onboarding) onboardingByUser.set(String(row.user_id), row);

    // Installs grouped by the user they were linked to (identity context).
    const installsByUser = new Map<string, any[]>();
    for (const i of allInstalls) {
      if (!i.user_id) continue;
      const list = installsByUser.get(i.user_id) ?? [];
      list.push(i);
      installsByUser.set(i.user_id, list);
    }

    // ── Engagement aggregation ────────────────────────────────────────
    const byUser = new Map<string, PersonAgg>();
    const byInstall = new Map<string, PersonAgg>();
    for (const v of views) {
      if (v.user_id) {
        let agg = byUser.get(v.user_id);
        if (!agg) { agg = emptyAgg(); byUser.set(v.user_id, agg); }
        addView(agg, v);
      } else if (v.install_id) {
        let agg = byInstall.get(v.install_id);
        if (!agg) { agg = emptyAgg(); byInstall.set(v.install_id, agg); }
        addView(agg, v);
      }
    }

    const quietCutoff = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();

    // ── One row per person ────────────────────────────────────────────
    const people = allProfiles.map((p) => {
      const agg = byUser.get(p.id) ?? emptyAgg();
      const installs = installsByUser.get(p.id) ?? [];
      const firstInstall = installs
        .slice()
        .sort((a, b) => String(a.first_seen_at).localeCompare(String(b.first_seen_at)))[0] ?? null;
      const ob = onboardingByUser.get(String(p.id)) ?? null;

      const steps = ONBOARDING_STEPS.map((s) => ({
        key: s.key,
        label: s.label,
        reachedAt: (ob?.[s.key] as string | null) ?? (s.key === "onboarding_completed_at" ? p.onboarding_completed_at ?? null : null),
      }));
      const finished = Boolean(p.onboarding_completed_at || ob?.onboarding_completed_at || ob?.completed_at);
      const reached = steps.filter((s) => s.reachedAt);
      const onboardingStage = finished
        ? "Completed"
        : reached.length > 0
          ? reached[reached.length - 1].label
          : ob?.current_step
            ? String(ob.current_step)
            : "Not started";

      const subscribed = ["active", "trialing", "trial"].includes(String(p.subscription_status ?? ""));
      const funnelStage = subscribed
        ? "Subscribed"
        : finished
          ? "Onboarding finished"
          : reached.length > 0 || ob
            ? "Onboarding started"
            : "Signed up";

      const { used, neverUsed } = serializePages(agg);
      const sessions = agg.sessions.size;
      const lastActive = agg.lastActive
        ?? (firstInstall?.last_seen_at as string | null)
        ?? null;

      return {
        kind: "user" as const,
        userId: p.id,
        installId: firstInstall?.install_id ?? null,
        email: p.email ?? null,
        name: p.full_name ?? null,
        platform: firstInstall?.platform ?? null,
        country: firstInstall?.country ?? null,
        funnelStage,
        onboardingStage,
        onboardingSteps: steps,
        firstOpenAt: firstInstall?.first_seen_at ?? null,
        signupAt: p.created_at ?? null,
        lastActiveAt: lastActive,
        activeDays: agg.days.size,
        views: agg.views,
        totalMinutes: Math.round(agg.totalMs / 60000),
        sessions,
        avgMinutesPerSession: sessions > 0 ? Math.round((agg.totalMs / sessions / 60000) * 10) / 10 : 0,
        topRoute: used[0]?.route ?? null,
        subscriptionStatus: p.subscription_status ?? null,
        subscriptionTier: p.subscription_tier ?? null,
        goingQuiet: Boolean(lastActive && lastActive < quietCutoff),
        pages: used,
        neverUsedPages: neverUsed,
        notificationOptIn: Boolean(firstInstall?.notification_opt_in),
        remindersSent: 0,
      };
    });

    // Anonymous installs — opened, never signed up.
    const anonymousPeople = allInstalls
      .filter((i) => !i.user_id)
      .map((i) => {
        const agg = byInstall.get(i.install_id) ?? emptyAgg();
        const { used, neverUsed } = serializePages(agg);
        const sessions = agg.sessions.size;
        const lastActive = agg.lastActive ?? i.last_seen_at ?? null;
        return {
          kind: "install" as const,
          userId: null,
          installId: i.install_id,
          email: null,
          name: null,
          platform: i.platform ?? null,
          country: i.country ?? null,
          funnelStage: "Opened",
          onboardingStage: "Not started",
          onboardingSteps: ONBOARDING_STEPS.map((s) => ({ key: s.key, label: s.label, reachedAt: null })),
          firstOpenAt: i.first_seen_at ?? null,
          signupAt: null,
          lastActiveAt: lastActive,
          activeDays: agg.days.size,
          views: agg.views,
          totalMinutes: Math.round(agg.totalMs / 60000),
          sessions,
          avgMinutesPerSession: sessions > 0 ? Math.round((agg.totalMs / sessions / 60000) * 10) / 10 : 0,
          topRoute: used[0]?.route ?? null,
          subscriptionStatus: null,
          subscriptionTier: null,
          goingQuiet: Boolean(lastActive && lastActive < quietCutoff),
          pages: used,
          neverUsedPages: neverUsed,
          notificationOptIn: Boolean(i.notification_opt_in),
          remindersSent: i.signup_reminders_sent ?? 0,
        };
      });

    const allPeople = [...people, ...anonymousPeople].sort((a, b) =>
      String(b.lastActiveAt ?? "").localeCompare(String(a.lastActiveAt ?? "")),
    );

    // ── Funnel summary strip (counts only) ────────────────────────────
    const profilesInWindow = allProfiles.filter((p) => p.created_at && p.created_at >= since);
    const completedInWindow = allProfiles.filter(
      (p) => p.onboarding_completed_at && p.onboarding_completed_at >= since,
    );
    const onboardingStartedInWindow = onboarding.filter((o) => o.started_at && o.started_at >= since);
    const subscribedInWindow = profilesInWindow.filter((p) =>
      ["active", "trialing", "trial"].includes(String(p.subscription_status ?? "")),
    );

    const funnel = {
      opens: installsInWindow.length,
      signups: profilesInWindow.length,
      onboardingStarted: onboardingStartedInWindow.length,
      onboardingFinished: completedInWindow.length,
      subscribed: subscribedInWindow.length,
      manualDownloads: downloads.reduce((sum, d) => sum + (d.downloads ?? 0), 0),
    };

    return json({
      generatedAt: new Date().toISOString(),
      days,
      funnel,
      people: allPeople,
      totals: {
        installsTracked: installsInWindow.length,
        screenViewsTracked: views.length,
        anonymousInstalls: anonymousPeople.length,
        installsOptedIntoNotifications: allInstalls.filter((i) => i.notification_opt_in).length,
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
