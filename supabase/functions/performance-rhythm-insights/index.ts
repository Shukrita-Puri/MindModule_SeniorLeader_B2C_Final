import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { dedupeCalendarEvents } from "../_shared/executive-state-taxonomy.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";
import { loadLeaderProfile } from "../_shared/leader-profile-loader.ts";
import {
  buildWearableDailySeries,
  computeWearableBaselines,
  type WearableDim,
  type WearableRow,
} from "../_shared/signal-engine/checkin-pattern-aggregator.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-mm-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Full day names for user-facing copy. `DAYS` (abbreviated) is reserved for
// internal keys / logs only — pluralising "Sun" → "Suns" reads as nonsense.
const DAYS_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_LABELS = ["Morning", "Afternoon", "Evening"];

// "2026-04-19" → "Apr 19" — used in consecutive-run findings so the user
// sees the most recent occurrence inline ("3 Sundays in a row … last on Apr 19").
function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = parseInt(m, 10) - 1;
  const day = parseInt(d, 10);
  return `${months[idx] || m} ${day}`;
}

function getTimeWindow(hour: number): number {
  if (hour >= 5 && hour < 12) return 0;
  if (hour >= 12 && hour < 17) return 1;
  return 2;
}

function getDayIndex(dayOfWeek: number): number {
  return dayOfWeek === 0 ? 6 : dayOfWeek - 1;
}

function isSameDay(a: string, b: string): boolean {
  return a.split("T")[0] === b.split("T")[0];
}

const EVENT_TYPE_KEYWORDS: Record<string, string[]> = {
  board: ["board", "board meeting", "board of directors", "board deck"],
  investor: ["investor", "vc", "funding", "pitch", "fundraise"],
  quarterly: ["quarterly", "qbr", "q1", "q2", "q3", "q4", "quarterly review"],
  strategic: ["strategy", "strategic planning", "offsite", "vision", "roadmap"],
  client: ["client", "customer", "demo", "proposal"],
  performance_review: ["performance review", "annual review", "mid-year", "360"],
  all_hands: ["all hands", "town hall", "company meeting"],
  media: ["interview", "podcast", "media", "press"],
  deadline: ["deadline", "urgent", "due", "eod", "cob"],
  presentation: ["presentation", "speaking", "conference", "webinar"],
};

interface HeatmapCell {
  outcome: string | null;
  compositeScore: number | null;
  divergence: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const userId = await verifyAuth0JWT(req);
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Phase 5 — Leader Profile enrichment. Null-safe; Insights renders as
    // today when the profile is missing/in_progress. See
    // supabase/functions/_shared/leader-profile-loader.ts.
    const leaderProfile = await loadLeaderProfile(sb, userId).catch(() => null);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    // Fetch all data in parallel
    const [checkInsRes, calConnRes, calEventsRes, behaviorRes, readinessRes, ritualsRes, dialogueRes, jitRes, wearableRes, causalityRes] =
      await Promise.all([
        sb.from("daily_checkins").select("outcome, energy_balance, checkin_date, created_at, time_window, clarity_level, mental_sharpness_level, confidence_level, emotion_level, pressure_level, regulation_level")
          .eq("user_id", userId).gte("checkin_date", thirtyDaysAgoStr).order("created_at", { ascending: false }),
        sb.from("calendar_connections").select("is_active")
          .eq("user_id", userId).eq("is_active", true).limit(1).maybeSingle(),
        sb.from("calendar_events").select("title, start_time")
          .eq("user_id", userId).gte("start_time", thirtyDaysAgoIso),
        sb.from("behavior_logs").select("behavior_type, created_at")
          .eq("user_id", userId).gte("created_at", thirtyDaysAgoIso),
        sb.from("inner_readiness_scores").select("composite_score, energy_tier, score_date, time_of_day")
          .eq("user_id", userId).gte("score_date", thirtyDaysAgoStr),
        sb.from("daily_ritual_completions").select("ritual_date, completion_status, session_period")
          .eq("user_id", userId).gte("ritual_date", thirtyDaysAgoStr),
        sb.from("dialogue_sessions").select("id")
          .eq("user_id", userId).gte("created_at", thirtyDaysAgoIso),
        sb.from("jit_preferences").select("event_title, action, event_start_time")
          .eq("user_id", userId).gte("created_at", thirtyDaysAgoIso),
        sb.from("wearable_data")
          .select("summary_date, hrv, resting_heart_rate, sleep_score, total_sleep_minutes, sleep_efficiency")
          .eq("user_id", userId).gte("summary_date", thirtyDaysAgoStr),
        // v4 — read pre-projected positive correlations from the unified
        // pattern store. cause-effect-engine writes signal_summary nightly;
        // we surface its performance_lift key on the "When You Perform Best"
        // card without recomputing anything client-side.
        sb.from("causality_findings")
          .select("signal_summary, payload, computed_for_date")
          .eq("user_id", userId)
          .eq("pattern_kind", "cause_effect_v2")
          .order("computed_for_date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    const checkIns = checkInsRes.data || [];
    const hasCalendar = !!calConnRes.data?.is_active;
    // Cross-provider dedupe: same logical meeting can land once per provider
    // (e.g. Apple-mirrored Google). Collapse on (start_time, normalized_title).
    const calendarEvents = dedupeCalendarEvents(calEventsRes.data || []);
    const behaviorLogs = behaviorRes.data || [];
    const readinessScores = readinessRes.data || [];
    const rituals = ritualsRes.data || [];
    const jitPrefs = jitRes.data || [];
    const wearableData = wearableRes.data || [];
    // Latest performance_lift projection (may be absent for new users —
    // card falls back to the existing patterns block).
    const performanceLift = (causalityRes?.data as any)?.signal_summary?.performance_lift ?? null;
    // v6 — gate-failure diagnostics so the UI can render data-honest
    // "awaiting <reason>" lines when a block is null instead of a silent gap.
    const performanceDiagnostics =
      (causalityRes?.data as any)?.payload?.diagnostics ?? null;

    // BUG 1 fix: Scope dialogue_messages by user's session IDs
    const userSessionIds = (dialogueRes.data || []).map((s: any) => s.id);
    let dialogueMessages: any[] = [];
    if (userSessionIds.length > 0) {
      const { data: msgs } = await sb.from("dialogue_messages")
        .select("content, sender_type, session_id")
        .in("session_id", userSessionIds);
      dialogueMessages = msgs || [];
    }

    console.log(`[perf-rhythm] ${redactUserId(userId)}: ${checkIns.length}ci ${calendarEvents.length}ev ${behaviorLogs.length}beh ${readinessScores.length}irs ${wearableData.length}hrv`);

    // ── BUILD 3×7 GRID ──
    // Uses stored time_window (not UTC-derived hours) to avoid timezone mismatch
    const grid: HeatmapCell[][] = Array(3).fill(null).map(() =>
      Array(7).fill(null).map(() => ({ outcome: null, compositeScore: null, divergence: false }))
    );
    const cellLatest: Map<string, number> = new Map();

    for (const ci of checkIns) {
      if (!ci.checkin_date || !ci.outcome) continue;
      const d = new Date(ci.checkin_date);
      const tw = ci.time_window === 'morning' ? 0 : ci.time_window === 'afternoon' ? 1 : 2;
      const di = getDayIndex(d.getDay());
      const cellKey = `${tw}-${di}`;
      const t = ci.created_at ? new Date(ci.created_at).getTime() : 0;
      const prev = cellLatest.get(cellKey) || 0;
      if (t > prev) {
        cellLatest.set(cellKey, t);
        grid[tw][di].outcome = ci.outcome;
      }
    }

    // Composite score overlay
    const cellComposites: number[][][] = Array(3).fill(null).map(() =>
      Array(7).fill(null).map(() => [] as number[])
    );
    for (const s of readinessScores) {
      const d = new Date(s.score_date);
      // BUG 6 fix: Use time_of_day column instead of parsing hours from date-only score_date
      const tw = s.time_of_day === 'morning' ? 0 : s.time_of_day === 'afternoon' ? 1 : 2;
      const di = getDayIndex(d.getDay());
      cellComposites[tw][di].push(s.composite_score);
    }
    for (let t = 0; t < 3; t++) {
      for (let d = 0; d < 7; d++) {
        const sc = cellComposites[t][d];
        if (sc.length > 0) {
          grid[t][d].compositeScore = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
        }
      }
    }

    // Divergence
    const outcomeExpected: Record<string, number> = { focused: 75, steady: 60, scattered: 45, drained: 30, overwhelmed: 25 };
    for (let t = 0; t < 3; t++) {
      for (let d = 0; d < 7; d++) {
        const c = grid[t][d];
        if (c.outcome && c.compositeScore !== null) {
          if (Math.abs(c.compositeScore - (outcomeExpected[c.outcome] || 50)) >= 20) c.divergence = true;
        }
      }
    }

    // ── BEST READINESS WINDOW ──
    let bestReadinessWindow: { timeWindow: number; day: number; avgScore: number; label: string } | null = null;
    for (let t = 0; t < 3; t++) {
      for (let d = 0; d < 7; d++) {
        const sc = cellComposites[t][d];
        if (sc.length >= 1) {
          const avg = Math.round(sc.reduce((a, b) => a + b, 0) / sc.length);
          if (!bestReadinessWindow || avg > bestReadinessWindow.avgScore) {
            bestReadinessWindow = { timeWindow: t, day: d, avgScore: avg, label: `${TIME_LABELS[t]} on ${DAYS[d]} (avg readiness: ${avg})` };
          }
        }
      }
    }

    // Logistic event filter – skip transit/admin/booking events from all insight paths
    const LOGISTIC_KEYWORDS = [
      'station', 'bus', 'train', 'flight', 'airport', 'departure', 'arrival',
      'boarding', 'layover', 'transit', 'coach station', 'platform', 'taxi', 'uber', 'cab',
      'delivery', 'pick up', 'dry cleaning', 'groceries', 'pharmacy', 'haircut',
      'car service', 'mot', 'oil change', 'dentist', 'optician',
      'reminder', 'auto-pay', 'subscription', 'booking confirmation', 'ticket',
      'reservation', 'out of office', 'blocked', 'hold', 'placeholder', 'tentative',
    ];
    const LOGISTIC_PATTERN = /\[\d{6,}\]/;
    function isLogisticEvent(title: string): boolean {
      const lower = (title || '').toLowerCase();
      if (LOGISTIC_PATTERN.test(title || '')) return true;
      return LOGISTIC_KEYWORDS.some(kw => lower.includes(kw));
    }

    // Also check event_metadata.eventType for events classified as 'logistic' at sync time
    function isLogisticByMetadata(ev: any): boolean {
      return ev.event_metadata?.eventType === 'logistic';
    }

    // Filter calendar events for insight analysis – exclude logistics
    const insightCalendarEvents = calendarEvents.filter((ev: any) => {
      if (!ev.title) return false;
      if (isLogisticEvent(ev.title)) return false;
      if (isLogisticByMetadata(ev)) return false;
      return true;
    });

    // ── CALENDAR PATTERN (1B) ──
    let calendarInsight: string | null = null;
    if (hasCalendar && insightCalendarEvents.length > 0 && checkIns.length >= 7) {
      const etCorr = new Map<string, { scores: number[]; count: number }>();
      for (const ev of insightCalendarEvents) {
        if (!ev.title) continue;
        const tl = ev.title.toLowerCase();
        const evDate = new Date(ev.start_time).toISOString().split("T")[0];
        const et = Object.keys(EVENT_TYPE_KEYWORDS).find(type =>
          EVENT_TYPE_KEYWORDS[type].some(kw => tl.includes(kw))
        );
        if (!et) continue;
        const dayScore = readinessScores.find(s => isSameDay(s.score_date, evDate));
        if (!dayScore) continue;
        if (!etCorr.has(et)) etCorr.set(et, { scores: [], count: 0 });
        const x = etCorr.get(et)!;
        x.scores.push(dayScore.composite_score);
        x.count++;
      }
      const corrs: { et: string; avg: number; count: number }[] = [];
      etCorr.forEach((v, et) => {
        if (v.count >= 2) corrs.push({ et, avg: v.scores.reduce((a, b) => a + b, 0) / v.count, count: v.count });
      });
      corrs.sort((a, b) => a.avg - b.avg);
      // Phase 5 — if the leader declared high-stakes event types in
      // onboarding, prioritise them when surfacing drain/lift. Matching is
      // substring against the canonical event-type key (e.g. "board" matches
      // declared "board meeting"). Purely additive: falls back to the
      // statistical top/bottom when there is no declared match.
      const declaredHS: string[] = (leaderProfile?.priors.high_stakes_map?.declared_events ?? [])
        .map((s) => String(s).toLowerCase());
      const isDeclared = (et: string) =>
        declaredHS.some((d) => d.includes(et) || et.includes(d));
      const declaredDrain = corrs.find((c) => isDeclared(c.et));
      const declaredLift = [...corrs].reverse().find((c) => isDeclared(c.et));
      const drain = declaredDrain ?? corrs[0];
      const lift = declaredLift ?? corrs[corrs.length - 1];
      if (drain && drain.avg < 50) {
        calendarInsight = `On days with ${drain.et.replace("_", " ")} events, your readiness averages ${Math.round(drain.avg)} – observed across ${drain.count} occurrences.`;
      } else if (lift && lift.avg > 65) {
        const lbl = lift.et.replace("_", " ");
        calendarInsight = `${lbl.charAt(0).toUpperCase() + lbl.slice(1)} events consistently lift your readiness – avg ${Math.round(lift.avg)} across ${lift.count} occurrences.`;
      }
    }

    // ── CAUSE-EFFECT (1C) ──
    let causeEffectInsight: string | null = null;

    // Path A (NEW): Calendar Event Type × Physiology Correlation (HRV / RHR / HR peak)
    if (hasCalendar && insightCalendarEvents.length >= 2 && wearableData.length >= 3) {
      // Path A.0: Try the event_physiology_join view first — captures next-morning physiology
      // deltas (true causation signal: did the event tax the nervous system overnight?).
      // We evaluate HRV, RHR, and peak HR; the strongest, most consistent signal wins.
      try {
        const { data: joinRows } = await sb
          .from('event_physiology_join')
          .select('event_type, title, hrv_delta, rhr_delta, hr_delta, is_high_stakes')
          .eq('user_id', userId);

        if (joinRows && joinRows.length >= 3) {
          // Group by event type, collect per-metric deltas
          type Grp = { hrv: number[]; rhr: number[]; hr: number[]; titles: string[] };
          const grouped = new Map<string, Grp>();
          for (const r of joinRows) {
            const key = (r.event_type as string) || 'general';
            if (!grouped.has(key)) grouped.set(key, { hrv: [], rhr: [], hr: [], titles: [] });
            const g = grouped.get(key)!;
            if (r.hrv_delta !== null && r.hrv_delta !== undefined) g.hrv.push(r.hrv_delta as number);
            if (r.rhr_delta !== null && r.rhr_delta !== undefined) g.rhr.push(r.rhr_delta as number);
            if (r.hr_delta !== null && r.hr_delta !== undefined) g.hr.push(r.hr_delta as number);
            if (r.title) g.titles.push(r.title as string);
          }

          // Significance thresholds (each metric has different units / clinical meaning)
          //   HRV (ms):  ≥5 ms shift = meaningful  (drop = stress)
          //   RHR (bpm): ≥3 bpm shift = meaningful (rise = stress)
          //   HR  (bpm): ≥5 bpm shift = meaningful (rise = arousal)
          type Candidate = {
            key: string; metric: 'HRV' | 'RHR' | 'HR'; avgDelta: number;
            count: number; recentTitle: string; isStressSignal: boolean; severity: number;
          };
          const candidates: Candidate[] = [];
          grouped.forEach((g, k) => {
            const recent = g.titles[g.titles.length - 1] || '';
            const consider = (
              metric: 'HRV' | 'RHR' | 'HR',
              vals: number[],
              threshold: number,
              stressDirection: 'down' | 'up'
            ) => {
              if (vals.length < 2) return;
              const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
              if (Math.abs(avg) < threshold) return;
              const isStressSignal = stressDirection === 'down' ? avg < 0 : avg > 0;
              // Severity: normalised magnitude (so HRV ms and HR bpm compete fairly)
              const severity = Math.abs(avg) / threshold;
              candidates.push({ key: k, metric, avgDelta: avg, count: vals.length, recentTitle: recent, isStressSignal, severity });
            };
            consider('HRV', g.hrv, 5, 'down');
            consider('RHR', g.rhr, 3, 'up');
            consider('HR',  g.hr,  5, 'up');
          });

          // Prefer stress signals; tie-break by severity
          candidates.sort((a, b) => {
            if (a.isStressSignal !== b.isStressSignal) return a.isStressSignal ? -1 : 1;
            return b.severity - a.severity;
          });
          const top = candidates[0];
          if (top) {
            const label = top.key.replace(/[-_]/g, ' ');
            const cap = label.charAt(0).toUpperCase() + label.slice(1);
            const mag = Math.abs(Math.round(top.avgDelta));
            const unit = top.metric === 'HRV' ? 'ms' : 'bpm';
            const ref = top.recentTitle ? ` (e.g. "${top.recentTitle}")` : '';
            const verb =
              top.metric === 'HRV'
                ? (top.avgDelta < 0 ? 'drop' : 'lift')
                : (top.avgDelta > 0 ? 'raise' : 'lower');
            const metricLabel =
              top.metric === 'HRV' ? 'HRV'
              : top.metric === 'RHR' ? 'resting heart rate'
              : 'peak heart rate';
            const tail = top.isStressSignal
              ? ` — observed across ${top.count} events.`
              : ` — your nervous system handles them well, observed across ${top.count} events.`;
            causeEffectInsight = `${cap} events${ref} ${verb} your next-morning ${metricLabel} by ${mag}${unit} on average${tail}`;
          }
        }
      } catch (e) {
        console.warn('[perf-rhythm] event_physiology_join query failed, falling back:', e);
      }
    }

    // Path A (legacy fallback): Same-day HRV correlation if the view didn't yield a signal
    if (!causeEffectInsight && hasCalendar && insightCalendarEvents.length >= 2 && wearableData.length >= 3) {
      // Calculate 30-day HRV baseline
      const allHRVs = wearableData.map((w: any) => w.hrv as number);
      const hrvBaseline = allHRVs.reduce((a: number, b: number) => a + b, 0) / allHRVs.length;

      // Map wearable data by date for fast lookup
      const hrvByDate = new Map<string, number>();
      for (const w of wearableData) {
        hrvByDate.set(w.summary_date, w.hrv as number);
      }

      // Group calendar events by type, collect same-day HRV
      const eventTypeHRV = new Map<string, { hrvs: number[]; titles: string[] }>();
      for (const ev of insightCalendarEvents) {
        if (!ev.title) continue;
        const tl = ev.title.toLowerCase();
        const et = Object.keys(EVENT_TYPE_KEYWORDS).find(type =>
          EVENT_TYPE_KEYWORDS[type].some(kw => tl.includes(kw))
        );
        // Use actual event title (truncated) when no keyword match
        const groupKey = et || (ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title);
        const evDate = new Date(ev.start_time).toISOString().split("T")[0];
        const dayHRV = hrvByDate.get(evDate);
        if (dayHRV === undefined) continue;
        if (!eventTypeHRV.has(groupKey)) eventTypeHRV.set(groupKey, { hrvs: [], titles: [] });
        const entry = eventTypeHRV.get(groupKey)!;
        entry.hrvs.push(dayHRV);
        entry.titles.push(ev.title);
      }

      // Find event type with biggest HRV deviation from baseline
      let bestDeviation: { et: string; avgHRV: number; count: number; devPct: number; recentTitle: string; direction: string } | null = null;
      eventTypeHRV.forEach((data, et) => {
        if (data.hrvs.length < 2) return;
        const avgHRV = data.hrvs.reduce((a, b) => a + b, 0) / data.hrvs.length;
        const devPct = ((avgHRV - hrvBaseline) / hrvBaseline) * 100;
        if (Math.abs(devPct) >= 10) {
          if (!bestDeviation || Math.abs(devPct) > Math.abs(bestDeviation.devPct)) {
            bestDeviation = {
              et,
              avgHRV: Math.round(avgHRV),
              count: data.hrvs.length,
              devPct: Math.round(devPct),
              recentTitle: data.titles[data.titles.length - 1],
              direction: devPct < 0 ? "drop" : "rise",
            };
          }
        }
      });

      if (bestDeviation) {
        const b = bestDeviation as { et: string; avgHRV: number; count: number; devPct: number; recentTitle: string; direction: string };
        const label = b.et.replace(/_/g, " ");
        const absDevPct = Math.abs(b.devPct);
        if (b.direction === "drop") {
          causeEffectInsight = `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV drop (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) – observed across ${b.count} events.`;
        } else {
          causeEffectInsight = `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV rise (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) – these events don't tax your nervous system.`;
        }
      }
    }

    // Path B: behavior_logs → nearest same/next-day check-in (refined pairing)
    if (!causeEffectInsight && behaviorLogs.length >= 2 && checkIns.length > 0) {
      const bp = new Map<string, { behavior: string; outcome: string; count: number }>();
      for (const log of behaviorLogs) {
        const bd = new Date(log.created_at).toISOString().split("T")[0];
        const type = log.behavior_type?.toLowerCase();
        if (!type) continue;
        let nearest: typeof checkIns[0] | null = null;
        let nearestDiff = Infinity;
        for (const ci of checkIns) {
          const diff = (new Date(ci.checkin_date).getTime() - new Date(bd).getTime()) / 86400000;
          if (diff >= 0 && diff <= 1 && Math.abs(diff) < nearestDiff && ci.outcome) {
            nearest = ci;
            nearestDiff = Math.abs(diff);
          }
        }
        if (nearest) {
          const key = `${type}→${nearest.outcome}`;
          if (!bp.has(key)) bp.set(key, { behavior: type, outcome: nearest.outcome!, count: 0 });
          bp.get(key)!.count++;
        }
      }
      const totals = new Map<string, number>();
      bp.forEach(p => totals.set(p.behavior, (totals.get(p.behavior) || 0) + p.count));
      const patterns: { behavior: string; outcome: string; conf: number; count: number }[] = [];
      bp.forEach(p => {
        const t = totals.get(p.behavior) || 1;
        const conf = p.count / t;
        if (p.count >= 2 && conf >= 0.4) patterns.push({ behavior: p.behavior, outcome: p.outcome, conf, count: p.count });
      });
      patterns.sort((a, b) => b.conf - a.conf);
      if (patterns[0]) {
        const p = patterns[0];
        const behaviorLabel = p.behavior.replace(/_/g, ' ');
        causeEffectInsight = `On days following ${behaviorLabel.charAt(0).toUpperCase() + behaviorLabel.slice(1)}, you tend to check in '${p.outcome}' ${Math.round(p.conf * 100)}% of the time.`;
        // HRV enrichment for Path B
        if (wearableData.length >= 3) {
          const hrvByDate = new Map<string, number>();
          for (const w of wearableData) hrvByDate.set(w.summary_date, w.hrv as number);
          const allHRVs = wearableData.map((w: any) => w.hrv as number);
          const hrvBaseline = Math.round(allHRVs.reduce((a: number, b: number) => a + b, 0) / allHRVs.length);
          const behaviorDayHRVs: number[] = [];
          for (const log of behaviorLogs) {
            if (log.behavior_type?.toLowerCase() !== p.behavior) continue;
            const bd = new Date(log.created_at).toISOString().split("T")[0];
            const hrv = hrvByDate.get(bd);
            if (hrv !== undefined) behaviorDayHRVs.push(hrv);
          }
          if (behaviorDayHRVs.length >= 2) {
            const avgHRV = Math.round(behaviorDayHRVs.reduce((a, b) => a + b, 0) / behaviorDayHRVs.length);
            causeEffectInsight += ` Your HRV averaged ${avgHRV}ms on those days vs ${hrvBaseline}ms baseline.`;
          }
        }
      }
    }

    // Path C: Calendar event → next-day check-in outcome (independent fallback)
    if (!causeEffectInsight && hasCalendar && insightCalendarEvents.length >= 3 && checkIns.length >= 5) {
      const etOutcomes = new Map<string, string[]>();
      for (const ev of insightCalendarEvents) {
        if (!ev.title) continue;
        const tl = ev.title.toLowerCase();
        let et: string | undefined = Object.keys(EVENT_TYPE_KEYWORDS).find(type =>
          EVENT_TYPE_KEYWORDS[type].some(kw => tl.includes(kw))
        );
        // Use actual event title when no keyword match
        if (!et) et = ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title;
        if (!et) continue;
        const evDate = new Date(ev.start_time).toISOString().split("T")[0];
        const nextDate = new Date(new Date(ev.start_time).getTime() + 86400000).toISOString().split("T")[0];
        const sameDayCI = checkIns.find(c => c.checkin_date === evDate);
        const nextDayCI = checkIns.find(c => c.checkin_date === nextDate);
        const matchCI = nextDayCI || sameDayCI;
        if (matchCI?.outcome) {
          const etKey = et as string;
          if (!etOutcomes.has(etKey)) etOutcomes.set(etKey, []);
          etOutcomes.get(etKey)!.push(matchCI.outcome);
        }
      }
      let bestCalCE: { et: string; outcome: string; pct: number; count: number } | null = null;
      etOutcomes.forEach((outcomes, et) => {
        if (outcomes.length < 2) return;
        const freq = new Map<string, number>();
        outcomes.forEach(o => freq.set(o, (freq.get(o) || 0) + 1));
        freq.forEach((cnt, outcome) => {
          const pct = cnt / outcomes.length;
          if (pct >= 0.4 && (!bestCalCE || pct > bestCalCE.pct)) {
            bestCalCE = { et, outcome, pct, count: outcomes.length };
          }
        });
      });
      if (bestCalCE) {
        const b = bestCalCE as { et: string; outcome: string; pct: number; count: number };
        const isKeyword = Object.keys(EVENT_TYPE_KEYWORDS).includes(b.et);
        const label = isKeyword ? `${b.et.replace(/_/g, " ")} events` : `'${b.et}' events`;
        causeEffectInsight = `After ${label}, you tend to check in '${b.outcome}' – ${Math.round(b.pct * 100)}% of the time across ${b.count} occurrences.`;
        // HRV enrichment for Path C
        if (wearableData.length >= 3) {
          const hrvByDate = new Map<string, number>();
          for (const w of wearableData) hrvByDate.set(w.summary_date, w.hrv as number);
          const matchedDayHRVs: number[] = [];
          for (const ev of insightCalendarEvents) {
            if (!ev.title) continue;
            const tl2 = ev.title.toLowerCase();
            const et2 = Object.keys(EVENT_TYPE_KEYWORDS).find(type => EVENT_TYPE_KEYWORDS[type].some(kw => tl2.includes(kw)));
            const groupKey = et2 || (ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title);
            if (groupKey !== b.et) continue;
            const evDate = new Date(ev.start_time).toISOString().split("T")[0];
            const hrv = hrvByDate.get(evDate);
            if (hrv !== undefined) matchedDayHRVs.push(hrv);
          }
          if (matchedDayHRVs.length >= 2) {
            const avgHRV = Math.round(matchedDayHRVs.reduce((a, b) => a + b, 0) / matchedDayHRVs.length);
            causeEffectInsight += ` Your HRV on those days averaged ${avgHRV}ms.`;
          }
        }
      }
    }

    // Path D: Same-day check-in outcome correlation with any calendar event (broader net)
    if (!causeEffectInsight && hasCalendar && insightCalendarEvents.length >= 2 && checkIns.length >= 5) {
      const eventDayOutcomes: string[] = [];
      const nonEventDayOutcomes: string[] = [];
      const eventDates = new Set(insightCalendarEvents.map(e => new Date(e.start_time).toISOString().split("T")[0]));
      for (const ci of checkIns) {
        if (!ci.outcome) continue;
        if (eventDates.has(ci.checkin_date)) eventDayOutcomes.push(ci.outcome);
        else nonEventDayOutcomes.push(ci.outcome);
      }
      if (eventDayOutcomes.length >= 3 && nonEventDayOutcomes.length >= 2) {
        const posOutcomes = new Set(["focused", "steady"]);
        const eventPosPct = eventDayOutcomes.filter(o => posOutcomes.has(o)).length / eventDayOutcomes.length;
        const nonEventPosPct = nonEventDayOutcomes.filter(o => posOutcomes.has(o)).length / nonEventDayOutcomes.length;
        const diff = eventPosPct - nonEventPosPct;
        if (Math.abs(diff) >= 0.15) {
          if (diff > 0) {
            causeEffectInsight = `On days with calendar events, you check in positively ${Math.round(eventPosPct * 100)}% of the time vs ${Math.round(nonEventPosPct * 100)}% on quieter days – external structure may help you focus.`;
          } else {
            causeEffectInsight = `On quieter days without events, you check in positively ${Math.round(nonEventPosPct * 100)}% of the time vs ${Math.round(eventPosPct * 100)}% on event-heavy days – your inner state may benefit from space.`;
          }
          // HRV enrichment for Path D
          if (wearableData.length >= 3) {
            const hrvByDate = new Map<string, number>();
            for (const w of wearableData) hrvByDate.set(w.summary_date, w.hrv as number);
            const eventDayHRVs: number[] = [];
            const nonEventDayHRVs: number[] = [];
            for (const ci of checkIns) {
              const hrv = hrvByDate.get(ci.checkin_date);
              if (hrv === undefined) continue;
              if (eventDates.has(ci.checkin_date)) eventDayHRVs.push(hrv);
              else nonEventDayHRVs.push(hrv);
            }
            if (eventDayHRVs.length >= 2 && nonEventDayHRVs.length >= 2) {
              const evAvg = Math.round(eventDayHRVs.reduce((a, b) => a + b, 0) / eventDayHRVs.length);
              const neAvg = Math.round(nonEventDayHRVs.reduce((a, b) => a + b, 0) / nonEventDayHRVs.length);
              causeEffectInsight += ` HRV: ${evAvg}ms on event days vs ${neAvg}ms on quiet days.`;
            }
          }
        }
      }
    }

    // Path E: JIT completion → outcome correlation + HRV enrichment
    if (!causeEffectInsight && jitPrefs.length >= 2 && checkIns.length >= 5) {
      const jitCompleted = jitPrefs.filter(j => j.action === 'completed' || j.action === 'accepted');
      if (jitCompleted.length >= 2) {
        // Try HRV-enriched version first
        if (wearableData.length >= 3) {
          const hrvByDate = new Map<string, number>();
          for (const w of wearableData) {
            hrvByDate.set(w.summary_date, w.hrv as number);
          }
          const jitDayHRVs: number[] = [];
          const allEventDates = new Set<string>();
          for (const j of jitCompleted) {
            if (!j.event_start_time) continue;
            const evDate = new Date(j.event_start_time).toISOString().split("T")[0];
            allEventDates.add(evDate);
            const hrv = hrvByDate.get(evDate);
            if (hrv !== undefined) jitDayHRVs.push(hrv);
          }
          // Non-prepped event days: calendar events not in JIT completed set
          const nonPreppedHRVs: number[] = [];
          for (const ev of insightCalendarEvents) {
            const evDate = new Date(ev.start_time).toISOString().split("T")[0];
            if (allEventDates.has(evDate)) continue;
            const hrv = hrvByDate.get(evDate);
            if (hrv !== undefined) nonPreppedHRVs.push(hrv);
          }
          if (jitDayHRVs.length >= 2 && nonPreppedHRVs.length >= 2) {
            const jitAvg = Math.round(jitDayHRVs.reduce((a, b) => a + b, 0) / jitDayHRVs.length);
            const nonAvg = Math.round(nonPreppedHRVs.reduce((a, b) => a + b, 0) / nonPreppedHRVs.length);
            if (jitAvg > nonAvg) {
              causeEffectInsight = `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped event days – preparation may reduce physiological stress.`;
            } else {
              causeEffectInsight = `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped days – prep helps your state even when HRV stays similar.`;
            }
          }
        }
        // Fallback: check-in only
        if (!causeEffectInsight) {
          const completedOutcomes: string[] = [];
          for (const j of jitCompleted) {
            if (!j.event_start_time) continue;
            const evDate = new Date(j.event_start_time).toISOString().split("T")[0];
            const ci = checkIns.find(c => c.checkin_date === evDate);
            if (ci?.outcome) completedOutcomes.push(ci.outcome);
          }
          const positiveCount = completedOutcomes.filter(o => o === 'focused' || o === 'steady').length;
          if (completedOutcomes.length >= 2 && positiveCount / completedOutcomes.length >= 0.5) {
            causeEffectInsight = `When you completed JIT prep before events, you checked in positively ${Math.round(positiveCount / completedOutcomes.length * 100)}% of the time – observed across ${completedOutcomes.length} events.`;
          }
        }
      }
    }

    // Path F: Deterministic temporal fallback – use strongest day/time differential
    if (!causeEffectInsight && checkIns.length >= 7) {
      const positiveOutcomes = new Set(["focused", "steady"]);
      const weekdayCI = checkIns.filter(c => { const d = new Date(c.checkin_date).getDay(); return d >= 1 && d <= 5 && c.outcome; });
      const weekendCI = checkIns.filter(c => { const d = new Date(c.checkin_date).getDay(); return (d === 0 || d === 6) && c.outcome; });
      if (weekdayCI.length >= 3 && weekendCI.length >= 2) {
        const wdPos = weekdayCI.filter(c => positiveOutcomes.has(c.outcome!)).length / weekdayCI.length;
        const wePos = weekendCI.filter(c => positiveOutcomes.has(c.outcome!)).length / weekendCI.length;
        if (Math.abs(wdPos - wePos) >= 0.15) {
          const better = wdPos > wePos ? "weekdays" : "weekends";
          const worse = wdPos > wePos ? "weekends" : "weekdays";
          const betterPct = Math.round(Math.max(wdPos, wePos) * 100);
          const worsePct = Math.round(Math.min(wdPos, wePos) * 100);
          causeEffectInsight = `Your positive check-in rate on ${better} is ${betterPct}% vs ${worsePct}% on ${worse} – your environment on ${better} may better support your inner state.`;
        }
      }
      if (!causeEffectInsight) {
            const morningCI = checkIns.filter(c => c.time_window === 'morning' && c.outcome);
            const eveningCI = checkIns.filter(c => c.time_window === 'evening' && c.outcome);
        if (morningCI.length >= 3 && eveningCI.length >= 3) {
          const mPos = morningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / morningCI.length;
          const ePos = eveningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / eveningCI.length;
          if (Math.abs(mPos - ePos) >= 0.15) {
            const better = mPos > ePos ? "mornings" : "evenings";
            const betterPct = Math.round(Math.max(mPos, ePos) * 100);
            causeEffectInsight = `You tend to check in more positively during ${better} (${betterPct}% positive) – your natural rhythm may favour this window for high-stakes work.`;
          }
        }
      }
    }

    // ══════════════════════════════════════════════════════════════════
    // ── HOW YOU SHOW UP (1A) — Mind Rhythm Patterns ──
    // ══════════════════════════════════════════════════════════════════
    // Pure rhythm reader over the four trend calendars (Energy, Clarity,
    // Sharpness, Confidence). NO coach signals, NO calendar/JIT/behavior
    // signals, NO wearable signals — those live in other cards. This block
    // answers only: when (time-of-day × day-of-week) is the user most/least
    // energetic / clear / sharp / confident, and which of those are real
    // patterns (consecutive same-DOW runs).
    //
    // Per-dimension findings cap: 2.   Total findings cap: 6.
    // Gates: ≥7 obs per series for window/day insights, ≥3 for consecutive runs.

    type RhythmKind = 'peak-window' | 'low-window' | 'peak-day' | 'low-day' | 'consecutive-neg' | 'consecutive-pos' | 'cell-peak';
    // v3: 4 Mind check-in dims + 4 wearable dims (Body Rhythm). Wearable
    // findings compete in the same ranked list and are gated by the diversity
    // guard below (≤2 per dim, ≤2 per kind) so the top-3 stays balanced.
    type RhythmDimension =
      | 'clarity' | 'emotion' | 'pressure' | 'regulation'
      | 'hrv' | 'sleep_score' | 'sleep_duration' | 'sleep_efficiency'
      | 'rhr' | 'hr';

    /**
     * v4 — structured evidence behind every finding. Additive: the app now
     * assembles sentences from these numbers (perform-best templates), while
     * `text` / `longText` stay for backwards-compatible consumers.
     */
    interface RhythmStats {
      /** 0=Mon … 6=Sun for day-scoped findings. */
      day?: number;
      comparisonDay?: number;
      /** 0=Morning, 1=Afternoon, 2=Evening for window-scoped findings. */
      window?: number;
      comparisonWindow?: number;
      /** Positive rate (0–100) at the peak bucket / comparison bucket. */
      bestPct?: number;
      comparePct?: number;
      /** Percentage-point gap between best and comparison. */
      gapPp?: number;
      /** Consecutive same-DOW run length. */
      runLength?: number;
      lastDate?: string;
      /** Observations behind the finding (bucket n, or run length). */
      n: number;
      /** Observation dates used in the calculation (capped at 12). */
      dates: string[];
      /** Raw values used, when the series carries them (wearable dims). */
      rawValues?: number[];
      /** 'check-in' | 'wearable'. */
      source: 'check-in' | 'wearable';
      /** Polarity of the dimension: 'high' = higher is better. */
      polarity: 'high' | 'low';
    }

    interface RhythmFinding {
      kind: RhythmKind;
      dimension: RhythmDimension;
      /** Crisp app-facing copy (≤ ~110 chars). */
      text: string;
      /** Verbose long-form with stats — reserved for the weekly insights email. */
      longText: string;
      /** 0–1 statistical strength. */
      confidence: number;
      observations: number;
      /** Chief-of-Staff priority score; higher wins. */
      priorityScore: number;
      /** v4 — evidence block (see RhythmStats). */
      stats?: RhythmStats;
    }

    type SeriesPoint = { dateStr: string; di: number; tw: number; positive: boolean; negative: boolean; value?: number };

    const INVERTED_DIMS = new Set<RhythmDimension>(['pressure', 'rhr', 'hr']);

    const positiveOutcomeSet = new Set(['focused', 'steady']);
    const negativeOutcomeSet = new Set(['drained', 'overwhelmed']);

    const buildOutcomeSeries = (): SeriesPoint[] => {
      const out: SeriesPoint[] = [];
      for (const ci of checkIns) {
        if (!ci.checkin_date || !ci.outcome) continue;
        const d = new Date(ci.checkin_date);
        out.push({
          dateStr: ci.checkin_date,
          di: getDayIndex(d.getDay()),
          tw: ci.time_window === 'morning' ? 0 : ci.time_window === 'afternoon' ? 1 : 2,
          positive: positiveOutcomeSet.has((ci.outcome || '').toLowerCase()),
          negative: negativeOutcomeSet.has((ci.outcome || '').toLowerCase()),
        });
      }
      return out;
    };

    const buildLevelSeries = (
      field: 'clarity_level' | 'mental_sharpness_level' | 'confidence_level' | 'emotion_level' | 'pressure_level' | 'regulation_level',
      opts: { invert?: boolean } = {}
    ): SeriesPoint[] => {
      const out: SeriesPoint[] = [];
      for (const ci of checkIns as any[]) {
        const v = ci[field];
        if (!ci.checkin_date || v == null) continue;
        const d = new Date(ci.checkin_date);
        // For pressure_level, semantic is inverted: HIGH value (4–5) = "under load" (negative),
        // LOW value (1–2) = "composed" (positive). The `invert` flag flips polarity so
        // downstream pattern phrasing (positivePhrase / negativePhrase) stays correct.
        const positive = opts.invert ? v <= 2 : v >= 4;
        const negative = opts.invert ? v >= 4 : v <= 2;
        out.push({
          dateStr: ci.checkin_date,
          di: getDayIndex(d.getDay()),
          tw: ci.time_window === 'morning' ? 0 : ci.time_window === 'afternoon' ? 1 : 2,
          positive,
          negative,
        });
      }
      return out;
    };

    /**
     * Mine a single 4-band series for time-of-day, day-of-week, cell, and
     * consecutive-run patterns. Returns crisp app-facing `text` plus a verbose
     * `longText` (preserved for the weekly insights email).
     */
    const mineSeries = (
      series: SeriesPoint[],
      vocab: { dimension: RhythmDimension; appLabel: string; positivePhrase: string; negativePhrase: string; longPositiveLabel: string; longNegativeLabel: string }
    ): RhythmFinding[] => {
      const findings: RhythmFinding[] = [];
      if (series.length < 7) return findings;

      // ── Time-of-day (positive rate) ──
      const twBuckets: Record<number, { pos: number; n: number }> = { 0: { pos: 0, n: 0 }, 1: { pos: 0, n: 0 }, 2: { pos: 0, n: 0 } };
      for (const p of series) { twBuckets[p.tw].n++; if (p.positive) twBuckets[p.tw].pos++; }
      const twRates = Object.entries(twBuckets)
        .filter(([, v]) => v.n >= 3)
        .map(([tw, v]) => ({ tw: +tw, pct: v.pos / v.n, n: v.n }));
      if (twRates.length >= 2) {
        twRates.sort((a, b) => b.pct - a.pct);
        const best = twRates[0];
        const worst = twRates[twRates.length - 1];
        if (best.pct - worst.pct >= 0.20 && best.pct >= 0.5) {
          const pctBest = Math.round(best.pct * 100);
          const pctWorst = Math.round(worst.pct * 100);
          findings.push({
            kind: 'peak-window',
            dimension: vocab.dimension,
            text: `${TIME_LABELS[best.tw]}s are your peak ${vocab.appLabel} window — ${pctBest}% vs ${pctWorst}% in the ${TIME_LABELS[worst.tw].toLowerCase()} (n=${best.n + worst.n}).`,
            longText: `${TIME_LABELS[best.tw]}s are your ${vocab.longPositiveLabel} window (${pctBest}% across ${best.n} check-ins) – ${TIME_LABELS[worst.tw]}s sit at ${pctWorst}%.`,
            confidence: Math.min(1, (best.pct - worst.pct) + best.n / 30),
            observations: best.n + worst.n,
            priorityScore: 0,
          });
        }
      }

      // ── Day-of-week (positive rate) ──
      const doBuckets: Record<number, { pos: number; n: number }> = {};
      for (const p of series) {
        if (!doBuckets[p.di]) doBuckets[p.di] = { pos: 0, n: 0 };
        doBuckets[p.di].n++;
        if (p.positive) doBuckets[p.di].pos++;
      }
      const doRates = Object.entries(doBuckets)
        .filter(([, v]) => v.n >= 2)
        .map(([di, v]) => ({ di: +di, pct: v.pos / v.n, n: v.n }));
      if (doRates.length >= 2) {
        doRates.sort((a, b) => b.pct - a.pct);
        const best = doRates[0];
        const worst = doRates[doRates.length - 1];
        if (best.pct - worst.pct >= 0.30 && best.n >= 2 && worst.n >= 2) {
          const pctBest = Math.round(best.pct * 100);
          const pctWorst = Math.round(worst.pct * 100);
          // Pull the trough out as its own finding when the worst day is bad enough.
          // Otherwise emit a paired peak/trough headline.
          if (worst.pct <= 0.30) {
            findings.push({
              kind: 'low-day',
              dimension: vocab.dimension,
              text: `${DAYS_FULL[worst.di]}s slip on ${vocab.appLabel} — ${pctWorst}% vs your ${pctBest}% on ${DAYS_FULL[best.di]}s (last ${worst.n} ${DAYS_FULL[worst.di]}s).`,
              longText: `${DAYS_FULL[worst.di]}s land ${vocab.longPositiveLabel} only ${pctWorst}% of the time vs ${DAYS_FULL[best.di]}s at ${pctBest}%.`,
              confidence: Math.min(1, (best.pct - worst.pct) + (best.n + worst.n) / 20),
              observations: best.n + worst.n,
              priorityScore: 0,
            });
          }
          findings.push({
            kind: 'peak-day',
            dimension: vocab.dimension,
            text: `${DAYS_FULL[best.di]}s run sharpest on ${vocab.appLabel} (${pctBest}%); ${DAYS_FULL[worst.di]}s drop to ${pctWorst}% (n=${best.n + worst.n}).`,
            longText: `${DAYS_FULL[best.di]}s land ${vocab.longPositiveLabel} ${pctBest}% of the time vs ${DAYS_FULL[worst.di]}s at ${pctWorst}%.`,
            confidence: Math.min(1, (best.pct - worst.pct) + (best.n + worst.n) / 20),
            observations: best.n + worst.n,
            priorityScore: 0,
          });
        }
      }

      // ── Cell-level peak (DOW × TW) ──
      const cellBuckets: Map<string, { pos: number; n: number; di: number; tw: number }> = new Map();
      for (const p of series) {
        const key = `${p.di}-${p.tw}`;
        const cur = cellBuckets.get(key) || { pos: 0, n: 0, di: p.di, tw: p.tw };
        cur.n++;
        if (p.positive) cur.pos++;
        cellBuckets.set(key, cur);
      }
      const meanRate = series.filter(p => p.positive).length / series.length;
      const cellArr = [...cellBuckets.values()].filter(c => c.n >= 2);
      cellArr.sort((a, b) => (b.pos / b.n) - (a.pos / a.n));
      const topCell = cellArr[0];
      if (topCell && topCell.pos / topCell.n - meanRate >= 0.30) {
        const pctCell = Math.round((topCell.pos / topCell.n) * 100);
        findings.push({
          kind: 'cell-peak',
          dimension: vocab.dimension,
          text: `${DAYS_FULL[topCell.di]} ${TIME_LABELS[topCell.tw].toLowerCase()}s are your sharpest ${vocab.appLabel} window — ${pctCell}% across ${topCell.n} check-ins. Protect it.`,
          longText: `${DAYS_FULL[topCell.di]} ${TIME_LABELS[topCell.tw].toLowerCase()}s are your sharpest cell (${pctCell}% ${vocab.longPositiveLabel} across ${topCell.n} check-ins).`,
          confidence: Math.min(1, (topCell.pos / topCell.n - meanRate) + topCell.n / 10),
          observations: topCell.n,
          priorityScore: 0,
        });
      }

      // ── Consecutive same-DOW runs in the positive OR negative band ──
      // Group by DOW, sort by date, walk runs of length ≥3.
      const byDOW: Map<number, SeriesPoint[]> = new Map();
      for (const p of series) {
        if (!byDOW.has(p.di)) byDOW.set(p.di, []);
        byDOW.get(p.di)!.push(p);
      }
      for (const [di, pts] of byDOW) {
        const sorted = pts.slice().sort((a, b) => a.dateStr.localeCompare(b.dateStr));
        // Walk positive runs
        for (const band of ['positive', 'negative'] as const) {
          let run = 0;
          let lastDate = '';
          for (const p of sorted) {
            if (p[band]) {
              run++;
              lastDate = p.dateStr;
            } else {
              if (run >= 3) {
                findings.push({
                  kind: band === 'negative' ? 'consecutive-neg' : 'consecutive-pos',
                  dimension: vocab.dimension,
                  text: band === 'negative'
                    ? `${run} ${DAYS_FULL[di]}s in a row you've shown up ${vocab.negativePhrase} on ${vocab.appLabel} — last on ${formatShortDate(lastDate)}.`
                    : `${run} ${DAYS_FULL[di]}s in a row you've shown up ${vocab.positivePhrase} on ${vocab.appLabel} — through ${formatShortDate(lastDate)}.`,
                  longText: `${run}+ consecutive ${DAYS_FULL[di]}s you've checked in ${band === 'positive' ? vocab.longPositiveLabel : vocab.longNegativeLabel} (most recent ${formatShortDate(lastDate)}).`,
                  confidence: Math.min(1, 0.4 + run / 10),
                  observations: run,
                  priorityScore: 0,
                });
              }
              run = 0;
              lastDate = '';
            }
          }
          if (run >= 3) {
            findings.push({
              kind: band === 'negative' ? 'consecutive-neg' : 'consecutive-pos',
              dimension: vocab.dimension,
              text: band === 'negative'
                ? `${run} ${DAYS_FULL[di]}s in a row you've shown up ${vocab.negativePhrase} on ${vocab.appLabel} — last on ${formatShortDate(lastDate)}.`
                : `${run} ${DAYS_FULL[di]}s in a row you've shown up ${vocab.positivePhrase} on ${vocab.appLabel} — through ${formatShortDate(lastDate)}.`,
              longText: `${run}+ consecutive ${DAYS_FULL[di]}s you've checked in ${band === 'positive' ? vocab.longPositiveLabel : vocab.longNegativeLabel} (most recent ${formatShortDate(lastDate)}).`,
              confidence: Math.min(1, 0.4 + run / 10),
              observations: run,
              priorityScore: 0,
            });
          }
        }
      }

      // Order, dedupe by text, cap at 2.
      findings.sort((a, b) => b.confidence - a.confidence);
      const seenTexts = new Set<string>();
      const deduped: RhythmFinding[] = [];
      for (const f of findings) {
        if (seenTexts.has(f.text)) continue;
        seenTexts.add(f.text);
        deduped.push(f);
        if (deduped.length >= 2) break;
      }
      return deduped;
    };

    const claritySeries    = buildLevelSeries('clarity_level');
    const emotionSeries    = buildLevelSeries('emotion_level');
    const pressureSeries   = buildLevelSeries('pressure_level', { invert: true });
    const regulationSeries = buildLevelSeries('regulation_level');

    const clarityFindings = mineSeries(claritySeries, {
      dimension: 'clarity', appLabel: 'Clarity',
      positivePhrase: 'clear', negativePhrase: 'clouded',
      longPositiveLabel: 'Crystal/Lucid (4–5)', longNegativeLabel: 'Obscured/Clouded (1–2)',
    });
    const emotionFindings = mineSeries(emotionSeries, {
      dimension: 'emotion', appLabel: 'Emotion',
      positivePhrase: 'steady', negativePhrase: 'reactive',
      longPositiveLabel: 'Steady/Grounded (4–5)', longNegativeLabel: 'Reactive/Charged (1–2)',
    });
    const pressureFindings = mineSeries(pressureSeries, {
      dimension: 'pressure', appLabel: 'Pressure',
      positivePhrase: 'composed', negativePhrase: 'under load',
      longPositiveLabel: 'Composed/Light (1–2)', longNegativeLabel: 'Under load/Heavy (4–5)',
    });
    const regulationFindings = mineSeries(regulationSeries, {
      dimension: 'regulation', appLabel: 'Regulation',
      positivePhrase: 'composed', negativePhrase: 'depleted',
      longPositiveLabel: 'Regulated/Resourced (4–5)', longNegativeLabel: 'Depleted/Frayed (1–2)',
    });

    // ── Wearable Body Rhythm series ──
    // Same statistical engine; bands defined in the shared aggregator.
    // tw is fixed at 0 (wearables emit one row/night), so the time-of-day
    // patterns inside mineSeries naturally never trigger — only DOW and
    // consecutive-same-DOW runs surface for these dims.
    const wearableRowsTyped = wearableData as unknown as WearableRow[];
    const baselines = computeWearableBaselines(wearableRowsTyped);
    const mkWearableSeries = (dim: WearableDim): SeriesPoint[] =>
      buildWearableDailySeries(wearableRowsTyped, dim, baselines).map(p => ({
        dateStr: p.dateStr, di: p.di, tw: p.tw, positive: p.positive, negative: p.negative,
      }));

    const hrvFindings = mineSeries(mkWearableSeries('hrv'), {
      dimension: 'hrv', appLabel: 'HRV',
      positivePhrase: 'recovered', negativePhrase: 'depressed',
      longPositiveLabel: 'at/above baseline', longNegativeLabel: '≥10% below baseline',
    });
    const sleepScoreFindings = mineSeries(mkWearableSeries('sleep_score'), {
      dimension: 'sleep_score', appLabel: 'Sleep Score',
      positivePhrase: 'strong', negativePhrase: 'poor',
      longPositiveLabel: 'Sleep Score ≥75', longNegativeLabel: 'Sleep Score ≤60',
    });
    const sleepDurationFindings = mineSeries(mkWearableSeries('sleep_duration'), {
      dimension: 'sleep_duration', appLabel: 'Sleep Duration',
      positivePhrase: 'well-rested', negativePhrase: 'short on sleep',
      longPositiveLabel: '≥7h asleep', longNegativeLabel: '≤6h asleep',
    });
    const sleepEfficiencyFindings = mineSeries(mkWearableSeries('sleep_efficiency'), {
      dimension: 'sleep_efficiency', appLabel: 'Sleep Efficiency',
      positivePhrase: 'efficient', negativePhrase: 'restless',
      longPositiveLabel: 'efficiency ≥85%', longNegativeLabel: 'efficiency ≤75%',
    });

    // ── Performance Patterns prioritization ──
    // Surface the strongest day-of-week, time-of-day, and their intersection
    // (the three asks of the "Performance Patterns" section). Recurring risks
    // still rank, but pure celebratory streaks stay at the bottom.
    const KIND_WEIGHT: Record<RhythmKind, number> = {
      'cell-peak'      : 1.00, // day × time intersection (single strongest cell)
      'peak-day'       : 0.90, // strongest day-of-week
      'low-day'        : 0.85, // weakest day-of-week
      'peak-window'    : 0.85, // strongest time-of-day
      'low-window'     : 0.80, // weakest time-of-day
      'consecutive-neg': 0.70, // recurring drop (active risk)
      'consecutive-pos': 0.30, // celebratory, non-actionable
    };
    // Decision-quality signals first, then slow-movers. Cognitive (clarity) and
    // self-regulation lead; emotion and pressure follow as context modifiers.
    const DIMENSION_BONUS: Record<RhythmDimension, number> = {
      clarity: 0.15,
      regulation: 0.12,
      emotion: 0.10,
      pressure: 0.08,
      // Wearable dims: HRV ranks alongside regulation as a recovery
      // anchor; sleep dims sit just below emotion; efficiency last.
      hrv: 0.13,
      sleep_score: 0.11,
      sleep_duration: 0.11,
      sleep_efficiency: 0.09,
    };

    const allFindings: RhythmFinding[] = [
      ...clarityFindings, ...emotionFindings, ...pressureFindings, ...regulationFindings,
      ...hrvFindings, ...sleepScoreFindings, ...sleepDurationFindings, ...sleepEfficiencyFindings,
    ].map(f => ({
      ...f,
      priorityScore: KIND_WEIGHT[f.kind] + (f.confidence * 0.3) + DIMENSION_BONUS[f.dimension],
    }));

    // Diversity guard while picking top 3: ≤2 per dimension, ≤2 per kind,
    // so the user never sees three "Mondays peak / Fridays peak / …" findings.
    const sortedAll = allFindings.slice().sort((a, b) => b.priorityScore - a.priorityScore);
    const dimCount: Record<string, number> = {};
    const kindCount: Record<string, number> = {};
    const topThree: RhythmFinding[] = [];
    for (const f of sortedAll) {
      if (topThree.length >= 3) break;
      if ((dimCount[f.dimension] || 0) >= 2) continue;
      if ((kindCount[f.kind] || 0) >= 2) continue;
      topThree.push(f);
      dimCount[f.dimension] = (dimCount[f.dimension] || 0) + 1;
      kindCount[f.kind] = (kindCount[f.kind] || 0) + 1;
    }

    const mindRhythmPatterns = allFindings.length > 0
      ? { topThree, all: sortedAll }
      : null;

    // Top-level positive rate (mirror of friction) for the Trajectory scorecard.
    // Returned even though the same value is also exposed by state-patterns-insights,
    // so any caller of this endpoint can render it inline without a second fetch.
    const positiveRate = checkIns.length >= 5
      ? {
          pct: Math.round(
            (checkIns.filter(c => c.outcome && positiveOutcomeSet.has((c.outcome || '').toLowerCase())).length / checkIns.length) * 100
          ),
          n: checkIns.length,
        }
      : null;

    // ── DATA SOURCE NOTE ──
    const daySpan = checkIns.length > 0
      ? Math.ceil((now.getTime() - new Date(checkIns[checkIns.length - 1].checkin_date).getTime()) / 86400000)
      : 0;
    let dataSourceNote = `Based on ${checkIns.length} check-in${checkIns.length !== 1 ? "s" : ""}`;
    if (behaviorLogs.length > 0) dataSourceNote += `, ${behaviorLogs.length} behavior log${behaviorLogs.length !== 1 ? "s" : ""}`;
    if (hasCalendar) dataSourceNote += ", calendar data";
    if (wearableData.length > 0) {
      const hrvCount = wearableData.filter((w: any) => typeof w.hrv === 'number').length;
      const sleepCount = wearableData.filter((w: any) => typeof w.sleep_score === 'number' || typeof w.total_sleep_minutes === 'number').length;
      const parts: string[] = [];
      if (hrvCount > 0) parts.push(`${hrvCount} HRV reading${hrvCount !== 1 ? 's' : ''}`);
      if (sleepCount > 0) parts.push(`${sleepCount} sleep night${sleepCount !== 1 ? 's' : ''}`);
      if (parts.length > 0) dataSourceNote += `, ${parts.join(' & ')}`;
    }
    dataSourceNote += ` over ${daySpan} days`;

    // ── BUILD FULL MONTH CALENDAR ──
    interface WeekDaySlot { outcome: string | null; }
    interface WeekDay { date: string; dayLabel: string; dateNum: string; isToday: boolean; isFuture: boolean; slots: { morning: WeekDaySlot; midday: WeekDaySlot; evening: WeekDaySlot }; }
    interface WeekRow { weekLabel: string; startDate: string; days: WeekDay[]; }

    const twToSlot = (tw: string): 'morning' | 'midday' | 'evening' => {
      if (tw === 'morning') return 'morning';
      if (tw === 'afternoon') return 'midday';
      return 'evening';
    };

    const todayStr = now.toISOString().split("T")[0];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const DAY_NAMES_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    const monthDays: WeekDay[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(currentYear, currentMonth, d);
      const fmtDate = (dt: Date) => dt.toISOString().split("T")[0];
      const dateStr = fmtDate(dayDate);
      const isFuture = dateStr > todayStr;
      const isToday = dateStr === todayStr;

      const slots = { morning: { outcome: null as string | null }, midday: { outcome: null as string | null }, evening: { outcome: null as string | null } };
      const slotTimestamps: Record<string, number> = { morning: 0, midday: 0, evening: 0 };

      if (!isFuture) {
        const dayCheckIns = checkIns.filter(c => c.checkin_date === dateStr);
        for (const ci of dayCheckIns) {
          if (!ci.outcome) continue;
          const slot = twToSlot(ci.time_window || 'morning');
          const ciTime = ci.created_at ? new Date(ci.created_at).getTime() : 0;
          if (ciTime > slotTimestamps[slot]) {
            slotTimestamps[slot] = ciTime;
            slots[slot].outcome = ci.outcome;
          }
        }
      }

      monthDays.push({
        date: dateStr,
        dayLabel: DAY_NAMES_FULL[dayDate.getDay()],
        dateNum: String(d),
        isToday,
        isFuture,
        slots,
      });
    }

    const weekRows: WeekRow[] = [{
      weekLabel: '',
      startDate: monthDays[0].date,
      days: monthDays,
    }];

    const result = {
      // Legacy presence fields fully retired — kept null so older client builds
      // don't crash, but they will no longer surface anything in the UI.
      presenceScore: null,
      presenceLabel: null,
      presenceInsight: null,
      presenceActions: null,
      temporalPatterns: null,

      // New: pure rhythm patterns over the four trend calendars.
      mindRhythmPatterns,

      // New: positive-rate stat for Trajectory scorecard ("Consistency").
      positiveRate,

      // v4 — flat performance-lift projection from causality_findings.
      // See mem://architecture/unified-pattern-store. Null for new users.
      performanceLift,
      // v6 — paired diagnostics (always present after engine v6 runs).
      performanceDiagnostics,

      // Calendar Pattern + Cause-Effect remain on their own cards.
      calendarInsight,
      causeEffectInsight,

      grid,
      weekRows,
      bestReadinessWindow,
      checkInCount: checkIns.length,
      behaviorLogCount: behaviorLogs.length,
      hasCalendar,
      dataSourceNote,

      // Phase 5 — additive Leader Profile context. Null-safe: fields are
      // null when the CoS profile is missing/in_progress. Consumers use
      // these to PRIORITISE declared high-stakes event types and to frame
      // month-over-month summaries with the leader's archetype. Existing
      // rendering paths are unchanged when the profile is absent.
      leaderProfile: leaderProfile
        ? {
            status: leaderProfile.meta.status,
            archetype: leaderProfile.analysis.archetype,
            declaredHighStakes:
              leaderProfile.priors.high_stakes_map?.declared_events ?? [],
            inferredHighStakes:
              leaderProfile.priors.high_stakes_map?.inferred_events ?? [],
            cognitiveRisk: leaderProfile.priors.cognitive_risk_profile
              ? {
                  primary_risk:
                    leaderProfile.priors.cognitive_risk_profile.primary_risk,
                  risk_flags:
                    leaderProfile.priors.cognitive_risk_profile.risk_flags,
                  regulation_strengths:
                    leaderProfile.priors.cognitive_risk_profile
                      .regulation_strengths,
                }
              : null,
          }
        : null,
    };

    const totalFindings = mindRhythmPatterns?.all.length ?? 0;
    const topThreeCount = mindRhythmPatterns?.topThree.length ?? 0;
    console.log(`[perf-rhythm] Done: ci=${checkIns.length} rhythm=${totalFindings}(top3=${topThreeCount}) posRate=${positiveRate?.pct ?? 'n/a'} calIns=${!!calendarInsight} ceIns=${!!causeEffectInsight}`);

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[perf-rhythm] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
