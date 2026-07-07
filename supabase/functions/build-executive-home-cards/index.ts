import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMrsV4SubScores } from "../_shared/signal-engine/mrs-v4-subscores.ts";
import { composeDailyContext } from "../_shared/signal-engine/build-daily-context.ts";
import { mergeCalendarEvents } from "../_shared/rules/calendarEvents.ts";
import { isPtoOrHolidayTitle } from "../_shared/ceo-behaviour/pto-holiday.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import {
  localParts,
  resolveEffectiveTimezone,
  timezoneOffsetMinutes,
} from "../_shared/effective-timezone.ts";
import {
  defaultExecutiveHomeCronConfig,
  mergeExecutiveHomeCronConfig,
  nextExpectedRunAt,
  resolveDueWindow,
  validateWindowConfig,
  type ExecutiveHomeCronConfig,
  type TimeWindow,
} from "./scheduler.ts";
import { resolveDayTypeAndCadence, type DayTypeDecision } from "./day-type.ts";

type BuildMode = "scheduled" | "manual_refresh" | "manual_replay" | "backfill" | "dry_run";
const JOB_KEY = "executive_home_cards";

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

function weightProvenanceIndicatesAwaiting(weightProvenance: any): boolean {
  if (weightProvenance?.awaiting_signals === true) return true;
  if (weightProvenance && Object.prototype.hasOwnProperty.call(weightProvenance, "earned")) {
    return !Array.isArray(weightProvenance.earned) || weightProvenance.earned.length === 0;
  }
  return false;
}

async function loadJobConfig(db: any): Promise<ExecutiveHomeCronConfig> {
  try {
    const { data, error } = await db
      .from("admin_cron_job_configs")
      .select("job_key, job_name, function_name, enabled, schedule_mode, cron_expression, dispatcher_interval_minutes, timezone_mode, config_json, max_users_per_run, retry_attempts, retry_delay_seconds")
      .eq("job_key", JOB_KEY)
      .maybeSingle();
    if (error) {
      console.warn("[build-executive-home-cards] config load failed, using defaults", error.message);
      return defaultExecutiveHomeCronConfig();
    }
    return mergeExecutiveHomeCronConfig(data ?? null);
  } catch (err) {
    console.warn("[build-executive-home-cards] config lookup threw, using defaults", err);
    return defaultExecutiveHomeCronConfig();
  }
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

// Fetch merged (deduped) event slices for today + tomorrow, plus a small
// 2-day lookback used to hydrate `consecutiveOffDaysBefore` for the day-type
// resolver. A day is considered "off" when it is either a weekend day (Sat/Sun)
// OR contains an all-day PTO/holiday event (per the canonical
// `isPtoOrHolidayTitle` detector). The lookback stops at the first working
// day so a mid-week holiday doesn't inflate the count.
async function loadDayTypeEventSlices(
  db: any,
  userId: string,
  localDate: string,
  effectiveTimezone: string,
): Promise<{ todayEvents: any[]; tomorrowEvents: any[]; consecutiveOffDaysBefore: number }> {
  const start = `${localDate}T00:00:00`;
  const end = `${localDate}T23:59:59`;
  const tomorrow = new Date(`${localDate}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowDate = tomorrow.toISOString().slice(0, 10);
  const tStart = `${tomorrowDate}T00:00:00`;
  const tEnd = `${tomorrowDate}T23:59:59`;

  // Lookback: cover the two days immediately preceding today. That's enough
  // for `last_day_long_weekend` (which triggers at ≥2 consecutive off-days).
  const dayBack = (n: number) => {
    const d = new Date(`${localDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  const y1 = dayBack(1);
  const y2 = dayBack(2);

  const [todayRes, tomorrowRes, lookbackRes] = await Promise.all([
    db
      .from("calendar_events")
      .select("id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring,is_all_day,external_id")
      .eq("user_id", userId)
      .gte("start_time", start)
      .lte("start_time", end),
    db
      .from("calendar_events")
      .select("id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring,is_all_day,external_id")
      .eq("user_id", userId)
      .gte("start_time", tStart)
      .lte("start_time", tEnd),
    db
      .from("calendar_events")
      .select("id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring,is_all_day,external_id")
      .eq("user_id", userId)
      .gte("start_time", `${y2}T00:00:00`)
      .lte("start_time", `${y1}T23:59:59`),
  ]);

  // Weekday lookup in the user's local timezone (0=Sun … 6=Sat).
  const weekdayLocal = (isoDate: string): number => {
    const short = new Intl.DateTimeFormat("en-US", {
      timeZone: effectiveTimezone,
      weekday: "short",
    })
      .format(new Date(`${isoDate}T12:00:00Z`))
      .toLowerCase()
      .slice(0, 3);
    return short === "sun" ? 0
      : short === "mon" ? 1
      : short === "tue" ? 2
      : short === "wed" ? 3
      : short === "thu" ? 4
      : short === "fri" ? 5
      : 6;
  };

  const lookbackEvents = mergeCalendarEvents((lookbackRes.data || []) as any[], "unknown") as any[];
  const hasAllDayPtoOn = (isoDate: string) =>
    lookbackEvents.some((e: any) =>
      e.is_all_day === true &&
      isPtoOrHolidayTitle(e.title ?? "") &&
      typeof e.start_time === "string" &&
      e.start_time.slice(0, 10) === isoDate,
    );
  const isOffDay = (isoDate: string) => {
    const dow = weekdayLocal(isoDate);
    return dow === 0 || dow === 6 || hasAllDayPtoOn(isoDate);
  };

  let consecutive = 0;
  for (const iso of [y1, y2]) {
    if (isOffDay(iso)) consecutive += 1;
    else break;
  }

  return {
    todayEvents: mergeCalendarEvents((todayRes.data || []) as any[], "unknown") as any[],
    tomorrowEvents: mergeCalendarEvents((tomorrowRes.data || []) as any[], "unknown") as any[],
    consecutiveOffDaysBefore: consecutive,
  };
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

// Claim the scheduled slot for (user_id, local_date, window). A partial unique
// index on mode='scheduled' guarantees at most one row per window per day.
// Returns the claimed row id, or null if another invocation already claimed it
// (or a prior scheduled attempt already happened — success, skip, or error).
async function claimScheduledSlot(
  db: any,
  row: Record<string, unknown>,
  jobConfig: ExecutiveHomeCronConfig,
): Promise<string | null> {
  const startedAt = new Date().toISOString();
  try {
    const { data, error } = await db
      .from("executive_home_card_runs")
      .insert({
        ...row,
        job_key: JOB_KEY,
        status: "running",
        started_at: startedAt,
        finished_at: null,
        error: null,
        error_json: null,
        trace_json: {
          dispatcherIntervalMinutes: jobConfig.dispatcherIntervalMinutes,
          retryAttempts: jobConfig.retryAttempts,
          retryDelaySeconds: jobConfig.retryDelaySeconds,
        },
      })
      .select("id")
      .maybeSingle();
    if (error) {
      // 23505 unique_violation → slot already taken this window.
      if ((error as any).code === "23505") {
        const { data: existing } = await db
          .from("executive_home_card_runs")
          .select("id, status, retry_count, created_at, trace_json")
          .eq("job_key", JOB_KEY)
          .eq("user_id", row.user_id)
          .eq("local_date", row.local_date)
          .eq("window", row.window)
          .eq("mode", row.mode)
          .maybeSingle();
        if (!existing || existing.status !== "error") return null;
        const retryCount = Number((existing as any).retry_count ?? 0);
        if (retryCount >= jobConfig.retryAttempts) return null;
        const createdAt = new Date((existing as any).created_at ?? 0).getTime();
        if (!Number.isFinite(createdAt)) return null;
        const retryReadyAt = createdAt + jobConfig.retryDelaySeconds * 1000;
        if (Date.now() < retryReadyAt) return null;
        const { error: updateError } = await db
          .from("executive_home_card_runs")
          .update({
            status: "running",
            started_at: startedAt,
            finished_at: null,
            error: null,
            error_json: null,
            retry_count: retryCount + 1,
            trace_json: {
              ...(((existing as any).trace_json ?? {}) as Record<string, unknown>),
              retryCount: retryCount + 1,
              retriedAt: startedAt,
            },
          })
          .eq("id", (existing as any).id);
        if (updateError) {
          console.warn("[build-executive-home-cards] retry claim failed", updateError);
          return null;
        }
        return (existing as any).id ?? null;
      }
      console.warn("[build-executive-home-cards] claim failed", error);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn("[build-executive-home-cards] claim threw", err);
    return null;
  }
}

function buildTrace(args: {
  config: ExecutiveHomeCronConfig;
  effectiveTimezone: string;
  travel: unknown;
  mode: BuildMode;
  localDate: string;
  window: TimeWindow;
  dueWindow?: TimeWindow | null;
  skippedReason?: string | null;
  dayType?: DayTypeDecision | null;
}) {
  return {
    jobKey: JOB_KEY,
    mode: args.mode,
    localDate: args.localDate,
    window: args.window,
    dueWindow: args.dueWindow ?? args.window,
    effectiveTimezone: args.effectiveTimezone,
    config: {
      dispatcherIntervalMinutes: args.config.dispatcherIntervalMinutes,
      retryAttempts: args.config.retryAttempts,
      retryDelaySeconds: args.config.retryDelaySeconds,
      maxUsersPerRun: args.config.maxUsersPerRun,
      windows: args.config.configJson.windows,
      runOnWeekends: args.config.configJson.runOnWeekends,
      respectTravelTimezone: args.config.configJson.respectTravelTimezone,
      dryRun: args.config.configJson.dryRun ?? false,
      // `buildSequence` is intentionally CONFIG-ONLY. The MRS → Brief → Plan
      // order is enforced in code below; the config value is surfaced here
      // only for observability. Reordering it in admin_cron_job_configs will
      // NOT reorder execution — change the code if the sequence must change.
      buildSequence: args.config.configJson.buildSequence,
    },
    travelState: args.travel ?? null,
    skippedReason: args.skippedReason ?? null,
    dayType: args.dayType?.dayType ?? null,
    dayTypeAllowedWindows: args.dayType
      ? Array.from(args.dayType.allowedWindows)
      : null,
    dayTypeEvidence: args.dayType?.evidence ?? null,
    weekAheadReason: args.dayType?.weekAheadReason ?? null,
  };
}

async function finalizeRun(db: any, id: string, patch: Record<string, unknown>) {
  try {
    await db.from("executive_home_card_runs").update(patch).eq("id", id);
  } catch (err) {
    console.warn("[build-executive-home-cards] finalize failed", err);
  }
}

async function buildForUser(db: any, args: {
  userId: string;
  profile: any;
  mode: BuildMode;
  jobConfig: ExecutiveHomeCronConfig;
  requestedWindow?: TimeWindow | null;
  requestedLocalDate?: string | null;
  resolvedTimezone?: Awaited<ReturnType<typeof resolveEffectiveTimezone>>;
  dueWindow?: TimeWindow | null;
}) {
  const started = Date.now();
  const runId = crypto.randomUUID();
  const { userId, profile, mode, jobConfig } = args;
  const timezoneRead = args.resolvedTimezone ?? await resolveEffectiveTimezone(
    db,
    userId,
    profile,
    new Date(),
    { respectTravelTimezone: jobConfig.configJson.respectTravelTimezone },
  );
  const { effectiveTimezone, homeTimezone, travel } = timezoneRead;
  const parts = localParts(effectiveTimezone);
  const localDate = args.requestedLocalDate || parts.localDate;
  const window = args.requestedWindow || args.dueWindow || getWindow(parts.hour);
  const offset = timezoneOffsetMinutes(effectiveTimezone);
  const force = isForceMode(mode);

  const baseLog = {
    run_id: runId,
    job_key: JOB_KEY,
    user_id: userId,
    local_date: localDate,
    effective_timezone: effectiveTimezone,
    window,
    mode,
  };

  // Scheduled cron: enforce hard one-attempt-per-window cap via DB uniqueness.
  // A prior success, skip, or error still counts as that window's one attempt,
  // so a failing user never gets retried every 15 minutes.
  let claimedRunRowId: string | null = null;
  if (mode === "scheduled") {
    claimedRunRowId = await claimScheduledSlot(db, baseLog, jobConfig);
    if (!claimedRunRowId) {
      return {
        userId,
        localDate,
        window,
        status: "skipped",
        skippedReason: "already_attempted_for_window",
        effectiveTimezone,
      };
    }
  }

  const writeRun = async (patch: Record<string, unknown>) => {
    if (claimedRunRowId) {
      await finalizeRun(db, claimedRunRowId, {
        finished_at: new Date().toISOString(),
        ...patch,
      });
    } else {
      await logRun(db, {
        ...baseLog,
        started_at: new Date(started).toISOString(),
        finished_at: new Date().toISOString(),
        trace_json: buildTrace({
          config: jobConfig,
          effectiveTimezone,
          travel,
          mode,
          localDate,
          window,
          dueWindow: args.dueWindow,
          skippedReason: (patch.skipped_reason as string | undefined) ?? null,
          dayType: dayTypeDecision,
        }),
        ...patch,
      });
    }
  };

  if (mode === "dry_run") {
    return {
      userId,
      localDate,
      window,
      status: "dry_run",
      effectiveTimezone,
      timezoneUsed: effectiveTimezone,
      dueWindow: args.dueWindow ?? window,
      skippedReason: null,
    };
  }

  // ---------------------------------------------------------------------------
  // CENTRALIZED DAY-TYPE / CADENCE GATE
  // Runs BEFORE MRS. The orchestrator owns whether this window fires at all.
  // Downstream (compute-outer-readiness / generate-mastery-plan) owns the
  // content generated inside a window the orchestrator chose to run.
  //
  // Scoping: scheduled cron respects the gate strictly. Manual refresh,
  // replay, and backfill ALWAYS proceed — a user pulling to refresh (or an
  // admin replaying a failed run) is an explicit override of cadence.
  // ---------------------------------------------------------------------------
  let dayTypeDecision: DayTypeDecision | null = null;
  try {
    const slices = await loadDayTypeEventSlices(db, userId, localDate, effectiveTimezone);
    dayTypeDecision = resolveDayTypeAndCadence({
      effectiveTimezone,
      now: new Date(),
      todayEvents: slices.todayEvents as any,
      tomorrowEvents: slices.tomorrowEvents as any,
      travel: travel ?? null,
      consecutiveOffDaysBefore: slices.consecutiveOffDaysBefore,
    });
  } catch (err) {
    // Fail-open: never let a day-type lookup take down the orchestrator run.
    console.warn("[build-executive-home-cards] day-type resolve failed", err);
    dayTypeDecision = null;
  }

  if (
    mode === "scheduled" &&
    dayTypeDecision &&
    !dayTypeDecision.allowedWindows.has(window)
  ) {
    await writeRun({
      status: "skipped",
      day_type: dayTypeDecision.dayType,
      mrs_status: "skipped",
      brief_status: "skipped",
      plan_status: "skipped",
      skipped_reason: "day_type_window_suppressed",
      error_json: null,
      duration_ms: Date.now() - started,
    });
    return {
      userId,
      localDate,
      window,
      status: "skipped",
      skippedReason: "day_type_window_suppressed",
      dayType: dayTypeDecision.dayType,
      allowedWindows: Array.from(dayTypeDecision.allowedWindows),
      effectiveTimezone,
    };
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

    console.log("[build-executive-home-cards] compute-inner-readiness input:", {
      userId,
      localDate,
      window,
      latestWearableDate: latest?.summary_date ?? null,
      hasFreshWearable,
      mrsSubScores,
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

    // Diagnostic — surface exactly what compute-inner-readiness returned so
    // we can tell an awaiting run apart from a malformed / null-scored one.
    console.log("[build-executive-home-cards] compute-inner-readiness summary:", {
      userId,
      window,
      score: mrs?.score ?? null,
      scoreBaseline: mrs?.scoreBaseline ?? null,
      scoreRefined: mrs?.scoreRefined ?? null,
      readinessState: mrs?.readinessState ?? null,
      tier: mrs?.tier ?? null,
      mrsAwaitingSignals: mrs?.mrsAwaitingSignals ?? mrs?.awaitingSignals ?? null,
      weightProvenance: mrs?.weightProvenance ?? null,
    });

    // MRS is only genuinely "ready" when compute-inner-readiness returned
    // a numeric score AND a numeric baseline AND is not itself awaiting.
    // Previously we treated any non-awaiting response as ready, which meant
    // a malformed/null-scored payload still marked the run ready and then
    // caused compute-outer-readiness to mirror NULL/awaiting into
    // daily_context_snapshot.
    const mrsWeightProvenanceAwaiting = weightProvenanceIndicatesAwaiting(mrs?.weightProvenance ?? null);
    const mrsIsReady =
      !!mrs &&
      mrs.readinessState !== "awaiting" &&
      typeof mrs.score === "number" &&
      typeof mrs.scoreBaseline === "number" &&
      mrs.mrsAwaitingSignals !== true &&
      mrs.awaitingSignals !== true &&
      !mrsWeightProvenanceAwaiting;
    const mrsIsAwaiting =
      mrs?.readinessState === "awaiting" ||
      mrs?.mrsAwaitingSignals === true ||
      mrs?.awaitingSignals === true ||
      mrsWeightProvenanceAwaiting;
    mrsStatus = mrsIsReady
      ? "ready"
      : mrsIsAwaiting
        ? "awaiting"
        : "awaiting_no_score";

    const hasStageOneSignal = mrsIsReady;
    const brief = await callFunction("compute-outer-readiness", {
      userId,
      innerReadinessTier: mrsIsReady ? (mrs?.tier ?? null) : null,
      innerReadinessScore: mrsIsReady ? (mrs?.score ?? null) : null,
      clarityLevel: checkin?.clarity_level ?? null,
      confidenceLevel: checkin?.confidence_level ?? null,
      emotionLevel: checkin?.emotion_level ?? null,
      pressureLevel: checkin?.pressure_level ?? null,
      regulationLevel: checkin?.regulation_level ?? null,
      checkInOutcome: checkin?.outcome ?? null,
      timezoneOffset: offset,
      currentTimezone: effectiveTimezone,
      homeTimezone,
      localDate,
      mrsWindow: window,
      tierDisplayed: mrsIsReady ? (mrs?.tierDisplayed ?? mrs?.tier ?? null) : null,
      tierCapReason: mrsIsReady ? (mrs?.tierCapReason ?? null) : null,
      innerReadinessScoreBaseline: mrsIsReady ? (mrs?.scoreBaseline ?? null) : null,
      innerReadinessScoreRefined: mrsIsReady ? (mrs?.scoreRefined ?? null) : null,
      innerReadinessState: mrsIsReady ? (mrs?.readinessState ?? "baseline") : "awaiting",
      innerReadinessRefinedContribution: mrsIsReady ? (mrs?.refinedContribution ?? null) : null,
      weightProvenance: mrs?.weightProvenance ?? null,
    }, userId);
    briefStatus = brief?.awaitingSignals ? "awaiting" : "ready";

    let plan: any = null;
    if (window !== "morning") {
      // Cron-written, snapshot-read model: Plan is generated once per day
      // in the morning slot. Afternoon/evening render the morning snapshot
      // via `resolveCanonicalPlanSnapshot` in `get-mastery-plan-snapshot`.
      planStatus = "skipped_non_morning_window";
    } else if (!hasStageOneSignal) {
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

    try {
      const built: string[] = ["mrs", "brief"];
      const skipped: string[] = [];
      if (planStatus === "ready") built.push("plan");
      else skipped.push(`plan(${planStatus})`);
      const briefSnapshotId = brief?.briefSnapshotId ?? brief?.briefId ?? null;
      const briefSnapshotWritten = brief?.briefSnapshotWritten === true;
      const mrsSnapshotWritten = brief?.mrsSnapshotWritten === true;
      console.log(
        `[exec-home-cron] window=${window} user=${userId} localDate=${localDate} built=[${built.join(",")}] skipped=[${skipped.join(",")}] mrsSnapshotWritten=${mrsSnapshotWritten} briefSnapshotWritten=${briefSnapshotWritten} briefSnapshotId=${briefSnapshotId ?? "null"}`,
      );
      if (!mrsSnapshotWritten || !briefSnapshotWritten) {
        console.warn('[exec-home-cron][persistence-gap]', JSON.stringify({
          userId,
          localDate,
          window,
          mrsSnapshotWritten,
          briefSnapshotWritten,
          briefSnapshotId,
          briefStatus,
        }));
      }
    } catch (_) { /* noop */ }

    await writeRun({
      // Orchestrator's centrally-resolved dayType wins; fall back to Plan's
      // downstream dayKind only when the resolver returned no decision.
      day_type:
        dayTypeDecision?.dayType ?? plan?.dayKind ?? plan?.meta?.dayKind ?? null,
      status: "success",
      mrs_status: mrsStatus,
      brief_status: briefStatus,
      plan_status: planStatus,
      error_json: null,
      trace_json: buildTrace({
        config: jobConfig,
        effectiveTimezone,
        travel,
        mode,
        localDate,
        window,
        dueWindow: args.dueWindow,
        dayType: dayTypeDecision,
      }),
      duration_ms: Date.now() - started,
    });
    return {
      userId,
      localDate,
      window,
      status: "success",
      mrsStatus,
      briefStatus,
      planStatus,
      dayType: dayTypeDecision?.dayType ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await writeRun({
      status: "error",
      day_type: dayTypeDecision?.dayType ?? null,
      mrs_status: mrsStatus,
      brief_status: briefStatus,
      plan_status: planStatus,
      error: message,
      error_json: { function_name: JOB_KEY, message, run_id: runId },
      trace_json: buildTrace({
        config: jobConfig,
        effectiveTimezone,
        travel,
        mode,
        localDate,
        window,
        dueWindow: args.dueWindow,
        dayType: dayTypeDecision,
      }),
      duration_ms: Date.now() - started,
    });
    return {
      userId,
      localDate,
      window,
      status: "error",
      error: message,
      effectiveTimezone,
    };
  }
}

async function planDueUsers(
  db: any,
  profiles: any[],
  jobConfig: ExecutiveHomeCronConfig,
  requestedWindow: TimeWindow | null,
  now = new Date(),
) {
  const due: Array<{
    profile: any;
    userId: string;
    resolvedTimezone: Awaited<ReturnType<typeof resolveEffectiveTimezone>>;
    localDate: string;
    window: TimeWindow;
  }> = [];
  const skipped: Array<{
    userId: string;
    reason: string;
    timezoneUsed: string | null;
    localDate: string | null;
    expectedWindow: TimeWindow | null;
  }> = [];

  for (const profile of profiles) {
    const userId = profile.id as string | undefined;
    if (!userId) continue;
    const resolvedTimezone = await resolveEffectiveTimezone(
      db,
      userId,
      profile,
      now,
      { respectTravelTimezone: jobConfig.configJson.respectTravelTimezone },
    );
    const local = localParts(resolvedTimezone.effectiveTimezone, now);
    const dueWindow = resolveDueWindow(resolvedTimezone.effectiveTimezone, now, jobConfig);
    if (!dueWindow) {
      skipped.push({
        userId,
        reason: jobConfig.enabled ? "not_due_now" : "job_disabled",
        timezoneUsed: resolvedTimezone.effectiveTimezone,
        localDate: local.localDate,
        expectedWindow: null,
      });
      continue;
    }
    if (requestedWindow && dueWindow !== requestedWindow) {
      skipped.push({
        userId,
        reason: "window_filter_mismatch",
        timezoneUsed: resolvedTimezone.effectiveTimezone,
        localDate: local.localDate,
        expectedWindow: dueWindow,
      });
      continue;
    }
    due.push({
      profile,
      userId,
      resolvedTimezone,
      localDate: local.localDate,
      window: dueWindow,
    });
  }

  return { due, skipped };
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
    const jobConfig = await loadJobConfig(db);
    const configErrors = validateWindowConfig(jobConfig.configJson.windows);
    if (configErrors.length > 0) {
      return json({ error: "invalid_job_config", details: configErrors }, 500);
    }
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

    if ((mode === "scheduled" || mode === "dry_run") && !requestedUserId) {
      if (!jobConfig.enabled && mode === "scheduled") {
        return json({
          mode,
          jobKey: JOB_KEY,
          status: "disabled",
          nextExpectedRun: nextExpectedRunAt(new Date(), jobConfig.dispatcherIntervalMinutes),
          config: jobConfig,
          results: [],
        });
      }

      const planning = await planDueUsers(db, profiles, jobConfig, requestedWindow);
      const dueLimited = planning.due.slice(0, jobConfig.maxUsersPerRun);
      const skippedOverflow = planning.due.slice(jobConfig.maxUsersPerRun).map((row) => ({
        userId: row.userId,
        reason: "max_users_per_run_reached",
        timezoneUsed: row.resolvedTimezone.effectiveTimezone,
        localDate: row.localDate,
        expectedWindow: row.window,
      }));

      if (mode === "dry_run" || jobConfig.configJson.dryRun === true) {
        return json({
          mode: "dry_run",
          jobKey: JOB_KEY,
          config: jobConfig,
          totalActiveUsers: profiles.length,
          dueUsers: dueLimited.length,
          skippedUsers: planning.skipped.length + skippedOverflow.length,
          nextExpectedRun: nextExpectedRunAt(new Date(), jobConfig.dispatcherIntervalMinutes),
          results: dueLimited.map((row) => ({
            userId: row.userId,
            localDate: row.localDate,
            window: row.window,
            timezoneUsed: row.resolvedTimezone.effectiveTimezone,
            status: "dry_run",
          })),
          skipped: [...planning.skipped, ...skippedOverflow],
        });
      }

      const results = [];
      for (const row of dueLimited) {
        results.push(await buildForUser(db, {
          userId: row.userId,
          profile: row.profile,
          mode,
          jobConfig,
          requestedWindow: row.window,
          requestedLocalDate: row.localDate,
          resolvedTimezone: row.resolvedTimezone,
          dueWindow: row.window,
        }));
      }
      return json({
        mode,
        jobKey: JOB_KEY,
        config: jobConfig,
        totalActiveUsers: profiles.length,
        dueUsers: dueLimited.length,
        skippedUsers: planning.skipped.length + skippedOverflow.length,
        nextExpectedRun: nextExpectedRunAt(new Date(), jobConfig.dispatcherIntervalMinutes),
        results,
        skipped: [...planning.skipped, ...skippedOverflow],
      });
    }

    const results = [];
    for (const profile of profiles) {
      const userId = profile.id;
      if (!userId) continue;
      results.push(await buildForUser(db, {
        userId,
        profile,
        mode,
        jobConfig,
        requestedWindow,
        requestedLocalDate,
      }));
    }

    return json({ mode, jobKey: JOB_KEY, config: jobConfig, results });
  } catch (err) {
    console.error("[build-executive-home-cards] fatal", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
