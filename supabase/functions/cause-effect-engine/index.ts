/**
 * cause-effect-engine
 *
 * Powers the unified "Performance Causality" card on the Insights page.
 * Produces 4 lenses of cause→effect findings with strict CEO-grade gating:
 *   • Lens A — Events → Physiology (HRV / RHR delta vs baseline)
 *   • Lens B — Events → Cognition (clarity / sharpness / confidence / PRS delta)
 *   • Lens C — Sleep → Next-day Decision Quality (PRS + cognition vs sleep tier)
 *   • Lens D — Consecutive High-Load Days → Recovery (PRS / HRV after run)
 *
 * Every finding rendered MUST contain: cause, effect signal, magnitude (% delta + n),
 * recovery window, and pass: n>=3 AND |delta|>=10% (or >=0.5 tier on 1-5 scales).
 *
 * Auth: Auth0 JWT via verifyAuth0JWT (Auth0 tokens cannot satisfy auth.uid()).
 * Reads/writes via service-role client. Cached in `causality_findings` per day.
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
const MIN_OCCURRENCES = 3;            // n >= 3
const MIN_DELTA_PCT = 10;             // |%Δ| >= 10
const MIN_TIER_DELTA = 0.5;           // 0..5 scales
const RECOVERY_TOLERANCE_PCT = 5;     // returns to ±5% of baseline
const RECOVERY_LOOKAHEAD_DAYS = 4;

// ── Types ──────────────────────────────────────────────────────────────
type Lens = "A" | "B" | "C" | "D";
type Direction = "negative" | "positive";

interface Finding {
  lens: Lens;
  cause: string;          // "Board reviews", "Low-sleep nights (<6h)"
  effectSignal: string;   // "HRV", "Sharpness", "PRS"
  unit: string;           // "ms", "tier", "pts", "bpm"
  baseline: number;
  observed: number;
  deltaAbs: number;
  deltaPct: number;       // signed; negative = decline
  n: number;
  recoveryDays: number | null;
  direction: Direction;
  longText: string;       // for weekly email
}

interface Coverage {
  hasCalendar: boolean;
  hasWearable: boolean;
  checkinCount: number;
  briefCount: number;
  wearableDayCount: number;
  eventCount: number;
}

interface Payload {
  top: Finding | null;
  lensA: Finding[];
  lensB: Finding[];
  lensC: Finding[];
  lensD: Finding[];
  coverage: Coverage;
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
function passNumericGate(deltaPct: number, n: number): boolean {
  return n >= MIN_OCCURRENCES && Math.abs(deltaPct) >= MIN_DELTA_PCT;
}
function passTierGate(deltaAbs: number, n: number): boolean {
  return n >= MIN_OCCURRENCES && Math.abs(deltaAbs) >= MIN_TIER_DELTA;
}
function impactScore(f: Finding): number {
  // For cross-lens ranking. Heavier on n and magnitude.
  return Math.abs(f.deltaPct) * Math.log2(1 + f.n);
}

// Calendar event → coarse type label
const EVENT_TYPE_KEYWORDS: Array<{ key: string; label: string; words: string[] }> = [
  { key: "board",     label: "Board / governance", words: ["board", "governance"] },
  { key: "investor",  label: "Investor calls",     words: ["investor", "vc", "fundraise", "raise"] },
  { key: "review",    label: "Reviews",            words: ["review", "performance review", "qbr", "quarterly"] },
  { key: "1on1",      label: "1:1s",               words: ["1:1", "1-1", "one on one", "1on1"] },
  { key: "allhands",  label: "All-hands",          words: ["all-hands", "all hands", "town hall"] },
  { key: "client",    label: "Client meetings",    words: ["client", "customer", "stakeholder"] },
  { key: "interview", label: "Interviews",         words: ["interview", "candidate"] },
  { key: "deepwork",  label: "Deep work blocks",   words: ["deep work", "focus block", "writing"] },
  { key: "exec",      label: "Exec / leadership",  words: ["exec", "executive", "leadership", "ceo", "cto"] },
];

function classifyEvent(title: string | null | undefined): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  for (const ec of EVENT_TYPE_KEYWORDS) {
    if (ec.words.some((w) => t.includes(w))) return ec.label;
  }
  return null;
}

// ── Main handler ───────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req);
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
        .eq("computed_for_date", todayStr)
        .maybeSingle();
      if (cached?.payload) {
        return new Response(JSON.stringify({ ...cached.payload, cached: true }), {
          status: 200,
          headers: corsHeaders,
        });
      }
    }

    const startStr = ymd(addDays(today, -days));
    const startIso = new Date(startStr + "T00:00:00Z").toISOString();

    // Parallel reads ---------------------------------------------------
    const [eventsRes, wearableRes, checkinsRes, briefsRes, calConnRes] = await Promise.all([
      supabase.from("calendar_events")
        .select("title, start_time, end_time, attendees_count, is_organizer")
        .eq("user_id", userId)
        .gte("start_time", startIso),
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

    const coverage: Coverage = {
      hasCalendar,
      hasWearable: wearable.length >= 5,
      checkinCount: checkins.length,
      briefCount: briefs.length,
      wearableDayCount: wearable.length,
      eventCount: events.length,
    };

    // Index helpers ----------------------------------------------------
    const wearableByDay = new Map<string, typeof wearable[number]>();
    wearable.forEach((w) => wearableByDay.set(w.summary_date as string, w));

    // Daily PRS — average across windows for that date
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

    // Group events by date
    const eventsByDay = new Map<string, typeof events>();
    const eventTypeDays = new Map<string, Set<string>>(); // label -> Set<date>
    events.forEach((e: any) => {
      const d = ymd(new Date(e.start_time));
      if (!eventsByDay.has(d)) eventsByDay.set(d, []);
      eventsByDay.get(d)!.push(e);
      const label = classifyEvent(e.title);
      if (label) {
        if (!eventTypeDays.has(label)) eventTypeDays.set(label, new Set());
        eventTypeDays.get(label)!.add(d);
      }
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

    // ── Lens A — Events → Physiology ────────────────────────────────
    const lensA: Finding[] = [];
    if (hasCalendar && coverage.hasWearable && eventTypeDays.size > 0) {
      for (const sig of ["hrv", "resting_heart_rate"] as const) {
        const sigUnit = sig === "hrv" ? "ms" : "bpm";
        const sigLabel = sig === "hrv" ? "HRV" : "RHR";
        const negDirection: Direction = sig === "hrv" ? "negative" : "positive"; // RHR ↑ is bad

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
          if (eventDayVals.length < MIN_OCCURRENCES || nonEventVals.length < 3) continue;

          const baseline = mean(nonEventVals);
          const observed = mean(eventDayVals);
          const deltaPct = pctDelta(observed, baseline);
          if (!passNumericGate(deltaPct, eventDayVals.length)) continue;

          // Drop "good" deltas — Cause & Effect surfaces costs.
          const isHarmful = sig === "hrv" ? deltaPct < 0 : deltaPct > 0;
          if (!isHarmful) continue;

          // Recovery: days post-event for HRV/RHR to return to ±5%
          let recoverySamples: number[] = [];
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
          const recoveryDays = recoverySamples.length >= 2
            ? Math.round(mean(recoverySamples))
            : null;

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
            longText: `On days with ${label.toLowerCase()}, your ${sigLabel} averages ${observed.toFixed(0)}${sigUnit} vs your ${baseline.toFixed(0)}${sigUnit} baseline (n=${eventDayVals.length})${recoveryDays ? ` — typically recovers within ${recoveryDays} day${recoveryDays === 1 ? "" : "s"}.` : "."}`,
          });
        }
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
        // Pick the most-impacted dimension (largest negative absolute delta)
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
          if (eventVals.length < MIN_OCCURRENCES || baseVals.length < 3) continue;
          const baseline = mean(baseVals);
          const observed = mean(eventVals);
          const deltaAbs = observed - baseline;
          if (!passTierGate(deltaAbs, eventVals.length)) continue;
          if (deltaAbs >= 0) continue; // surface cognitive costs only

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
            longText: `On ${label.toLowerCase()} days, your ${dim.label} averages ${observed.toFixed(1)}/5 vs your ${baseline.toFixed(1)}/5 baseline (n=${eventVals.length}).`,
          };
          if (!best || Math.abs(finding.deltaAbs) > Math.abs(best.deltaAbs)) best = finding;
        }
        if (best) lensB.push(best);
      }
    }

    // ── Lens C — Sleep → Next-day Decision Quality ──────────────────
    const lensC: Finding[] = [];
    if (coverage.hasWearable && (briefs.length >= 5 || checkins.length >= 7)) {
      // Bucket sleep_score (or total_sleep_minutes if score missing) into Low/Mid/High by tertile.
      const sleepRows = wearable
        .filter((w: any) => typeof w.sleep_score === "number" || typeof w.total_sleep_minutes === "number")
        .map((w: any) => ({
          date: w.summary_date as string,
          score: typeof w.sleep_score === "number" ? w.sleep_score : (w.total_sleep_minutes / 60),
          isMinutes: typeof w.sleep_score !== "number",
        }));
      if (sleepRows.length >= 5) {
        const sorted = [...sleepRows].sort((a, b) => a.score - b.score);
        const lowCut = sorted[Math.floor(sorted.length / 3)].score;
        const highCut = sorted[Math.floor((2 * sorted.length) / 3)].score;

        const buckets: Record<"low" | "mid" | "high", string[]> = { low: [], mid: [], high: [] };
        sleepRows.forEach((r) => {
          const t = r.score <= lowCut ? "low" : r.score >= highCut ? "high" : "mid";
          buckets[t].push(r.date);
        });

        // For each bucket compute next-day PRS and morning Sharpness
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
          if (nLow < MIN_OCCURRENCES || nNonLow < 3) continue;

          const baseline = mean([...valuesByBucket.mid, ...valuesByBucket.high]);
          const observed = mean(valuesByBucket.low);
          const deltaAbs = observed - baseline;
          const deltaPct = pctDelta(observed, baseline);

          const passes = dim.unit === "tier"
            ? passTierGate(deltaAbs, nLow)
            : passNumericGate(deltaPct, nLow);
          if (!passes) continue;
          if (deltaAbs >= 0) continue;

          // Friendly threshold label
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
            longText: `After ${causeLabel.toLowerCase()}, next-day ${dim.name} averages ${observed.toFixed(dim.unit === "tier" ? 1 : 0)}${dim.unit === "tier" ? "/5" : dim.unit === "pts" ? " pts" : ""} vs your ${baseline.toFixed(dim.unit === "tier" ? 1 : 0)}${dim.unit === "tier" ? "/5" : dim.unit === "pts" ? " pts" : ""} baseline (n=${nLow}).`,
          });
        }
      }
    }

    // ── Lens D — Consecutive High-Load Days → Recovery ─────────────
    const lensD: Finding[] = [];
    if (hasCalendar && loadByDay.size >= 6) {
      // Top-third daily load in window = "heavy"
      const loads = [...loadByDay.values()].sort((a, b) => a - b);
      const heavyCut = loads[Math.floor((2 * loads.length) / 3)] || 0;
      const heavyDays = new Set<string>();
      loadByDay.forEach((m, d) => { if (m >= heavyCut && m > 0) heavyDays.add(d); });

      // Detect runs of >=2 consecutive heavy days; capture day AFTER the run.
      const orderedDates = [...allDates].sort();
      const runEndPlusOne: string[] = [];
      let runLen = 0;
      for (let i = 0; i < orderedDates.length; i++) {
        const d = orderedDates[i];
        if (heavyDays.has(d)) runLen++;
        else {
          if (runLen >= 2) runEndPlusOne.push(d); // d is the first non-heavy day after the run
          runLen = 0;
        }
      }
      // Edge case: run continues to end of window — skip (no recovery sample)

      if (runEndPlusOne.length >= MIN_OCCURRENCES) {
        // Compare PRS / HRV on runEndPlusOne vs baseline mean (all non-heavy non-run-tail days)
        const runTailSet = new Set(runEndPlusOne);
        const dimsForD: Array<{ name: "PRS" | "HRV"; unit: string; lookup: (d: string) => number | null; harmful: (delta: number) => boolean }> = [
          { name: "PRS", unit: "pts", lookup: (d) => prsByDay.get(d) ?? null, harmful: (x) => x < 0 },
          { name: "HRV", unit: "ms",  lookup: (d) => (wearableByDay.get(d)?.hrv as number) ?? null, harmful: (x) => x < 0 },
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
          if (tailVals.length < MIN_OCCURRENCES || baseVals.length < 3) continue;

          const baseline = mean(baseVals);
          const observed = mean(tailVals);
          const deltaPct = pctDelta(observed, baseline);
          if (!passNumericGate(deltaPct, tailVals.length)) continue;
          if (!dim.harmful(deltaPct)) continue;

          // Recovery: days for the signal to return to baseline ±5% after each run end
          let recovery: number[] = [];
          runEndPlusOne.forEach((tailDay) => {
            for (let k = 0; k <= RECOVERY_LOOKAHEAD_DAYS; k++) {
              const probe = ymd(addDays(new Date(tailDay + "T00:00:00Z"), k));
              const v = dim.lookup(probe);
              if (typeof v !== "number" || v <= 0) continue;
              if (Math.abs(pctDelta(v, baseline)) <= RECOVERY_TOLERANCE_PCT) {
                recovery.push(k + 1); // 1-indexed days to recover
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
            longText: `After 2+ consecutive heavy calendar days, your ${dim.name} drops to ${observed.toFixed(0)}${dim.unit === "pts" ? " pts" : dim.unit} vs your ${baseline.toFixed(0)}${dim.unit === "pts" ? " pts" : dim.unit} baseline (n=${tailVals.length})${recoveryDays ? ` — typically takes ${recoveryDays} day${recoveryDays === 1 ? "" : "s"} to recover.` : "."}`,
          });
        }
      }
    }

    // Trim each lens to the top 3 by impact
    const trim = (arr: Finding[]) =>
      arr.sort((a, b) => impactScore(b) - impactScore(a)).slice(0, 3);
    const lensATop = trim(lensA);
    const lensBTop = trim(lensB);
    const lensCTop = trim(lensC);
    const lensDTop = trim(lensD);

    // Cross-lens "top finding"
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
    };

    // Cache
    const { error: upsertErr } = await supabase
      .from("causality_findings")
      .upsert({
        user_id: userId,
        computed_for_date: todayStr,
        payload: payload as any,
      }, { onConflict: "user_id,computed_for_date" });
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