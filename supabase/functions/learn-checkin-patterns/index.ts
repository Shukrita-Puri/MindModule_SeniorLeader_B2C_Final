import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function scoreToTier(score: number): string {
  if (score < 40) return 'depleted';
  if (score < 60) return 'managing';
  if (score < 75) return 'strong';
  return 'peak';
}

function getMostCommon(arr: string[]): string {
  const counts: Record<string, number> = {};
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
  }
  return Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);
}

function getDayName(dayIndex: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
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

    // Get last 60 days of check-ins
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const { data: checkins } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', userId)
      .gte('checkin_date', sixtyDaysAgo.toISOString().split('T')[0])
      .order('checkin_date', { ascending: true });

    if (!checkins || checkins.length < 10) {
      return new Response(JSON.stringify({ data: { patternsLearned: 0, reason: 'Not enough data' } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Group by day-of-week + time-window
    const dowPatterns: Record<string, {
      day_of_week: number;
      time_window: string;
      outcomes: string[];
      tiers: string[];
      scores: number[];
    }> = {};

    for (const checkin of checkins) {
      const date = new Date(checkin.checkin_date);
      const dow = date.getDay();
      const window = checkin.time_window || 'morning';
      const key = `${dow}-${window}`;

      if (!dowPatterns[key]) {
        dowPatterns[key] = {
          day_of_week: dow,
          time_window: window,
          outcomes: [],
          tiers: [],
          scores: []
        };
      }

      dowPatterns[key].outcomes.push(checkin.outcome);
      dowPatterns[key].tiers.push(scoreToTier(checkin.energy_balance || 50));
      dowPatterns[key].scores.push(checkin.energy_balance || 50);
    }

    let patternsLearned = 0;

    for (const [, pattern] of Object.entries(dowPatterns)) {
      if (pattern.outcomes.length < 3) continue;

      const typicalOutcome = getMostCommon(pattern.outcomes);
      const typicalTier = getMostCommon(pattern.tiers);
      const mostCommonCount = pattern.outcomes.filter(x => x === typicalOutcome).length;
      const confidence = mostCommonCount / pattern.outcomes.length;

      const { error } = await supabase.from('checkin_patterns').upsert({
        user_id: userId,
        pattern_type: 'day_of_week',
        pattern_description: `${getDayName(pattern.day_of_week)} ${pattern.time_window}`,
        day_of_week: pattern.day_of_week,
        time_window: pattern.time_window,
        typical_outcome: typicalOutcome,
        typical_tier: typicalTier,
        observation_count: pattern.outcomes.length,
        confidence_score: confidence,
        last_observed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,day_of_week,time_window'
      });

      if (error) {
        console.error('[learn-checkin-patterns] Upsert error:', error);
      } else {
        patternsLearned++;
      }
    }

    console.log(`[learn-checkin-patterns] Learned ${patternsLearned} patterns for user ${userId}`);

    return new Response(JSON.stringify({ data: { patternsLearned } }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[learn-checkin-patterns] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
