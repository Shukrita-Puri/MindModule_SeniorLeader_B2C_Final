import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface StrengthInput {
  metaSkill: string;
  subSkill?: string;
  indicators?: string[];
}

interface DevelopmentAreaInput {
  metaSkill: string;
  subSkill?: string;
  observation: string;
  actionSuggested?: string;
}

interface RequestBody {
  strengths: StrengthInput[];
  developmentAreas: DevelopmentAreaInput[];
  scenarioContext: {
    domain?: string;
    context?: string;
    duration?: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { strengths, developmentAreas, scenarioContext }: RequestBody = await req.json();
    
    console.log('[generate-debrief-insights] Input:', { 
      strengthsCount: strengths?.length || 0, 
      developmentAreasCount: developmentAreas?.length || 0,
      scenarioContext 
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an expert executive coach. Transform raw skill data into crisp, single-line feedback.

RULES:
- ONE sentence max (15 words or less) per item
- Maximum 3-4 strengths and 3-4 blind spots total
- Write in second person ("You...")
- Be specific and behavioral
- No jargon or fluff`;

    const userPrompt = `Based on this dialogue practice session, generate crisp, meaningful feedback.

CONTEXT:
- Domain: ${scenarioContext?.domain || 'General'}
- Scenario: ${scenarioContext?.context || 'Professional conversation'}
- Duration: ${scenarioContext?.duration ? Math.round(scenarioContext.duration / 60) : 'Unknown'} minutes

RAW STRENGTHS DETECTED:
${strengths?.length > 0 ? strengths.map((s, i) => 
  `${i + 1}. ${s.metaSkill}${s.subSkill ? ` → ${s.subSkill}` : ''}
   Indicators: ${s.indicators?.join(', ') || 'None specified'}`
).join('\n\n') : 'No strengths detected'}

RAW BLIND SPOTS/DEVELOPMENT AREAS DETECTED:
${developmentAreas?.length > 0 ? developmentAreas.map((d, i) => 
  `${i + 1}. ${d.metaSkill}${d.subSkill ? ` → ${d.subSkill}` : ''}
   Observation: ${d.observation}
   ${d.actionSuggested ? `Suggested Action: ${d.actionSuggested}` : ''}`
).join('\n\n') : 'No blind spots detected'}

Return MAX 3-4 of each, prioritizing most important. JSON format:
{
  "enhancedStrengths": [
    {
      "metaSkill": "skill name",
      "subSkill": "sub skill if any",
      "description": "ONE sentence (max 15 words) - what they did well"
    }
  ],
  "enhancedBlindSpots": [
    {
      "metaSkill": "skill name", 
      "subSkill": "sub skill if any",
      "observation": "ONE sentence (max 15 words) - the pattern",
      "actionSuggested": "ONE phrase (max 8 words) - the action"
    }
  ]
}

Return ONLY valid JSON.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-debrief-insights] API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log('[generate-debrief-insights] Raw response:', content);

    // Parse the JSON response
    let parsed;
    try {
      // Remove any markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('[generate-debrief-insights] Failed to parse response:', parseError);
      // Return original data if parsing fails
      return new Response(JSON.stringify({
        enhancedStrengths: strengths.map(s => ({
          metaSkill: s.metaSkill,
          subSkill: s.subSkill,
          description: s.indicators?.join('. ') || 'Strength demonstrated in this area.'
        })),
        enhancedBlindSpots: developmentAreas.map(d => ({
          metaSkill: d.metaSkill,
          subSkill: d.subSkill,
          observation: d.observation,
          actionSuggested: d.actionSuggested || 'Practice this skill in your next session.'
        }))
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit to max 4 items each
    const limitedResult = {
      enhancedStrengths: (parsed.enhancedStrengths || []).slice(0, 4),
      enhancedBlindSpots: (parsed.enhancedBlindSpots || []).slice(0, 4)
    };

    console.log('[generate-debrief-insights] Success:', {
      strengthsGenerated: limitedResult.enhancedStrengths.length,
      blindSpotsGenerated: limitedResult.enhancedBlindSpots.length
    });

    return new Response(JSON.stringify(limitedResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('[generate-debrief-insights] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
