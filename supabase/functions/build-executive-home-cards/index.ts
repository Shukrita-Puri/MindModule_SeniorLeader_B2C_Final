import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMrsV4SubScores } from "../_shared/signal-engine/mrs-v4-subscores.ts";
import { composeDailyContext } from "../_shared/signal-engine/build-daily-context.ts";
import { computeCalendarDemand } from "../_shared/signal-engine/demand-scorer.ts";
import { deriveEveningPhysioSource } from "../_shared/signal-engine/evening-physio-source.ts";
import {
  maxWearableAgeDaysForWindow,
  type SignalWindow,
} from "../_shared/signal-engine/signal-freshness.ts";
import { classifyDay } from "../_shared/availability/availability-classifier.ts";
import { applyDayOverlapFilter, eventOverlapsDay } from "../_shared/signal-engine/db-queries.ts";
import { mergeCalendarEvents } from "../_shared/rules/calendarEvents.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
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
type BuildModeInput = BuildMode | "checkin_save";
const JOB_KEY = "executive_home_cards";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-dev-user-id, x-mm-client-platform",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getWindow(hour: number): TimeWindow {
  if (hour >= 4 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

function isForceMode(mode: BuildMode) {
  return mode === "manual_refresh" || mode === "manual_replay" || mode === "backfill" || mode === "dry_run";
}

function normalizeBuildMode(mode: unknown): BuildMode | null {
  if (mode === "checkin_save") return "manual_refresh";
  if (
    mode === "scheduled" ||
    mode === "manual_refresh" ||
    mode === "manual_replay" ||
    mode === "backfill" ||
    mode === "dry_run"
  ) {
    return mode;
  }
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

/**
 * MRS v4 — Morning demand is split between today's scheduled load and
 * yesterday's realised load (carryover). Yesterday sits in the DEMAND
 * pillar, not the pattern pillar.
 */
async function yesterdayDemand(db: any, userId: string, localDate: string): Promise<number | null> {
  try {
    const prev = new Date(`${localDate}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const day = prev.toISOString().slice(0, 10);
    const { data } = await db
      .from("calendar_events")
      .select("start_time,end_time,is_organizer,attendees_count,is_recurring,title,event_metadata,provider,external_id,id")
      .eq("user_id", userId)
      .gte("start_time", `${day}T00:00:00`)
      .lte("start_time", `${day}T23:59:59`);
    const merged = mergeCalendarEvents((data || []) as any[], "unknown") as any[];
    return computeCalendarDemand(merged as any).demandScore;
  } catch {
    return null;
  }
}

// Fetch merged (deduped) event slices for today + tomorrow, plus a small
// 2-day lookback used to hydrate `consecutiveOffDaysBefore` for the day-type
// resolver. Lookback "off day" classification is delegated to the canonical
// availability SSOT via `classifyDay`, so foreign FYI/regional holidays and
// empty weekdays cannot silently count as off-days here.
async function loadDayTypeEventSlices(
  db: any,
  userId: string,
  localDate: string,
  effectiveTimezone: string,
  userHomeCountry?: string | null,
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

  // Availability SSOT v2: OVERLAP, not start-inside-the-day. A multi-day
  // hotel stay / OOO block must be visible on every day it covers.
  const [todayRes, tomorrowRes, lookbackRes] = await Promise.all([
    applyDayOverlapFilter(
      db.from("calendar_events").select("id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring,is_all_day,external_id").eq("user_id", userId),
      start,
      end,
    ),
    applyDayOverlapFilter(
      db.from("calendar_events").select("id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring,is_all_day,external_id").eq("user_id", userId),
      tStart,
      tEnd,
    ),
    applyDayOverlapFilter(
      db.from("calendar_events").select("id,title,start_time,end_time,provider,event_metadata,attendees_count,is_organizer,is_recurring,is_all_day,external_id").eq("user_id", userId),
      `${y2}T00:00:00`,
      `${y1}T23:59:59`,
    ),
  ]);
  const lookbackEvents = mergeCalendarEvents((lookbackRes.data || []) as any[], "unknown") as any[];
  const isOffDay = (isoDate: string) => {
    const rows = lookbackEvents.filter((e: any) =>
      eventOverlapsDay(e, `${isoDate}T00:00:00`, `${isoDate}T23:59:59`),
    );
    const localDay = new Date(`${isoDate}T12:00:00Z`);
    const r = classifyDay({
      now: localDay,
      userHomeCountry: userHomeCountry ?? null,
      userCurrentCountry: null,
      events: rows.map((e: any) => ({
        title: String(e?.title ?? ""),
        startTime: String(e?.start_time ?? ""),
        endTime: String(e?.end_time ?? e?.start_time ?? ""),
        isAllDay: e?.is_all_day === true,
        isOrganizer: e?.is_organizer === true,
        attendeesCount: Number(e?.attendees_count ?? 0) || 0,
        source: e?.source ?? e?.calendar_name ?? null,
        calendarSummary: e?.calendar_summary ?? null,
      })),
    });
    return r.isOffDay;
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

async function latestWearable(db: any, userId: string, localDate?: string) {
  const { data: latest } = await db
    .from("wearable_data")
    .select("summary_date,hrv,resting_heart_rate,sleep_score,total_sleep_minutes,hr_samples")
    .eq("user_id", userId)
    .order("summary_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // MRS v4 — baselines must be a true 30-DAY window, not "last 30 rows".
  // A row-count limit silently reaches back months for sparse syncers and
  // produces a different HRV baseline than the signal-pill path.
  const anchor = localDate ?? (latest?.summary_date as string | undefined) ??
    new Date().toISOString().slice(0, 10);
  const windowStart = new Date(`${anchor}T00:00:00Z`);
  windowStart.setUTCDate(windowStart.getUTCDate() - 29);
  const { data: rows } = await db
    .from("wearable_data")
    .select("hrv,resting_heart_rate")
    .eq("user_id", userId)
    .gte("summary_date", windowStart.toISOString().slice(0, 10))
    .lte("summary_date", anchor)
    .order("summary_date", { ascending: false });

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
  return await _latestCheckin(db, userId, localDate, window);
}

/**
 * MRS v4 — calendar availability is a PILLAR, not an event count.
 * `connected_no_events` is earned data (a genuinely empty day);
 * `not_connected` is missing data and must block MRS formation.
 */
async function resolveCalendarState(
  db: any,
  userId: string,
  eventCount: number,
): Promise<"active" | "connected_no_events" | "not_connected"> {
  if (eventCount > 0) return "active";
  try {
    const { data } = await db
      .from("calendar_connections")
      .select("id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1);
    return Array.isArray(data) && data.length > 0 ? "connected_no_events" : "not_connected";
  } catch {
    return "not_connected";
  }
}

async function _latestCheckin(db: any, userId: string, localDate: string, window: TimeWindow) {
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
    // Fix 3: skipIfAlreadyReady logic
    const [{ data: existingSnapshot }, { data: existingBrief }] = await Promise.all([
      db
        .from("daily_context_snapshot")
        .select("readiness_state")
        .eq("user_id", userId)
        .eq("local_date", localDate)
        .eq("mrs_window", window)
        .maybeSingle(),
      db
        .from("brief_snapshots")
        .select("baseline_state, refined_state")
        .eq("user_id", userId)
        .eq("local_date", localDate)
        .eq("time_window", window)
        .maybeSingle()
    ]);

    const mrsReady = existingSnapshot?.readiness_state === "published" || existingSnapshot?.readiness_state === "partial";
    const briefReady = existingBrief?.baseline_state === "baseline" || existingBrief?.refined_state === "refined";
    
    if (mrsReady && briefReady) {
      return {
        userId,
        localDate,
        window,
        status: "skipped",
        skippedReason: "already_ready_from_client",
        effectiveTimezone,
      };
    }

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
  let dayTypeSlices: { todayEvents: any[]; tomorrowEvents: any[]; consecutiveOffDaysBefore: number } | null = null;
  try {
    const slices = await loadDayTypeEventSlices(
      db,
      userId,
      localDate,
      effectiveTimezone,
      profile?.country ?? null,
    );
    dayTypeSlices = slices;
    dayTypeDecision = resolveDayTypeAndCadence({
      effectiveTimezone,
      now: new Date(),
      userHomeCountry: profile?.country ?? null,
      userCurrentCountry: null,
      todayEvents: slices.todayEvents as any,
      tomorrowEvents: slices.tomorrowEvents as any,
      travel: (travel ?? null) as Record<string, unknown> | null,
      currentTimezone: profile?.current_timezone ?? null,
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
    const [context, eventCount, wearable, checkin, existingMrsSnapshot] = await Promise.all([
      composeDailyContext(db, userId, localDate, { dryRun: true, timezone: effectiveTimezone, mrsWindow: window }),
      countTodayEvents(db, userId, localDate),
      latestWearable(db, userId, localDate),
      latestCheckin(db, userId, localDate, window),
      db
        .from("daily_context_snapshot")
        .select("readiness_score_baseline, readiness_state")
        .eq("user_id", userId)
        .eq("local_date", localDate)
        .eq("mrs_window", window)
        .maybeSingle()
        .then((res: { data: unknown; error: { message: string } | null }) => {
          const { data, error } = res;
          if (error) {
            console.warn("[build-executive-home-cards] existing MRS snapshot read failed", {
              userId,
              localDate,
              window,
              error: error.message,
            });
            return null;
          }
          return data as { readiness_score_baseline?: number | null; readiness_state?: string | null } | null;
        }),
    ]);
    const baselineAnchorScore =
      checkin &&
      existingMrsSnapshot?.readiness_state !== "awaiting" &&
      typeof existingMrsSnapshot?.readiness_score_baseline === "number" &&
      Number.isFinite(existingMrsSnapshot.readiness_score_baseline)
        ? Math.max(0, Math.min(100, Math.round(existingMrsSnapshot.readiness_score_baseline)))
        : null;
    if (baselineAnchorScore != null) {
      console.info("[build-executive-home-cards] using same-window MRS baseline anchor", {
        userId,
        localDate,
        window,
        baselineAnchorScore,
      });
    }

    const latest = wearable.latest;
    // Window-aware freshness: morning accepts a 0- or 1-day-old row,
    // afternoon/evening require same-day — except the evening overnight slice
    // (local 00:00-04:59), where the prior day's row is the current physiology.
    // Same canonical rule as the pills.
    const maxWearableAge = maxWearableAgeDaysForWindow(
      window as SignalWindow,
      parts.hour,
    );

    const wearableAgeDays = latest?.summary_date
      ? Math.round(
        (new Date(localDate + "T00:00:00Z").getTime() -
          new Date(latest.summary_date + "T00:00:00Z").getTime()) / 86400000,
      )
      : null;
    const hasFreshWearable = !!latest && wearableAgeDays !== null &&
      wearableAgeDays >= 0 && wearableAgeDays <= maxWearableAge;
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

    const calendarState = await resolveCalendarState(db, userId, eventCount);
    const yesterdayDemandScore = window === "morning"
      ? (calendarState === "not_connected" ? null : await yesterdayDemand(db, userId, localDate))
      : null;
    // Earned zero: a connected calendar with no events scores demand 0.
    // Not connected: demand is genuinely missing and the pillar stays unmet.
    const demandScore = eventCount > 0
      ? context.calendarDemandScore
      : calendarState === "connected_no_events"
        ? 0
        : null;
    // MRS v4 — tomorrow's opening demand must come from TOMORROW's own events,
    // never from a copy of today's demand. Zero/null semantics are preserved:
    // not connected -> null (unearned); connected with no tomorrow events -> 0
    // (earned, zero-demand credit); events -> calculated demand.
    const tomorrowDemandScore = window === "evening"
      ? (calendarState === "not_connected" || dayTypeSlices == null
          ? null
          : computeCalendarDemand((dayTypeSlices.tomorrowEvents || []) as any).demandScore)
      : null;
    // MRS v4 — independent evening physiological read (local 18:00–04:59 HR
    // samples vs the 30-day RHR baseline). Without this the evening 32.5pt
    // cell reused the morning HRV deviation already scored at 8.75.
    const eveningPhysio = window === "evening" && hasFreshWearable
      ? deriveEveningPhysioSource((latest as any)?.hr_samples ?? null, wearable.rhrBaseline, offset)
      : { eveningHrDeviationPct: null, bodyLoadElevated: null, sampleCount: 0 };
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
      tomorrowOpeningDemand: tomorrowDemandScore,
      eveningHrDeviationPct: eveningPhysio.eveningHrDeviationPct,
      bodyLoadElevated: eveningPhysio.bodyLoadElevated,
      patternScore: null,
      yesterdayCarryoverDemand: yesterdayDemandScore,
    });

    console.log("[build-executive-home-cards] compute-inner-readiness input:", {
      userId,
      localDate,
      window,
      latestWearableDate: latest?.summary_date ?? null,
      hasFreshWearable,
      yesterdayDemandScore,
      todayDemandScore: demandScore,
      tomorrowDemandScore,
      eveningPhysioSampleCount: eveningPhysio.sampleCount,
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
      hasCalendarSignal: calendarState !== "not_connected",
      calendarState,
      patternSignals: context.patternSignals,
      mrsWindow: window,
      mrsSubScores,
      baselineAnchorScore,
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

    // Write to inner_readiness_scores for Insights historical timeseries (MRS Fix I1)
    const scoreToWrite = typeof mrs?.score === "number" ? mrs.score : typeof mrs?.scoreBaseline === "number" ? mrs.scoreBaseline : null;
    if (scoreToWrite != null) {
      try {
        const { error: irsErr } = await db
          .from("inner_readiness_scores")
          .upsert(
            {
              user_id: userId,
              score_date: localDate,
              composite_score: Math.round(scoreToWrite),
              energy_tier: mrs.tierDisplayed ?? mrs.tier ?? "managing",
              time_of_day: window,
              check_in_outcome: checkin?.outcome ?? null,
              clarity_level: checkin?.clarity_level ?? null,
              confidence_level: checkin?.confidence_level ?? null,
              full_context_statement: mrs.contextStatement ?? null,
              divergence_overlay: mrs.layer3Statement ?? null,
              divergence_flag: mrs.divergenceFlag ?? "ALIGNED",
              hrv_deviation: mrs.hrvDeviation ?? null,
              layers_active: mrs.alreadyUsed ?? mrs.layersActive ?? ["base"],
              data_sources: mrs.dataSources ?? [],
              confidence: mrs.confidence ?? "low",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id,score_date,time_of_day" }
          );

        if (irsErr) {
          console.warn("[build-executive-home-cards] inner_readiness_scores upsert error:", irsErr.message);
        } else {
          console.log("[build-executive-home-cards] ✅ inner_readiness_scores written for:", redactUserId(userId), localDate, window);
        }
      } catch (irsEx) {
        console.warn(
          "[build-executive-home-cards] inner_readiness_scores upsert threw:",
          irsEx instanceof Error ? irsEx.message : irsEx
        );
      }
    }

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
      // Manual refresh / replay / backfill: bypass the brief snapshot replay
      // so the Brief is rebuilt from the CURRENT signals. Scheduled cron runs
      // never set this, so their cache behaviour and LLM volume are unchanged.
      forceRefresh: force,
    }, userId);
    briefStatus = brief?.awaitingSignals ? "awaiting" : "ready";

    let plan: any = null;
    // Manual refresh is an explicit user action: it must always regenerate
    // Plan for the requested (userId, localDate, window), even when
    // hasStageOneSignal is false. Scheduled/backfill/replay/dry_run keep
    // the existing stage-one gating.
    const shouldForcePlanOnManualRefresh = mode === "manual_refresh";
    const planCanForm = mrsIsReady && briefStatus === "ready";
    const skippedStageOneGate = shouldForcePlanOnManualRefresh && !planCanForm;
    
    if (!planCanForm && !shouldForcePlanOnManualRefresh) {
      planStatus = "skipped_upstream_not_ready";
    } else {
      if (shouldForcePlanOnManualRefresh) {
        console.log('[build-executive-home-cards][manual-refresh-plan]', JSON.stringify({
          userId,
          localDate,
          window,
          mode,
          forced: true,
          skippedStageOneGate,
        }));
      }
      // Context-aware Plan: generated for every window (morning / afternoon
      // / evening). Each window persists its own `mastery_plan_snapshots`
      // row keyed on (user_id, plan_date, mrs_window), so afternoon/evening
      // regeneration reflects updated calendar, physiology, and check-in
      // context without clobbering earlier windows for the same day. The
      // reader (`get-mastery-plan-snapshot`) resolves current-window first
      // and falls back to the latest ready row for the day.
      try {
        plan = await callFunction("generate-mastery-plan", {
          timezoneOffset: offset,
          localDate,
          forceRefresh: force,
          currentTimezone: effectiveTimezone,
          homeTimezone,
          userHomeCountry: profile?.country ?? null,
          userCurrentCountry: null,
          travelState: travel ?? null,
          preferJitV2: true,
          outerReadinessCache: brief,
        // F1 — bind Plan persistence to the exact window this orchestrator
        // run is for (morning/afternoon/evening). Without this, the Plan
        // derives a window from wall-clock, so a manual refresh or backfill
        // executed at a different real-time period would persist into the
        // wrong (user, plan_date, mrs_window) row.
          mrsWindow: window,
        // F2 — strict Brief→Plan handshake for the Executive Home snapshot
        // path. The Plan MUST reason over the same-window persisted Brief
        // behaviour snapshot (or the inline snapshot from this same request).
        // A silent local rebuild here is a drift risk; treat it as awaiting
        // instead so the snapshot state stays honest.
          strictBriefHandshake: true,
        }, userId);

        // Honest status derivation: never assume "ready" from HTTP 200.
        const awaitingSignals =
          plan?.awaitingSignals === true ||
          plan?.planState === "awaiting_signals" ||
          plan?.status === "awaiting";
        // Rest-day is a valid ready Plan with zero modules. Recognize it
        // so the orchestrator doesn't downgrade it to awaiting.
        const isRestDayPlan =
          plan?.meta?.restDay === true ||
          plan?.meta?.dayShape === "rest_day" ||
          plan?.restDay === true;
        const hasRenderable =
          !!plan &&
          !awaitingSignals &&
          (
            isRestDayPlan ||
            (Array.isArray(plan?.horizonModules) && plan.horizonModules.length > 0) ||
            (Array.isArray(plan?.timeOfDayModules) && plan.timeOfDayModules.length > 0) ||
            (Array.isArray(plan?.priorities) && plan.priorities.length > 0)
          );
        planStatus = hasRenderable ? "ready" : awaitingSignals ? "awaiting" : "awaiting";

        console.log('[build-executive-home-cards][plan-summary]', JSON.stringify({
          userId,
          localDate,
          window,
          mode,
          forced: shouldForcePlanOnManualRefresh,
          awaitingSignals,
          planState: plan?.planState ?? null,
          reason: plan?.reason ?? plan?.awaitingReason ?? null,
          horizonModulesCount: Array.isArray(plan?.horizonModules) ? plan.horizonModules.length : 0,
          timeOfDayModulesCount: Array.isArray(plan?.timeOfDayModules) ? plan.timeOfDayModules.length : 0,
          derivedPlanStatus: planStatus,
        }));
      } catch (planErr) {
        const message = planErr instanceof Error ? planErr.message : String(planErr);
        planStatus = "error";
        console.warn('[build-executive-home-cards][plan-summary]', JSON.stringify({
          userId,
          localDate,
          window,
          mode,
          forced: shouldForcePlanOnManualRefresh,
          awaitingSignals: null,
          planState: null,
          reason: message,
          horizonModulesCount: 0,
          timeOfDayModulesCount: 0,
          derivedPlanStatus: planStatus,
        }));
      }
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
    const cronSharedSecret = Deno.env.get("CRON_SHARED_SECRET") ?? "";
    const cronSecretHeader = req.headers.get("x-cron-secret") ?? "";
    const body = await req.json().catch(() => ({}));
    const requestedMode = (body.mode ?? "scheduled") as BuildModeInput;
    const mode = normalizeBuildMode(requestedMode);
    if (!mode) {
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
    // Scheduled cron must present a real shared secret (or the service role).
    // Accepting a plain Bearer/apikey value made the endpoint reachable with
    // the public anon key, which is a critical auth bypass. The only trusted
    // scheduled callers are pg_cron (via CRON_SHARED_SECRET, sourced from
    // vault) and internal service-role invocations.
    const hasValidCronSecret =
      cronSharedSecret.length > 0 &&
      cronSecretHeader.length > 0 &&
      cronSecretHeader === cronSharedSecret;
    const isScheduledCredentialedCall =
      mode === "scheduled" && hasValidCronSecret;
    void apiKeyHeader; // preserved for observability; no longer used for auth
    if (mode === "scheduled" && !isServiceRoleCall && !isScheduledCredentialedCall) {
      return json({ error: "unauthorized_scheduled_call" }, 401);
    }
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
