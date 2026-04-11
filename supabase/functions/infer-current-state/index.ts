import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { callClaudeText, CLAUDE_MODELS } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Utility helpers ───────────────────────────────────────────────

function getCurrentTimeWindow(now: Date): 'morning' | 'afternoon' | 'evening' {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

function scoreToTier(score: number): 'depleted' | 'managing' | 'strong' | 'peak' {
  if (score < 40) return 'depleted';
  if (score < 60) return 'managing';
  if (score < 75) return 'strong';
  return 'peak';
}

function tierToOutcome(tier: string): string {
  const map: Record<string, string> = {
    depleted: 'drained',
    managing: 'steady',
    strong: 'focused',
    peak: 'focused',
  };
  return map[tier] || 'steady';
}

function patternToScore(pattern: any): number {
  const tierMap: Record<string, number> = { depleted: 30, managing: 50, strong: 70, peak: 85 };
  return tierMap[pattern.typical_tier] || 50;
}

function getDateNDaysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().split('T')[0];
}

function getDayName(dayIndex: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayIndex];
}

// ─── Time decay inference ──────────────────────────────────────────

function timeDecayInference(
  nearestCheckin: any,
  hoursSince: number,
  practicesCompleted: number
): { score: number; confidence: number } {
  let score = nearestCheckin.energy_balance || 50;
  let confidence = 100;

  // Apply time decay
  const decayFactor = Math.max(0.5, 1 - (hoursSince / 12));
  score = score * decayFactor;
  confidence -= Math.min(50, hoursSince * 5);

  // Adjust for practices
  score += practicesCompleted * 5;
  if (practicesCompleted > 0) confidence += 5;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    confidence: Math.max(20, Math.min(100, Math.round(confidence)))
  };
}

// ─── AI prediction ─────────────────────────────────────────────────

async function predictStateWithAI(
  targetWindow: string,
  relevantHistory: any[],
  dayOfWeek: number
): Promise<{ score: number; confidence: number }> {
  if (relevantHistory.length < 3) {
    return { score: 50, confidence: 30 };
  }

  const prompt = `
You are predicting a C-suite leader's inner state for ${targetWindow} on ${getDayName(dayOfWeek)}.

HISTORICAL DATA (last ${relevantHistory.length} ${targetWindow} check-ins on ${getDayName(dayOfWeek)}s):
${relevantHistory.slice(0, 10).map(c => `- ${c.checkin_date}: ${c.outcome} (score: ${c.energy_balance ?? 'N/A'}, clarity: ${c.clarity_level ?? 'N/A'}/5, confidence: ${c.confidence_level ?? 'N/A'}/5)`).join('\n')}

Return ONLY a JSON object:
{"predictedScore": 0-100, "confidence": 0-100}
  `.trim();

  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('ANTHROPIC_API_KEY')}`
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: 'You are a precise state prediction system. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 100
      })
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content.replace(/```json|```/g, '').trim());

    return {
      score: Math.max(0, Math.min(100, parsed.predictedScore || 50)),
      confidence: Math.max(20, Math.min(100, parsed.confidence || 30))
    };
  } catch (error) {
    console.error('[infer-current-state] AI prediction failed:', error);
    return { score: 50, confidence: 30 };
  }
}

// ─── Hybrid inference ──────────────────────────────────────────────

function hybridInference(
  nearestCheckin: any,
  pattern: any,
  hoursSince: number,
  practicesCompleted: number
): { score: number; confidence: number } {
  let score = patternToScore(pattern);
  let confidence = Math.round((pattern.confidence_score || 0.5) * 100);

  const recentCheckinScore = nearestCheckin.energy_balance || 50;
  const decayFactor = Math.max(0.3, 1 - (hoursSince / 8));
  const decayInfluence = 0.4;

  score = (score * (1 - decayInfluence)) + (recentCheckinScore * decayFactor * decayInfluence);
  score += practicesCompleted * 4;

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    confidence: Math.max(50, Math.min(100, confidence))
  };
}

// ─── Main inference engine ─────────────────────────────────────────

async function inferCurrentState(
  userId: string,
  supabase: any,
  usedFor: string = 'general'
) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentWindow = getCurrentTimeWindow(now);

  // Step 1: Get all check-ins today
  const { data: todayCheckins } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('checkin_date', today)
    .order('timestamp', { ascending: false });

  // Step 2: Check if we have a check-in for current window
  const currentWindowCheckin = todayCheckins?.find((c: any) => c.time_window === currentWindow);

  if (currentWindowCheckin) {
    return {
      tier: scoreToTier(currentWindowCheckin.energy_balance || 50),
      score: currentWindowCheckin.energy_balance || 50,
      outcome: currentWindowCheckin.outcome,
      confidence: 100,
      inferenceMethod: 'actual',
      basedOn: {
        actualCheckins: todayCheckins.map((c: any) => c.time_window),
        hoursSinceNearest: 0,
        practicesCompleted: 0
      }
    };
  }

  // Step 3: Find nearest check-in (today or yesterday evening)
  let nearestCheckin = todayCheckins?.[0];

  if (!nearestCheckin) {
    const yesterday = getDateNDaysAgo(1);
    const { data: yesterdayEvening } = await supabase
      .from('daily_checkins')
      .select('*')
      .eq('user_id', userId)
      .eq('checkin_date', yesterday)
      .eq('time_window', 'evening')
      .maybeSingle();
    nearestCheckin = yesterdayEvening;
  }

  if (!nearestCheckin) {
    return {
      tier: 'unknown' as const,
      score: 50,
      outcome: 'steady',
      confidence: 0,
      inferenceMethod: 'time_decay',
      basedOn: {
        actualCheckins: [],
        hoursSinceNearest: 24,
        practicesCompleted: 0
      }
    };
  }

  // Step 4: Calculate hours since nearest check-in
  const hoursSince = (now.getTime() - new Date(nearestCheckin.timestamp).getTime()) / (1000 * 60 * 60);

  // Step 5: Determine inference method
  const { data: historicalCheckins } = await supabase
    .from('daily_checkins')
    .select('*')
    .eq('user_id', userId)
    .gte('checkin_date', getDateNDaysAgo(30))
    .order('checkin_date', { ascending: false });

  const hasEnoughHistory = historicalCheckins && historicalCheckins.length >= 20;

  const { data: patterns } = await supabase
    .from('checkin_patterns')
    .select('*')
    .eq('user_id', userId)
    .eq('day_of_week', now.getDay())
    .eq('time_window', currentWindow)
    .gte('confidence_score', 0.7)
    .order('confidence_score', { ascending: false })
    .limit(1);

  const hasPattern = patterns && patterns.length > 0;

  // Step 6: Get completed practices today
  const { data: completedPractices } = await supabase
    .from('sanctuary_events')
    .select('id')
    .eq('user_id', userId)
    .gte('timestamp', `${today}T00:00:00`)
    .lte('timestamp', `${today}T23:59:59`);

  const practicesCount = completedPractices?.length || 0;

  // Step 7: Execute inference
  let inferredScore: number;
  let confidence: number;
  let inferenceMethod: string;

  if (hasEnoughHistory && hasPattern) {
    inferenceMethod = 'hybrid';
    const result = hybridInference(nearestCheckin, patterns[0], hoursSince, practicesCount);
    inferredScore = result.score;
    confidence = result.confidence;
  } else if (hasPattern) {
    inferenceMethod = 'pattern_matching';
    inferredScore = patternToScore(patterns[0]);
    confidence = Math.round((patterns[0].confidence_score || 0.5) * 100);
  } else if (hasEnoughHistory) {
    inferenceMethod = 'ai_prediction';
    const dayOfWeek = now.getDay();
    const relevantHistory = historicalCheckins.filter((c: any) => {
      const d = new Date(c.checkin_date);
      return d.getDay() === dayOfWeek && c.time_window === currentWindow;
    });
    const result = await predictStateWithAI(currentWindow, relevantHistory, dayOfWeek);
    inferredScore = result.score;
    confidence = result.confidence;
  } else {
    inferenceMethod = 'time_decay';
    const result = timeDecayInference(nearestCheckin, hoursSince, practicesCount);
    inferredScore = result.score;
    confidence = result.confidence;
  }

  const inferredTier = scoreToTier(inferredScore);

  // Step 8: Store inference for audit trail
  await supabase.from('inferred_states').insert({
    user_id: userId,
    inferred_at: now.toISOString(),
    inferred_for_date: today,
    inferred_for_window: currentWindow,
    inferred_tier: inferredTier,
    inferred_score: inferredScore,
    inferred_outcome: tierToOutcome(inferredTier),
    confidence_score: confidence,
    inference_method: inferenceMethod,
    based_on: {
      actualCheckins: todayCheckins?.map((c: any) => c.time_window) || [],
      hoursSinceNearest: Math.round(hoursSince * 10) / 10,
      practicesCompleted: practicesCount,
      patternMatched: hasPattern ? patterns[0].pattern_description : null
    },
    used_for: usedFor
  });

  return {
    tier: inferredTier,
    score: Math.round(inferredScore),
    outcome: tierToOutcome(inferredTier),
    confidence,
    inferenceMethod,
    basedOn: {
      actualCheckins: todayCheckins?.map((c: any) => c.time_window) || [],
      hoursSinceNearest: Math.round(hoursSince * 10) / 10,
      practicesCompleted: practicesCount,
      patternMatched: hasPattern ? patterns[0].pattern_description : null
    }
  };
}

// ─── Serve ─────────────────────────────────────────────────────────

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

    const body = await req.json();
    const result = await inferCurrentState(userId, supabase, body.usedFor || 'general');

    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[infer-current-state] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
