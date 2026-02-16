import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AUTH0_DOMAIN = Deno.env.get("VITE_AUTH0_DOMAIN")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace("Bearer ", "");
  const response = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Auth0 userinfo failed: ${response.status} ${txt}`);
  }
  const data = await response.json();
  if (!data?.sub) throw new Error("Auth0 userinfo missing sub");
  return data.sub as string;
}

// Time window classification
function getTimeWindow(hour: number): "morning" | "afternoon" | "evening" {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 17) return "afternoon";
  return "evening"; // 18-4
}

function getDayLabel(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return days[date.getDay()];
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_WINDOWS = ["morning", "afternoon", "evening"] as const;

const HIGH_STAKES_KEYWORDS = [
  "board", "quarterly", "investor", "pitch", "review",
  "presentation", "interview", "deadline", "client", "all-hands",
  "performance", "budget", "strategy", "executive", "stakeholder",
];

interface HeatmapCell {
  outcome: string | null;
  avgScore: number | null;
  divergence: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userId = await verifyAuth0Token(authHeader);
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    // Fetch all data in parallel
    const [checkInsRes, calendarConnRes, calendarEventsRes, behaviorLogsRes] = await Promise.all([
      supabaseAdmin
        .from("daily_checkins")
        .select("outcome, energy_balance, checkin_date, created_at")
        .eq("user_id", userId)
        .gte("checkin_date", thirtyDaysAgoStr)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("calendar_connections")
        .select("is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle(),
      supabaseAdmin
        .from("calendar_events")
        .select("title, start_time")
        .eq("user_id", userId)
        .gte("start_time", thirtyDaysAgo.toISOString()),
      supabaseAdmin
        .from("behavior_logs")
        .select("behavior_type, created_at")
        .eq("user_id", userId)
        .gte("created_at", thirtyDaysAgo.toISOString()),
    ]);

    const checkIns = checkInsRes.data || [];
    const hasCalendar = !!calendarConnRes.data?.is_active;
    const calendarEvents = calendarEventsRes.data || [];
    const behaviorLogs = behaviorLogsRes.data || [];

    console.log(`[performance-rhythm-insights] User ${userId}: ${checkIns.length} checkins, ${calendarEvents.length} events, ${behaviorLogs.length} behaviors, calendar=${hasCalendar}`);

    // ── 1. Build Heatmap Grid (3x7) ──
    // Track most recent outcome per cell and all scores for averaging
    const cellOutcomes: Record<string, Record<string, { outcome: string | null; latestTime: number }>> = {};
    const cellScores: Record<string, Record<string, number[]>> = {};

    for (const tw of TIME_WINDOWS) {
      cellOutcomes[tw] = {};
      cellScores[tw] = {};
      for (const day of DAYS) {
        cellOutcomes[tw][day] = { outcome: null, latestTime: 0 };
        cellScores[tw][day] = [];
      }
    }

    for (const ci of checkIns) {
      if (!ci.created_at) continue;
      const date = new Date(ci.created_at);
      const hour = date.getHours();
      const tw = getTimeWindow(hour);
      const day = getDayLabel(date);
      const time = date.getTime();

      // Most recent outcome per cell
      if (ci.outcome && time > cellOutcomes[tw][day].latestTime) {
        cellOutcomes[tw][day] = { outcome: ci.outcome, latestTime: time };
      }

      // Accumulate scores for averaging
      if (ci.energy_balance != null) {
        cellScores[tw][day].push(ci.energy_balance);
      }
    }

    // Build heatmap response + find best window
    const heatmap: Record<string, Record<string, HeatmapCell>> = {};
    let bestWindowScore = -1;
    let bestWindowLabel = "";

    for (const tw of TIME_WINDOWS) {
      heatmap[tw] = {};
      for (const day of DAYS) {
        const outcome = cellOutcomes[tw][day].outcome;
        const scores = cellScores[tw][day];
        const avgScore = scores.length > 0
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;

        // Divergence: felt "focused" but composite score < 50 (Managing tier)
        const divergence = outcome === "focused" && avgScore !== null && avgScore < 50;

        heatmap[tw][day] = { outcome, avgScore, divergence };

        if (avgScore !== null && avgScore > bestWindowScore) {
          bestWindowScore = avgScore;
          bestWindowLabel = `${day} ${tw === "morning" ? "mornings" : tw === "afternoon" ? "afternoons" : "evenings"}`;
        }
      }
    }

    // ── 2. Best Performance Window ──
    const bestWindow = bestWindowScore > 0
      ? `Your sharpest window this month has been ${bestWindowLabel}.`
      : null;

    // ── 3. Calendar Pattern Observations (max 2) ──
    const observations: string[] = [];

    if (hasCalendar && calendarEvents.length > 0 && checkIns.length >= 5) {
      // Build a map of checkin_date → energy_balance values
      const dateScores: Record<string, number[]> = {};
      const dateOutcomes: Record<string, string[]> = {};
      for (const ci of checkIns) {
        const d = ci.checkin_date;
        if (ci.energy_balance != null) {
          if (!dateScores[d]) dateScores[d] = [];
          dateScores[d].push(ci.energy_balance);
        }
        if (ci.outcome) {
          if (!dateOutcomes[d]) dateOutcomes[d] = [];
          dateOutcomes[d].push(ci.outcome);
        }
      }

      // Overall 30-day average energy_balance
      const allScores = Object.values(dateScores).flat();
      const overallAvg = allScores.length > 0
        ? allScores.reduce((a, b) => a + b, 0) / allScores.length
        : null;

      // Map calendar event dates to keywords
      const keywordDays: Record<string, Set<string>> = {};
      for (const event of calendarEvents) {
        if (!event.title) continue;
        const titleLower = event.title.toLowerCase();
        const eventDate = new Date(event.start_time).toISOString().split("T")[0];

        for (const kw of HIGH_STAKES_KEYWORDS) {
          if (titleLower.includes(kw)) {
            if (!keywordDays[kw]) keywordDays[kw] = new Set();
            keywordDays[kw].add(eventDate);
          }
        }
      }

      // For each keyword, compute average energy_balance on those days vs overall
      const hasEnergyData = overallAvg !== null;

      interface KeywordInsight {
        keyword: string;
        delta: number;
        count: number;
        absDelta: number;
      }
      const keywordInsights: KeywordInsight[] = [];

      for (const [keyword, dates] of Object.entries(keywordDays)) {
        const datesArr = Array.from(dates);

        if (hasEnergyData) {
          // Energy-balance approach
          const kwScores: number[] = [];
          for (const d of datesArr) {
            if (dateScores[d]) kwScores.push(...dateScores[d]);
          }
          if (kwScores.length >= 3) {
            const kwAvg = kwScores.reduce((a, b) => a + b, 0) / kwScores.length;
            const delta = Math.round(kwAvg - overallAvg!);
            if (Math.abs(delta) >= 10) {
              keywordInsights.push({ keyword, delta, count: datesArr.length, absDelta: Math.abs(delta) });
            }
          }
        } else {
          // Fallback: outcome-correlation approach
          const outcomeCounts: Record<string, number> = {};
          let total = 0;
          for (const d of datesArr) {
            if (dateOutcomes[d]) {
              dateOutcomes[d].forEach(o => {
                outcomeCounts[o] = (outcomeCounts[o] || 0) + 1;
                total++;
              });
            }
          }
          if (total >= 3) {
            const sorted = Object.entries(outcomeCounts).sort((a, b) => b[1] - a[1]);
            const [topOutcome, topCount] = sorted[0];
            const confidence = topCount / total;
            if (confidence >= 0.5) {
              observations.push(
                `On days with ${keyword.charAt(0).toUpperCase() + keyword.slice(1)} events, you tend to check in ${topOutcome} ${Math.round(confidence * 100)}% of the time — observed across ${total} occurrences.`
              );
            }
          }
        }
      }

      // Sort by absolute delta and take top 2
      if (keywordInsights.length > 0) {
        keywordInsights.sort((a, b) => b.absDelta - a.absDelta);
        for (const insight of keywordInsights.slice(0, 2)) {
          const direction = insight.delta > 0 ? "higher" : "lower";
          observations.push(
            `On days with ${insight.keyword.charAt(0).toUpperCase() + insight.keyword.slice(1)} events, your Inner Readiness tends to be ${Math.abs(insight.delta)} points ${direction} than your average — observed across ${insight.count} days.`
          );
        }
      }
    }

    // ── 4. Behavior-State Observation (max 1) ──
    if (behaviorLogs.length > 0 && checkIns.length > 0) {
      const behaviorOutcomes = new Map<string, Map<string, number>>();

      for (const b of behaviorLogs) {
        const bDate = new Date(b.created_at).toISOString().split("T")[0];
        const type = b.behavior_type?.toLowerCase();
        if (!type) continue;

        // Same-day or next-day check-in
        for (const ci of checkIns) {
          const ciDate = ci.checkin_date;
          const diffMs = new Date(ciDate).getTime() - new Date(bDate).getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          if (diffDays >= 0 && diffDays <= 1 && ci.outcome) {
            const outcome = ci.outcome.toLowerCase();
            if (!behaviorOutcomes.has(type)) behaviorOutcomes.set(type, new Map());
            const m = behaviorOutcomes.get(type)!;
            m.set(outcome, (m.get(outcome) || 0) + 1);
          }
        }
      }

      // Find top pattern
      let topPattern: { trigger: string; outcome: string; confidence: number; total: number } | null = null;

      behaviorOutcomes.forEach((outcomes, behaviorType) => {
        let total = 0, maxState = "", maxCount = 0;
        outcomes.forEach((count, state) => {
          total += count;
          if (count > maxCount) { maxCount = count; maxState = state; }
        });
        const confidence = total > 0 ? maxCount / total : 0;
        if (total >= 2 && confidence >= 0.5) {
          if (!topPattern || confidence > topPattern.confidence || (confidence === topPattern.confidence && total > topPattern.total)) {
            topPattern = { trigger: behaviorType, outcome: maxState, confidence, total };
          }
        }
      });

      if (topPattern && observations.length < 2) {
        const p = topPattern as { trigger: string; outcome: string; confidence: number; total: number };
        const label = p.trigger.charAt(0).toUpperCase() + p.trigger.slice(1);
        observations.push(
          `On days following ${label} behaviors, you tend to check in ${p.outcome} ${Math.round(p.confidence * 100)}% of the time.`
        );
      }
    }

    // ── 5. Time-of-day & day-of-week pattern observations (no calendar needed) ──
    if (checkIns.length >= 3 && observations.length < 2) {
      const twOutcomes: Record<string, Record<string, number>> = { morning: {}, afternoon: {}, evening: {} };
      const twTotals: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 };
      for (const ci of checkIns) {
        if (!ci.created_at || !ci.outcome) continue;
        const h = new Date(ci.created_at).getHours();
        const tw = h >= 5 && h <= 11 ? "morning" : h >= 12 && h <= 17 ? "afternoon" : "evening";
        twOutcomes[tw][ci.outcome] = (twOutcomes[tw][ci.outcome] || 0) + 1;
        twTotals[tw]++;
      }
      let bestTw: { window: string; state: string; pct: number } | null = null;
      for (const [tw, outs] of Object.entries(twOutcomes)) {
        if (twTotals[tw] < 2) continue;
        const sorted = Object.entries(outs).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0) {
          const pct = sorted[0][1] / twTotals[tw];
          if (pct >= 0.6 && (!bestTw || pct > bestTw.pct)) {
            bestTw = { window: tw, state: sorted[0][0], pct };
          }
        }
      }
      if (bestTw && observations.length < 2) {
        const label = bestTw.window === "morning" ? "mornings" : bestTw.window === "afternoon" ? "afternoons" : "evenings";
        observations.push(`You tend to check in ${bestTw.state} during ${label} — ${Math.round(bestTw.pct * 100)}% of the time.`);
      }

      if (observations.length < 2) {
        const dayLabelsArr = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const dayScores: Record<string, number[]> = {};
        for (const ci of checkIns) {
          if (ci.energy_balance == null) continue;
          const d = dayLabelsArr[new Date(ci.checkin_date).getDay()];
          if (!dayScores[d]) dayScores[d] = [];
          dayScores[d].push(ci.energy_balance as number);
        }
        let bestDay: { day: string; avg: number } | null = null;
        let worstDay: { day: string; avg: number } | null = null;
        for (const [day, scores] of Object.entries(dayScores)) {
          if (scores.length < 2) continue;
          const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
          if (!bestDay || avg > bestDay.avg) bestDay = { day, avg: Math.round(avg) };
          if (!worstDay || avg < worstDay.avg) worstDay = { day, avg: Math.round(avg) };
        }
        if (bestDay && worstDay && bestDay.day !== worstDay.day) {
          observations.push(`Your readiness tends to peak on ${bestDay.day}s (avg ${bestDay.avg}) and dip on ${worstDay.day}s (avg ${worstDay.avg}).`);
        }
      }
    }

    // Cap at 2 observations
    const finalObservations = observations.slice(0, 2);

    const result = {
      heatmap,
      bestWindow,
      observations: finalObservations,
      hasCalendar,
      checkInCount: checkIns.length,
    };

    console.log(`[performance-rhythm-insights] Returning: ${finalObservations.length} observations, bestWindow=${!!bestWindow}`);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[performance-rhythm-insights] Error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
