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
    const [checkInsRes, calConnRes, calEventsRes, behaviorRes, readinessRes, ritualsRes, dialogueRes, jitRes, wearableRes] =
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
        sb.from("dialogue_sessions").select("id")
          .eq("user_id", userId).gte("created_at", thirtyDaysAgoIso),
        sb.from("jit_preferences").select("event_title, action, event_start_time")
          .eq("user_id", userId).gte("created_at", thirtyDaysAgoIso),
        sb.from("wearable_data").select("summary_date, hrv, resting_heart_rate")
          .eq("user_id", userId).gte("summary_date", thirtyDaysAgoStr).not("hrv", "is", null),
      ]);

    const checkIns = checkInsRes.data || [];
    const hasCalendar = !!calConnRes.data?.is_active;
    const calendarEvents = calEventsRes.data || [];
    const behaviorLogs = behaviorRes.data || [];
    const readinessScores = readinessRes.data || [];
    const rituals = ritualsRes.data || [];
    const jitPrefs = jitRes.data || [];
    const wearableData = wearableRes.data || [];

    // BUG 1 fix: Scope dialogue_messages by user's session IDs
    const userSessionIds = (dialogueRes.data || []).map((s: any) => s.id);
    let dialogueMessages: any[] = [];
    if (userSessionIds.length > 0) {
      const { data: msgs } = await sb.from("dialogue_messages")
        .select("content, sender_type, session_id")
        .in("session_id", userSessionIds);
      dialogueMessages = msgs || [];
    }

    console.log(`[perf-rhythm] ${userId}: ${checkIns.length}ci ${calendarEvents.length}ev ${behaviorLogs.length}beh ${readinessScores.length}irs ${wearableData.length}hrv`);

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

    // Logistic event filter — skip transit/admin/booking events from all insight paths
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

    // Filter calendar events for insight analysis — exclude logistics
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

    // Path A (NEW): Calendar Event Type × HRV Correlation
    if (hasCalendar && insightCalendarEvents.length >= 3 && wearableData.length >= 5) {
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
          causeEffectInsight = `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV drop (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) — observed across ${b.count} events.`;
        } else {
          causeEffectInsight = `${label.charAt(0).toUpperCase() + label.slice(1)} events (e.g. "${b.recentTitle}") correlate with a ${absDevPct}% HRV rise (avg ${b.avgHRV}ms vs your baseline ${Math.round(hrvBaseline)}ms) — these events don't tax your nervous system.`;
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
        let et = Object.keys(EVENT_TYPE_KEYWORDS).find(type =>
          EVENT_TYPE_KEYWORDS[type].some(kw => tl.includes(kw))
        );
        // Use actual event title when no keyword match
        if (!et) et = ev.title.length > 40 ? ev.title.substring(0, 40) : ev.title;
        const evDate = new Date(ev.start_time).toISOString().split("T")[0];
        const nextDate = new Date(new Date(ev.start_time).getTime() + 86400000).toISOString().split("T")[0];
        const sameDayCI = checkIns.find(c => c.checkin_date === evDate);
        const nextDayCI = checkIns.find(c => c.checkin_date === nextDate);
        const matchCI = nextDayCI || sameDayCI;
        if (matchCI?.outcome) {
          if (!etOutcomes.has(et)) etOutcomes.set(et, []);
          etOutcomes.get(et)!.push(matchCI.outcome);
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
        causeEffectInsight = `After ${label}, you tend to check in '${b.outcome}' — ${Math.round(b.pct * 100)}% of the time across ${b.count} occurrences.`;
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
            causeEffectInsight = `On days with calendar events, you check in positively ${Math.round(eventPosPct * 100)}% of the time vs ${Math.round(nonEventPosPct * 100)}% on quieter days — external structure may help you focus.`;
          } else {
            causeEffectInsight = `On quieter days without events, you check in positively ${Math.round(nonEventPosPct * 100)}% of the time vs ${Math.round(eventPosPct * 100)}% on event-heavy days — your inner state may benefit from space.`;
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
              causeEffectInsight = `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped event days — preparation may reduce physiological stress.`;
            } else {
              causeEffectInsight = `When you completed JIT prep, your HRV averaged ${jitAvg}ms vs ${nonAvg}ms on unprepped days — prep helps your state even when HRV stays similar.`;
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
            causeEffectInsight = `When you completed JIT prep before events, you checked in positively ${Math.round(positiveCount / completedOutcomes.length * 100)}% of the time — observed across ${completedOutcomes.length} events.`;
          }
        }
      }
    }

    // Path F: Deterministic temporal fallback — use strongest day/time differential
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
          causeEffectInsight = `Your positive check-in rate on ${better} is ${betterPct}% vs ${worsePct}% on ${worse} — your environment on ${better} may better support your inner state.`;
        }
      }
      if (!causeEffectInsight) {
        const morningCI = checkIns.filter(c => { const h = new Date(c.created_at).getHours(); return h >= 5 && h < 12 && c.outcome; });
        const eveningCI = checkIns.filter(c => { const h = new Date(c.created_at).getHours(); return h >= 17 && c.outcome; });
        if (morningCI.length >= 3 && eveningCI.length >= 3) {
          const mPos = morningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / morningCI.length;
          const ePos = eveningCI.filter(c => positiveOutcomes.has(c.outcome!)).length / eveningCI.length;
          if (Math.abs(mPos - ePos) >= 0.15) {
            const better = mPos > ePos ? "mornings" : "evenings";
            const betterPct = Math.round(Math.max(mPos, ePos) * 100);
            causeEffectInsight = `You tend to check in more positively during ${better} (${betterPct}% positive) — your natural rhythm may favour this window for high-stakes work.`;
          }
        }
      }
    }

    // ── HOW YOU SHOW UP (1A) ──
    let presenceScore: number | null = null;
    let presenceLabel: string | null = null;
    let presenceInsight: string | null = null;
    let presenceActions: string[] = [];

    const highStakesEvents = insightCalendarEvents.filter(e =>
      e.title && HIGH_STAKES_KEYWORDS.some(k => e.title!.toLowerCase().includes(k))
    );
    const coachSessionCount = new Set(
      dialogueMessages.filter(m => m.sender_type === "coach").map(m => m.session_id)
    ).size;

    // Lowered gate: show presence section with ≥7 check-ins even without high-stakes/coach
    if (checkIns.length >= 7) {
      let pts = 0;

      // Signal 1: Pre-event rituals before high-stakes
      const preEventDone = rituals.filter(r =>
        r.session_period === "pre-event" && r.completion_status === "full" &&
        highStakesEvents.some(e => isSameDay(new Date(e.start_time).toISOString(), r.ritual_date))
      ).length;
      const preEventPts = Math.min(30, preEventDone * 10);
      pts += preEventPts;

      // Signal 2: Depleted during high-stakes (requires readiness scores)
      const depletedHighStakes = highStakesEvents.filter(e => {
        const ds = readinessScores.find(s => isSameDay(s.score_date, new Date(e.start_time).toISOString().split("T")[0]));
        return ds && ds.energy_tier === "depleted";
      }).length;
      const depletedPts = Math.min(20, depletedHighStakes * 5);
      pts += depletedPts;

      // Signal 3: Coach presence keywords
      const posKw = /showed up well|brought full presence|held the room|commanded the space|fully there|present and sharp|brought your best/i;
      const negKw = /wasn't fully there|didn't bring it|phoned it in|checked out|not fully present|energy wasn't there/i;
      const posCount = dialogueMessages.filter(m => posKw.test(m.content)).length;
      const negCount = dialogueMessages.filter(m => negKw.test(m.content)).length;
      const coachPts = Math.max(-30, Math.min(30, (posCount * 15) - (negCount * 15)));
      pts += coachPts;

      // Signal 4: Energized after high-stakes
      const energizedCount = highStakesEvents.filter(e => {
        const evDateStr = new Date(e.start_time).toISOString().split("T")[0];
        const nextDate = new Date(new Date(e.start_time).getTime() + 86400000).toISOString().split("T")[0];
        const evScore = readinessScores.find(s => s.score_date === evDateStr);
        const nextScore = readinessScores.find(s => s.score_date === nextDate);
        return evScore && nextScore && (nextScore.composite_score > evScore.composite_score + 10);
      }).length;
      const energizedPts = Math.min(15, energizedCount * 5);
      pts += energizedPts;

      // Signal 5 (NEW): Check-in consistency on high-stakes days
      const highStakesDayOutcomes: string[] = [];
      for (const ev of highStakesEvents) {
        const evDate = new Date(ev.start_time).toISOString().split("T")[0];
        const ci = checkIns.find(c => c.checkin_date === evDate);
        if (ci?.outcome) highStakesDayOutcomes.push(ci.outcome);
      }
      const positiveOutcomesSet = new Set(["focused", "steady"]);
      const hsPositivePct = highStakesDayOutcomes.length > 0
        ? highStakesDayOutcomes.filter(o => positiveOutcomesSet.has(o)).length / highStakesDayOutcomes.length
        : 0;
      const hsDayPts = highStakesDayOutcomes.length >= 2 ? Math.round(hsPositivePct * 25) : 0;
      pts += hsDayPts;

      // Signal 6 (NEW): Overall positive check-in rate as baseline
      const overallPosPct = checkIns.filter(c => c.outcome && positiveOutcomesSet.has(c.outcome)).length / checkIns.length;
      const baselinePts = Math.round(overallPosPct * 15);
      pts += baselinePts;

      presenceScore = Math.max(0, Math.min(100, pts));

      if (presenceScore >= 70) presenceLabel = "You show up when it matters";
      else if (presenceScore >= 50) presenceLabel = "Your presence holds under pressure";
      else if (presenceScore >= 30) presenceLabel = "Your presence varies with your state";
      else presenceLabel = "Building your presence pattern";

      // Build signals for insight text
      const signals: { s: number; t: string }[] = [];

      if (preEventPts > 0) signals.push({ s: preEventPts, t: `You prepared for ${preEventDone} of ${highStakesEvents.length} high-stakes moments — preparation correlates with stronger presence.` });
      if (Math.abs(coachPts) > 0) signals.push({ s: Math.abs(coachPts), t: coachPts > 0 ? "Your coach has noted strong presence in high-stakes contexts — that consistency is a real strength." : "Your coach has flagged uneven presence when stakes are high." });
      if (depletedPts > 0) signals.push({ s: depletedPts, t: `You showed up to ${depletedHighStakes} high-stakes moments while depleted — your presence held despite your state.` });
      if (energizedPts > 0) signals.push({ s: energizedPts, t: "High-stakes moments energize you — your readiness often rises the day after, not before." });

      // Check-in-based presence insights (always available)
      if (hsDayPts > 0 && highStakesDayOutcomes.length >= 2) {
        signals.push({ s: hsDayPts, t: `On high-stakes days, you checked in positively ${Math.round(hsPositivePct * 100)}% of the time across ${highStakesDayOutcomes.length} events.` });
      }
      if (baselinePts > 0) {
        signals.push({ s: baselinePts, t: `Your overall positive check-in rate is ${Math.round(overallPosPct * 100)}% — ${overallPosPct >= 0.6 ? "a strong foundation for sustained performance." : "there's room to build more consistent positive states."}` });
      }

      signals.sort((a, b) => b.s - a.s);
      presenceInsight = signals.length > 0 && signals[0].s > 0
        ? signals[0].t
        : "Building pattern data — presence insights strengthen with more check-ins and high-stakes moments.";

      // Build presenceActions from top signals, excluding the one already used as presenceInsight
      presenceActions = signals
        .filter(sig => sig.s > 0 && sig.t !== presenceInsight)
        .slice(0, 2)
        .map(sig => sig.t);

      // Add JIT-specific action if data available
      const jitBeforeHighStakes = jitPrefs.filter(j =>
        (j.action === 'completed' || j.action === 'accepted') && j.event_start_time
      ).length;
      if (jitBeforeHighStakes >= 2 && highStakesEvents.length > 0) {
        presenceActions.push(
          `You completed JIT prep before ${jitBeforeHighStakes} high-stakes events — this preparation pattern correlates with stronger presence.`
        );
      }

      // Add depleted recovery suggestion
      if (depletedHighStakes > highStakesEvents.length * 0.5 && highStakesEvents.length >= 2) {
        presenceActions.push(
          `You've shown up depleted to ${depletedHighStakes} of ${highStakesEvents.length} high-stakes moments — consider scheduling recovery blocks before these events.`
        );
      }

      // Cap at 3 actions
      presenceActions = presenceActions.slice(0, 3);
    }

    // ── TEMPORAL PATTERNS (day-of-week, time-of-day, weekday vs weekend, consecutive) ──
    const temporalPatterns: string[] = [];

    if (checkIns.length >= 7) {
      // Group check-ins by day-of-week × time-window
      const dayTimeOutcomes: Map<string, string[]> = new Map();
      const dayOutcomes: Map<number, string[]> = new Map();
      const timeOutcomes: Map<number, string[]> = new Map();
      const weekdayOutcomes: string[] = [];
      const weekendOutcomes: string[] = [];

      for (const ci of checkIns) {
        if (!ci.created_at || !ci.outcome) continue;
        const d = new Date(ci.created_at);
        const di = getDayIndex(d.getDay());
        const tw = getTimeWindow(d.getHours());
        const isWeekend = di >= 5; // Sat=5, Sun=6

        if (!dayOutcomes.has(di)) dayOutcomes.set(di, []);
        dayOutcomes.get(di)!.push(ci.outcome);

        if (!timeOutcomes.has(tw)) timeOutcomes.set(tw, []);
        timeOutcomes.get(tw)!.push(ci.outcome);

        const dtKey = `${di}-${tw}`;
        if (!dayTimeOutcomes.has(dtKey)) dayTimeOutcomes.set(dtKey, []);
        dayTimeOutcomes.get(dtKey)!.push(ci.outcome);

        if (isWeekend) weekendOutcomes.push(ci.outcome);
        else weekdayOutcomes.push(ci.outcome);
      }

      // 1. Consecutive same-day patterns (e.g., "3 consecutive Mondays depleted")
      // Group check-ins by day-of-week, ordered by date
      const dayDateOutcomes: Map<number, { date: string; outcome: string }[]> = new Map();
      for (const ci of checkIns) {
        if (!ci.created_at || !ci.outcome) continue;
        const d = new Date(ci.created_at);
        const di = getDayIndex(d.getDay());
        if (!dayDateOutcomes.has(di)) dayDateOutcomes.set(di, []);
        dayDateOutcomes.get(di)!.push({ date: ci.checkin_date, outcome: ci.outcome });
      }
      for (const [di, entries] of dayDateOutcomes) {
        // Deduplicate by date (keep latest)
        const byDate = new Map<string, string>();
        for (const e of entries) byDate.set(e.date, e.outcome);
        const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        // Find consecutive runs of 3+
        let runOutcome = sorted[0]?.[1];
        let runLen = 1;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i][1] === runOutcome) { runLen++; }
          else { 
            if (runLen >= 3 && runOutcome) {
              temporalPatterns.push(`${runLen} consecutive ${DAYS[di]}s you've checked in '${runOutcome}'.`);
            }
            runOutcome = sorted[i][1]; runLen = 1;
          }
        }
        if (runLen >= 3 && runOutcome) {
          temporalPatterns.push(`${runLen} consecutive ${DAYS[di]}s you've checked in '${runOutcome}'.`);
        }
      }

      // 2. Day-of-week × time-of-day comparison (e.g., "Friday evening more focused than Monday morning")
      const dtScores: Map<string, { focusedPct: number; label: string; count: number }> = new Map();
      const positiveOutcomes = new Set(["focused", "steady"]);
      dayTimeOutcomes.forEach((outcomes, key) => {
        if (outcomes.length < 2) return;
        const [diStr, twStr] = key.split("-");
        const posPct = outcomes.filter(o => positiveOutcomes.has(o)).length / outcomes.length;
        dtScores.set(key, { focusedPct: posPct, label: `${TIME_LABELS[+twStr]} ${DAYS[+diStr]}`, count: outcomes.length });
      });
      if (dtScores.size >= 2) {
        const sorted = [...dtScores.entries()].sort((a, b) => b[1].focusedPct - a[1].focusedPct);
        const best = sorted[0][1];
        const worst = sorted[sorted.length - 1][1];
        if (best.focusedPct - worst.focusedPct >= 0.3 && best.count >= 2 && worst.count >= 2) {
          temporalPatterns.push(
            `${best.label} you're positive ${Math.round(best.focusedPct * 100)}% of the time vs ${worst.label} at ${Math.round(worst.focusedPct * 100)}%.`
          );
        }
      }

      // 3. Weekday vs weekend
      if (weekdayOutcomes.length >= 3 && weekendOutcomes.length >= 2) {
        const wdPos = weekdayOutcomes.filter(o => positiveOutcomes.has(o)).length / weekdayOutcomes.length;
        const wePos = weekendOutcomes.filter(o => positiveOutcomes.has(o)).length / weekendOutcomes.length;
        const diff = Math.abs(wdPos - wePos);
        if (diff >= 0.2) {
          const better = wdPos > wePos ? "weekdays" : "weekends";
          const pct = Math.round(Math.max(wdPos, wePos) * 100);
          temporalPatterns.push(`You tend to check in more positively on ${better} (${pct}% focused/steady).`);
        }
      }

      // 4. Time-of-day pattern
      const timeScores: { tw: number; posPct: number; count: number }[] = [];
      timeOutcomes.forEach((outcomes, tw) => {
        if (outcomes.length >= 3) {
          timeScores.push({ tw, posPct: outcomes.filter(o => positiveOutcomes.has(o)).length / outcomes.length, count: outcomes.length });
        }
      });
      if (timeScores.length >= 2) {
        timeScores.sort((a, b) => b.posPct - a.posPct);
        const best = timeScores[0];
        const worst = timeScores[timeScores.length - 1];
        if (best.posPct - worst.posPct >= 0.2) {
          temporalPatterns.push(
            `${TIME_LABELS[best.tw]}s are your strongest window (${Math.round(best.posPct * 100)}% positive) — ${TIME_LABELS[worst.tw]}s your most challenging (${Math.round(worst.posPct * 100)}%).`
          );
        }
      }
    }

    // ── DATA SOURCE NOTE ──
    const daySpan = checkIns.length > 0
      ? Math.ceil((now.getTime() - new Date(checkIns[checkIns.length - 1].checkin_date).getTime()) / 86400000)
      : 0;
    let dataSourceNote = `Based on ${checkIns.length} check-in${checkIns.length !== 1 ? "s" : ""}`;
    if (behaviorLogs.length > 0) dataSourceNote += `, ${behaviorLogs.length} behavior log${behaviorLogs.length !== 1 ? "s" : ""}`;
    if (hasCalendar) dataSourceNote += ", calendar data";
    if (wearableData.length > 0) dataSourceNote += `, ${wearableData.length} HRV reading${wearableData.length !== 1 ? "s" : ""}`;
    dataSourceNote += ` over ${daySpan} days`;

    const result = {
      presenceScore,
      presenceLabel,
      presenceInsight,
      presenceActions: presenceActions.length > 0 ? presenceActions : null,
      temporalPatterns: temporalPatterns.length > 0 ? temporalPatterns.slice(0, 4) : null,
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
