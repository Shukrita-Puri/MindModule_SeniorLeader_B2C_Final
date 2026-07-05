/**
 * Admin audit view for the `executive_home_cards` pipeline.
 *
 * Reuses the CANONICAL scheduler rules from
 * `../build-executive-home-cards/scheduler.ts` so the audit never drifts
 * from real runtime behaviour. Reuses the shared timezone resolver so
 * effective_timezone here matches what the job would compute.
 *
 * Endpoints
 *   GET  /admin-executive-home-audit
 *        → summary + per-user eligibility list (with filters)
 *   GET  /admin-executive-home-audit?userId=<id>
 *        → per-user drill-down (last runs + latest snapshots)
 *
 * Actions (dry-run + replay) are NOT re-implemented here; the existing
 * `admin-jobs-summary` POST `run_job` action is the single writer path.
 */

import { requireAdmin, adminCorsHeaders } from "../_shared/admin-guard.ts";
// NOTE: Edge-function bundling forbids cross-function imports, so we mirror
// the canonical scheduler locally (same pattern as admin-jobs-summary).
// Keep `scheduler-local.ts` byte-identical with
// `../build-executive-home-cards/scheduler.ts` or the audit will drift
// from real runtime behaviour.
import {
  defaultExecutiveHomeCronConfig,
  mergeExecutiveHomeCronConfig,
  resolveDueWindow,
  type ExecutiveHomeCronConfig,
  type TimeWindow,
} from "./scheduler-local.ts";
import {
  localParts,
  resolveEffectiveTimezone,
} from "../_shared/effective-timezone.ts";

const cors = adminCorsHeaders();
const JOB_KEY = "executive_home_cards";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function loadConfig(db: any): Promise<{
  config: ExecutiveHomeCronConfig;
  configRow: Record<string, unknown> | null;
  configPresent: boolean;
}> {
  try {
    const { data, error } = await db
      .from("admin_cron_job_configs")
      .select(
        "job_key, job_name, function_name, enabled, schedule_mode, cron_expression, dispatcher_interval_minutes, timezone_mode, config_json, max_users_per_run, retry_attempts, retry_delay_seconds, updated_at",
      )
      .eq("job_key", JOB_KEY)
      .maybeSingle();
    if (error) {
      return {
        config: defaultExecutiveHomeCronConfig(),
        configRow: null,
        configPresent: false,
      };
    }
    return {
      config: mergeExecutiveHomeCronConfig(data ?? null),
      configRow: (data ?? null) as Record<string, unknown> | null,
      configPresent: !!data,
    };
  } catch (_err) {
    return {
      config: defaultExecutiveHomeCronConfig(),
      configRow: null,
      configPresent: false,
    };
  }
}

/**
 * Deterministic skip reason derivation. Mirrors `planDueUsers` +
 * `claimScheduledSlot` in `build-executive-home-cards/index.ts`. If the
 * source logic changes and this drifts, the audit result will be visibly
 * different from the real run — that is the desired signal.
 */
type Eligibility =
  | { eligible: true; window: TimeWindow; reason: null }
  | { eligible: false; window: TimeWindow | null; reason: SkipReason };

type SkipReason =
  | "job_disabled"
  | "not_due_now"
  | "window_filter_mismatch"
  | "already_attempted_for_window"
  | "max_users_per_run_reached"
  | "onboarding_missing";

function deriveEligibility(args: {
  config: ExecutiveHomeCronConfig;
  effectiveTimezone: string;
  now: Date;
  onboardingCompletedAt: string | null;
  alreadyAttemptedForCurrentWindow: boolean;
}): Eligibility {
  if (!args.onboardingCompletedAt) {
    return { eligible: false, window: null, reason: "onboarding_missing" };
  }
  if (!args.config.enabled) {
    return { eligible: false, window: null, reason: "job_disabled" };
  }
  const dueWindow = resolveDueWindow(args.effectiveTimezone, args.now, args.config);
  if (!dueWindow) {
    return { eligible: false, window: null, reason: "not_due_now" };
  }
  if (args.alreadyAttemptedForCurrentWindow) {
    return { eligible: false, window: dueWindow, reason: "already_attempted_for_window" };
  }
  return { eligible: true, window: dueWindow, reason: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const guard = await requireAdmin(req);
  if (guard.errorResponse) return guard.errorResponse;
  const { db } = guard;

  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const url = new URL(req.url);
  const filterUserId = (url.searchParams.get("userId") ?? "").trim() || null;
  const filterQuery = (url.searchParams.get("q") ?? "").trim().toLowerCase() || null;
  const filterEligibility = (url.searchParams.get("eligibility") ?? "").trim(); // "eligible" | "skipped" | ""
  const filterWindow = (url.searchParams.get("window") ?? "").trim();
  const filterSkipReason = (url.searchParams.get("skipReason") ?? "").trim();

  const now = new Date();
  const { config, configRow, configPresent } = await loadConfig(db);

  // ── Per-user drill-down ────────────────────────────────────────────
  if (filterUserId) {
    const { data: profile } = await db
      .from("profiles")
      .select("id, email, full_name, current_timezone, home_timezone, onboarding_completed_at")
      .eq("id", filterUserId)
      .maybeSingle();
    if (!profile) return json({ error: "profile_not_found" }, 404);

    const tz = await resolveEffectiveTimezone(db, filterUserId, profile as any, now, {
      respectTravelTimezone: config.configJson.respectTravelTimezone,
    });
    const local = localParts(tz.effectiveTimezone, now);
    const dueWindow = resolveDueWindow(tz.effectiveTimezone, now, config);

    // Only a `scheduled`-mode row for the current local_date+window counts
    // as "already attempted".
    let alreadyAttempted = false;
    if (dueWindow) {
      const { data: existing } = await db
        .from("executive_home_card_runs")
        .select("id")
        .eq("job_key", JOB_KEY)
        .eq("user_id", filterUserId)
        .eq("local_date", local.localDate)
        .eq("window", dueWindow)
        .eq("mode", "scheduled")
        .limit(1)
        .maybeSingle();
      alreadyAttempted = !!existing;
    }

    const eligibility = deriveEligibility({
      config,
      effectiveTimezone: tz.effectiveTimezone,
      now,
      onboardingCompletedAt: (profile as any).onboarding_completed_at ?? null,
      alreadyAttemptedForCurrentWindow: alreadyAttempted,
    });

    const [{ data: runs }, { data: contextSnap }, { data: brief }, { data: plan }] =
      await Promise.all([
        db
          .from("executive_home_card_runs")
          .select(
            "id, run_id, local_date, effective_timezone, window, mode, status, mrs_status, brief_status, plan_status, skipped_reason, error, duration_ms, created_at, retry_count, trace_json",
          )
          .eq("job_key", JOB_KEY)
          .eq("user_id", filterUserId)
          .order("created_at", { ascending: false })
          .limit(10),
        db
          .from("daily_context_snapshot")
          .select(
            "local_date, mrs_window, readiness_state, readiness_score_baseline, readiness_score_refined, inner_score, inner_tier, tier_displayed, updated_at, created_at",
          )
          .eq("user_id", filterUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("brief_snapshots")
          .select("id, local_date, time_window, brief_source, driver, refined_state, refined_tier, refined_score, created_at")
          .eq("user_id", filterUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("mastery_plan_snapshots")
          .select("id, plan_date, mrs_window, day_kind, status, generated_at, created_at")
          .eq("user_id", filterUserId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    return json({
      now: now.toISOString(),
      configPresent,
      config,
      configRow,
      user: {
        id: filterUserId,
        email: (profile as any).email ?? null,
        fullName: (profile as any).full_name ?? null,
        onboardingCompletedAt: (profile as any).onboarding_completed_at ?? null,
        currentTimezone: (profile as any).current_timezone ?? null,
        homeTimezone: tz.homeTimezone,
        effectiveTimezone: tz.effectiveTimezone,
        isAway: tz.isAway,
        localDate: local.localDate,
        localHour: local.hour,
        localMinute: local.minute,
        dueWindow,
        eligibility,
        alreadyAttemptedForCurrentWindow: alreadyAttempted,
      },
      recentRuns: runs ?? [],
      latestMrsSnapshot: contextSnap ?? null,
      latestBriefSnapshot: brief ?? null,
      latestMasteryPlanSnapshot: plan ?? null,
    });
  }

  // ── List view ─────────────────────────────────────────────────────
  const { data: profiles, error: profErr } = await db
    .from("profiles")
    .select("id, email, full_name, current_timezone, home_timezone, onboarding_completed_at")
    .not("onboarding_completed_at", "is", null);
  if (profErr) return json({ error: "profiles_query_failed", detail: profErr.message }, 500);

  const userIds = (profiles ?? []).map((p: any) => p.id).filter(Boolean);

  // Batch fetch: travel_state + today's scheduled runs + last-run per user.
  const [{ data: travelRows }, { data: recentRuns }] = await Promise.all([
    userIds.length
      ? db.from("travel_state").select("user_id, state, last_known_timezone, meta, updated_at").in("user_id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    // Pull enough recent runs to derive "last run per user" and 24h aggregates.
    // Bounded at 2000 rows to keep the audit page responsive even with growth.
    db
      .from("executive_home_card_runs")
      .select("user_id, local_date, window, mode, status, skipped_reason, error, created_at")
      .eq("job_key", JOB_KEY)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const travelByUser = new Map<string, any>();
  for (const row of travelRows ?? []) travelByUser.set((row as any).user_id, row);

  const lastRunByUser = new Map<string, any>();
  const scheduledTodayByKey = new Set<string>(); // `${user}|${date}|${window}`
  const successUserIds = new Set<string>();
  const errorUserIds = new Set<string>();
  const everProcessedUserIds = new Set<string>();
  const sinceMs = now.getTime() - 24 * 60 * 60 * 1000;
  for (const row of recentRuns ?? []) {
    const uid = (row as any).user_id as string;
    if (!uid) continue;
    everProcessedUserIds.add(uid);
    if (!lastRunByUser.has(uid)) lastRunByUser.set(uid, row);
    if ((row as any).mode === "scheduled") {
      scheduledTodayByKey.add(`${uid}|${(row as any).local_date}|${(row as any).window}`);
    }
    const createdMs = new Date((row as any).created_at).getTime();
    if (Number.isFinite(createdMs) && createdMs >= sinceMs) {
      if ((row as any).status === "success") successUserIds.add(uid);
      if ((row as any).status === "error") errorUserIds.add(uid);
    }
  }

  // Build per-user rows.
  const rows: any[] = [];
  let dueNow = 0;
  let skippedNow = 0;
  const skipReasonCounts: Record<string, number> = {};

  for (const profile of profiles ?? []) {
    const uid = (profile as any).id as string;
    if (!uid) continue;

    // Inline resolveEffectiveTimezone using cached travel row (skip N extra
    // DB round-trips). Mirrors the resolver's precedence rules.
    const travel = travelByUser.get(uid) ?? null;
    const respect = config.configJson.respectTravelTimezone;
    const isAway = Boolean(travel?.state && travel.state !== "not_travelling");
    const isValidTz = (v: unknown): v is string => {
      if (typeof v !== "string" || v.trim().length === 0) return false;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: v }).format(now);
        return true;
      } catch {
        return false;
      }
    };
    const profileCurrent = isValidTz((profile as any).current_timezone) ? (profile as any).current_timezone : null;
    const profileHome = isValidTz((profile as any).home_timezone) ? (profile as any).home_timezone : null;
    const travelTimezone = isValidTz(travel?.last_known_timezone) ? travel!.last_known_timezone : null;
    const effectiveTimezone =
      (respect && isAway && (travelTimezone || profileCurrent)) ||
      profileCurrent ||
      profileHome ||
      "UTC";

    const local = localParts(effectiveTimezone, now);
    const dueWindow = resolveDueWindow(effectiveTimezone, now, config);
    const alreadyAttempted = dueWindow
      ? scheduledTodayByKey.has(`${uid}|${local.localDate}|${dueWindow}`)
      : false;
    const eligibility = deriveEligibility({
      config,
      effectiveTimezone,
      now,
      onboardingCompletedAt: (profile as any).onboarding_completed_at ?? null,
      alreadyAttemptedForCurrentWindow: alreadyAttempted,
    });

    if (eligibility.eligible) dueNow++;
    else {
      skippedNow++;
      skipReasonCounts[eligibility.reason] = (skipReasonCounts[eligibility.reason] ?? 0) + 1;
    }

    const lastRun = lastRunByUser.get(uid) ?? null;
    rows.push({
      userId: uid,
      email: (profile as any).email ?? null,
      fullName: (profile as any).full_name ?? null,
      onboardingCompletedAt: (profile as any).onboarding_completed_at ?? null,
      currentTimezone: (profile as any).current_timezone ?? null,
      homeTimezone: (profile as any).home_timezone ?? null,
      effectiveTimezone,
      isAway,
      localDate: local.localDate,
      localHour: local.hour,
      localMinute: local.minute,
      dueWindow,
      eligibility,
      lastRun: lastRun
        ? {
            createdAt: lastRun.created_at ?? null,
            status: lastRun.status ?? null,
            mode: lastRun.mode ?? null,
            window: lastRun.window ?? null,
            localDate: lastRun.local_date ?? null,
            skippedReason: lastRun.skipped_reason ?? null,
            error: lastRun.error ?? null,
          }
        : null,
      everProcessed: everProcessedUserIds.has(uid),
    });
  }

  // Filters (server-side to keep payload small).
  const filtered = rows.filter((row) => {
    if (filterQuery) {
      const hay = `${row.email ?? ""} ${row.fullName ?? ""} ${row.userId}`.toLowerCase();
      if (!hay.includes(filterQuery)) return false;
    }
    if (filterEligibility === "eligible" && !row.eligibility.eligible) return false;
    if (filterEligibility === "skipped" && row.eligibility.eligible) return false;
    if (filterWindow) {
      // Match on due window OR current-time window.
      if (row.dueWindow !== filterWindow) return false;
    }
    if (filterSkipReason) {
      if (row.eligibility.eligible) return false;
      if (row.eligibility.reason !== filterSkipReason) return false;
    }
    return true;
  });

  const summary = {
    totalOnboardedUsers: rows.length,
    dueNow,
    skippedNow,
    recentSuccessUsers24h: successUserIds.size,
    recentErrorUsers24h: errorUserIds.size,
    neverProcessedUsers: rows.filter((r) => !r.everProcessed).length,
    skipReasonCounts,
  };

  return json({
    now: now.toISOString(),
    configPresent,
    config,
    configRow,
    summary,
    users: filtered,
    totalUnfiltered: rows.length,
  });
});
