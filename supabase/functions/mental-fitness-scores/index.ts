import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-mm-client-platform",
};

interface RequestBody {
  action: "GET_SCORES" | "SAVE_SCORE" | "GET_LATEST_SCORE" | "GET_WEEKLY_DELTA";
  days?: number;
  // GET_WEEKLY_DELTA: ISO dates anchored in the user's local timezone
  thisMonday?: string; // YYYY-MM-DD
  lastMonday?: string; // YYYY-MM-DD
  lastToday?: string; // YYYY-MM-DD
  lastSunday?: string; // YYYY-MM-DD
  today?: string; // YYYY-MM-DD
  scoreData?: {
    score_date: string;
    score: number;
    ritual_completion_score?: number;
    checkin_consistency_score?: number;
    content_engagement_score?: number;
    streak_bonus?: number;
    current_streak?: number;
    trend?: string;
    is_baseline_period?: boolean;
    baseline_avg?: number;
    metadata?: Record<string, unknown>;
  };
}

type ReadinessComposition =
  | "baseline-only"
  | "refined-with-baseline"
  | "check-in-only"
  | "awaiting"
  | "unknown";

type WeeklyDeltaReason =
  | "composition_mismatch"
  | "not_enough_history"
  | "awaiting_signals"
  | null;

interface SnapshotRow {
  local_date: string;
  readiness_score_baseline: number | null;
  readiness_score_refined: number | null;
  readiness_state: string | null;
}

function inRange(d: string, lo: string, hi: string): boolean {
  return d >= lo && d <= hi;
}

function avg(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function classifyComposition(row: SnapshotRow): ReadinessComposition {
  if (
    row.readiness_state === "awaiting" ||
    (row.readiness_score_baseline == null &&
      row.readiness_score_refined == null)
  ) {
    return "awaiting";
  }
  const hasBaseline = typeof row.readiness_score_baseline === "number";
  const hasRefined = typeof row.readiness_score_refined === "number";
  if (hasBaseline && hasRefined) return "refined-with-baseline";
  if (hasRefined && !hasBaseline) return "check-in-only";
  if (hasBaseline) return "baseline-only";
  return "unknown";
}

export function summarizeWeek(
  rows: SnapshotRow[],
  startISO: string,
  endISO: string,
  metric: "baseline" | "refined",
): {
  composition: ReadinessComposition;
  metric: "baseline" | "refined" | null;
  average: number | null;
  rowCount: number;
  scoredDays: number;
} {
  const weekRows = rows.filter((row) =>
    inRange(row.local_date, startISO, endISO)
  );
  if (weekRows.length === 0) {
    return {
      composition: "unknown",
      metric,
      average: null,
      rowCount: 0,
      scoredDays: 0,
    };
  }

  const nonAwaiting = weekRows.filter((row) =>
    classifyComposition(row) !== "awaiting"
  );
  if (nonAwaiting.length === 0) {
    return {
      composition: "awaiting",
      metric,
      average: null,
      rowCount: weekRows.length,
      scoredDays: 0,
    };
  }

  const firstComposition = classifyComposition(nonAwaiting[0]);
  const mixed = nonAwaiting.some((row) =>
    classifyComposition(row) !== firstComposition
  );
  // Composition is diagnostic only — a mixed week still averages.
  const composition: ReadinessComposition = mixed ? "unknown" : firstComposition;
  const values = nonAwaiting
    .map((row) =>
      metric === "baseline"
        ? (row.readiness_score_baseline ?? row.readiness_score_refined)
        : (row.readiness_score_refined ?? row.readiness_score_baseline)
    )
    .filter((value): value is number => typeof value === "number");

  return {
    composition,
    metric,
    average: avg(values),
    rowCount: weekRows.length,
    scoredDays: values.length,
  };
}

export function computeWeeklyDeltaComparison(
  rows: SnapshotRow[],
  thisMonday: string,
  lastMonday: string,
  lastSunday: string,
  today: string,
): {
  baselineDelta: number | null;
  refinedDelta: number | null;
  delta: number | null;
  reason: WeeklyDeltaReason;
  thisWeekComposition: ReadinessComposition;
  lastWeekComposition: ReadinessComposition;
  comparisonMetric: "baseline" | "refined" | null;
  thisWeekAvg: number | null;
  lastWeekAvg: number | null;
  thisWeekScoredDays: number;
  lastWeekScoredDays: number;
  todayState: string;
} {
  const todayRow = rows.find((r) => r.local_date === today) || null;
  const todayState = todayRow?.readiness_state || "baseline";
  // Active metric follows today's MRS read: baseline until the check-in
  // refines it, refined thereafter. Both weeks use the same metric.
  const metric: "baseline" | "refined" =
    typeof todayRow?.readiness_score_refined === "number" ||
      todayState === "refined"
      ? "refined"
      : "baseline";

  const thisWeek = summarizeWeek(rows, thisMonday, today, metric);
  const lastWeek = summarizeWeek(rows, lastMonday, lastSunday, metric);

  let reason: WeeklyDeltaReason = null;
  let baselineDelta: number | null = null;
  let refinedDelta: number | null = null;
  let delta: number | null = null;

  if (thisWeek.average != null && lastWeek.average != null) {
    delta = Math.round(thisWeek.average - lastWeek.average);
    // Backward compatibility: the field matching the active metric carries
    // the delta, the other stays null (the shape existing clients read).
    if (metric === "baseline") {
      baselineDelta = delta;
    } else {
      refinedDelta = delta;
    }
  } else {
    reason = "not_enough_history";
  }

  return {
    baselineDelta,
    refinedDelta,
    delta,
    reason,
    thisWeekComposition: thisWeek.composition,
    lastWeekComposition: lastWeek.composition,
    comparisonMetric: metric,
    thisWeekAvg: thisWeek.average == null ? null : Math.round(thisWeek.average),
    lastWeekAvg: lastWeek.average == null ? null : Math.round(lastWeek.average),
    thisWeekScoredDays: thisWeek.scoredDays,
    lastWeekScoredDays: lastWeek.scoredDays,
    todayState,
  };
}

if (import.meta.main) {
  serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const auth = await authenticateRequest(req, corsHeaders);
      if (auth.errorResponse) return auth.errorResponse;
      const userId = auth.userId;

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );

      const reqBody = await req.json() as RequestBody;
      const { action, days, scoreData } = reqBody;
      console.log(
        `[mental-fitness-scores] Action: ${action}, User: ${
          redactUserId(userId)
        }`,
      );

      switch (action) {
        case "GET_SCORES": {
          const daysToFetch = days || 30;
          const startDate = new Date();
          startDate.setDate(startDate.getDate() - daysToFetch);

          const { data, error } = await supabase
            .from("mental_fitness_scores")
            .select("*")
            .eq("user_id", userId)
            .gte("score_date", startDate.toISOString().split("T")[0])
            .order("score_date", { ascending: false });

          if (error) {
            console.error("[mental-fitness-scores] GET_SCORES error:", error);
            throw error;
          }

          let rows = data ?? [];
          if (rows.length < 5) {
            const fallbackStart = new Date();
            fallbackStart.setDate(fallbackStart.getDate() - Math.max(daysToFetch, 90));
            const { data: checkinRows, error: checkinError } = await supabase
              .from("daily_checkins")
              .select("checkin_date, time_window, clarity_level, emotion_level, pressure_level, regulation_level")
              .eq("user_id", userId)
              .gte("checkin_date", fallbackStart.toISOString().split("T")[0])
              .order("checkin_date", { ascending: true });

            if (checkinError) {
              console.warn("[mental-fitness-scores] GET_SCORES check-in fallback error:", checkinError.message);
            } else {
              const existingDates = new Set(rows.map((row: any) => row.score_date));
              const byDate = new Map<string, number[]>();
              for (const row of checkinRows ?? []) {
                const pressure = typeof row.pressure_level === "number" ? 6 - row.pressure_level : null;
                const vals = [
                  row.clarity_level,
                  row.emotion_level,
                  pressure,
                  row.regulation_level,
                ].filter((v): v is number => typeof v === "number");
                if (vals.length < 2) continue;
                const avg = vals.reduce((sum, value) => sum + value, 0) / vals.length;
                const score = Math.round((avg / 5) * 100);
                const list = byDate.get(row.checkin_date) ?? [];
                list.push(score);
                byDate.set(row.checkin_date, list);
              }
              const fallbackRows = Array.from(byDate.entries())
                .filter(([date]) => !existingDates.has(date))
                .map(([date, scores]) => ({
                  user_id: userId,
                  score_date: date,
                  score: Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length),
                  metadata: { source: "checkin_composite" },
                }));
              rows = [...rows, ...fallbackRows]
                .sort((a: any, b: any) => String(b.score_date).localeCompare(String(a.score_date)));
            }
          }

          return new Response(JSON.stringify({ data: rows }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        case "GET_LATEST_SCORE": {
          const { data, error } = await supabase
            .from("mental_fitness_scores")
            .select("*")
            .eq("user_id", userId)
            .order("score_date", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (error) {
            console.error(
              "[mental-fitness-scores] GET_LATEST_SCORE error:",
              error,
            );
            throw error;
          }

          return new Response(JSON.stringify({ data }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        case "GET_WEEKLY_DELTA": {
          const { thisMonday, lastMonday, today } = reqBody;
          if (!thisMonday || !lastMonday || !today) {
            return new Response(
              JSON.stringify({ error: "Missing week anchors" }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
          // Full previous calendar week (Mon -> Sun). `lastToday` is accepted
          // for request compatibility but never used as a window bound.
          const lastSunday = reqBody.lastSunday ??
            new Date(
              new Date(`${lastMonday}T00:00:00Z`).getTime() +
                6 * 86400000,
            ).toISOString().slice(0, 10);
          // Phase 2 — snapshot is window-scoped; collapse to one row per
          // local_date by keeping the most recently updated window.
          const { data, error } = await supabase
            .from("daily_context_snapshot")
            .select(
              "local_date, readiness_score_baseline, readiness_score_refined, readiness_state, mrs_window, updated_at",
            )
            .eq("user_id", userId)
            .gte("local_date", lastMonday)
            .lte("local_date", today)
            .order("updated_at", { ascending: false });

          if (error) {
            console.error(
              "[mental-fitness-scores] GET_WEEKLY_DELTA error:",
              error,
            );
            throw error;
          }

          const allRows = (data || []) as Array<{
            local_date: string;
            readiness_score_baseline: number | null;
            readiness_score_refined: number | null;
            readiness_state: string | null;
            mrs_window?: string | null;
            updated_at?: string | null;
          }>;
          // Collapse to one row per date: prefer a scored window over an
          // awaiting one, then the most recently updated (already ordered
          // by updated_at DESC).
          const byDate = new Map<string, typeof allRows[number]>();
          const isScored = (r: typeof allRows[number]) =>
            typeof r.readiness_score_refined === "number" ||
            typeof r.readiness_score_baseline === "number";
          for (const r of allRows) {
            const existing = byDate.get(r.local_date);
            if (!existing || (!isScored(existing) && isScored(r))) {
              byDate.set(r.local_date, r);
            }
          }
          const rows = [...byDate.values()];
          const comparison = computeWeeklyDeltaComparison(
            rows,
            thisMonday,
            lastMonday,
            lastSunday,
            today,
          );

          return new Response(
            JSON.stringify({
              data: {
                baselineDelta: comparison.baselineDelta,
                refinedDelta: comparison.refinedDelta,
                delta: comparison.delta,
                todayState: comparison.todayState,
                reason: comparison.reason,
                thisWeekComposition: comparison.thisWeekComposition,
                lastWeekComposition: comparison.lastWeekComposition,
                comparisonMetric: comparison.comparisonMetric,
                thisWeekAvg: comparison.thisWeekAvg,
                lastWeekAvg: comparison.lastWeekAvg,
                thisWeekScoredDays: comparison.thisWeekScoredDays,
                lastWeekScoredDays: comparison.lastWeekScoredDays,
              },
            }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        case "SAVE_SCORE": {
          if (!scoreData) {
            return new Response(
              JSON.stringify({ error: "Missing score data" }),
              {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          const { data, error } = await supabase
            .from("mental_fitness_scores")
            .upsert({
              user_id: userId,
              ...scoreData,
            }, { onConflict: "user_id,score_date" })
            .select()
            .single();

          if (error) {
            console.error("[mental-fitness-scores] SAVE_SCORE error:", error);
            throw error;
          }

          return new Response(JSON.stringify({ data }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        default:
          return new Response(JSON.stringify({ error: "Unknown action" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Unknown error";
      console.error("[mental-fitness-scores] Error:", errorMessage);
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  });
}
