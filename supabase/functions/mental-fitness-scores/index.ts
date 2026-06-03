import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'GET_SCORES' | 'SAVE_SCORE' | 'GET_LATEST_SCORE' | 'GET_WEEKLY_DELTA';
  days?: number;
  // GET_WEEKLY_DELTA: ISO dates anchored in the user's local timezone
  thisMonday?: string;   // YYYY-MM-DD
  lastMonday?: string;   // YYYY-MM-DD
  lastSunday?: string;   // YYYY-MM-DD
  today?: string;        // YYYY-MM-DD
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const reqBody = await req.json() as RequestBody;
    const { action, days, scoreData } = reqBody;
    console.log(`[mental-fitness-scores] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_SCORES': {
        const daysToFetch = days || 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysToFetch);
        
        const { data, error } = await supabase
          .from('mental_fitness_scores')
          .select('*')
          .eq('user_id', userId)
          .gte('score_date', startDate.toISOString().split('T')[0])
          .order('score_date', { ascending: false });

        if (error) {
          console.error('[mental-fitness-scores] GET_SCORES error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_LATEST_SCORE': {
        const { data, error } = await supabase
          .from('mental_fitness_scores')
          .select('*')
          .eq('user_id', userId)
          .order('score_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[mental-fitness-scores] GET_LATEST_SCORE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_WEEKLY_DELTA': {
        const { thisMonday, lastMonday, lastSunday, today } = reqBody;
        if (!thisMonday || !lastMonday || !lastSunday || !today) {
          return new Response(JSON.stringify({ error: 'Missing week anchors' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const { data, error } = await supabase
          .from('brief_snapshots')
          .select('local_date, time_window, created_at, baseline_score, refined_score, baseline_state, refined_state, daily_checkin_id')
          .eq('user_id', userId)
          .gte('local_date', lastMonday)
          .lte('local_date', today)
          .order('local_date', { ascending: true })
          .order('created_at', { ascending: true });

        if (error) {
          console.error('[mental-fitness-scores] GET_WEEKLY_DELTA error:', error);
          throw error;
        }

        // brief_snapshots can have multiple rows per local_date (one per
        // time_window, plus regenerations). Collapse to one row per day —
        // the latest by created_at — so daily averages aren't skewed by the
        // number of intra-day regenerations.
        type SnapRow = {
          local_date: string;
          time_window: string;
          created_at: string;
          baseline_score: number | null;
          refined_score: number | null;
          baseline_state: string | null;
          refined_state: string | null;
          daily_checkin_id: string | null;
        };
        const perDay = new Map<string, SnapRow>();
        for (const r of ((data || []) as SnapRow[])) {
          const prev = perDay.get(r.local_date);
          // Rows arrive ASC by created_at — last write wins for the day.
          if (!prev || r.created_at >= prev.created_at) perDay.set(r.local_date, r);
        }
        // Two parallel series per spec:
        //   baseline series — always populated (back-compat: historical rows
        //     have refined_score only, so coalesce to keep the series dense).
        //   refined series  — only days the user actually checked in. We
        //     detect that via refined_state='refined' OR a daily_checkin_id
        //     attached to that day's last snapshot.
        const rows = Array.from(perDay.values()).map((r) => {
          const hasCheckIn =
            r.refined_state === 'refined' || !!r.daily_checkin_id;
          return {
            local_date: r.local_date,
            readiness_score_baseline: r.baseline_score ?? r.refined_score,
            readiness_score_refined: hasCheckIn ? r.refined_score : null,
            readiness_state:
              r.refined_state === 'refined' || (hasCheckIn && r.refined_score != null)
                ? 'refined'
                : (r.baseline_state ?? 'baseline'),
          };
        });

        const inRange = (d: string, lo: string, hi: string) => d >= lo && d <= hi;
        const avg = (xs: number[]) =>
          xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

        const baselineThis = rows
          .filter(r => inRange(r.local_date, thisMonday, today))
          .map(r => r.readiness_score_baseline)
          .filter((v): v is number => typeof v === 'number');
        const baselineLast = rows
          .filter(r => inRange(r.local_date, lastMonday, lastSunday))
          .map(r => r.readiness_score_baseline)
          .filter((v): v is number => typeof v === 'number');
        const refinedThis = rows
          .filter(r => inRange(r.local_date, thisMonday, today))
          .map(r => r.readiness_score_refined)
          .filter((v): v is number => typeof v === 'number');
        const refinedLast = rows
          .filter(r => inRange(r.local_date, lastMonday, lastSunday))
          .map(r => r.readiness_score_refined)
          .filter((v): v is number => typeof v === 'number');

        const baselineThisAvg = avg(baselineThis);
        const baselineLastAvg = avg(baselineLast);
        const refinedThisAvg = avg(refinedThis);
        const refinedLastAvg = avg(refinedLast);

        const baselineDelta =
          baselineThisAvg !== null && baselineLastAvg !== null
            ? Math.round(baselineThisAvg - baselineLastAvg)
            : null;
        const refinedDelta =
          refinedThisAvg !== null && refinedLastAvg !== null
            ? Math.round(refinedThisAvg - refinedLastAvg)
            : null;

        const todayRow = rows.find(r => r.local_date === today) || null;
        const todayState =
          todayRow?.readiness_score_refined != null
            ? 'refined'
            : (todayRow?.readiness_state || 'baseline');
        const refinedDays = refinedThis.length + refinedLast.length;

        return new Response(JSON.stringify({
          data: {
            baselineDelta,
            refinedDelta,
            baselineThisAvg,
            baselineLastAvg,
            refinedThisAvg,
            refinedLastAvg,
            todayState,
            refinedDays,
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }


      case 'SAVE_SCORE': {
        if (!scoreData) {
          return new Response(JSON.stringify({ error: 'Missing score data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('mental_fitness_scores')
          .upsert({
            user_id: userId,
            ...scoreData
          }, { onConflict: 'user_id,score_date' })
          .select()
          .single();

        if (error) {
          console.error('[mental-fitness-scores] SAVE_SCORE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[mental-fitness-scores] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
