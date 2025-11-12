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
    const { balance, state, dataSources, recommendationPriority } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = `Generate a crisp, single-sentence energy state insight for an executive user.

Context:
- Energy balance: ${balance}/100
- State: ${state}
- Data sources: ${dataSources.join(', ')}
- Recommendation priority: ${recommendationPriority}

Rules:
- Maximum 15 words
- Action-oriented and specific
- No generic statements like "you're doing great"
- Tie insight directly to their balance/state
- Be direct and concise
- Example: "Sharp focus at 82—sustain with grounding before your 2pm call"
- Example: "Depleted at 38—deep restoration needed before evening demands"
- Example: "Scattered at 52—centering practice will sharpen your next decision"

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
