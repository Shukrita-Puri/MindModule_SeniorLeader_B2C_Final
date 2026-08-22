/**
 * cause-effect-engine (v2)
 *
 * Powers the unified "Performance Causality" card on the Insights page.
 * Produces 5 sources of cause→effect findings with two-tier confidence:
 *
 *   Lens A — Events / calendar load → Physiology
 *     • Per event-type (HRV / RHR delta vs non-event days)
 *     • Calendar-load tertile (high-load days vs rest) — NEW, doesn't depend
 *       on event-title keywords so every wearable-equipped user gets coverage
 *   Lens B — Events → Cognition (most-impacted dim per event-type)
 *   Lens C — Sleep → Next-day decision quality (PRS / morning sharpness / clarity)
 *   Lens D — Consecutive heavy-day streaks → PRS / HRV
 *
 * Confidence tiers (sent to UI as a pill):
 *   strong   — n ≥ 5 AND |Δ| ≥ MIN_DELTA_PCT_STRONG / 1.0 tier
 *   emerging — n ≥ 3 AND |Δ| ≥ MIN_DELTA_PCT_EMERGING / 0.5 tier
 * Anything below "emerging" is dropped (CEO contract preserved).
 *
 * Auth: Auth0 JWT via verifyAuth0JWT.
 * Storage: cached daily in `causality_findings` (service-role only).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import {
  EVENT_TYPE_KEYWORDS as SHARED_EVENT_TYPE_KEYWORDS,
  dedupeCalendarEvents,
} from "../_shared/events/event-classifier.ts";
import { PILLAR_META, type Pillar } from "../_shared/events/event-subtypes.ts";
import { type ResolveEventInput } from "../_shared/events/resolve-event-category.ts";
import { enrich as enrichCalendarEvent, patternBucketFor } from "../_shared/events/pattern-bucket.ts";
import { EVENT_CATEGORIES, type EventCategoryId } from "../_shared/events/event-categories.ts";
import {
  getSubcategoryForEvent,
  loadPriorityMemoryForUser,
  type PriorityMemoryIndex,
} from "../_shared/plan/event-priority-memory.ts";
import {
  buildWearableDiagnostics,
  type WearableDiagnostics,
} from "./_diagnostics.ts";
import { dayOfWeekFromIsoDate } from "../_shared/signal-engine/day-kind-detector.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// ── Tunables ───────────────────────────────────────────────────────────
const WINDOW_DAYS = 60;
const MIN_OCCURRENCES_EMERGING = 3;
const MIN_OCCURRENCES_STRONG = 5;
const MIN_DELTA_PCT_EMERGING = 10;
const MIN_DELTA_PCT_STRONG = 15;
const MIN_TIER_DELTA_EMERGING = 0.5;
const MIN_TIER_DELTA_STRONG = 1.0;
const RECOVERY_TOLERANCE_PCT = 5;
const RECOVERY_LOOKAHEAD_DAYS = 7;

/**
 * Bump this when scoring/classification logic changes so that any cached
 * row missing this version is treated as stale and recomputed automatically.
 */
/**
 * v4 adds `signal_summary.performance_lift` — positive-side correlations
 * (event subtype/category thrive matrix using event-window peak HR vs
 * resting baseline, sleep → next-day lift, RHR-recovery best-window,
 * recovery-streak → peak). Reads from the new A–H event taxonomy via
 * `classifyEventCanonical`. See mem://architecture/unified-pattern-store.
 *
 * v5 adds `recoveryByEvent` to the payload — per event-type (A–H taxonomy)
 * recovery-days based on Heart Rate (RHR). HRV is intentionally excluded
 * here because it's a daily morning signal and too coarse for event-level
 * recovery tracking; Heart Rate is the canonical event-window signal.
 *
 * v6 adds `diagnostics` — explicit gate-failure reasons + raw counts
 * (sleep_score_day_count, rhr_day_count, hr_samples_day_count,
 * recovered-day count, per-window bucket counts) so a missing block
 * always reports WHY. Persisted to `wearable_signal_diagnostics`. No
 * existing gate is loosened. See _diagnostics.ts and
 * mem://reliability/wearable-signal-diagnostics.
 */
// v7: Stress Load buckets a full Mon–Sun week (weekend events no longer dropped).
const ENGINE_VERSION = 12;

// ── Types ──────────────────────────────────────────────────────────────
type Lens = "A" | "B" | "C" | "D";
type Direction = "negative" | "positive";
type Confidence = "strong" | "emerging";

interface Finding {
  lens: Lens;
  cause: string;
  effectSignal: string;
  unit: string;
  baseline: number;
  observed: number;
  deltaAbs: number;
  deltaPct: number;
  n: number;
  recoveryDays: number | null;
  direction: Direction;
  confidence: Confidence;
  longText: string;
}

interface Coverage {
  hasCalendar: boolean;
  hasWearable: boolean;
  hasWearableSleep: boolean;
  checkinCount: number;
  briefCount: number;
  wearableDayCount: number;
  eventCount: number;
  eventTypesIdentified: number;
  // Why each lens is empty (short, data-honest reason). Always populated.
  lensReasons: {
    A: string | null;
    B: string | null;
    C: string | null;
    D: string | null;
  };
}

interface Payload {
  top: Finding | null;
  lensA: Finding[];
  lensB: Finding[];
  lensC: Finding[];
  lensD: Finding[];
  coverage: Coverage;
  generatedAt: string;
  version: number;
  // ── New v3 projections (UI: Performance Causality card tabs) ─────────
  // PROPRIETARY LOGIC NOTICE: All formulas, weights, modifiers, baselines,
  // and signal-combination rules live in this Edge Function source only.
  // The payload exposes ONLY rendered numbers, opacities, sample sizes,
  // confidence tiers, colors, and short pre-baked banner copy. The UI
  // never receives the formula or its breakdown, so the protected logic
  // is never inspectable from the client.
  stressMatrix?: StressMatrix;
  burnoutMatrix?: BurnoutMatrix;
  /**
   * v5 — per event-type recovery time (in days) after that event class,
   * derived from Heart Rate (RHR) returning within ±5% of baseline. HRV
   * intentionally excluded — too coarse for event-level recovery tracking.
   * Uses the canonical A–H event taxonomy via lensA findings.
   */
  recoveryByEvent?: RecoveryByEvent | null;
  // Computed silently per spec — engine measures these so the UI can
  // surface them later without a separate backfill. The card does not
  // currently render these tabs.
  sleepDisruptionMatrix?: StressMatrix | null;
  recoveryCostTimeline?: RecoveryTimeline | null;
  /**
   * v6 — gate-failure diagnostics for the Apple Health-derived blocks.
   * Always present so the UI can render a data-honest reason line when
   * a block is null. See `_diagnostics.ts` for the sentinel taxonomy.
   */
  diagnostics?: WearableDiagnostics;
}

// ── Tabbed-card matrix shapes (presentation-ready, formula-free) ────────
interface StressMatrix {
  events: string[];               // column headers (A–H category names)
  categoryNames?: string[];        // canonical A-H category names, parallel to events
  days: string[];                 // row headers (Mon..Sun)
  cells: (number | null)[][];     // value to render (e.g. peak HR delta in bpm); null = no data
  n: number[][];                  // sample size per cell
  /** Subtype label of the event that produced the cell's peak value. */
  subLabels?: (string | null)[][];
  confidence: (Confidence | null)[][];
  maxObserved: number;            // for client-side ramp scaling
  topCell: { event: string; day: string; value: number } | null;
  lowCell: { event: string; day: string; value: number } | null;
  topDay: { day: string; total: number } | null;
}

interface BurnoutMatrix {
  weeks: string[];                                  // 5 labels: '4 wks ago' .. 'This week'
  dims: Array<{
    key: 'load' | 'rhr' | 'hrv' | 'sleep';
    label: string;
    color: string;                                  // hex from spec, ramp via opacity client-side
    weekly: Array<number | null>;                   // 1-5 intensity per week; null = insufficient data
    trajectory: 'escalating' | 'stable' | 'improving';
  }>;
  cardTrajectory: 'escalating' | 'stable' | 'improving';
  bannerCopy: string;                               // pre-baked, no formula reveal
}
interface RecoveryTimeline {
  days: string[];                                   // ISO dates
  values: (number | null)[];                        // recovery-cost score per day
  rolling7: (number | null)[];
}

// ── v5: Per event-type recovery time (Heart Rate based) ────────────────
interface RecoveryByEventEntry {
  eventType: string;          // canonical A–H taxonomy label (from lensA.cause)
  recoveryDays: number;       // mean days for RHR to return within ±5% of baseline
  rhrDeltaBpm: number;        // mean event-day RHR − baseline (bpm), positive = elevation
  n: number;                  // sample size of event days
  confidence: Confidence;
  lastSeen: string;           // ISO date of most recent event in this category
}
interface RecoveryByEvent {
  entries: RecoveryByEventEntry[];          // sorted desc by recoveryDays
  maxRecoveryDays: number;                  // for client-side bar scaling
  topEntry: RecoveryByEventEntry | null;
}

// ── Unified pattern store: flat projection for fast O(1) reads by other
// edge functions (smart-nudges in particular). Mirrors values already in
// `payload` but in a shape that does not require parsing the full Insights
// payload. Stored alongside payload in the same row.
interface SignalSummary {
  event_to_hrv: Array<{
    event_type: string;
    n: number;
    hrvDeltaPct: number;
    rhrElevated: boolean;
    confidence: Confidence;
    lastSeen: string;
  }>;
  event_to_rhr: Array<{
    event_type: string;
    n: number;
    rhrDeltaPct: number;
    confidence: Confidence;
    lastSeen: string;
  }>;
  event_to_cognition: Array<{
    event_type: string;
    dim: string;
    tierDelta: number;
    n: number;
    confidence: Confidence;
  }>;
  sleep_to_prs: { lowSleepPrsDeltaPct: number; n: number; confidence: Confidence } | null;
  consecutive_load: { tailDeltaPct: number; n: number; confidence: Confidence } | null;
  /**
   * v4 — positive correlations powering the "When You Perform Best" card.
   * Heart Rate (not HRV) for event windows — HRV is a daily morning signal
   * and is too coarse for per-event causation. Daily HRV stays elsewhere in
   * this summary as recovery context only.
   */
  performance_lift?: PerformanceLift;
  generatedAt: string;
}

// ── v4: Performance Lift projections ──────────────────────────────────
// Shape mirrors the unified-pattern-store extension rule: small, flat,
// pre-projected arrays the UI can render with no client-side math.
type TimeWindow = "morning" | "afternoon" | "evening";
interface PerformanceLift {
  /** Per EVENT_TYPE subtype: mean event-window peak HR delta + composite lift. */
  hr_event_lift: Array<{
    eventTypeId: string;
    bucket: string;
    categoryId: EventCategoryId;
    categoryName: string;
    hrDeltaBpm: number;       // mean peak HR − resting baseline (bpm)
    compositeLift: number;    // pct delta in same-day PRS vs window baseline
    n: number;
    confidence: Confidence;
    lastSeen: string;
  }>;
  /** Rollup of hr_event_lift to A–H categories. */
  category_lift: Array<{
    categoryId: EventCategoryId;
    categoryName: string;
    hrDeltaBpm: number;
    compositeLift: number;
    n: number;
    confidence: Confidence;
  }>;
  /**
   * Rollup of hr_event_lift to (categoryId, subcategoryId). Subcategory id
   * is derived from the canonical subtype id (`str.deep_work` → `deep_work`).
   * Consumed by the Insights Stress Load card to render a secondary line
   * under any A–H row that spans ≥2 subcategories.
   */
  subcategory_lift: Array<{
    categoryId: EventCategoryId;
    categoryName: string;
    subcategoryId: string;
    hrDeltaBpm: number;
    n: number;
    confidence: Confidence;
  }>;
  /** Nights with sleep ≥ user P70 → next-day PRS lift + best window. */
  sleep_to_peak: { deltaPct: number; n: number; confidence: Confidence; bestWindow: TimeWindow | null } | null;
  /** Well-recovered mornings (RHR ≤ baseline − 1σ) → window with highest lift. */
  rhr_recovery_window: { window: TimeWindow; liftPct: number; n: number; confidence: Confidence } | null;
  /** Mean streak length of low-RHR days preceding a top-quartile PRS day. */
  recovery_streak_to_peak: { avgStreakLength: number; n: number; confidence: Confidence } | null;
  generatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────────
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function pctDelta(observed: number, baseline: number): number {
  if (!baseline) return 0;
  return ((observed - baseline) / Math.abs(baseline)) * 100;
}

/** Returns 'strong' | 'emerging' | null based on n + |Δ|. Numeric units (%). */
function classifyNumeric(deltaPct: number, n: number): Confidence | null {
  const absD = Math.abs(deltaPct);
  if (n >= MIN_OCCURRENCES_STRONG && absD >= MIN_DELTA_PCT_STRONG) return "strong";
  if (n >= MIN_OCCURRENCES_EMERGING && absD >= MIN_DELTA_PCT_EMERGING) return "emerging";
  return null;
}
/** Returns 'strong' | 'emerging' | null based on n + |Δ| in tier units (1-5). */
function classifyTier(deltaAbs: number, n: number): Confidence | null {
  const absD = Math.abs(deltaAbs);
  if (n >= MIN_OCCURRENCES_STRONG && absD >= MIN_TIER_DELTA_STRONG) return "strong";
  if (n >= MIN_OCCURRENCES_EMERGING && absD >= MIN_TIER_DELTA_EMERGING) return "emerging";
  return null;
}
function impactScore(f: Finding): number {
  // Cross-lens ranking. Strong findings outrank emerging at equal magnitude.
  const tierBoost = f.confidence === "strong" ? 1.4 : 1.0;
  return Math.abs(f.deltaPct) * Math.log2(1 + f.n) * tierBoost;
}

// ── Stress Load per-event delta helpers ─────────────────────────────────
// v12: mean HR (not peak), per-event trailing baseline, 45-min focus window
// for long blocks. Shared by the Stress Load matrix and the subcategory_lift
// rollup so the two paths cannot drift.
type BaselineSource = "14d" | "30d" | "window";

interface EventHrDeltaResult {
  delta: number; // mean HR − baseline (bpm)
  meanHr: number;
  baselineUsed: number;
  baselineSource: BaselineSource;
  longBlock: boolean;
  sampleCount: number;
}

function trailingBaselineFor(
  eventDateStr: string,
  restingHrByDay: Map<string, number>,
  windowBaseline: number | null,
): { baseline: number; source: BaselineSource } | null {
  const eventDate = new Date(eventDateStr);

  const lookback = (days: number): number[] => {
    const vals: number[] = [];
    for (let i = 1; i <= days; i++) {
      const d = ymd(addDays(eventDate, -i));
      const v = restingHrByDay.get(d);
      if (typeof v === "number" && v > 0) vals.push(v);
    }
    return vals;
  };

  const vals14 = lookback(14);
  if (vals14.length >= 3) return { baseline: mean(vals14), source: "14d" };

  const vals30 = lookback(30);
  if (vals30.length >= 3) return { baseline: mean(vals30), source: "30d" };

  if (windowBaseline !== null) return { baseline: windowBaseline, source: "window" };
  return null;
}

function eventHrDelta(
  e: any,
  samples: Array<{ t: string; v: number }>,
  restingHrByDay: Map<string, number>,
  windowBaseline: number | null,
): EventHrDeltaResult | null {
  if (!e.start_time || !e.end_time) return null;
  const startMs = new Date(e.start_time).getTime();
  const endMs = new Date(e.end_time).getTime();
  const durationMinutes = (endMs - startMs) / 60000;
  const longBlock = durationMinutes > 90;
  const focusEndMs = longBlock ? startMs + 45 * 60000 : endMs;

  const selected: number[] = [];
  for (const s of samples) {
    const t = new Date(s.t).getTime();
    if (t >= startMs && t <= focusEndMs && typeof s.v === "number") {
      selected.push(s.v);
    }
  }

  // Long blocks: if the 45-minute focus window has too few samples,
  // fall back to the full event window (existing behaviour).
  if (longBlock && selected.length < 3) {
    for (const s of samples) {
      const t = new Date(s.t).getTime();
      if (t > focusEndMs && t <= endMs && typeof s.v === "number") {
        selected.push(s.v);
      }
    }
  }

  if (selected.length === 0) return null;
  const meanHr = mean(selected);
  if (meanHr <= 0) return null;

  const eventDateStr = ymd(new Date(e.start_time));
  const baselineResult = trailingBaselineFor(eventDateStr, restingHrByDay, windowBaseline);
  if (!baselineResult) return null;

  const delta = meanHr - baselineResult.baseline;
  if (!Number.isFinite(delta)) return null;

  return {
    delta,
    meanHr,
    baselineUsed: baselineResult.baseline,
    baselineSource: baselineResult.source,
    longBlock,
    sampleCount: selected.length,
  };
}

// Calendar event → coarse type label (now imported from shared taxonomy).
// Local re-export keeps downstream readers stable.
const EVENT_TYPE_KEYWORDS = SHARED_EVENT_TYPE_KEYWORDS;

/** Legacy pattern-bucket label, resolved through enrichEvent(). */
function patternBucketLabel(title: string | null | undefined): string | null {
  return patternBucketFor(title);
}
/**
 * Canonical A–H resolution for the Insights engines. Accepts the raw calendar
 * row (preferred — unlocks user overrides / learned tokens / persisted
 * category) or a bare title.
 */
function classifyEventCanonical(input: ResolveEventInput) {
  return enrichCalendarEvent(input as any).subtype;
}
function canonicalCategoryName(input: ResolveEventInput): string | null {
  const e = enrichCalendarEvent(input as any);
  return e.category?.name ?? e.subtype?.bucket ?? null;
}

// Pillar swim-lane projection (Section K) — exposed so the Insights
// "Performance Causality" card can group findings by executive pillar
// instead of just one flat "Stress Load" lane.
function pillarOfTitle(title: string | null | undefined): Pillar | null {
  return classifyEventCanonical(title)?.primaryPillar ?? null;
}
function pillarLabelOfTitle(title: string | null | undefined): string | null {
  const p = pillarOfTitle(title);
  return p ? PILLAR_META[p].name : null;
}

/** Final fallback: classify by attendee count so every event lands in a bucket. */
function classifyByAttendees(attendees: number | null | undefined): string {
  const a = typeof attendees === "number" ? attendees : 0;
  if (a === 0) return "Solo work blocks";
  if (a >= 4) return "Group meetings";
  return "Small-group meetings";
}

// ── Main handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let userId: string | null = null;
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    // Server-to-server backfill path: caller must share our runtime
    // SUPABASE_SERVICE_ROLE_KEY and pass target_user_id in body.
    const adminHeader = req.headers.get("x-admin-secret");
    if (
      adminHeader &&
      SUPABASE_SERVICE_ROLE_KEY &&
      adminHeader === SUPABASE_SERVICE_ROLE_KEY &&
      typeof body?.target_user_id === "string"
    ) {
      userId = body.target_user_id;
    } else {
      try {
        userId = await verifyAuth0JWT(req);
      } catch (authErr: any) {
        console.log("[cause-effect-engine] auth rejected:", authErr?.message || authErr);
      }
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const force = body?.force === true || body?.force === 1;
    const days = Math.min(Math.max(Number(body?.days) || WINDOW_DAYS, 14), 90);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date();
    const todayStr = ymd(today);

    // Cache check (24h) ------------------------------------------------
    if (!force) {
      const { data: cached } = await supabase
        .from("causality_findings")
        .select("payload, signal_summary")
        .eq("user_id", userId)
        .eq("pattern_kind", "cause_effect_v2")
        .eq("computed_for_date", todayStr)
        .maybeSingle();
      const cachedPayload: any = cached?.payload;
      if (cachedPayload) {
        // Treat cached row as stale and recompute when:
        //  - payload predates the current engine version, OR
        //  - payload is empty (no top + zero findings) and missing the v2
        //    coverage shape (eventTypesIdentified/lensReasons), which means
        //    it was written by an older logic version.
        const isOldVersion =
          typeof cachedPayload.version !== "number" ||
          cachedPayload.version < ENGINE_VERSION;
        const lensCount =
          (cachedPayload.lensA?.length || 0) +
          (cachedPayload.lensB?.length || 0) +
          (cachedPayload.lensC?.length || 0) +
          (cachedPayload.lensD?.length || 0);
        const isEmptyAndOldShape =
          !cachedPayload.top &&
          lensCount === 0 &&
          (cachedPayload.coverage == null ||
            cachedPayload.coverage.eventTypesIdentified == null ||
            cachedPayload.coverage.lensReasons == null);
        if (!isOldVersion && !isEmptyAndOldShape) {
          const cachedSig: any = (cached as any)?.signal_summary;
          const subcat = cachedSig?.performance_lift?.subcategory_lift ?? [];
          return new Response(JSON.stringify({
            ...cachedPayload,
            signalSummary: { subcategory_lift: subcat },
            cached: true,
          }), {
            status: 200,
            headers: corsHeaders,
          });
        }
        console.log(
          "[cause-effect-engine] cache invalidated (version=%s, isEmptyOldShape=%s) — recomputing",
          cachedPayload.version,
          isEmptyAndOldShape,
        );
      }
    }

    const startStr = ymd(addDays(today, -days));
    const startIso = new Date(startStr + "T00:00:00Z").toISOString();
    const nowIso = new Date().toISOString();

    // Parallel reads ---------------------------------------------------
    const [eventsRes, wearableRes, checkinsRes, briefsRes, calConnRes] = await Promise.all([
      supabase.from("calendar_events")
        .select("title, start_time, end_time, attendees_count, is_organizer")
        .eq("user_id", userId)
        .gte("start_time", startIso)
        // Exclude future events — they have no check-ins or wearable data yet
        // and would distort buckets/baselines.
        .lte("start_time", nowIso),
      supabase.from("wearable_data")
        .select("summary_date, hrv, resting_heart_rate, heart_rate, sleep_score, total_sleep_minutes")
        .eq("user_id", userId)
        .gte("summary_date", startStr),
      supabase.from("daily_checkins")
        .select("checkin_date, time_window, clarity_level, mental_sharpness_level, confidence_level, outcome, timestamp")
        .eq("user_id", userId)
        .gte("checkin_date", startStr),
      supabase.from("brief_snapshots")
        .select("local_date, time_window, score")
        .eq("user_id", userId)
        .gte("local_date", startStr),
      supabase.from("calendar_connections")
        .select("is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    // Cross-provider dedupe (Apple mirrors Google etc.). Must run before any
    // event-type bucketing or load tertile math, otherwise duplicates would
    // double-count load.
    const events = dedupeCalendarEvents(eventsRes.data || []);
    const wearable = wearableRes.data || [];
    const checkins = checkinsRes.data || [];
    const briefs = briefsRes.data || [];
    const hasCalendar = !!calConnRes.data?.is_active;

    // WS-A · Best-effort load of persisted A–H subcategories for this user.
    // When a memory row exists for a given event_id, prefer it over the
    // deterministic classifier below. Falls back silently on any error.
    let priorityMemoryIndex: PriorityMemoryIndex | null = null;
    try {
      priorityMemoryIndex = await loadPriorityMemoryForUser(supabase, userId);
    } catch (_e) {
      priorityMemoryIndex = null;
    }

    const sleepRowsAvailable = wearable.filter(
      (w: any) => typeof w.sleep_score === "number" || typeof w.total_sleep_minutes === "number",
    ).length;

    // Index helpers ----------------------------------------------------
    const wearableByDay = new Map<string, typeof wearable[number]>();
    wearable.forEach((w) => wearableByDay.set(w.summary_date as string, w));

    const briefsByDay = new Map<string, number[]>();
    briefs.forEach((b: any) => {
      if (typeof b.score !== "number") return;
      const d = b.local_date as string;
      if (!briefsByDay.has(d)) briefsByDay.set(d, []);
      briefsByDay.get(d)!.push(b.score);
    });
    const prsByDay = new Map<string, number>();
    briefsByDay.forEach((arr, d) => prsByDay.set(d, mean(arr)));

    const morningCheckinsByDay = new Map<string, typeof checkins[number]>();
    const allCheckinsByDay = new Map<string, typeof checkins>();
    checkins.forEach((c) => {
      const d = c.checkin_date as string;
      if (!allCheckinsByDay.has(d)) allCheckinsByDay.set(d, []);
      allCheckinsByDay.get(d)!.push(c);
      if (c.time_window === "morning") morningCheckinsByDay.set(d, c);
    });

    // Group events by date (with fallback bucket so every event is classified)
    const eventsByDay = new Map<string, typeof events>();
    const eventTypeDays = new Map<string, Set<string>>(); // label -> Set<date>
    events.forEach((e: any) => {
      const d = ymd(new Date(e.start_time));
      if (!eventsByDay.has(d)) eventsByDay.set(d, []);
      eventsByDay.get(d)!.push(e);
      // Canonical A–H first (honours overrides / learned tokens / persisted
      // category), then the keyword bucket, then attendee-count fallback.
      const label = canonicalCategoryName(e) ?? patternBucketLabel(e.title) ??
        classifyByAttendees(e.attendees_count);
      if (!eventTypeDays.has(label)) eventTypeDays.set(label, new Set());
      eventTypeDays.get(label)!.add(d);
    });

    // Daily calendar load (minutes)
    const loadByDay = new Map<string, number>();
    events.forEach((e: any) => {
      if (!e.start_time || !e.end_time) return;
      const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
      if (dur <= 0) return;
      const d = ymd(new Date(e.start_time));
      loadByDay.set(d, (loadByDay.get(d) || 0) + dur);
    });

    // Universe of dates in window (for non-event baselines)
    const allDates: string[] = [];
    for (let i = 0; i < days; i++) allDates.push(ymd(addDays(today, -i)));

    const coverage: Coverage = {
      hasCalendar,
      hasWearable: wearable.length >= 5,
      hasWearableSleep: sleepRowsAvailable >= 5,
      checkinCount: checkins.length,
      briefCount: briefs.length,
      wearableDayCount: wearable.length,
      eventCount: events.length,
      eventTypesIdentified: eventTypeDays.size,
      lensReasons: { A: null, B: null, C: null, D: null },
    };

    // Helper: detect overlap between wearable signal days and event days.
    // If they don't overlap, no event→physiology finding is mathematically
    // possible. We surface this as the lens-A reason rather than a generic
    // empty state.
    const wearableSignalDays = new Set(
      wearable
        .filter((w: any) => typeof w.hrv === "number" || typeof w.resting_heart_rate === "number")
        .map((w: any) => w.summary_date as string),
    );
    const eventOnlyDates = new Set<string>();
    eventTypeDays.forEach((set) => set.forEach((d) => eventOnlyDates.add(d)));
    let wearableEventOverlap = 0;
    eventOnlyDates.forEach((d) => { if (wearableSignalDays.has(d)) wearableEventOverlap++; });

    // ── Lens A.1 — Per event-type → Physiology ──────────────────────
    const lensA: Finding[] = [];
    const wearableHasAnySignal = wearable.some(
      (w: any) => typeof w.hrv === "number" || typeof w.resting_heart_rate === "number",
    );
    if (hasCalendar && wearableHasAnySignal && eventTypeDays.size > 0) {
      for (const sig of ["hrv", "resting_heart_rate"] as const) {
        const sigUnit = sig === "hrv" ? "ms" : "bpm";
        const sigLabel = sig === "hrv" ? "HRV" : "RHR";

        for (const [label, daySet] of eventTypeDays) {
          const eventDayVals: number[] = [];
          const nonEventVals: number[] = [];
          allDates.forEach((d) => {
            const w = wearableByDay.get(d);
            const v = w?.[sig];
            if (typeof v !== "number" || v <= 0) return;
            if (daySet.has(d)) eventDayVals.push(v);
            else nonEventVals.push(v);
          });
          const minEventOccurrences = sig === "resting_heart_rate" ? 2 : MIN_OCCURRENCES_EMERGING;
          if (eventDayVals.length < minEventOccurrences || nonEventVals.length < 3) continue;

          const baseline = mean(nonEventVals);
          const observed = mean(eventDayVals);
          const deltaPct = pctDelta(observed, baseline);
          const conf = sig === "resting_heart_rate" && eventDayVals.length === 2
            ? (Math.abs(deltaPct) >= MIN_DELTA_PCT_EMERGING ? "emerging" as const : null)
            : classifyNumeric(deltaPct, eventDayVals.length);
          if (!conf) continue;

          const isHarmful = sig === "hrv" ? deltaPct < 0 : deltaPct > 0;
          if (!isHarmful) continue;

          // Recovery: days post-event for HRV/RHR to return to ±5%
          const recoverySamples: number[] = [];
          for (const ed of daySet) {
            for (let k = 1; k <= RECOVERY_LOOKAHEAD_DAYS; k++) {
              const nd = ymd(addDays(new Date(ed + "T00:00:00Z"), k));
              const wn = wearableByDay.get(nd);
              const vn = wn?.[sig];
              if (typeof vn !== "number" || vn <= 0) continue;
              if (Math.abs(pctDelta(vn, baseline)) <= RECOVERY_TOLERANCE_PCT) {
                recoverySamples.push(k);
                break;
              }
            }
          }
          const recoveryDays = recoverySamples.length >= 2 ? Math.round(mean(recoverySamples)) : null;

          lensA.push({
            lens: "A",
            cause: label,
            effectSignal: sigLabel,
            unit: sigUnit,
            baseline: Math.round(baseline * 10) / 10,
            observed: Math.round(observed * 10) / 10,
            deltaAbs: Math.round((observed - baseline) * 10) / 10,
            deltaPct: Math.round(deltaPct * 10) / 10,
            n: eventDayVals.length,
            recoveryDays,
            direction: "negative",
            confidence: conf,
            longText: `On days with ${label.toLowerCase()}, your ${sigLabel} averages ${observed.toFixed(0)}${sigUnit} vs your ${baseline.toFixed(0)}${sigUnit} baseline (n=${eventDayVals.length})${recoveryDays ? ` — typically recovers within ${recoveryDays} day${recoveryDays === 1 ? "" : "s"}.` : "."}`,
          });
        }
      }
    }

    // ── Lens A.2 — Calendar load tertile → Physiology (NEW) ─────────
    if (hasCalendar && wearableHasAnySignal && loadByDay.size >= 6) {
      const loads = [...loadByDay.values()].sort((a, b) => a - b);
      const heavyCut = loads[Math.floor((2 * loads.length) / 3)] || 0;
      const heavyDays = new Set<string>();
      loadByDay.forEach((m, d) => { if (m >= heavyCut && m > 0) heavyDays.add(d); });

      for (const sig of ["hrv", "resting_heart_rate"] as const) {
        const sigUnit = sig === "hrv" ? "ms" : "bpm";
        const sigLabel = sig === "hrv" ? "HRV" : "RHR";
        const heavyVals: number[] = [];
        const lightVals: number[] = [];
        allDates.forEach((d) => {
          const w = wearableByDay.get(d);
          const v = w?.[sig];
          if (typeof v !== "number" || v <= 0) return;
          if (heavyDays.has(d)) heavyVals.push(v);
          else if (loadByDay.has(d)) lightVals.push(v); // only days with some load form the "light" baseline
          else lightVals.push(v); // no events at all → still part of baseline
        });
        if (heavyVals.length < MIN_OCCURRENCES_EMERGING || lightVals.length < 3) continue;

        const baseline = mean(lightVals);
        const observed = mean(heavyVals);
        const deltaPct = pctDelta(observed, baseline);
        const conf = classifyNumeric(deltaPct, heavyVals.length);
        if (!conf) continue;
        const isHarmful = sig === "hrv" ? deltaPct < 0 : deltaPct > 0;
        if (!isHarmful) continue;

        lensA.push({
          lens: "A",
          cause: "High-load calendar days",
          effectSignal: sigLabel,
          unit: sigUnit,
          baseline: Math.round(baseline * 10) / 10,
          observed: Math.round(observed * 10) / 10,
          deltaAbs: Math.round((observed - baseline) * 10) / 10,
          deltaPct: Math.round(deltaPct * 10) / 10,
          n: heavyVals.length,
          recoveryDays: null,
          direction: "negative",
          confidence: conf,
          longText: `On your top-third calendar-load days, ${sigLabel} averages ${observed.toFixed(0)}${sigUnit} vs your ${baseline.toFixed(0)}${sigUnit} baseline (n=${heavyVals.length}).`,
        });
      }
    }

    // ── Lens B — Events → Cognition ─────────────────────────────────
    const lensB: Finding[] = [];
    if (hasCalendar && checkins.length >= 7 && eventTypeDays.size > 0) {
      const cogDims: Array<{ key: "clarity_level" | "mental_sharpness_level" | "confidence_level"; label: string }> = [
        { key: "clarity_level", label: "Clarity" },
        { key: "mental_sharpness_level", label: "Sharpness" },
        { key: "confidence_level", label: "Confidence" },
      ];

      for (const [label, daySet] of eventTypeDays) {
        let best: Finding | null = null;
        for (const dim of cogDims) {
          const eventVals: number[] = [];
          const baseVals: number[] = [];
          allDates.forEach((d) => {
            const slots = allCheckinsByDay.get(d) || [];
            slots.forEach((c: any) => {
              const v = c[dim.key];
              if (typeof v !== "number" || v <= 0) return;
              if (daySet.has(d)) eventVals.push(v);
              else baseVals.push(v);
            });
          });
          if (eventVals.length < MIN_OCCURRENCES_EMERGING || baseVals.length < 3) continue;
          const baseline = mean(baseVals);
          const observed = mean(eventVals);
          const deltaAbs = observed - baseline;
          const conf = classifyTier(deltaAbs, eventVals.length);
          if (!conf) continue;
          if (deltaAbs >= 0) continue;

          const deltaPct = pctDelta(observed, baseline);
          const finding: Finding = {
            lens: "B",
            cause: label,
            effectSignal: dim.label,
            unit: "tier",
            baseline: Math.round(baseline * 10) / 10,
            observed: Math.round(observed * 10) / 10,
            deltaAbs: Math.round(deltaAbs * 10) / 10,
            deltaPct: Math.round(deltaPct * 10) / 10,
            n: eventVals.length,
            recoveryDays: null,
            direction: "negative",
            confidence: conf,
            longText: `On ${label.toLowerCase()} days, your ${dim.label} averages ${observed.toFixed(1)}/5 vs your ${baseline.toFixed(1)}/5 baseline (n=${eventVals.length}).`,
          };
          if (!best || Math.abs(finding.deltaAbs) > Math.abs(best.deltaAbs)) best = finding;
        }
        if (best) lensB.push(best);
      }
    }

    // ── Lens C — Sleep → Next-day Decision Quality ──────────────────
    const lensC: Finding[] = [];
    if (sleepRowsAvailable >= 5 && (briefs.length >= 5 || checkins.length >= 7)) {
      const sleepRows = wearable
        .filter((w: any) => typeof w.sleep_score === "number" || typeof w.total_sleep_minutes === "number")
        .map((w: any) => ({
          date: w.summary_date as string,
          score: typeof w.sleep_score === "number" ? w.sleep_score : (w.total_sleep_minutes / 60),
          isMinutes: typeof w.sleep_score !== "number",
        }));
      const sorted = [...sleepRows].sort((a, b) => a.score - b.score);
      const lowCut = sorted[Math.floor(sorted.length / 3)].score;
      const highCut = sorted[Math.floor((2 * sorted.length) / 3)].score;

      const buckets: Record<"low" | "mid" | "high", string[]> = { low: [], mid: [], high: [] };
      sleepRows.forEach((r) => {
        const t = r.score <= lowCut ? "low" : r.score >= highCut ? "high" : "mid";
        buckets[t].push(r.date);
      });

      const dimsForC: Array<{ name: "PRS" | "Sharpness" | "Clarity"; unit: string; lookup: (d: string) => number | null }> = [
        { name: "PRS",       unit: "pts",  lookup: (d) => prsByDay.get(d) ?? null },
        { name: "Sharpness", unit: "tier", lookup: (d) => morningCheckinsByDay.get(d)?.mental_sharpness_level ?? null },
        { name: "Clarity",   unit: "tier", lookup: (d) => morningCheckinsByDay.get(d)?.clarity_level ?? null },
      ];

      for (const dim of dimsForC) {
        const valuesByBucket: Record<"low" | "mid" | "high", number[]> = { low: [], mid: [], high: [] };
        (Object.keys(buckets) as Array<"low" | "mid" | "high">).forEach((tier) => {
          buckets[tier].forEach((sleepDate) => {
            const next = ymd(addDays(new Date(sleepDate + "T00:00:00Z"), 1));
            const v = dim.lookup(next);
            if (typeof v === "number" && v > 0) valuesByBucket[tier].push(v);
          });
        });

        const nLow = valuesByBucket.low.length;
        const nNonLow = valuesByBucket.mid.length + valuesByBucket.high.length;
        if (nLow < MIN_OCCURRENCES_EMERGING || nNonLow < 3) continue;

        const baseline = mean([...valuesByBucket.mid, ...valuesByBucket.high]);
        const observed = mean(valuesByBucket.low);
        const deltaAbs = observed - baseline;
        const deltaPct = pctDelta(observed, baseline);
        const conf = dim.unit === "tier"
          ? classifyTier(deltaAbs, nLow)
          : classifyNumeric(deltaPct, nLow);
        if (!conf) continue;
        if (deltaAbs >= 0) continue;

        const lowSample = sleepRows.find((r) => r.score === lowCut);
        const causeLabel = lowSample?.isMinutes
          ? `Low-sleep nights (<${lowCut.toFixed(1)}h)`
          : `Low-sleep nights (score ≤ ${Math.round(lowCut)})`;

        lensC.push({
          lens: "C",
          cause: causeLabel,
          effectSignal: dim.name,
          unit: dim.unit,
          baseline: Math.round(baseline * 10) / 10,
          observed: Math.round(observed * 10) / 10,
          deltaAbs: Math.round(deltaAbs * 10) / 10,
          deltaPct: Math.round(deltaPct * 10) / 10,
          n: nLow,
          recoveryDays: null,
          direction: "negative",
          confidence: conf,
          longText: `After ${causeLabel.toLowerCase()}, next-day ${dim.name} averages ${observed.toFixed(dim.unit === "tier" ? 1 : 0)}${dim.unit === "tier" ? "/5" : dim.unit === "pts" ? " pts" : ""} vs your ${baseline.toFixed(dim.unit === "tier" ? 1 : 0)}${dim.unit === "tier" ? "/5" : dim.unit === "pts" ? " pts" : ""} baseline (n=${nLow}).`,
        });
      }
    }

    // ── Lens D — Consecutive heavy days → Recovery (lowered floor) ──
    const lensD: Finding[] = [];
    if (hasCalendar && loadByDay.size >= 6) {
      const loads = [...loadByDay.values()].sort((a, b) => a - b);
      const heavyCut = loads[Math.floor((2 * loads.length) / 3)] || 0;
      const heavyDays = new Set<string>();
      loadByDay.forEach((m, d) => { if (m >= heavyCut && m > 0) heavyDays.add(d); });

      const orderedDates = [...allDates].sort();
      const runEndPlusOne: string[] = [];
      let runLen = 0;
      for (let i = 0; i < orderedDates.length; i++) {
        const d = orderedDates[i];
        if (heavyDays.has(d)) runLen++;
        else {
          if (runLen >= 2) runEndPlusOne.push(d);
          runLen = 0;
        }
      }

      // Allow emerging at n>=2; classifyNumeric gates final confidence.
      if (runEndPlusOne.length >= 2) {
        const runTailSet = new Set(runEndPlusOne);
        const dimsForD: Array<{ name: "PRS" | "HRV"; unit: string; lookup: (d: string) => number | null }> = [
          { name: "PRS", unit: "pts", lookup: (d) => prsByDay.get(d) ?? null },
          { name: "HRV", unit: "ms",  lookup: (d) => (wearableByDay.get(d)?.hrv as number) ?? null },
        ];

        for (const dim of dimsForD) {
          const tailVals: number[] = [];
          const baseVals: number[] = [];
          allDates.forEach((d) => {
            const v = dim.lookup(d);
            if (typeof v !== "number" || v <= 0) return;
            if (runTailSet.has(d)) tailVals.push(v);
            else if (!heavyDays.has(d)) baseVals.push(v);
          });
          if (tailVals.length < MIN_OCCURRENCES_EMERGING || baseVals.length < 3) continue;

          const baseline = mean(baseVals);
          const observed = mean(tailVals);
          const deltaPct = pctDelta(observed, baseline);
          const conf = classifyNumeric(deltaPct, tailVals.length);
          if (!conf) continue;
          if (deltaPct >= 0) continue; // both PRS and HRV: lower = harmful

          const recovery: number[] = [];
          runEndPlusOne.forEach((tailDay) => {
            for (let k = 0; k <= RECOVERY_LOOKAHEAD_DAYS; k++) {
              const probe = ymd(addDays(new Date(tailDay + "T00:00:00Z"), k));
              const v = dim.lookup(probe);
              if (typeof v !== "number" || v <= 0) continue;
              if (Math.abs(pctDelta(v, baseline)) <= RECOVERY_TOLERANCE_PCT) {
                recovery.push(k + 1);
                break;
              }
            }
          });
          const recoveryDays = recovery.length >= 2 ? Math.round(mean(recovery)) : null;

          lensD.push({
            lens: "D",
            cause: "Back-to-back heavy days",
            effectSignal: dim.name,
            unit: dim.unit,
            baseline: Math.round(baseline * 10) / 10,
            observed: Math.round(observed * 10) / 10,
            deltaAbs: Math.round((observed - baseline) * 10) / 10,
            deltaPct: Math.round(deltaPct * 10) / 10,
            n: tailVals.length,
            recoveryDays,
            direction: "negative",
            confidence: conf,
            longText: `After 2+ consecutive heavy calendar days, your ${dim.name} drops to ${observed.toFixed(0)}${dim.unit === "pts" ? " pts" : dim.unit} vs your ${baseline.toFixed(0)}${dim.unit === "pts" ? " pts" : dim.unit} baseline (n=${tailVals.length})${recoveryDays ? ` — typically takes ${recoveryDays} day${recoveryDays === 1 ? "" : "s"} to recover.` : "."}`,
          });
        }
      }
    }

    // De-dup & trim each lens to top 3 by impact
    const dedupAndTrim = (arr: Finding[]) => {
      const seen = new Set<string>();
      const unique: Finding[] = [];
      for (const f of arr.sort((a, b) => impactScore(b) - impactScore(a))) {
        const key = `${f.cause}|${f.effectSignal}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(f);
        if (unique.length >= 3) break;
      }
      return unique;
    };
    const lensATop = dedupAndTrim(lensA);
    const lensBTop = dedupAndTrim(lensB);
    const lensCTop = dedupAndTrim(lensC);
    const lensDTop = dedupAndTrim(lensD);

    // Populate per-lens reasons whenever a lens has no findings, so the UI
    // can show a specific data-honest explanation instead of a generic line.
    if (lensATop.length === 0) {
      if (!hasCalendar) coverage.lensReasons.A = "Connect calendar to unlock";
      else if (wearable.length === 0) coverage.lensReasons.A = "No wearable HRV/RHR records yet";
      else if (!wearableHasAnySignal) coverage.lensReasons.A = "Wearable rows have no HRV/RHR yet";
      else if (eventTypeDays.size === 0) coverage.lensReasons.A = "No events in window";
      else if (wearableEventOverlap === 0) coverage.lensReasons.A = `No overlap between wearable days and event days (need both on the same date)`;
      else coverage.lensReasons.A = `Classified ${eventTypeDays.size} event type(s); none cleared the threshold yet`;
    }
    if (lensBTop.length === 0) {
      if (!hasCalendar) coverage.lensReasons.B = "Connect calendar to unlock";
      else if (checkins.length < 7) coverage.lensReasons.B = `Need 7+ check-ins — currently ${checkins.length}`;
      else if (eventTypeDays.size === 0) coverage.lensReasons.B = "No events in window";
      else coverage.lensReasons.B = `Classified ${eventTypeDays.size} event type(s); no cognitive cost cleared the threshold yet`;
    }
    if (lensCTop.length === 0) {
      if (sleepRowsAvailable === 0) coverage.lensReasons.C = "Connect Apple Health sleep tracking — no sleep records yet";
      else if (sleepRowsAvailable < 5) coverage.lensReasons.C = `Need 5+ sleep records — currently ${sleepRowsAvailable}`;
      else coverage.lensReasons.C = "No clear sleep→next-day pattern yet";
    }
    if (lensDTop.length === 0) {
      if (!hasCalendar) coverage.lensReasons.D = "Connect calendar to unlock";
      else if (loadByDay.size < 6) coverage.lensReasons.D = `Need 6+ days with events — currently ${loadByDay.size}`;
      else coverage.lensReasons.D = "No back-to-back heavy-day streak detected yet";
    }

    const all = [...lensATop, ...lensBTop, ...lensCTop, ...lensDTop];
    const top = all.length > 0
      ? all.reduce((best, f) => (impactScore(f) > impactScore(best) ? f : best), all[0])
      : null;

    const payload: Payload = {
      top,
      lensA: lensATop,
      lensB: lensBTop,
      lensC: lensCTop,
      lensD: lensDTop,
      coverage,
      generatedAt: new Date().toISOString(),
      version: ENGINE_VERSION,
    };

    // ════════════════════════════════════════════════════════════════════
    // PROPRIETARY LOGIC — DO NOT DUPLICATE IN CLIENT
    // ════════════════════════════════════════════════════════════════════
    // The block below computes the v3 tabbed matrices for the Performance
    // Causality card. Every formula, weight, threshold, modifier and
    // contributing-signal rule lives here and is never echoed to the
    // client. The UI receives only rendered values + colors + sample sizes.
    // ════════════════════════════════════════════════════════════════════

    // Re-fetch the wearable rows with hr_samples + hrv (we already have
    // wearable but it doesn't include hr_samples). Cheap query, scoped to
    // the same window.
    const { data: wearableExt } = await supabase
      .from("wearable_data")
      .select("summary_date, hr_samples, resting_heart_rate, hrv, sleep_score, total_sleep_minutes")
      .eq("user_id", userId)
      .gte("summary_date", startStr);
    const hrSamplesByDay = new Map<string, Array<{ t: string; v: number }>>();
    (wearableExt || []).forEach((w: any) => {
      if (Array.isArray(w.hr_samples) && w.hr_samples.length > 0) {
        hrSamplesByDay.set(w.summary_date as string, w.hr_samples as any);
      }
    });

    // ── Stress Load matrix: per-event-window mean HR − trailing baseline ─
    // v12 changes:
    // 1. Baseline is a per-event trailing mean (14d → 30d → whole window),
    //    not a single window average, so travel/rest days don't dilute an event's
    //    own baseline.
    // 2. Delta uses mean HR over the event window, not peak HR, so a single
    //    adrenaline spike no longer dominates the metric.
    // 3. Events >90 minutes use only the first 45 minutes (focus window) to
    //    avoid drift from breaks, travel, or post-event noise.
    const restingHrByDay = new Map<string, number>();
    (wearableExt || []).forEach((w: any) => {
      if (typeof w.resting_heart_rate === "number" && w.resting_heart_rate > 0) {
        restingHrByDay.set(w.summary_date as string, w.resting_heart_rate as number);
      }
    });
    const restingVals = [...restingHrByDay.values()];
    const windowBaseline = restingVals.length >= 3 ? mean(restingVals) : null;

    // Full Mon–Sun week: Sunday is a working day in Israel and the Gulf, and
    // weekend events carry real load, so they are bucketed like any other day.
    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dayIndex = (iso: string): number => {
      // Event timestamps already carry the user's local calendar date in the
      // ISO date portion, so derive DOW from that instead of reinterpreting
      // the timestamp through UTC.
      const d = dayOfWeekFromIsoDate(iso.slice(0, 10)); // 0=Sun..6=Sat
      if (!Number.isFinite(d) || d < 0 || d > 6) return -1;
      return (d + 6) % 7; // 0=Mon..6=Sun
    };

    // Build column set from the canonical A–H resolver, per event. The legacy
    // pattern bucket + attendee fallback mis-filed titles the keyword list
    // doesn't know (a flight landed under "Small-group meetings"), so the row
    // an event lands in is now its own resolved category, not the category of
    // whichever event first carried the same legacy bucket label.
    const categoryLabelOf = (e: any): string =>
      canonicalCategoryName(e) ?? classifyByAttendees(e.attendees_count);
    const subtypeLabelOf = (e: any): string | null => {
      const et = classifyEventCanonical(e) as any;
      return et?.name ?? et?.bucket ?? null;
    };

    const categoryDays = new Map<string, Set<string>>();
    for (const e of events as any[]) {
      if (!e.start_time) continue;
      const label = categoryLabelOf(e);
      if (!categoryDays.has(label)) categoryDays.set(label, new Set());
      categoryDays.get(label)!.add(ymd(new Date(e.start_time)));
    }
    const topEventTypes = [...categoryDays.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 7)
      .map(([label]) => label);

    // Accumulators for each (day, event) cell: arrays of per-event mean deltas.
    const stressAcc: Array<Array<number[]>> = DAY_LABELS.map(() =>
      topEventTypes.map(() => [] as number[]),
    );
    // Subtype label of the single event with the highest delta in each cell.
    const stressTop: Array<Array<{ label: string | null; delta: number } | null>> =
      DAY_LABELS.map(() => topEventTypes.map(() => null));

    const stressLoadEvents: Array<{
      date: string;
      day: string;
      event: string;
      meanHr: number;
      baselineUsed: number;
      baselineSource: BaselineSource;
      delta: number;
      longBlock: boolean;
      sampleCount: number;
    }> = [];

    if (windowBaseline !== null && topEventTypes.length > 0) {
      for (const e of events as any[]) {
        if (!e.start_time || !e.end_time) continue;
        const dIdx = dayIndex(e.start_time);
        if (dIdx < 0) continue;
        const label = categoryLabelOf(e);
        const colIdx = topEventTypes.indexOf(label);
        if (colIdx < 0) continue;
        const dayKey = ymd(new Date(e.start_time));
        const samples = hrSamplesByDay.get(dayKey);
        if (!samples || samples.length === 0) continue; // honest: omit cell, no day-max proxy

        const result = eventHrDelta(e, samples, restingHrByDay, windowBaseline);
        if (!result) continue;

        stressAcc[dIdx][colIdx].push(result.delta);
        const cur = stressTop[dIdx][colIdx];
        if (!cur || result.delta > cur.delta) {
          stressTop[dIdx][colIdx] = { label: subtypeLabelOf(e), delta: result.delta };
        }

        stressLoadEvents.push({
          date: dayKey,
          day: DAY_LABELS[dIdx],
          event: e.title ?? "Untitled",
          meanHr: Math.round(result.meanHr * 10) / 10,
          baselineUsed: Math.round(result.baselineUsed * 10) / 10,
          baselineSource: result.baselineSource,
          delta: Math.round(result.delta),
          longBlock: result.longBlock,
          sampleCount: result.sampleCount,
        });
      }
    }

    const stressCells: (number | null)[][] = DAY_LABELS.map((_, r) =>
      topEventTypes.map((_, c) => {
        const arr = stressAcc[r][c];
        if (arr.length === 0) return null;
        return Math.round(mean(arr));
      }),
    );
    const stressN: number[][] = stressAcc.map((row) => row.map((arr) => arr.length));
    const stressSubLabels: (string | null)[][] = stressTop.map((row) =>
      row.map((entry) => entry?.label ?? null),
    );

    const stressConf: (Confidence | null)[][] = stressAcc.map((row) =>
      row.map((arr) =>
        arr.length >= MIN_OCCURRENCES_STRONG ? "strong" :
        arr.length >= MIN_OCCURRENCES_EMERGING ? "emerging" : null,
      ),
    );
    let maxObserved = 0;
    let topCell: StressMatrix["topCell"] = null;
    let lowCell: StressMatrix["lowCell"] = null;
    const dayTotals: number[] = DAY_LABELS.map(() => 0);
    const dayCounts: number[] = DAY_LABELS.map(() => 0);
    stressCells.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v === null) return;
        if (v > maxObserved) maxObserved = v;
        if (!topCell || v > topCell.value) {
          topCell = { event: topEventTypes[c], day: DAY_LABELS[r], value: v };
        }
        if (!lowCell || v < lowCell.value) {
          lowCell = { event: topEventTypes[c], day: DAY_LABELS[r], value: v };
        }
        dayTotals[r] += v;
        dayCounts[r] += 1;
      }),
    );
    let topDay: StressMatrix["topDay"] = null;
    DAY_LABELS.forEach((d, r) => {
      if (dayCounts[r] === 0) return;
      const avg = dayTotals[r] / dayCounts[r];
      if (!topDay || avg > topDay.total) topDay = { day: d, total: Math.round(avg) };
    });

    const stressMatrix: StressMatrix = {
      events: topEventTypes,
      categoryNames: topEventTypes,
      days: DAY_LABELS,
      cells: stressCells,
      n: stressN,
      subLabels: stressSubLabels,
      confidence: stressConf,

      maxObserved,
      topCell,
      lowCell,
      topDay,
    };

    // ── Burnout Risk matrix: 4 dims × 5 weeks, intensity 1..5 ───────────
    // PROPRIETARY: signal weights, threshold mappings, Resilience-pill
    // multiplier, and the "all four align = critical" rule live in the
    // helpers below. Output exposes only the 1-5 intensity per cell + a
    // pre-baked one-line banner sentence.
    const WEEK_LABELS = ["4 wks ago", "3 wks ago", "2 wks ago", "Last week", "This week"];
    const weekStart = (idx: number): Date => {
      // idx 4 = this week (Mon-of-this-week start). Weeks roll Mon..Sun.
      const now = new Date();
      const dow = (now.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
      const thisMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow));
      return new Date(thisMon.getTime() - (4 - idx) * 7 * 86400000);
    };
    const inWeek = (iso: string, idx: number): boolean => {
      const t = new Date(iso).getTime();
      const s = weekStart(idx).getTime();
      const e = s + 7 * 86400000;
      return t >= s && t < e;
    };
    const clamp1to5 = (x: number) => Math.max(1, Math.min(5, Math.round(x)));
    const trajectoryOf = (weekly: Array<number | null>): "escalating" | "stable" | "improving" => {
      const valid = weekly.filter((value): value is number => typeof value === "number");
      if (valid.length < 2) return "stable";
      const delta = valid[valid.length - 1] - valid[0];
      if (delta >= 1.5) return "escalating";
      if (delta <= -1.5) return "improving";
      return "stable";
    };

    // load: weekly calendar minutes, normalized to 1-5
    const loadByWeek: number[] = WEEK_LABELS.map(() => 0);
    (events as any[]).forEach((e) => {
      if (!e.start_time || !e.end_time) return;
      const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
      if (dur <= 0) return;
      for (let w = 0; w < 5; w++) if (inWeek(e.start_time, w)) { loadByWeek[w] += dur; break; }
    });
    const loadMax = Math.max(1, ...loadByWeek);
    const loadWeekly = loadByWeek.map((v) => clamp1to5(1 + (v / loadMax) * 4));

    // rhr trend (positive slope = elevated): use weekly mean RHR
    const wByWeek = (
      sig: "resting_heart_rate" | "hrv" | "sleep_score",
    ): Array<{ mean: number | null; count: number }> => {
      const out: Array<{ mean: number | null; count: number }> = [];
      for (let w = 0; w < 5; w++) {
        const vals: number[] = [];
        (wearable as any[]).forEach((row) => {
          if (!row.summary_date) return;
          if (!inWeek(row.summary_date + "T12:00:00Z", w)) return;
          const v = row[sig];
          if (typeof v === "number" && v > 0) vals.push(v);
        });
        out.push({ mean: vals.length ? mean(vals) : null, count: vals.length });
      }
      return out;
    };
    const rhrWeeks = wByWeek("resting_heart_rate");
    const hrvWeeks = wByWeek("hrv");
    const sleepWeeks = wByWeek("sleep_score");
    // Build sleep-deficit count per week (nights below trailing baseline)
    const sleepBaseline = (() => {
      const arr = (wearable as any[])
        .map((r) => (typeof r.sleep_score === "number" ? r.sleep_score : null))
        .filter((v) => typeof v === "number" && v > 0) as number[];
      return arr.length >= 5 ? mean(arr) : null;
    })();
    const sleepDeficitByWeek: number[] = WEEK_LABELS.map(() => 0);
    if (sleepBaseline !== null) {
      (wearable as any[]).forEach((row) => {
        if (!row.summary_date || typeof row.sleep_score !== "number") return;
        for (let w = 0; w < 5; w++) {
          if (inWeek(row.summary_date + "T12:00:00Z", w)) {
            if (row.sleep_score < sleepBaseline) sleepDeficitByWeek[w]++;
            break;
          }
        }
      });
    }

    // Map raw weekly values → 1..5 intensity using deviation from window baseline.
    const intensityFromTrend = (
      weekly: Array<{ mean: number | null; count: number }>,
      invert = false,
      minCount = 1,
    ): Array<number | null> => {
      const valid = weekly
        .filter((entry) => entry.count >= minCount && entry.mean !== null)
        .map((entry) => entry.mean as number);
      if (valid.length === 0) return WEEK_LABELS.map(() => null);
      const base = mean(valid);
      const span = Math.max(1, ...valid.map((v) => Math.abs(v - base)));
      return weekly.map(({ mean: v, count }) => {
        if (count < minCount || v === null || !Number.isFinite(v)) return null;
        const dev = (v - base) / span; // -1..1
        const signed = invert ? -dev : dev;
        // Center at 3, scale to 1..5
        return clamp1to5(3 + signed * 2);
      });
    };
    const rhrWeekly = intensityFromTrend(rhrWeeks, false);
    const hrvWeekly = intensityFromTrend(hrvWeeks, true, 4);
    const sleepDeficitMax = Math.max(1, ...sleepDeficitByWeek);
    const sleepWeekly = sleepDeficitByWeek.map((c) => clamp1to5(1 + (c / sleepDeficitMax) * 4));

    const dimsBuilt: BurnoutMatrix["dims"] = [
      { key: "load",  label: "Calendar load",   color: "#D85A30", weekly: loadWeekly,  trajectory: trajectoryOf(loadWeekly)  },
      { key: "rhr",   label: "RHR trend ↑",     color: "#EF9F27", weekly: rhrWeekly,   trajectory: trajectoryOf(rhrWeekly)   },
      { key: "hrv",   label: "HRV trend ↓",     color: "#534AB7", weekly: hrvWeekly,   trajectory: trajectoryOf(hrvWeekly)   },
      { key: "sleep", label: "Sleep deficit",   color: "#185FA5", weekly: sleepWeekly, trajectory: trajectoryOf(sleepWeekly) },
    ];
    // Card-level trajectory = worst direction across dims.
    const cardTrajectory: BurnoutMatrix["cardTrajectory"] =
      dimsBuilt.some((d) => d.trajectory === "escalating") ? "escalating" :
      dimsBuilt.every((d) => d.trajectory === "improving") ? "improving" : "stable";
    const bannerCopy =
      cardTrajectory === "escalating" ? "Risk trajectory: escalating - load is building" :
      cardTrajectory === "improving"  ? "Risk trajectory: improving - recovery is gaining"  :
                                        "Risk trajectory: stable - holding consistent";

    const burnoutMatrix: BurnoutMatrix = {
      weeks: WEEK_LABELS,
      dims: dimsBuilt,
      cardTrajectory,
      bannerCopy,
    };

    // Silent computations (not yet rendered) — keep the data plumbing warm
    // so the Sleep Disruption / Recovery Cost tabs can light up later
    // without a backfill.
    const sleepDisruptionMatrix: StressMatrix | null = null; // shape mirrors stressMatrix; emit when surfacing.
    const recoveryCostTimeline: RecoveryTimeline | null = (() => {
      const days: string[] = [];
      const values: (number | null)[] = [];
      for (let i = days.length; i < Math.min(allDates.length, 30); i++) {
        // placeholder: simple inverse HRV proxy so the field is non-trivially populated.
        const d = allDates[i];
        const w: any = wearableByDay.get(d);
        const hrv = typeof w?.hrv === "number" ? w.hrv : null;
        days.push(d);
        values.push(hrv ? Math.max(0, Math.round(100 - hrv)) : null);
      }
      const rolling7: (number | null)[] = values.map((_, i) => {
        const slice = values.slice(Math.max(0, i - 6), i + 1).filter((v): v is number => typeof v === "number");
        return slice.length ? Math.round(mean(slice)) : null;
      });
      return { days, values, rolling7 };
    })();

    payload.stressMatrix = stressMatrix;
    payload.burnoutMatrix = burnoutMatrix;
    payload.sleepDisruptionMatrix = sleepDisruptionMatrix;
    payload.recoveryCostTimeline = recoveryCostTimeline;

    // ════════════════════════════════════════════════════════════════════
    // v5: RECOVERY BY EVENT — Heart Rate based per A–H event taxonomy
    // ════════════════════════════════════════════════════════════════════
    // Surfaces "after which events does recovery take longest" inside the
    // Drains card. Pulls from existing lensA RHR findings that already
    // carry per-event recoveryDays (days for RHR to return within ±5% of
    // baseline). HRV is intentionally excluded — too coarse for events.
    const recoveryByEvent: RecoveryByEvent | null = (() => {
      const rhrFindings = lensA.filter(
        (f) =>
          f.effectSignal === "RHR" &&
          f.cause !== "High-load calendar days" &&
          typeof f.recoveryDays === "number" &&
          f.recoveryDays > 0,
      );
      if (rhrFindings.length === 0) return null;
      // Compute last-seen per event-type inline (lastSeenByEventType isn't
      // built until further below in the signal-summary section).
      const lastSeenLocal = new Map<string, string>();
      eventTypeDays.forEach((set, label) => {
        let max = "";
        set.forEach((d) => { if (d > max) max = d; });
        if (max) lastSeenLocal.set(label, max);
      });
      const entries: RecoveryByEventEntry[] = rhrFindings
        .map((f) => ({
          eventType: f.cause,
          recoveryDays: f.recoveryDays as number,
          rhrDeltaBpm: f.deltaAbs,
          n: f.n,
          confidence: f.confidence,
          lastSeen: lastSeenLocal.get(f.cause) || "",
        }))
        .sort((a, b) => b.recoveryDays - a.recoveryDays)
        .slice(0, 6);
      const maxRecoveryDays = entries.reduce((m, e) => Math.max(m, e.recoveryDays), 0);
      return {
        entries,
        maxRecoveryDays,
        topEntry: entries[0] || null,
      };
    })();
    payload.recoveryByEvent = recoveryByEvent;

    // ════════════════════════════════════════════════════════════════════
    // v4: PERFORMANCE LIFT — positive-side correlations
    // ════════════════════════════════════════════════════════════════════
    // Drives the "When You Perform Best" card. Uses event-window peak HR
    // (not HRV), the new A–H event taxonomy via classifyEventCanonical,
    // and PRS (brief_snapshots.score) as the composite proxy.
    // Per mem://architecture/unified-pattern-store: new key on
    // signal_summary, never a new table.
    const performance_lift: PerformanceLift = (() => {
      // PRS baseline + per-window PRS baselines
      const prsAll: number[] = [];
      const prsByWindow: Record<TimeWindow, number[]> = { morning: [], afternoon: [], evening: [] };
      briefs.forEach((b: any) => {
        if (typeof b.score !== "number") return;
        prsAll.push(b.score);
        const tw = b.time_window as TimeWindow | null;
        if (tw && prsByWindow[tw]) prsByWindow[tw].push(b.score);
      });
      const prsBaseline = prsAll.length >= 3 ? mean(prsAll) : null;

      // ── (1) hr_event_lift: per-subtype peak HR + same-day PRS lift ────
      // Accumulators keyed by canonical EVENT_TYPE.id (from event-subtypes).
      const hrAcc = new Map<string, { hrDeltas: number[]; prsDeltas: number[]; lastSeen: string; et: ReturnType<typeof classifyEventCanonical> }>();
      if (restingBaseline !== null && prsBaseline !== null) {
        for (const e of events as any[]) {
          if (!e.start_time || !e.end_time) continue;
          const et = classifyEventCanonical(e);
          if (!et) continue;
          const dayKey = ymd(new Date(e.start_time));
          const samples = hrSamplesByDay.get(dayKey);
          if (!samples || samples.length === 0) continue;
          const startMs = new Date(e.start_time).getTime();
          const endMs = new Date(e.end_time).getTime();
          let peak = 0;
          for (const s of samples) {
            const t = new Date(s.t).getTime();
            if (t >= startMs && t <= endMs && typeof s.v === "number" && s.v > peak) peak = s.v;
          }
          if (peak <= 0) continue;
          const hrDelta = peak - restingBaseline;
          if (!Number.isFinite(hrDelta)) continue;
          const dayPrs = prsByDay.get(dayKey);
          const prsDelta = typeof dayPrs === "number" ? pctDelta(dayPrs, prsBaseline) : NaN;
          if (!hrAcc.has(et.id)) hrAcc.set(et.id, { hrDeltas: [], prsDeltas: [], lastSeen: dayKey, et });
          const slot = hrAcc.get(et.id)!;
          slot.hrDeltas.push(hrDelta);
          if (Number.isFinite(prsDelta)) slot.prsDeltas.push(prsDelta);
          if (dayKey > slot.lastSeen) slot.lastSeen = dayKey;
        }
      }
      const hr_event_lift: PerformanceLift["hr_event_lift"] = [];
      hrAcc.forEach(({ hrDeltas, prsDeltas, lastSeen, et }, id) => {
        if (!et) return;
        if (hrDeltas.length < MIN_OCCURRENCES_EMERGING) return;
        const conf: Confidence = hrDeltas.length >= MIN_OCCURRENCES_STRONG ? "strong" : "emerging";
        const cat = EVENT_CATEGORIES[et.categoryId];
        hr_event_lift.push({
          eventTypeId: id,
          bucket: et.bucket,
          categoryId: et.categoryId,
          categoryName: cat?.name ?? et.bucket,
          hrDeltaBpm: Math.round(mean(hrDeltas)),
          compositeLift: prsDeltas.length >= 2 ? Math.round(mean(prsDeltas) * 10) / 10 : 0,
          n: hrDeltas.length,
          confidence: conf,
          lastSeen,
        });
      });
      // Sort by thrive score (low HR delta + high composite lift). Smaller
      // hrDelta is better; higher compositeLift is better.
      hr_event_lift.sort((a, b) => (b.compositeLift - a.compositeLift) - (a.hrDeltaBpm - b.hrDeltaBpm) * 0.1);

      // ── (2) category_lift: rollup of (1) to A–H ──────────────────────
      const catAcc = new Map<EventCategoryId, { hr: number[]; prs: number[]; n: number }>();
      hr_event_lift.forEach((row) => {
        if (!catAcc.has(row.categoryId)) catAcc.set(row.categoryId, { hr: [], prs: [], n: 0 });
        const slot = catAcc.get(row.categoryId)!;
        // Weight by sample size — repeating the value n times preserves means.
        for (let i = 0; i < row.n; i++) slot.hr.push(row.hrDeltaBpm);
        for (let i = 0; i < row.n; i++) slot.prs.push(row.compositeLift);
        slot.n += row.n;
      });
      const category_lift: PerformanceLift["category_lift"] = [];
      catAcc.forEach((slot, categoryId) => {
        if (slot.n < MIN_OCCURRENCES_EMERGING) return;
        const conf: Confidence = slot.n >= MIN_OCCURRENCES_STRONG ? "strong" : "emerging";
        category_lift.push({
          categoryId,
          categoryName: EVENT_CATEGORIES[categoryId]?.name ?? categoryId,
          hrDeltaBpm: Math.round(mean(slot.hr)),
          compositeLift: Math.round(mean(slot.prs) * 10) / 10,
          n: slot.n,
          confidence: conf,
        });
      });
      category_lift.sort((a, b) => b.compositeLift - a.compositeLift);

      // ── (2b) subcategory_lift: rollup by (categoryId, subcategoryId) ─
      // WS-A · Prefer persisted `event_priority_memory.event_subcategory`
      // per event when available; fall back to canonical subtype id
      // (`str.deep_work` → `deep_work`). Additive; Insights Stress Load
      // reads this rollup directly.
      // v12: uses the same eventHrDelta helper as the Stress Load matrix so
      // the two surfaces cannot drift (mean HR, trailing baseline, 45-min focus).
      const subAcc = new Map<string, { hr: number[]; n: number; categoryId: EventCategoryId; subcategoryId: string }>();
      if (windowBaseline !== null) {
        for (const e of events as any[]) {
          if (!e.start_time || !e.end_time) continue;
          const et = classifyEventCanonical(e);
          if (!et) continue;
          const dayKey = ymd(new Date(e.start_time));
          const samples = hrSamplesByDay.get(dayKey);
          if (!samples || samples.length === 0) continue;

          const result = eventHrDelta(e, samples, restingHrByDay, windowBaseline);
          if (!result) continue;

          const eventId = typeof e.id === "string" ? e.id : null;
          const persistedSub = priorityMemoryIndex
            ? getSubcategoryForEvent(priorityMemoryIndex, eventId)
            : null;
          const fallbackSub = et.id.includes(".") ? et.id.split(".")[1] : et.id;
          const subcategoryId = persistedSub || fallbackSub;
          const key = `${et.categoryId}::${subcategoryId}`;
          if (!subAcc.has(key)) {
            subAcc.set(key, { hr: [], n: 0, categoryId: et.categoryId, subcategoryId });
          }
          const slot = subAcc.get(key)!;
          slot.hr.push(result.delta);
          slot.n += 1;
        }
      }
      const subcategory_lift: PerformanceLift["subcategory_lift"] = [];
      subAcc.forEach((slot) => {
        if (slot.n < MIN_OCCURRENCES_EMERGING) return;
        subcategory_lift.push({
          categoryId: slot.categoryId,
          categoryName: EVENT_CATEGORIES[slot.categoryId]?.name ?? slot.categoryId,
          subcategoryId: slot.subcategoryId,
          hrDeltaBpm: Math.round(mean(slot.hr)),
          n: slot.n,
          confidence: slot.n >= MIN_OCCURRENCES_STRONG ? "strong" : "emerging",
        });
      });
      subcategory_lift.sort((a, b) => {
        if (b.hrDeltaBpm !== a.hrDeltaBpm) return b.hrDeltaBpm - a.hrDeltaBpm;
        return b.n - a.n;
      });

      // ── (3) sleep_to_peak: high-sleep nights → next-day PRS + window ─
      let sleep_to_peak: PerformanceLift["sleep_to_peak"] = null;
      const sleepScored = (wearable as any[])
        .filter((w) => typeof w.sleep_score === "number" && w.sleep_score > 0)
        .map((w) => ({ date: w.summary_date as string, score: w.sleep_score as number }));
      if (sleepScored.length >= 7 && prsBaseline !== null) {
        const sortedScores = sleepScored.map((s) => s.score).sort((a, b) => a - b);
        const p70 = sortedScores[Math.floor(sortedScores.length * 0.7)];
        const highNights = sleepScored.filter((s) => s.score >= p70);
        const nextDayPrs: number[] = [];
        const winAcc: Record<TimeWindow, number[]> = { morning: [], afternoon: [], evening: [] };
        highNights.forEach((n) => {
          const next = ymd(addDays(new Date(n.date + "T00:00:00Z"), 1));
          const p = prsByDay.get(next);
          if (typeof p === "number") nextDayPrs.push(p);
          briefs.forEach((b: any) => {
            if (b.local_date !== next || typeof b.score !== "number") return;
            const tw = b.time_window as TimeWindow | null;
            if (tw && winAcc[tw]) winAcc[tw].push(b.score);
          });
        });
        if (nextDayPrs.length >= MIN_OCCURRENCES_EMERGING) {
          const observed = mean(nextDayPrs);
          const deltaPct = Math.round(pctDelta(observed, prsBaseline) * 10) / 10;
          let bestWindow: TimeWindow | null = null;
          let bestVal = -Infinity;
          (Object.keys(winAcc) as TimeWindow[]).forEach((w) => {
            if (winAcc[w].length < 2) return;
            const m = mean(winAcc[w]);
            if (m > bestVal) { bestVal = m; bestWindow = w; }
          });
          const conf: Confidence = nextDayPrs.length >= MIN_OCCURRENCES_STRONG ? "strong" : "emerging";
          sleep_to_peak = { deltaPct, n: nextDayPrs.length, confidence: conf, bestWindow };
        }
      }

      // ── (4) rhr_recovery_window: well-recovered days → best window ───
      let rhr_recovery_window: PerformanceLift["rhr_recovery_window"] = null;
      const rhrVals = (wearable as any[])
        .filter((w) => typeof w.resting_heart_rate === "number" && w.resting_heart_rate > 0)
        .map((w) => ({ date: w.summary_date as string, rhr: w.resting_heart_rate as number }));
      if (rhrVals.length >= 7 && prsBaseline !== null) {
        const rhrOnly = rhrVals.map((r) => r.rhr);
        const rhrMean = mean(rhrOnly);
        const rhrStd = Math.sqrt(mean(rhrOnly.map((v) => (v - rhrMean) ** 2)));
        const threshold = rhrMean - rhrStd;
        const recoveredDays = rhrVals.filter((r) => r.rhr <= threshold).map((r) => r.date);
        const winAcc: Record<TimeWindow, number[]> = { morning: [], afternoon: [], evening: [] };
        recoveredDays.forEach((d) => {
          briefs.forEach((b: any) => {
            if (b.local_date !== d || typeof b.score !== "number") return;
            const tw = b.time_window as TimeWindow | null;
            if (tw && winAcc[tw]) winAcc[tw].push(b.score);
          });
        });
        let best: { window: TimeWindow; liftPct: number; n: number } | null = null;
        for (const w of Object.keys(winAcc) as TimeWindow[]) {
          if (winAcc[w].length < MIN_OCCURRENCES_EMERGING) continue;
          const winBase = prsByWindow[w].length >= 3 ? mean(prsByWindow[w]) : prsBaseline!;
          const lift = Math.round(pctDelta(mean(winAcc[w]), winBase) * 10) / 10;
          if (!best || lift > best.liftPct) best = { window: w, liftPct: lift, n: winAcc[w].length };
        }
        if (best && best.liftPct > 0) {
          const conf: Confidence = best.n >= MIN_OCCURRENCES_STRONG ? "strong" : "emerging";
          rhr_recovery_window = { ...best, confidence: conf };
        }
      }

      // ── (5) recovery_streak_to_peak ──────────────────────────────────
      let recovery_streak_to_peak: PerformanceLift["recovery_streak_to_peak"] = null;
      if (rhrVals.length >= 7 && prsByDay.size >= 5) {
        const rhrByDate = new Map(rhrVals.map((r) => [r.date, r.rhr]));
        const rhrOnly = rhrVals.map((r) => r.rhr);
        const rhrMean = mean(rhrOnly);
        const rhrStd = Math.sqrt(mean(rhrOnly.map((v) => (v - rhrMean) ** 2)));
        const threshold = rhrMean - rhrStd;
        const prsList = [...prsByDay.values()].sort((a, b) => b - a);
        const topQuartileCut = prsList[Math.max(0, Math.floor(prsList.length * 0.25) - 1)] ?? prsList[0];
        const peakDays = [...prsByDay.entries()].filter(([, v]) => v >= topQuartileCut).map(([d]) => d);
        const streaks: number[] = [];
        peakDays.forEach((d) => {
          let len = 0;
          for (let k = 1; k <= 7; k++) {
            const probe = ymd(addDays(new Date(d + "T00:00:00Z"), -k));
            const rhr = rhrByDate.get(probe);
            if (typeof rhr === "number" && rhr <= threshold) len++;
            else break;
          }
          if (len > 0) streaks.push(len);
        });
        if (streaks.length >= MIN_OCCURRENCES_EMERGING) {
          const conf: Confidence = streaks.length >= MIN_OCCURRENCES_STRONG ? "strong" : "emerging";
          recovery_streak_to_peak = {
            avgStreakLength: Math.round(mean(streaks) * 10) / 10,
            n: streaks.length,
            confidence: conf,
          };
        }
      }

      return {
        hr_event_lift,
        category_lift,
        subcategory_lift,
        sleep_to_peak,
        rhr_recovery_window,
        recovery_streak_to_peak,
        generatedAt: new Date().toISOString(),
      };
    })();

    // ── Build flat signal_summary for the unified pattern store ─────
    // Per-event-type lookups need a "lastSeen" date so smart-nudges can
    // weight recent patterns higher. We pick the most recent date in
    // eventTypeDays for each label.
    const lastSeenByEventType = new Map<string, string>();
    eventTypeDays.forEach((set, label) => {
      let max = "";
      set.forEach((d) => { if (d > max) max = d; });
      if (max) lastSeenByEventType.set(label, max);
    });

    const eventToHrv = lensA
      .filter((f) => f.effectSignal === "HRV" && f.cause !== "High-load calendar days")
      .map((f) => ({
        event_type: f.cause,
        n: f.n,
        hrvDeltaPct: f.deltaPct,
        rhrElevated: lensA.some(
          (g) => g.cause === f.cause && g.effectSignal === "RHR" && g.deltaPct > 0,
        ),
        confidence: f.confidence,
        lastSeen: lastSeenByEventType.get(f.cause) || "",
      }));

    const eventToRhr = lensA
      .filter((f) => f.effectSignal === "RHR" && f.cause !== "High-load calendar days")
      .map((f) => ({
        event_type: f.cause,
        n: f.n,
        rhrDeltaPct: f.deltaPct,
        confidence: f.confidence,
        lastSeen: lastSeenByEventType.get(f.cause) || "",
      }));

    const eventToCognition = lensB.map((f) => ({
      event_type: f.cause,
      dim: f.effectSignal,
      tierDelta: f.deltaAbs,
      n: f.n,
      confidence: f.confidence,
    }));

    // Sleep→PRS: pick the strongest lensC PRS finding (always negative when present)
    const sleepPrs = lensC.find((f) => f.effectSignal === "PRS") || null;
    const sleep_to_prs = sleepPrs
      ? { lowSleepPrsDeltaPct: sleepPrs.deltaPct, n: sleepPrs.n, confidence: sleepPrs.confidence }
      : null;

    // Consecutive heavy days → tail HRV/PRS delta
    const consecHrv = lensD.find((f) => f.effectSignal === "HRV") || lensD.find((f) => f.effectSignal === "PRS") || null;
    const consecutive_load = consecHrv
      ? { tailDeltaPct: consecHrv.deltaPct, n: consecHrv.n, confidence: consecHrv.confidence }
      : null;

    const signalSummary: SignalSummary = {
      event_to_hrv: eventToHrv,
      event_to_rhr: eventToRhr,
      event_to_cognition: eventToCognition,
      sleep_to_prs,
      consecutive_load,
      performance_lift,
      generatedAt: new Date().toISOString(),
    };
    const topEventSubcategory =
      signalSummary.performance_lift?.subcategory_lift?.[0]?.subcategoryId ?? null;

    // ── v6: Wearable signal diagnostics ─────────────────────────────
    // Pure helper, runs on the same inputs the engine just used. Decides
    // *why* each Apple Health-derived block is or is not present. Never
    // mutates the payload or relaxes a gate.
    const diagnostics = buildWearableDiagnostics(
      {
        wearable: wearable as any[],
        events: events as any[],
        briefs: briefs as any[],
        hrSamplesByDay,
        restingBaseline,
        prsBaseline: (() => {
          const xs: number[] = [];
          (briefs as any[]).forEach((b) => { if (typeof b.score === "number") xs.push(b.score); });
          return xs.length >= 3 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
        })(),
        performanceLift: performance_lift,
      },
      {
        windowDays: days,
        engineVersion: ENGINE_VERSION,
        minOccurrencesEmerging: MIN_OCCURRENCES_EMERGING,
      },
    );
    payload.diagnostics = diagnostics;

    // Log every run for edge-function-logs visibility.
    console.log("[cause-effect-engine][diag]", JSON.stringify({
      user_id: userId,
      counts: diagnostics.counts,
      gate_reasons: diagnostics.gateReasons,
    }));

    // Persist diagnostic audit row. Failures here must not block the
    // payload response — diagnostics are observability, not correctness.
    const { error: diagErr } = await supabase
      .from("wearable_signal_diagnostics")
      .insert({
        user_id: userId,
        window_days: diagnostics.windowDays,
        engine_version: diagnostics.engineVersion,
        sleep_score_day_count: diagnostics.counts.sleepScoreDays,
        rhr_day_count: diagnostics.counts.rhrDays,
        hrv_day_count: diagnostics.counts.hrvDays,
        hr_samples_day_count: diagnostics.counts.hrSamplesDays,
        rhr_recovered_day_count: diagnostics.counts.rhrRecoveredDays,
        rhr_window_bucket_counts: diagnostics.counts.rhrWindowBucketCounts,
        event_days_with_hr: diagnostics.counts.eventDaysWithHr,
        gate_reasons: diagnostics.gateReasons,
      });
    if (diagErr) console.error("[cause-effect-engine][diag] persist failed:", diagErr);

    const { error: upsertErr } = await supabase
      .from("causality_findings")
      .upsert({
        user_id: userId,
        pattern_kind: "cause_effect_v2",
        computed_for_date: todayStr,
        event_subcategory: topEventSubcategory,
        payload: payload as any,
        signal_summary: signalSummary as any,
      }, { onConflict: "user_id,pattern_kind,computed_for_date" });
    if (upsertErr) console.error("[cause-effect-engine] cache upsert failed:", upsertErr);

    // Attach the subset of signal_summary that client surfaces read (Insights
    // Stress Load renders `subcategory_lift`). Additive — never breaking.
    return new Response(JSON.stringify({
      ...payload,
      signalSummary: {
        subcategory_lift: signalSummary.performance_lift?.subcategory_lift ?? [],
      },
      cached: false,
    }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    console.error("[cause-effect-engine] FATAL:", err?.message || err);
    return new Response(
      JSON.stringify({ error: err?.message || "Internal error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
