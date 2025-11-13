import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      currentScore, 
      baselineScore, 
      archetype, 
      growthPriority,
      peakWindows,
      dipWindows,
      weeklyCompletionRate,
      recentPractices 
    } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `You are an Executive Energy and Performance Management Coach analyzing a leader's 7-day Self-Regulation progress.

Progress Data:
- Current Score: ${currentScore}/100 (Baseline: ${baselineScore}/100, Change: ${currentScore - baselineScore})
- Archetype: ${archetype}
- Growth Priority: ${growthPriority}
- Peak Windows: ${peakWindows?.join(', ') || 'not yet detected'}
- Dip Windows: ${dipWindows?.join(', ') || 'not yet detected'}
- Weekly Ritual Completion: ${weeklyCompletionRate}%
- Recent Practices: ${recentPractices?.slice(0, 5).join(', ') || 'none yet'}

Your Task:
Generate a 3-4 sentence trend analysis that:
1. Acknowledges the pattern emerging (peak windows, dips, consistency)
2. Names the Self-Regulation sub-skill being developed (e.g., focus, emotional awareness, discipline)
3. Provides actionable timing optimization based on their energy rhythm
4. References their growth priority and how it's showing up

Meta-Skill Context:
Self-Regulation mastery includes: emotional awareness, focus, discipline, mindfulness, emotional regulation, attention management, task switching. Taught through Pause, Flow, and Renewal practices as Daily Rituals.

Tone: Strategic, pattern-focused, executive-appropriate

Examples:
- "Your morning peak (9-11am) is consistent—leverage this for ${growthPriority}. Afternoon dips suggest pre-emptive centering at 2pm could protect decision quality. Your ${archetype} pattern thrives on front-loaded focus work."
- "Ritual completion at ${weeklyCompletionRate}% shows commitment. Peak detected at ${peakWindows?.[0]}—protect this window for hardest decisions. Your emotional regulation work is building baseline from ${baselineScore} to ${currentScore}."

Generate insight:`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway Error:', response.status, errorText);
      throw new Error(`AI Gateway failed: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating dashboard insight:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
