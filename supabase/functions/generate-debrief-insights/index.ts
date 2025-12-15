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

    const systemPrompt = `You are an expert executive coach providing crisp, actionable feedback on dialogue practice sessions. Your role is to transform raw skill indicators into meaningful, personalized insights.

GUIDELINES:
- Write in second person ("You demonstrated...")
- Be specific and behavioral, not generic
- Keep descriptions concise but meaningful (2-3 sentences max per item)
- For strengths: highlight what the person did well and why it matters
- For blind spots: identify the pattern, explain the impact, and provide ONE concrete actionable step
- Use professional, encouraging tone appropriate for high-achieving individuals
- Never use jargon or buzzwords
- Be direct and honest, not patronizing`;

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

Generate enhanced feedback in this exact JSON format:
{
  "enhancedStrengths": [
    {
      "metaSkill": "original meta skill name",
      "subSkill": "original sub skill name if any",
      "description": "2-3 sentence crisp description of what they did well and why it matters"
    }
  ],
  "enhancedBlindSpots": [
    {
      "metaSkill": "original meta skill name",
      "subSkill": "original sub skill name if any",
      "observation": "1-2 sentence clear observation of the behavioral pattern",
      "actionSuggested": "1 sentence specific, actionable step to practice"
    }
  ]
}

Return ONLY valid JSON, no markdown or explanation.`;

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

    console.log('[generate-debrief-insights] Success:', {
      strengthsGenerated: parsed.enhancedStrengths?.length || 0,
      blindSpotsGenerated: parsed.enhancedBlindSpots?.length || 0
    });

    return new Response(JSON.stringify(parsed), {
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
