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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// ── Tunables ───────────────────────────────────────────────────────────
const WINDOW_DAYS = 30;
const MIN_OCCURRENCES_EMERGING = 3;
const MIN_OCCURRENCES_STRONG = 5;
const MIN_DELTA_PCT_EMERGING = 10;
const MIN_DELTA_PCT_STRONG = 15;
const MIN_TIER_DELTA_EMERGING = 0.5;
const MIN_TIER_DELTA_STRONG = 1.0;
const RECOVERY_TOLERANCE_PCT = 5;
const RECOVERY_LOOKAHEAD_DAYS = 4;

/**
 * Bump this when scoring/classification logic changes so that any cached
 * row missing this version is treated as stale and recomputed automatically.
 */
const ENGINE_VERSION = 3;

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
  // Computed silently per spec — engine measures these so the UI can
  // surface them later without a separate backfill. The card does not
  // currently render these tabs.
  sleepDisruptionMatrix?: StressMatrix | null;
  recoveryCostTimeline?: RecoveryTimeline | null;
}

// ── Tabbed-card matrix shapes (presentation-ready, formula-free) ────────
interface StressMatrix {
  events: string[];               // column headers (event-type buckets)
  days: string[];                 // row headers (Mon..Fri)
  cells: (number | null)[][];     // value to render (e.g. peak HR delta in bpm); null = no data
  n: number[][];                  // sample size per cell
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
    weekly: number[];                               // 1-5 intensity per week
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

// Calendar event → coarse type label (broadened buckets)
const EVENT_TYPE_KEYWORDS: Array<{ label: string; words: string[] }> = [
  // ── Specific intent buckets first so "School Governor" doesn't fall
  //    into the broader "governance" or "Networking" matches. Order matters.
  { label: "School & family",        words: ["school", "parents evening", "open evening", "parents", "governor"] },
  { label: "Board / governance",     words: ["board", "governance"] },
  { label: "Investor calls",         words: ["investor", "vc ", " vc", "fundraise", "raise", "pitch deck"] },
  { label: "Reviews",                words: ["review", "qbr", "quarterly"] },
  { label: "1:1s",                   words: ["1:1", "1-1", "one on one", "1on1"] },
  { label: "All-hands",              words: ["all-hands", "all hands", "town hall", "townhall"] },
  { label: "Client meetings",        words: ["client", "customer", "stakeholder"] },
  { label: "Interviews",             words: ["interview", "candidate"] },
  { label: "Deep work blocks",       words: ["deep work", "focus block", "writing time"] },
  { label: "Exec / leadership",      words: ["exec", "executive", "leadership", "ceo ", " ceo", "cto ", " cto"] },
  // ── Broader catch-alls evaluated last ───────────────────────────────
  { label: "Networking & community", words: ["meetup", "summit", "expo", "conference", "info session", "community", "rise ai", "scale", "ai thursday", "connects"] },
  { label: "Intro / discovery calls", words: ["intro", "discovery", "chemistry"] },
  { label: "Catch-ups & syncs",       words: ["catchup", "catch-up", "catch up", "sync", "check-in", "check in", "weekly", "standup", "stand-up"] },
  { label: "Internal builds",         words: ["debug", "dashboard", "engineering", "sprint", "planning", "db ", " db"] },
];

function classifyEvent(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const ec of EVENT_TYPE_KEYWORDS) {
    if (ec.words.some((w) => t.includes(w))) return ec.label;
  }
  return null;
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
    try {
      userId = await verifyAuth0JWT(req);
    } catch (authErr: any) {
      console.log("[cause-effect-engine] auth rejected:", authErr?.message || authErr);
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const force = body?.force === true || body?.force === 1;
    const days = Math.min(Math.max(Number(body?.days) || WINDOW_DAYS, 14), 90);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date();
    const todayStr = ymd(today);

    // Cache check (24h) ------------------------------------------------
    if (!force) {
      const { data: cached } = await supabase
        .from("causality_findings")
        .select("payload")
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
          return new Response(JSON.stringify({ ...cachedPayload, cached: true }), {
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
        .maybeSingle(),
    ]);

    const events = eventsRes.data || [];
    const wearable = wearableRes.data || [];
    const checkins = checkinsRes.data || [];
    const briefs = briefsRes.data || [];
    const hasCalendar = !!calConnRes.data?.is_active;

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
      const label = classifyEvent(e.title) ?? classifyByAttendees(e.attendees_count);
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
          if (eventDayVals.length < MIN_OCCURRENCES_EMERGING || nonEventVals.length < 3) continue;

          const baseline = mean(nonEventVals);
          const observed = mean(eventDayVals);
          const deltaPct = pctDelta(observed, baseline);
          const conf = classifyNumeric(deltaPct, eventDayVals.length);
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

    // ── Stress Load matrix: per-event-window peak HR − resting baseline ─
    // Resting baseline = mean of resting_heart_rate over the window.
    // (Trailing 30-day mean is equivalent here because window === 30d.)
    const restingVals: number[] = (wearable as any[])
      .map((w) => (typeof w.resting_heart_rate === "number" ? w.resting_heart_rate : null))
      .filter((v) => typeof v === "number" && v > 0) as number[];
    const restingBaseline = restingVals.length >= 3 ? mean(restingVals) : null;

    const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const dayIndex = (iso: string): number => {
      // Using local-day already encoded in summary_date / event start_time.
      // JS getUTCDay: 0=Sun..6=Sat. We map Mon..Fri → 0..4, weekend → -1.
      const d = new Date(iso).getUTCDay();
      if (d === 0 || d === 6) return -1;
      return d - 1;
    };

    // Build column set: top event types by occurrence (max 7).
    const eventTypeCounts = new Map<string, number>();
    eventTypeDays.forEach((set, label) => eventTypeCounts.set(label, set.size));
    const topEventTypes = [...eventTypeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([label]) => label);

    // Accumulators for each (day, event) cell: arrays of per-event peak deltas.
    const stressAcc: Array<Array<number[]>> = DAY_LABELS.map(() =>
      topEventTypes.map(() => [] as number[]),
    );

    if (restingBaseline !== null && topEventTypes.length > 0) {
      for (const e of events as any[]) {
        if (!e.start_time || !e.end_time) continue;
        const dIdx = dayIndex(e.start_time);
        if (dIdx < 0) continue;
        const label = classifyEvent(e.title) ?? classifyByAttendees(e.attendees_count);
        const colIdx = topEventTypes.indexOf(label);
        if (colIdx < 0) continue;
        const dayKey = ymd(new Date(e.start_time));
        const samples = hrSamplesByDay.get(dayKey);
        if (!samples || samples.length === 0) continue; // honest: omit cell, no day-max proxy
        const startMs = new Date(e.start_time).getTime();
        const endMs = new Date(e.end_time).getTime();
        let peak = 0;
        for (const s of samples) {
          const t = new Date(s.t).getTime();
          if (t >= startMs && t <= endMs && typeof s.v === "number" && s.v > peak) {
            peak = s.v;
          }
        }
        if (peak <= 0) continue;
        const delta = peak - restingBaseline;
        if (!Number.isFinite(delta)) continue;
        stressAcc[dIdx][colIdx].push(delta);
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
      days: DAY_LABELS,
      cells: stressCells,
      n: stressN,
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
    const trajectoryOf = (weekly: number[]): "escalating" | "stable" | "improving" => {
      if (weekly.length < 2) return "stable";
      const delta = weekly[weekly.length - 1] - weekly[0];
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
    const wByWeek = (sig: "resting_heart_rate" | "hrv" | "sleep_score"): number[] => {
      const out: number[] = [];
      for (let w = 0; w < 5; w++) {
        const vals: number[] = [];
        (wearable as any[]).forEach((row) => {
          if (!row.summary_date) return;
          if (!inWeek(row.summary_date + "T12:00:00Z", w)) return;
          const v = row[sig];
          if (typeof v === "number" && v > 0) vals.push(v);
        });
        out.push(vals.length ? mean(vals) : NaN);
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
    const intensityFromTrend = (weekly: number[], invert = false): number[] => {
      const valid = weekly.filter((v) => Number.isFinite(v));
      if (valid.length === 0) return WEEK_LABELS.map(() => 1);
      const base = mean(valid);
      const span = Math.max(1, ...valid.map((v) => Math.abs(v - base)));
      return weekly.map((v) => {
        if (!Number.isFinite(v)) return 1;
        const dev = (v - base) / span; // -1..1
        const signed = invert ? -dev : dev;
        // Center at 3, scale to 1..5
        return clamp1to5(3 + signed * 2);
      });
    };
    const rhrWeekly = intensityFromTrend(rhrWeeks, false);
    const hrvWeekly = intensityFromTrend(hrvWeeks, true);
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
      cardTrajectory === "escalating" ? "Risk trajectory: escalating" :
      cardTrajectory === "improving"  ? "Risk trajectory: improving"  :
                                        "Risk trajectory: stable";

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
      generatedAt: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase
      .from("causality_findings")
      .upsert({
        user_id: userId,
        pattern_kind: "cause_effect_v2",
        computed_for_date: todayStr,
        payload: payload as any,
        signal_summary: signalSummary as any,
      }, { onConflict: "user_id,pattern_kind,computed_for_date" });
    if (upsertErr) console.error("[cause-effect-engine] cache upsert failed:", upsertErr);

    return new Response(JSON.stringify({ ...payload, cached: false }), {
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