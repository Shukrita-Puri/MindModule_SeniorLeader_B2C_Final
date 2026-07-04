import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";

const cors = adminCorsHeaders();
const MAX_PAGE_SIZE = 100;

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

  const url = new URL(req.url);
  const searchRaw = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50),
  );
  const offset = Math.max(0, Number.parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  if (searchRaw) {
    await writeAdminAudit(db, {
      admin: admin!,
      action: "ADMIN_USER_SEARCH",
      route: "/admin/users",
      metadata: { query_length: searchRaw.length },
    });
  }

  try {
    let query = db
      .from("profiles")
      .select(
        "id, email, full_name, display_name, created_at, onboarding_completed_at, subscription_tier, subscription_status, trial_ends_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (searchRaw) {
      // Escape %/_ so admin searches for "foo_bar" don't wildcard implicitly
      const escaped = searchRaw.replace(/[\\%_,]/g, (m) => `\\${m}`);
      query = query.or(
        `email.ilike.%${escaped}%,full_name.ilike.%${escaped}%,display_name.ilike.%${escaped}%,id.ilike.%${escaped}%`,
      );
    }

    const { data, error, count } = await query;
    if (error) throw error;

    const ids = (data ?? []).map((r: Record<string, unknown>) => r.id as string);
    const connectivityByUser: Record<string, { wearable: boolean; calendar: boolean; lastCheckIn: string | null; lastCardRun: string | null }> = {};
    if (ids.length) {
      const [wearable, calendar, checkIns, cards] = await Promise.all([
        db.from("wearable_data").select("user_id").in("user_id", ids),
        db.from("calendar_connections").select("user_id").in("user_id", ids),
        db
          .from("daily_checkins")
          .select("user_id, checkin_date")
          .in("user_id", ids)
          .order("checkin_date", { ascending: false }),
        db
          .from("executive_home_card_runs")
          .select("user_id, local_date")
          .in("user_id", ids)
          .eq("status", "success")
          .order("local_date", { ascending: false }),
      ]);
      const wearableSet = new Set((wearable.data ?? []).map((r: Record<string, unknown>) => r.user_id as string));
      const calendarSet = new Set((calendar.data ?? []).map((r: Record<string, unknown>) => r.user_id as string));
      const lastCheckIn = new Map<string, string>();
      for (const row of checkIns.data ?? []) {
        const uid = (row as Record<string, unknown>).user_id as string;
        const d = (row as Record<string, unknown>).checkin_date as string;
        if (!lastCheckIn.has(uid)) lastCheckIn.set(uid, d);
      }
      const lastCard = new Map<string, string>();
      for (const row of cards.data ?? []) {
        const uid = (row as Record<string, unknown>).user_id as string;
        const d = (row as Record<string, unknown>).local_date as string;
        if (!lastCard.has(uid)) lastCard.set(uid, d);
      }
      for (const id of ids) {
        connectivityByUser[id] = {
          wearable: wearableSet.has(id),
          calendar: calendarSet.has(id),
          lastCheckIn: lastCheckIn.get(id) ?? null,
          lastCardRun: lastCard.get(id) ?? null,
        };
      }
    }

    const users = (data ?? []).map((row: Record<string, unknown>) => {
      const id = row.id as string;
      const conn = connectivityByUser[id] ?? { wearable: false, calendar: false, lastCheckIn: null, lastCardRun: null };
      return {
        id,
        email: row.email ?? null,
        name: row.display_name ?? row.full_name ?? null,
        createdAt: row.created_at ?? null,
        onboardingCompletedAt: row.onboarding_completed_at ?? null,
        subscriptionTier: row.subscription_tier ?? null,
        subscriptionStatus: row.subscription_status ?? null,
        trialEndsAt: row.trial_ends_at ?? null,
        wearableConnected: conn.wearable,
        calendarConnected: conn.calendar,
        lastCheckInDate: conn.lastCheckIn,
        lastCardRunDate: conn.lastCardRun,
      };
    });

    return json({ users, total: count ?? users.length, limit, offset });
  } catch (err) {
    console.error("[admin-list-users] error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});