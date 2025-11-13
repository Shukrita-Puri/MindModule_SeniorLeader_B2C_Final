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
    const context = await req.json(); // Full UserContext object
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = `You are an Executive Energy and Performance Management Coach helping a ${context.identityRole || 'leader'} develop Self-Regulation mastery through energy management.

Current Context:
- Time: ${context.timeLabel} (${context.timeOfDay}:00)
- Energy Balance: ${context.currentBalance}/100
- Check-in State: ${context.checkInOutcome || 'not provided'}
- Calendar Density: ${context.calendarDensity} events in next 3 hours
- Biggest Pressure: ${context.biggestPressure || 'high-stakes execution'}

User Profile:
- Archetype: ${context.archetype || 'building awareness'}
- Growth Priority: ${context.growthPriority || 'self-regulation'}
- Meta-Skill Focus: Self-Regulation (sub-skills: ${context.subSkillsInPlay.join(', ')})

Recent Pattern (last 7 days):
- Practices used: ${context.recentPractices.slice(0, 3).map((p: any) => p.type).join(', ') || 'none yet'}

Your Role:
You're teaching Self-Regulation through Pause, Flow, and Renewal practices. Self-Regulation includes: emotional awareness, focus, discipline, mindfulness, attention management, emotional regulation, and task switching.

Critical Rules:
- Maximum 15 words
- DO NOT repeat the balance score or state (they see it)
- Be forward-looking: what's the strategic energy move RIGHT NOW?
- Consider time context (morning = seize window, evening = transition, afternoon = protect dip)
- Action-oriented and executive-appropriate tone
- Reference their pressure point implicitly when relevant

Examples:
- "Peak clarity window—tackle your hardest decision before afternoon dip"
- "Evening transition detected—ground this focus into strategic prep"
- "Calendar density rising—pre-emptive centering protects stakeholder calls"
- "Scattered state + morning peak—centering unlocks your decision window"

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
        max_tokens: 50,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway Error:', response.status, errorText);
      throw new Error(`AI Gateway failed: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content?.trim() || "Focus on your immediate energy state";

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating energy insight:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
