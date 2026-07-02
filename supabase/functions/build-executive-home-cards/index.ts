import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMrsV4SubScores } from "../_shared/signal-engine/mrs-v4-subscores.ts";
import { composeDailyContext } from "../_shared/signal-engine/build-daily-context.ts";
import { mergeCalendarEvents } from "../_shared/rules/calendarEvents.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  localParts,
  resolveEffectiveTimezone,
  timezoneOffsetMinutes,
} from "../_shared/effective-timezone.ts";

type BuildMode = "scheduled" | "manual_refresh" | "manual_replay" | "backfill" | "dry_run";
type TimeWindow = "morning" | "afternoon" | "evening";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getWindow(hour: number): TimeWindow {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

function isForceMode(mode: BuildMode) {
  return mode === "manual_refresh" || mode === "manual_replay" || mode === "backfill" || mode === "dry_run";
}

function scoreFromPattern(patternSignals: any): number | null {
  if (!patternSignals || typeof patternSignals !== "object") return null;
  if ((patternSignals.consecutive_high_load_days ?? 0) >= 3) return 20;
  const trend = patternSignals.hrv_3day_trend;
  if (trend === "declining") return 30;
  if (trend === "improving") return 70;
  if (trend === "stable") return 50;
  return null;
}

function sleepQuality(score: number | null, hours: number | null): "poor" | "fair" | "good" | "peak" | null {
  if (typeof score === "number") {
    if (score < 50) return "poor";
    if (score < 70) return "fair";
    if (score < 85) return "good";
    return "peak";
  }
  if (typeof hours === "number") {
    if (hours < 5) return "poor";
    if (hours < 6.5) return "fair";
    if (hours < 8) return "good";
    return "peak";
  }
  return null;
}

async function countTodayEvents(db: any, userId: string, localDate: string) {
  const start = `${localDate}T00:00:00`;
  const end = `${localDate}T23:59:59`;
  // Cross-provider dedupe: same real-world event mirrored on apple/google/microsoft
  // must collapse to 1. SQL count(*) over `calendar_events` double/triple-counts.
  // See mem/architecture/event-load-and-dedupe-rules.md.
  const { data } = await db
    .from("calendar_events")
    .select("id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring,external_id")
    .eq("user_id", userId)
    .gte("start_time", start)
    .lte("start_time", end);
  return mergeCalendarEvents((data || []) as any[], "unknown").length;
}

async function latestWearable(db: any, userId: string) {
  const { data: latest } = await db
    .from("wearable_data")
    .select("summary_date,hrv,resting_heart_rate,sleep_score,total_sleep_minutes")
    .eq("user_id", userId)
    .order("summary_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: rows } = await db
    .from("wearable_data")
    .select("hrv,resting_heart_rate")
    .eq("user_id", userId)
    .order("summary_date", { ascending: false })
    .limit(30);

  const hrvRows = (rows ?? []).map((r: any) => Number(r.hrv)).filter(Number.isFinite);
  const rhrRows = (rows ?? []).map((r: any) => Number(r.resting_heart_rate)).filter(Number.isFinite);
  const avg = (xs: number[]) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  return {
    latest,
    hrvBaseline: avg(hrvRows),
    rhrBaseline: avg(rhrRows),
  };
}

async function latestCheckin(db: any, userId: string, localDate: string, window: TimeWindow) {
  const { data } = await db
    .from("daily_checkins")
    .select("clarity_level,confidence_level,emotion_level,pressure_level,regulation_level,outcome")
    .eq("user_id", userId)
    .eq("checkin_date", localDate)
    .eq("time_window", window)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

async function callFunction(functionName: string, body: Record<string, unknown>, userId: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRole}`,
      "x-dev-user-id": userId,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${functionName} ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return data;
}

async function logRun(db: any, row: Record<string, unknown>) {
  try {
    await db.from("executive_home_card_runs").insert(row);
  } catch (err) {
    console.warn("[build-executive-home-cards] run log failed", err);
  }
}

async function buildForUser(db: any, args: {
  userId: string;
  profile: any;
  mode: BuildMode;
  requestedWindow?: TimeWindow | null;
  requestedLocalDate?: string | null;
}) {
  const started = Date.now();
  const runId = crypto.randomUUID();
  const { userId, profile, mode } = args;
  const { effectiveTimezone, homeTimezone, travel } = await resolveEffectiveTimezone(db, userId, profile);
  const parts = localParts(effectiveTimezone);
  const localDate = args.requestedLocalDate || parts.localDate;
  const window = args.requestedWindow || getWindow(parts.hour);
  const offset = timezoneOffsetMinutes(effectiveTimezone);
  const force = isForceMode(mode);

  const baseLog = {
    run_id: runId,
    user_id: userId,
    local_date: localDate,
    effective_timezone: effectiveTimezone,
    window,
    mode,
  };

  if (!force) {
    const { data: existing } = await db
      .from("daily_context_snapshot")
      .select("id")
      .eq("user_id", userId)
      .eq("local_date", localDate)
      .eq("mrs_window", window)
      .maybeSingle();
    if (existing?.id) {
      await logRun(db, {
        ...baseLog,
        status: "skipped",
        skipped_reason: "already_built",
        duration_ms: Date.now() - started,
      });
      return { userId, localDate, window, status: "skipped", skippedReason: "already_built" };
    }
  }

  if (mode === "dry_run") {
    await logRun(db, {
      ...baseLog,
      status: "skipped",
      skipped_reason: "dry_run",
      travel_state: travel ?? null,
      duration_ms: Date.now() - started,
    });
    return { userId, localDate, window, status: "dry_run", effectiveTimezone };
  }

  let mrsStatus = "pending";
  let briefStatus = "pending";
  let planStatus = "pending";
  try {
    const [context, eventCount, wearable, checkin] = await Promise.all([
      composeDailyContext(db, userId, localDate, { dryRun: true, timezone: effectiveTimezone, mrsWindow: window }),
      countTodayEvents(db, userId, localDate),
      latestWearable(db, userId),
      latestCheckin(db, userId, localDate, window),
    ]);

    const latest = wearable.latest;
    const hasFreshWearable = !!latest && latest.summary_date === localDate;
    const hrvDeviationPct =
      hasFreshWearable &&
      typeof latest?.hrv === "number" &&
      typeof wearable.hrvBaseline === "number" &&
      wearable.hrvBaseline > 0
        ? Math.round(((latest.hrv - wearable.hrvBaseline) / wearable.hrvBaseline) * 100)
        : null;
    const sleepHours =
      hasFreshWearable && typeof latest?.total_sleep_minutes === "number"
        ? latest.total_sleep_minutes / 60
        : null;
    const rhrTrend =
      hasFreshWearable &&
      typeof latest?.resting_heart_rate === "number" &&
      typeof wearable.rhrBaseline === "number" &&
      wearable.rhrBaseline > 0
        ? latest.resting_heart_rate > wearable.rhrBaseline * 1.08
          ? "rising"
          : latest.resting_heart_rate < wearable.rhrBaseline * 0.95
            ? "falling"
            : "stable"
        : null;

    const demandScore = eventCount > 0 ? context.calendarDemandScore : null;
    const patternScore = scoreFromPattern(context.patternSignals);
    const mrsSubScores = buildMrsV4SubScores(window, {
      hrvValue: hasFreshWearable ? latest?.hrv ?? null : null,
      hrvDeviationPct,
      sleepScore: hasFreshWearable ? latest?.sleep_score ?? null : null,
      sleepHours,
      rhrValue: hasFreshWearable ? latest?.resting_heart_rate ?? null : null,
      rhrTrend,
      todayFullDayDemand: demandScore,
      remainingDayDemand: demandScore,
      realizedSoFarCost: demandScore,
      todayRealizedDemand: demandScore,
      tomorrowOpeningDemand: demandScore,
      patternScore,
      yesterdayCarryoverDemand: null,
    });

    const mrs = await callFunction("compute-inner-readiness", {
      checkInOutcome: checkin?.outcome ?? null,
      clarityLevel: checkin?.clarity_level ?? null,
      confidenceLevel: checkin?.confidence_level ?? null,
      emotionLevel: checkin?.emotion_level ?? null,
      pressureLevel: checkin?.pressure_level ?? null,
      regulationLevel: checkin?.regulation_level ?? null,
      hasImminentHighStakes: false,
      wearableHRV: hasFreshWearable ? latest?.hrv ?? null : null,
      wearableBaseline: hasFreshWearable ? wearable.hrvBaseline : null,
      hasCheckIn: !!checkin,
      hasWearable: hasFreshWearable,
      timezoneOffset: offset,
      baselineConfidence: hasFreshWearable ? "medium" : undefined,
      sampleDays: hasFreshWearable ? 30 : undefined,
      sleepScore: hasFreshWearable ? latest?.sleep_score ?? null : null,
      sleepHours,
      rhrTrend,
      rhrElevated: rhrTrend === "rising",
      wearableStatus: hasFreshWearable ? "fresh" : latest ? "stale" : "missing",
      demandScore,
      hasCalendarSignal: eventCount > 0,
      patternSignals: context.patternSignals,
      mrsWindow: window,
      mrsSubScores,
      sleepDeficitMeasurement: {
        available: hasFreshWearable && (latest?.sleep_score != null || sleepHours != null),
        sleepTotalMinutes: sleepHours != null ? Math.round(sleepHours * 60) : null,
        sleepQuality: sleepQuality(latest?.sleep_score ?? null, sleepHours),
      },
    }, userId);
    mrsStatus = mrs?.readinessState === "awaiting" ? "awaiting" : "ready";

    const hasStageOneSignal = mrs?.readinessState !== "awaiting" && typeof mrs?.score === "number";
    const brief = await callFunction("compute-outer-readiness", {
      userId,
      innerReadinessTier: mrs?.tier ?? null,
      innerReadinessScore: mrs?.score ?? null,
      clarityLevel: checkin?.clarity_level ?? null,
      confidenceLevel: checkin?.confidence_level ?? null,
      emotionLevel: checkin?.emotion_level ?? null,
      pressureLevel: checkin?.pressure_level ?? null,
      regulationLevel: checkin?.regulation_level ?? null,
      checkInOutcome: checkin?.outcome ?? null,
      timezoneOffset: offset,
      currentTimezone: effectiveTimezone,
      homeTimezone,
      tierDisplayed: mrs?.tierDisplayed ?? mrs?.tier ?? null,
      tierCapReason: mrs?.tierCapReason ?? null,
      innerReadinessScoreBaseline: mrs?.scoreBaseline ?? null,
      innerReadinessScoreRefined: mrs?.scoreRefined ?? null,
      innerReadinessState: mrs?.readinessState ?? "awaiting",
      innerReadinessRefinedContribution: mrs?.refinedContribution ?? null,
      weightProvenance: mrs?.weightProvenance ?? null,
    }, userId);
    briefStatus = brief?.awaitingSignals ? "awaiting" : "ready";

    let plan: any = null;
    if (!hasStageOneSignal) {
      planStatus = "skipped_no_stage_one_signal";
    } else {
      plan = await callFunction("generate-mastery-plan", {
        timezoneOffset: offset,
        localDate,
        forceRefresh: force,
        outerReadinessCache: brief,
      }, userId);
      planStatus = "ready";
    }

    await logRun(db, {
      ...baseLog,
      day_type: plan?.dayKind ?? plan?.meta?.dayKind ?? null,
      status: "success",
      mrs_status: mrsStatus,
      brief_status: briefStatus,
      plan_status: planStatus,
      duration_ms: Date.now() - started,
    });
    return { userId, localDate, window, status: "success", mrsStatus, briefStatus, planStatus };
  } catch (err) {
    await logRun(db, {
      ...baseLog,
      status: "error",
      mrs_status: mrsStatus,
      brief_status: briefStatus,
      plan_status: planStatus,
      error: err instanceof Error ? err.message : String(err),
      duration_ms: Date.now() - started,
    });
    return {
      userId,
      localDate,
      window,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const apiKeyHeader = req.headers.get("apikey") ?? "";
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({}));
    const mode = (body.mode ?? "scheduled") as BuildMode;
    if (!["scheduled", "manual_refresh", "manual_replay", "backfill", "dry_run"].includes(mode)) {
      return json({ error: "invalid_mode" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const db = createClient(supabaseUrl, serviceRole);
    let authenticatedUserId: string | null = null;
    const isServiceRoleCall = auth === `Bearer ${serviceRole}`;
    // Scheduled cron is treated as a background orchestrator and does not need
    // a per-user JWT: it only iterates onboarded profiles and writes to the
    // server-owned run log + snapshot tables via service role. We require at
    // least a Supabase apikey/Authorization header to be present so random
    // public hits without any credential are still rejected upstream by the
    // platform's API gateway.
    const isScheduledCredentialedCall =
      mode === "scheduled" && (auth.startsWith("Bearer ") || apiKeyHeader.length > 0);
    if (!isServiceRoleCall && !isScheduledCredentialedCall) {
      const authResult = await authenticateRequest(req, corsHeaders);
      if (authResult.errorResponse) {
        const devUser = req.headers.get("x-dev-user-id");
        if (!devUser) return authResult.errorResponse;
        authenticatedUserId = devUser;
      } else {
        authenticatedUserId = authResult.userId;
      }
    }

    const requestedUserId = (isServiceRoleCall || isScheduledCredentialedCall)
      ? (typeof body.userId === "string" ? body.userId : null)
      : authenticatedUserId;

    if (!isServiceRoleCall && !isScheduledCredentialedCall && !requestedUserId) {
      return json({ error: "unauthorized" }, 401);
    }
    const requestedWindow =
      ["morning", "afternoon", "evening"].includes(body.window)
        ? body.window as TimeWindow
        : null;
    const requestedLocalDate = typeof body.localDate === "string" ? body.localDate : null;

    let profiles: any[] = [];
    if (requestedUserId) {
      const { data, error } = await db
        .from("profiles")
        .select("id,current_timezone,home_timezone")
        .eq("id", requestedUserId)
        .maybeSingle();
      if (error || !data) return json({ error: "profile_not_found", detail: error?.message }, 404);
      profiles = [data];
    } else {
      const { data, error } = await db
        .from("profiles")
        .select("id,current_timezone,home_timezone,onboarding_completed_at")
        .not("onboarding_completed_at", "is", null);
      if (error) return json({ error: "profiles_query_failed", detail: error.message }, 500);
      profiles = data ?? [];
    }

    const results = [];
    for (const profile of profiles) {
      const userId = profile.id;
      if (!userId) continue;
      results.push(await buildForUser(db, {
        userId,
        profile,
        mode,
        requestedWindow,
        requestedLocalDate,
      }));
    }

    return json({ mode, results });
  } catch (err) {
    console.error("[build-executive-home-cards] fatal", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
