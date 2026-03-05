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


const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_LABELS = ["Morning", "Afternoon", "Evening"];

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

const HIGH_STAKES_KEYWORDS = [
  "board", "board meeting", "board of directors",
  "investor", "vc", "funding", "pitch",
  "crisis", "urgent", "emergency",
  "negotiation", "deal", "contract",
  "all hands", "town hall", "company meeting",
  "interview", "media", "press",
  "performance review", "annual review",
  "termination", "layoff", "difficult conversation",
  "quarterly", "qbr", "earnings",
  "product launch", "go live",
  "keynote", "conference", "speaking", "presentation",
];

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
    const userId = await verifyAuth0JWT(req.headers.get("authorization"));
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];
    const thirtyDaysAgoIso = thirtyDaysAgo.toISOString();

    // Fetch all data in parallel
    const [checkInsRes, calConnRes, calEventsRes, behaviorRes, readinessRes, ritualsRes, dialogueRes] =
      await Promise.all([
        sb.from("daily_checkins").select("outcome, energy_balance, checkin_date, created_at")
          .eq("user_id", userId).gte("checkin_date", thirtyDaysAgoStr).order("created_at", { ascending: false }),
        sb.from("calendar_connections").select("is_active")
          .eq("user_id", userId).eq("is_active", true).maybeSingle(),
        sb.from("calendar_events").select("title, start_time")
          .eq("user_id", userId).gte("start_time", thirtyDaysAgoIso),
        sb.from("behavior_logs").select("behavior_type, created_at")
          .eq("user_id", userId).gte("created_at", thirtyDaysAgoIso),
        sb.from("inner_readiness_scores").select("composite_score, energy_tier, score_date, time_of_day")
          .eq("user_id", userId).gte("score_date", thirtyDaysAgoStr),
        sb.from("daily_ritual_completions").select("ritual_date, completion_status, session_period")
          .eq("user_id", userId).gte("ritual_date", thirtyDaysAgoStr),
        sb.from("dialogue_messages").select("content, sender_type, session_id")
          .limit(300),
      ]);

    const checkIns = checkInsRes.data || [];
    const hasCalendar = !!calConnRes.data?.is_active;
    const calendarEvents = calEventsRes.data || [];
    const behaviorLogs = behaviorRes.data || [];
    const readinessScores = readinessRes.data || [];
    const rituals = ritualsRes.data || [];
    const dialogueMessages = dialogueRes.data || [];

    console.log(`[perf-rhythm] ${userId}: ${checkIns.length}ci ${calendarEvents.length}ev ${behaviorLogs.length}beh ${readinessScores.length}irs`);

    // ── BUILD 3×7 GRID ──
    const grid: HeatmapCell[][] = Array(3).fill(null).map(() =>
      Array(7).fill(null).map(() => ({ outcome: null, compositeScore: null, divergence: false }))
    );
    const cellLatest: number[][] = Array(3).fill(null).map(() => Array(7).fill(0));

    for (const ci of checkIns) {
      if (!ci.created_at || !ci.outcome) continue;
      const d = new Date(ci.created_at);
      const tw = getTimeWindow(d.getHours());
      const di = getDayIndex(d.getDay());
      const t = d.getTime();
      if (t > cellLatest[tw][di]) {
        cellLatest[tw][di] = t;
        grid[tw][di].outcome = ci.outcome;
      }
    }

    // Composite score overlay
    const cellComposites: number[][][] = Array(3).fill(null).map(() =>
      Array(7).fill(null).map(() => [] as number[])
    );
    for (const s of readinessScores) {
      const d = new Date(s.score_date);
      const tw = getTimeWindow(d.getHours());
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

    // ── CALENDAR PATTERN (1B) ──
    let calendarInsight: string | null = null;
    if (hasCalendar && calendarEvents.length > 0 && checkIns.length >= 7) {
      const etCorr = new Map<string, { scores: number[]; count: number }>();
      for (const ev of calendarEvents) {
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
      const drain = corrs[0];
      const lift = corrs[corrs.length - 1];
      if (drain && drain.avg < 50) {
        calendarInsight = `On days with ${drain.et.replace("_", " ")} events, your readiness averages ${Math.round(drain.avg)} — observed across ${drain.count} occurrences.`;
      } else if (lift && lift.avg > 65) {
        const lbl = lift.et.replace("_", " ");
        calendarInsight = `${lbl.charAt(0).toUpperCase() + lbl.slice(1)} events consistently lift your readiness — avg ${Math.round(lift.avg)} across ${lift.count} occurrences.`;
      }
    }

    // ── CAUSE-EFFECT (1C) ──
    let causeEffectInsight: string | null = null;
    if (behaviorLogs.length >= 3 && checkIns.length > 0) {
      const bp = new Map<string, { behavior: string; outcome: string; count: number }>();
      for (const log of behaviorLogs) {
        const bd = new Date(log.created_at).toISOString().split("T")[0];
        const type = log.behavior_type?.toLowerCase();
        if (!type) continue;
        for (const ci of checkIns) {
          const diff = (new Date(ci.checkin_date).getTime() - new Date(bd).getTime()) / 86400000;
          if (diff >= 0 && diff <= 1 && ci.outcome) {
            const key = `${type}→${ci.outcome}`;
            if (!bp.has(key)) bp.set(key, { behavior: type, outcome: ci.outcome, count: 0 });
            bp.get(key)!.count++;
          }
        }
      }
      const totals = new Map<string, number>();
      bp.forEach(p => totals.set(p.behavior, (totals.get(p.behavior) || 0) + p.count));
      const patterns: { behavior: string; outcome: string; conf: number }[] = [];
      bp.forEach(p => {
        const t = totals.get(p.behavior) || 1;
        const conf = p.count / t;
        if (p.count >= 2 && conf >= 0.5) patterns.push({ behavior: p.behavior, outcome: p.outcome, conf });
      });
      patterns.sort((a, b) => b.conf - a.conf);
      if (patterns[0]) {
        const p = patterns[0];
        causeEffectInsight = `On days following ${p.behavior.charAt(0).toUpperCase() + p.behavior.slice(1)}, you tend to check in ${p.outcome} ${Math.round(p.conf * 100)}% of the time.`;
      }
    }

    // ── HOW YOU SHOW UP (1A) ──
    let presenceScore: number | null = null;
    let presenceLabel: string | null = null;
    let presenceInsight: string | null = null;

    const highStakesEvents = calendarEvents.filter(e =>
      e.title && HIGH_STAKES_KEYWORDS.some(k => e.title!.toLowerCase().includes(k))
    );
    const coachSessionCount = new Set(
      dialogueMessages.filter(m => m.sender_type === "coach").map(m => m.session_id)
    ).size;

    if (checkIns.length >= 7 && (highStakesEvents.length >= 1 || coachSessionCount >= 2)) {
      const preEventDone = rituals.filter(r =>
        r.session_period === "pre-event" && r.completion_status === "full" &&
        highStakesEvents.some(e => isSameDay(new Date(e.start_time).toISOString(), r.ritual_date))
      ).length;
      const preEventPts = Math.min(30, preEventDone * 10);

      const depletedHighStakes = highStakesEvents.filter(e => {
        const ds = readinessScores.find(s => isSameDay(s.score_date, new Date(e.start_time).toISOString().split("T")[0]));
        return ds && ds.energy_tier === "depleted";
      }).length;
      const depletedPts = Math.min(20, depletedHighStakes * 5);

      const posKw = /showed up well|brought full presence|held the room|commanded the space|fully there|present and sharp|brought your best/i;
      const negKw = /wasn't fully there|didn't bring it|phoned it in|checked out|not fully present|energy wasn't there/i;
      const posCount = dialogueMessages.filter(m => posKw.test(m.content)).length;
      const negCount = dialogueMessages.filter(m => negKw.test(m.content)).length;
      const coachPts = Math.max(-30, Math.min(30, (posCount * 15) - (negCount * 15)));

      const energizedCount = highStakesEvents.filter(e => {
        const evDateStr = new Date(e.start_time).toISOString().split("T")[0];
        const nextDate = new Date(new Date(e.start_time).getTime() + 86400000).toISOString().split("T")[0];
        const evScore = readinessScores.find(s => s.score_date === evDateStr);
        const nextScore = readinessScores.find(s => s.score_date === nextDate);
        return evScore && nextScore && (nextScore.composite_score > evScore.composite_score + 10);
      }).length;
      const energizedPts = Math.min(15, energizedCount * 5);

      presenceScore = Math.max(0, Math.min(100, preEventPts + depletedPts + coachPts + energizedPts));

      if (presenceScore >= 70) presenceLabel = "You show up when it matters";
      else if (presenceScore >= 50) presenceLabel = "Your presence holds under pressure";
      else if (presenceScore >= 30) presenceLabel = "Your presence varies with your state";
      else presenceLabel = "State is affecting your presence";

      const signals = [
        { s: preEventPts, t: `You prepared for ${preEventDone} of ${highStakesEvents.length} high-stakes moments — your presence held even when readiness was low.` },
        { s: Math.abs(coachPts), t: coachPts > 0 ? "Your coach has noted strong presence in high-stakes contexts — that consistency is a real strength." : "Your coach has flagged uneven presence when stakes are high — preparation matters but doesn't always close the gap." },
        { s: depletedPts, t: `You showed up to ${depletedHighStakes} high-stakes moments while depleted — your presence held despite your state.` },
        { s: energizedPts, t: "High-stakes moments energize you — your readiness often rises the day after, not before." },
      ];
      signals.sort((a, b) => b.s - a.s);
      presenceInsight = signals[0].s > 0 ? signals[0].t : "Building pattern data — presence insights strengthen after more high-stakes moments.";
    }

    // ── DATA SOURCE NOTE ──
    const daySpan = checkIns.length > 0
      ? Math.ceil((now.getTime() - new Date(checkIns[checkIns.length - 1].checkin_date).getTime()) / 86400000)
      : 0;
    let dataSourceNote = `Based on ${checkIns.length} check-in${checkIns.length !== 1 ? "s" : ""}`;
    if (behaviorLogs.length > 0) dataSourceNote += `, ${behaviorLogs.length} behavior log${behaviorLogs.length !== 1 ? "s" : ""}`;
    if (hasCalendar) dataSourceNote += ", calendar data";
    dataSourceNote += ` over ${daySpan} days`;

    const result = {
      presenceScore,
      presenceLabel,
      presenceInsight,
      calendarInsight,
      causeEffectInsight,
      grid,
      bestReadinessWindow,
      checkInCount: checkIns.length,
      behaviorLogCount: behaviorLogs.length,
      hasCalendar,
      dataSourceNote,
    };

    console.log(`[perf-rhythm] Done: ci=${checkIns.length} presence=${presenceScore} calIns=${!!calendarInsight} ceIns=${!!causeEffectInsight}`);

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[perf-rhythm] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});
