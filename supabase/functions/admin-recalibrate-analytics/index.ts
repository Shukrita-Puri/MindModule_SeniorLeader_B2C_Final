// Admin-only, read-only analytics over Recalibrate usage.
// Isolated: no writes (other than the standard admin audit entry), no changes
// to any user-facing surface.
import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

interface EventRow {
  user_id: string;
  content_id: string | null;
  content_type: string | null;
  category: string | null;
  duration_seconds: number | null;
  timestamp: string | null;
  created_at: string | null;
  context_data: Record<string, unknown> | null;
}

interface ContentRow {
  id: string;
  title: string | null;
  category: string | null;
  sub_type: string | null;
  content_type: string | null;
}

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function dayName(iso: string): string {
  return DAY_ORDER[(new Date(iso).getUTCDay() + 6) % 7];
}

function slotFromIso(iso: string): "morning" | "afternoon" | "evening" {
  const h = new Date(iso).getUTCHours();
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  return "evening";
}

function mode(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = "—";
  let bestN = 0;
  for (const [k, n] of counts) if (n > bestN) { best = k; bestN = n; }
  return best;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db, admin } = guard;

  const url = new URL(req.url);
  const daysParam = Number(url.searchParams.get("days") ?? "90");
  const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), 1), 365) : 90;
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString();
  const sinceDate = sinceIso.slice(0, 10);

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_RECALIBRATE_ANALYTICS_VIEWED",
    route: "/admin/recalibrate",
    metadata: { days },
  });

  try {
    const [eventsRes, contentRes, profilesRes, plansRes, completionsRes] = await Promise.all([
      db
        .from("sanctuary_events")
        .select("user_id, content_id, content_type, category, duration_seconds, timestamp, created_at, context_data")
        .gte("timestamp", sinceIso)
        .limit(50000),
      db.from("sanctuary_content").select("id, title, category, sub_type, content_type").limit(2000),
      db.from("profiles").select("id, email, full_name").limit(20000),
      db
        .from("mastery_plan_snapshots")
        .select("user_id, plan_date, recommended_practice_ids")
        .gte("plan_date", sinceDate)
        .limit(50000),
      db
        .from("mastery_plan_completions")
        .select("user_id, plan_date, practices_assigned, practices_completed")
        .gte("plan_date", sinceDate)
        .limit(50000),
    ]);

    const events = ((eventsRes.data ?? []) as EventRow[]).filter((e) => !!e.content_id);
    const content = (contentRes.data ?? []) as ContentRow[];
    const contentById = new Map(content.map((c) => [c.id, c]));
    const profiles = (profilesRes.data ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>;
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const when = (e: EventRow) => e.timestamp ?? e.created_at ?? new Date().toISOString();
    const dateOf = (e: EventRow) => when(e).slice(0, 10);
    const slotOf = (e: EventRow) =>
      ((e.context_data?.timeOfDay as string | undefined)?.toLowerCase() as string | undefined) ?? slotFromIso(when(e));
    const dayOf = (e: EventRow) => (e.context_data?.dayOfWeek as string | undefined) ?? dayName(when(e));

    // ---- Section A ----
    const uniqueUsers = new Set(events.map((e) => e.user_id));
    const uniqueContent = new Set(events.map((e) => e.content_id as string));
    const durations = events.map((e) => e.duration_seconds).filter((d): d is number => typeof d === "number");
    const times = events.map((e) => new Date(when(e)).getTime()).filter((t) => Number.isFinite(t));
    const globals = {
      totalSessions: events.length,
      uniqueUsers: uniqueUsers.size,
      uniqueContent: uniqueContent.size,
      avgSessionsPerUser: uniqueUsers.size ? Number((events.length / uniqueUsers.size).toFixed(1)) : 0,
      avgDurationSeconds: avg(durations),
      activeDaysSpan: times.length ? Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86400000)) : 0,
    };

    // ---- Section B ----
    const catKey = (e: EventRow) => {
      const meta = e.content_id ? contentById.get(e.content_id) : undefined;
      const ctype = (meta?.content_type ?? e.content_type ?? "").toLowerCase();
      if (ctype === "soundbath" || ctype === "guided-practice") return ctype;
      return (meta?.category ?? e.category ?? "unknown").toLowerCase();
    };
    const catMap = new Map<string, EventRow[]>();
    for (const e of events) {
      const k = catKey(e);
      if (!catMap.has(k)) catMap.set(k, []);
      catMap.get(k)!.push(e);
    }
    const categories = [...catMap.entries()]
      .map(([category, rows]) => ({
        category,
        sessions: rows.length,
        uniqueUsers: new Set(rows.map((r) => r.user_id)).size,
        avgDuration: avg(rows.map((r) => r.duration_seconds).filter((d): d is number => typeof d === "number")),
        pctOfTotal: events.length ? Number(((rows.length / events.length) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // ---- Sections C & D ----
    const byContent = new Map<string, EventRow[]>();
    for (const e of events) {
      const k = e.content_id as string;
      if (!byContent.has(k)) byContent.set(k, []);
      byContent.get(k)!.push(e);
    }
    const protocolRows = [...byContent.entries()].map(([contentId, rows]) => {
      const meta = contentById.get(contentId);
      const perUserDay = new Map<string, number>();
      for (const r of rows) {
        const k = `${r.user_id}::${dateOf(r)}`;
        perUserDay.set(k, (perUserDay.get(k) ?? 0) + 1);
      }
      const users = new Set(rows.map((r) => r.user_id));
      return {
        contentId,
        title: meta?.title ?? contentId,
        category: meta?.category ?? rows[0]?.category ?? "—",
        contentType: meta?.content_type ?? rows[0]?.content_type ?? "—",
        subType: meta?.sub_type ?? "—",
        sessions: rows.length,
        uniqueUsers: users.size,
        avgDuration: avg(rows.map((r) => r.duration_seconds).filter((d): d is number => typeof d === "number")),
        repeatRate: users.size ? Number((rows.length / users.size).toFixed(2)) : 0,
        peakTimeOfDay: mode(rows.map(slotOf)),
        peakDayOfWeek: mode(rows.map(dayOf)),
        loopSignal: [...perUserDay.values()].some((n) => n >= 5),
      };
    });
    protocolRows.sort((a, b) => b.sessions - a.sessions);

    const rarelyUsed = protocolRows.filter((p) => p.sessions >= 1 && p.sessions <= 3);
    const neverUsed = content
      .filter((c) => !byContent.has(c.id))
      .map((c) => ({ contentId: c.id, title: c.title ?? c.id, category: c.category ?? "—" }));

    // ---- Section E ----
    const slotCounts = new Map<string, number>();
    const dayCounts = new Map<string, number>();
    const comboCounts = new Map<string, number>();
    for (const e of events) {
      const s = slotOf(e);
      const d = dayOf(e);
      slotCounts.set(s, (slotCounts.get(s) ?? 0) + 1);
      dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1);
      const c = `${d}::${s}`;
      comboCounts.set(c, (comboCounts.get(c) ?? 0) + 1);
    }
    const pct = (n: number) => (events.length ? Number(((n / events.length) * 100).toFixed(1)) : 0);
    const byTimeOfDay = ["morning", "afternoon", "evening"].map((slot) => ({
      slot,
      sessions: slotCounts.get(slot) ?? 0,
      pct: pct(slotCounts.get(slot) ?? 0),
    }));
    const byDayOfWeek = DAY_ORDER.map((day) => ({
      day,
      sessions: dayCounts.get(day) ?? 0,
      pct: pct(dayCounts.get(day) ?? 0),
    }));
    let peakCombo = { day: "—", slot: "—", sessions: 0 };
    for (const [k, n] of comboCounts) {
      if (n > peakCombo.sessions) {
        const [day, slot] = k.split("::");
        peakCombo = { day, slot, sessions: n };
      }
    }

    // ---- Sections F & G ----
    const byUser = new Map<string, EventRow[]>();
    for (const e of events) {
      if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
      byUser.get(e.user_id)!.push(e);
    }
    const loopEvents: Array<Record<string, unknown>> = [];
    const powerUsers = [...byUser.entries()]
      .filter(([, rows]) => rows.length >= 10)
      .map(([userId, rows]) => {
        const prof = profileById.get(userId);
        const perContentDay = new Map<string, number>();
        const contentCount = new Map<string, number>();
        const activeDays = new Set<string>();
        const cats = { pause: 0, presence: 0, powerUp: 0 };
        for (const r of rows) {
          activeDays.add(dateOf(r));
          contentCount.set(r.content_id as string, (contentCount.get(r.content_id as string) ?? 0) + 1);
          perContentDay.set(`${dateOf(r)}::${r.content_id}`, (perContentDay.get(`${dateOf(r)}::${r.content_id}`) ?? 0) + 1);
          const c = catKey(r);
          if (c === "pause") cats.pause++;
          else if (c === "presence") cats.presence++;
          else if (c === "power-up") cats.powerUp++;
        }
        let mostUsedContentId = "";
        let mostN = 0;
        for (const [k, n] of contentCount) if (n > mostN) { mostUsedContentId = k; mostN = n; }
        const loopDays = new Set<string>();
        for (const [k, n] of perContentDay) if (n >= 3) loopDays.add(k.split("::")[0]);
        return {
          userId,
          email: prof?.email ?? null,
          name: prof?.full_name ?? null,
          sessions: rows.length,
          uniqueContent: new Set(rows.map((r) => r.content_id)).size,
          categories: cats,
          activeDays: activeDays.size,
          mostUsedContentId,
          mostUsedTitle: contentById.get(mostUsedContentId)?.title ?? mostUsedContentId,
          loopDays: loopDays.size,
          avgDailyIntensity: activeDays.size ? Number((rows.length / activeDays.size).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.sessions - a.sessions);

    {
      const perUserDayContent = new Map<string, number>();
      for (const e of events) {
        const k = `${e.user_id}::${dateOf(e)}::${e.content_id}`;
        perUserDayContent.set(k, (perUserDayContent.get(k) ?? 0) + 1);
      }
      for (const [k, count] of perUserDayContent) {
        if (count < 3) continue;
        const [userId, date, contentId] = k.split("::");
        const prof = profileById.get(userId);
        loopEvents.push({
          date,
          userId,
          email: prof?.email ?? null,
          contentId,
          title: contentById.get(contentId)?.title ?? contentId,
          count,
          category: contentById.get(contentId)?.category ?? "—",
        });
      }
      loopEvents.sort((a, b) => (b.count as number) - (a.count as number));
    }

    // ---- Plan exposure & variety ----
    const plans = (plansRes.data ?? []) as Array<{ user_id: string; plan_date: string; recommended_practice_ids: string[] | null }>;
    const planRecsByUserDate = new Map<string, Set<string>>();
    const recCount = new Map<string, number>(); // contentId -> plan appearances
    const recUsers = new Map<string, Set<string>>();
    const recPerUser = new Map<string, number>(); // user::content -> times recommended
    for (const p of plans) {
      const ids = (p.recommended_practice_ids ?? []).filter(Boolean);
      const key = `${p.user_id}::${p.plan_date}`;
      if (!planRecsByUserDate.has(key)) planRecsByUserDate.set(key, new Set());
      for (const id of ids) {
        planRecsByUserDate.get(key)!.add(id);
        recCount.set(id, (recCount.get(id) ?? 0) + 1);
        if (!recUsers.has(id)) recUsers.set(id, new Set());
        recUsers.get(id)!.add(p.user_id);
        const uk = `${p.user_id}::${id}`;
        recPerUser.set(uk, (recPerUser.get(uk) ?? 0) + 1);
      }
    }
    const recommendedIds = [...recCount.keys()];
    const totalRecs = [...recCount.values()].reduce((a, b) => a + b, 0);
    const topRecommended = recommendedIds
      .map((id) => ({
        contentId: id,
        title: contentById.get(id)?.title ?? id,
        category: contentById.get(id)?.category ?? "—",
        plans: recCount.get(id) ?? 0,
        users: recUsers.get(id)?.size ?? 0,
        pctOfRecs: totalRecs ? Number((((recCount.get(id) ?? 0) / totalRecs) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.plans - a.plans);
    const top10Share = totalRecs
      ? Number(((topRecommended.slice(0, 10).reduce((a, r) => a + r.plans, 0) / totalRecs) * 100).toFixed(1))
      : 0;
    const neverRecommended = content
      .filter((c) => !recCount.has(c.id))
      .map((c) => ({ contentId: c.id, title: c.title ?? c.id, category: c.category ?? "—" }));
    const repeatValues = [...recPerUser.values()];
    const avgRepeatPerUser = repeatValues.length
      ? Number((repeatValues.reduce((a, b) => a + b, 0) / repeatValues.length).toFixed(2))
      : 0;
    const heavyRepeats = [...recPerUser.entries()]
      .filter(([, n]) => n >= 5)
      .map(([k, n]) => {
        const [userId, contentId] = k.split("::");
        return {
          userId,
          email: profileById.get(userId)?.email ?? null,
          contentId,
          title: contentById.get(contentId)?.title ?? contentId,
          times: n,
        };
      })
      .sort((a, b) => b.times - a.times)
      .slice(0, 50);

    // Route: plan-led vs direct
    let planLed = 0;
    let direct = 0;
    const routeByContent = new Map<string, { plan: number; direct: number }>();
    for (const e of events) {
      const recs = planRecsByUserDate.get(`${e.user_id}::${dateOf(e)}`);
      const isPlan = !!recs && recs.has(e.content_id as string);
      if (isPlan) planLed++; else direct++;
      const cur = routeByContent.get(e.content_id as string) ?? { plan: 0, direct: 0 };
      if (isPlan) cur.plan++; else cur.direct++;
      routeByContent.set(e.content_id as string, cur);
    }
    const routeBreakdown = [...routeByContent.entries()]
      .map(([contentId, v]) => ({
        contentId,
        title: contentById.get(contentId)?.title ?? contentId,
        planLed: v.plan,
        direct: v.direct,
        total: v.plan + v.direct,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    const completions = (completionsRes.data ?? []) as Array<{
      practices_assigned: string[] | null;
      practices_completed: string[] | null;
    }>;
    const assignedTotal = completions.reduce((a, c) => a + (c.practices_assigned?.length ?? 0), 0);
    const completedTotal = completions.reduce((a, c) => a + (c.practices_completed?.length ?? 0), 0);

    const planExposure = {
      totalPlans: plans.length,
      distinctRecommended: recommendedIds.length,
      catalogueSize: content.length,
      coveragePct: content.length ? Number(((recommendedIds.length / content.length) * 100).toFixed(1)) : 0,
      top10Share,
      avgRepeatPerUser,
      topRecommended: topRecommended.slice(0, 20),
      neverRecommended,
      heavyRepeats,
      route: {
        planLed,
        direct,
        planLedPct: events.length ? Number(((planLed / events.length) * 100).toFixed(1)) : 0,
        byContent: routeBreakdown,
      },
      followThrough: {
        assignedTotal,
        completedTotal,
        completionPct: assignedTotal ? Number(((completedTotal / assignedTotal) * 100).toFixed(1)) : 0,
      },
    };

    // ---- Section H — gaps ----
    const catalogueByCategory = new Map<string, number>();
    for (const c of content) {
      const k = (c.category ?? "unknown").toLowerCase();
      catalogueByCategory.set(k, (catalogueByCategory.get(k) ?? 0) + 1);
    }
    const highDemandUncovered: string[] = [];
    let categoryImbalance: string | null = null;
    for (const row of categories) {
      const cataloguePct = content.length
        ? ((catalogueByCategory.get(row.category) ?? 0) / content.length) * 100
        : 0;
      if (row.pctOfTotal > 40 && cataloguePct < 30) highDemandUncovered.push(row.category);
      if (!categoryImbalance && row.pctOfTotal - cataloguePct > 15) {
        categoryImbalance = `${row.category} is ${row.pctOfTotal}% of sessions but only ${cataloguePct.toFixed(
          0,
        )}% of the catalogue`;
      }
    }
    const loopedIds = new Set(loopEvents.filter((l) => (l.count as number) >= 5).map((l) => l.contentId as string));
    const loopedButNoAlternative: string[] = [];
    for (const id of loopedIds) {
      const cat = contentById.get(id)?.category;
      if (!cat) continue;
      const sameCat = content.filter((c) => c.category === cat && c.id !== id);
      const anyTried = sameCat.some((c) => byContent.has(c.id));
      if (sameCat.length > 0 && !anyTried) loopedButNoAlternative.push(id);
    }
    const morningPct = byTimeOfDay.find((t) => t.slot === "morning")?.pct ?? 0;
    const busiestDay = [...byDayOfWeek].sort((a, b) => b.sessions - a.sessions)[0];

    const gaps = {
      highDemandUncovered,
      loopedButNoAlternative,
      morningUnderpenetrated: morningPct < 15,
      morningPct,
      fridayLoadHigh: busiestDay?.day === "Friday",
      categoryImbalance,
      planRotationNarrow: top10Share > 60,
      planCoveragePct: planExposure.coveragePct,
    };

    return json({
      generatedAt: new Date().toISOString(),
      days,
      globals,
      categories,
      protocols: protocolRows,
      rarelyUsed,
      neverUsed,
      timing: { byTimeOfDay, byDayOfWeek, peakCombo },
      powerUsers,
      loopEvents: loopEvents.slice(0, 50),
      planExposure,
      gaps,
    });
  } catch (err) {
    console.error("[admin-recalibrate-analytics] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
