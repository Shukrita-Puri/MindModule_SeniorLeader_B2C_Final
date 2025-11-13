import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import "https://deno.land/x/xhr@0.1.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { balance, state, dataSources, recommendationPriority, timeOfDay } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const getTimeLabel = (hour: number): string => {
      if (hour >= 6 && hour < 12) return 'morning';
      if (hour >= 12 && hour < 18) return 'afternoon';
      if (hour >= 18 && hour < 23) return 'evening';
      return 'night';
    };

    const prompt = `Generate a forward-looking energy insight for an executive user.

Context:
- Energy balance: ${balance}/100
- State: ${state}
- Time: ${getTimeLabel(timeOfDay)} (${timeOfDay}:00)
- Data sources: ${dataSources.join(', ')}
- Recommendation: ${recommendationPriority}

Critical Rules:
- Maximum 15 words
- DO NOT repeat the state or score (user already knows)
- Be forward-looking: what's the strategic move RIGHT NOW?
- Consider time of day (morning = seize window, evening = transition wisely)
- Action-oriented and specific

Examples:
- "Evening peak—ground this clarity into strategic planning before rest"
- "Morning window detected—capture this for your hardest decisions"
- "Afternoon dip coming—pre-emptive centering protects 3pm focus"
- "Depletion building—micro-rest now prevents evening collapse"

Insight:`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices[0].message.content.trim();

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in generate-energy-insight function:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      insight: 'Analyzing your energy state—check back in a moment.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
