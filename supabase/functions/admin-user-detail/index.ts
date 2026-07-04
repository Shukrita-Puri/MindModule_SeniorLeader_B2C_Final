import { requireAdmin, writeAdminAudit, adminCorsHeaders } from "../_shared/admin-guard.ts";
import { buildReferralDetail } from "./referral-detail.ts";

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

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  if (!userId) return json({ error: "userId required" }, 400);

  const { data: profile, error: profileErr } = await db
    .from("profiles")
    .select(
      "id, email, full_name, display_name, avatar_url, created_at, onboarding_completed_at, subscription_tier, subscription_status, subscription_plan, trial_ends_at, subscription_current_period_end, subscription_canceled_at, subscription_cancel_at, beta_user, beta_expires_at, stripe_customer_id, founding_member, referral_code_used, referral_code_entered_at, current_timezone, home_timezone, user_archetype",
    )
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    console.error("[admin-user-detail] profile error", profileErr);
    return json({ error: profileErr.message }, 500);
  }
  if (!profile) return json({ error: "User not found" }, 404);

  await writeAdminAudit(db, {
    admin: admin!,
    action: "ADMIN_USER_DETAIL_VIEWED",
    targetUserId: userId,
    targetEmail: (profile.email as string | null) ?? null,
    route: `/admin/users/${userId}`,
  });

  // Defensive: any optional section failing should not kill the whole detail page.
  const safe = async <T,>(p: PromiseLike<{ data: T | null; error: unknown }>, label: string): Promise<T | null> => {
    try {
      const res = await p;
      if (res.error) {
        console.warn(`[admin-user-detail] ${label} skipped:`, (res.error as { message?: string }).message ?? res.error);
        return null;
      }
      return (res.data ?? null) as T | null;
    } catch (err) {
      console.warn(`[admin-user-detail] ${label} threw:`, err instanceof Error ? err.message : err);
      return null;
    }
  };

  const [checkin, wearable, calendar, brief, plan, mrs, deviceTokens, recentRuns, referral] = await Promise.all([
    safe(db.from("daily_checkins").select("id, checkin_date, time_window, outcome, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(), "daily_checkins"),
    safe(db.from("wearable_data").select("summary_date, hrv, resting_heart_rate, sleep_score, total_sleep_minutes, data_source, created_at").eq("user_id", userId).order("summary_date", { ascending: false }).limit(1).maybeSingle(), "wearable_data"),
    safe(db.from("calendar_connections").select("provider, connection_status, created_at, updated_at, last_synced_at").eq("user_id", userId), "calendar_connections"),
    safe(db.from("brief_snapshots").select("id, local_date, time_window, brief_source, refined_state, baseline_state, refined_phrase, baseline_phrase, delivered_at, viewed_at, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(), "brief_snapshots"),
    safe(db.from("mastery_plan_snapshots").select("id, plan_date, mrs_window, status, delivered_at, viewed_at, generated_at").eq("user_id", userId).order("generated_at", { ascending: false }).limit(1).maybeSingle(), "mastery_plan_snapshots"),
    safe(db.from("daily_context_snapshot").select("mrs_window, readiness_state, readiness_score_baseline, readiness_score_refined, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(), "daily_context_snapshot"),
    safe(db.from("notification_device_tokens").select("id, platform, is_active, created_at, updated_at").eq("user_id", userId), "notification_device_tokens"),
    safe(db.from("executive_home_card_runs").select("run_id, local_date, window, mode, status, mrs_status, brief_status, plan_status, skipped_reason, error, duration_ms, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10), "executive_home_card_runs"),
    safe(db.from("user_referrals").select("referral_code, referral_link, total_signups, total_conversions, credited_months").eq("user_id", userId).maybeSingle(), "user_referrals"),
  ]);

  const referralDetail = referral
    ? buildReferralDetail(profile, referral as Parameters<typeof buildReferralDetail>[1])
    : buildReferralDetail(profile, null);

  return json({
    profile,
    referral: referralDetail,
    latestCheckIn: checkin ?? null,
    latestWearable: wearable ?? null,
    calendarConnections: (calendar as unknown[] | null) ?? [],
    latestBrief: brief ?? null,
    latestPlan: plan ?? null,
    latestMrs: mrs ?? null,
    deviceTokens: (deviceTokens as unknown[] | null) ?? [],
    recentCardRuns: (recentRuns as unknown[] | null) ?? [],
    lastCards: (recentRuns as unknown[] | null) ?? [],
  });
});
