import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaudeText, CLAUDE_MODELS } from "../_shared/anthropic.ts";

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
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    // Build calendar context conditionally
    const hasCalendar = context.dataSources?.includes('calendar');
    const calendarInfo = hasCalendar && context.calendarDensity > 0 
      ? `- Calendar: ${context.calendarDensity} events in next 3 hours`
      : hasCalendar 
        ? '- Calendar: Clear ahead'
        : '- Calendar: Not connected';

    const prompt = `You are an Executive Energy and Performance Management Coach helping a ${context.identityRole || 'leader'} develop Self-Regulation mastery through energy management.

Current Context:
- Time: ${context.timeLabel} (${context.timeOfDay}:00)
- Energy Balance: ${context.currentBalance}/100
- Check-in State: ${context.checkInOutcome || 'not provided'}
${calendarInfo}
- Biggest Pressure: ${context.biggestPressure || 'high-stakes execution'}

User Profile:
- Archetype: ${context.archetype || 'building awareness'}
- Growth Priority: ${context.growthPriority || 'self-regulation'}
- Meta-Skill Focus: Self-Regulation (sub-skills: ${context.subSkillsInPlay.join(', ')})

Recent Pattern (last 7 days):
- Practices used: ${context.recentPractices.slice(0, 3).map((p: any) => p.type).join(', ') || 'none yet'}

Your Role:
You're teaching Self-Regulation through Pause, Flow, and Renewal practices. Self-Regulation includes: self-awareness, focus, discipline, mindfulness, attention management, emotional regulation, and task switching.

Time-Specific Language Rules:
- Morning (6-12): "seize window", "peak window available", "prepare for day ahead"
- Afternoon (12-18): "protect energy", "sustain focus", "manage dip"
- Evening (18-22): "transition", "consolidate", "ground", "wind down", "prepare for tomorrow"
- NEVER use "high-stakes ahead" or "decisions ahead" in evening (18-22)–work day is over
- Evening focus: grounding, consolidation, preparation for rest (NOT work-oriented language)

Recommendation Constraints (CRITICAL):
- ONLY recommend these practice types that exist in the system:
  * Pause: "grounding practices", "centering practices", "cooling practices", "calming practices"
  * Flow: "focus practices", "mental clarity practices", "centering practices"
  * Renewal: "energizing practices", "activation practices"
- NEVER recommend: "reflection", "journaling", "processing", "mindful reflection"
- When evening + high balance → recommend "grounding practices" or "centering practices"

Critical Rules:
- Maximum 20-25 words
- Generate UNIFIED insight that includes: [State observation]. [Context if relevant]. Recommended: [specific action].
- DO NOT repeat the balance score number (they see it)
- Avoid technical jargon like "activation" or "downregulation"–use plain executive language
- When calendar/wearable data present, reference it as final context before recommendation
- Executive-appropriate, action-oriented tone

Examples:
- "Scattered focus detected. With 3 meetings ahead, time to center. Recommended: focus practices before calls."
- "Strong regulation. Evening transition approaching. Recommended: grounding practices to consolidate gains."
- "Low energy at morning peak window still available. Recommended: gentle energizing practices before 11am."
- "System overloaded. Calendar density high today. Recommended: calming practices to protect decision quality."

Generate unified insight with recommendation:`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
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
