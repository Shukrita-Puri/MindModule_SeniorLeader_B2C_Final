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
    const { baselineScore, componentScores, archetype, biggestPressure } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `You are an Executive Energy and Performance Management Coach. A leader just completed their Self-Regulation baseline assessment.

Results:
- Mental Fitness Baseline: ${baselineScore}/100
- Energy Regulation: ${componentScores.energyRegulation}/100
- Focus Recovery: ${componentScores.focusRecovery}/100
- Energy Renewal: ${componentScores.energyRenewal}/100
- Archetype: ${archetype}
- Biggest Pressure: ${biggestPressure}

Your Task:
Generate a 2-3 sentence personalized pattern revelation that:
1. Names their specific behavioral pattern (what they do in pressure moments)
2. Shows consequence without fear-mongering (what this costs them)
3. Points to unlock potential (what changes if they build this skill)

Meta-Skill Context:
They're building Self-Regulation mastery, which includes: emotional awareness, focus, discipline, mindfulness, emotional regulation, attention management, and task switching. This is taught through Pause (calming/grounding), Flow (focus/clarity), and Renewal (energizing) practices.

Tone: Direct, research-backed, status-aware (speak to executives)

Examples:
- "Your pattern: push through fatigue until performance drops sharply. Most leaders in your archetype plateau here. The unlock: strategic micro-recovery sustains peak output 40% longer."
- "You rely on willpower to stay focused when scattered. Research shows this drains decision quality by afternoon. The shift: centering practices protect your hardest calls."

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
        max_tokens: 150,
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
    console.error('Error generating onboarding insight:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
