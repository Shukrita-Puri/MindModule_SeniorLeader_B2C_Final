import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DetectedSignals {
  sentiment: { score: number; label: string; confidence: number; intensity: number };
  emotions: Array<{ type: string; confidence: number; indicators: string[] }>;
  eiBehaviors: Record<string, any>;
  skillGaps: Array<{ metaSkill: string; subSkill: string; cluster: string; confidence: number; indicators: string[] }>;
  skillStrengths: Array<{ metaSkill: string; subSkill: string; cluster: string; confidence: number; indicators: string[] }>;
  conversationFlow: { responseType: string; topicShift: boolean; questionsAsked: number };
  riskAssessment: { escalationRisk: string; interventionUrgency: string; riskFactors: string[] };
  coachingReadiness: { opennessScore: number; breakthroughPotential: boolean; canIntervene: boolean };
}

interface SessionContext {
  scenarioId: string;
  personaName: string;
  personaRole: string;
  personaBackground: string;
  personaCommunicationStyle: string;
  scenarioTitle: string;
  scenarioContext: Record<string, any>;
  coachPersonality: 'supportive' | 'challenging' | 'direct';
  messageCount: number;
  interventionCount: number;
}

interface ConversationMessage {
  role: 'user' | 'persona' | 'coach';
  content: string;
}

function buildPrompt(
  userMessage: string,
  signals: DetectedSignals,
  context: SessionContext,
  conversationHistory: ConversationMessage[],
  safetyCheck: { action: string; contextType: string; message?: string }
): string {
  const historyText = conversationHistory
    .slice(-10) // Last 10 messages for context
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  return `You are running a dialogue simulation with TWO roles:

## ROLE 1: PERSONA (${context.personaName})
- Role: ${context.personaRole}
- Communication Style: ${context.personaCommunicationStyle}
- Background: ${context.personaBackground}
- Scenario: ${context.scenarioTitle}

As the persona, you respond in-character to the student's messages. Be realistic and appropriately challenging based on the scenario.

## ROLE 2: META SKILLS COACH (Hidden from persona dialogue)
- Personality: ${context.coachPersonality}
- Purpose: Observe the student's communication skills and provide targeted feedback
- Rate Limit: ${context.interventionCount}/5 interventions used this session

The coach provides brief, actionable feedback when skill gaps or strengths are detected. Coach interventions appear SEPARATELY from persona responses.

## META-SKILL FRAMEWORK
**Self Mastery Cluster:**
- Emotional Intelligence → Emotional Regulation, Self-Awareness, Mindfulness
- Self-Regulation → Focus, Discipline, Goal Setting
- Learning Agility → Adaptability to Feedback, Reflective Thinking
- Emotional Resilience → Stress Management, Perseverance

**Social Mastery Cluster:**
- Social Intelligence → Empathy, Active Listening, Perspective-Taking
- Communication Excellence → Clarity, Influence, Rapport Building
- Adaptive Social Navigation → Context Reading, Boundary Setting

## DETECTED SIGNALS (from rule-based analysis - use as hints, you may refine)
${JSON.stringify(signals, null, 2)}

## SAFETY CHECK
Action: ${safetyCheck.action}
Context: ${safetyCheck.contextType}
${safetyCheck.message ? `Message: ${safetyCheck.message}` : ''}

## CONVERSATION HISTORY
${historyText || 'No previous messages'}

## CURRENT USER MESSAGE
${userMessage}

## RESPONSE FORMAT (JSON)
Respond with ONLY valid JSON in this exact structure:
{
  "persona_response": {
    "message": "The persona's in-character response",
    "emotion": "confident|curious|challenging|friendly|formal|concerned",
    "followup_question": "Optional follow-up question to keep conversation going"
  },
  "coaching_intervention": ${signals.coachingReadiness.canIntervene ? `{
    "observation": "Brief observation about what the student did",
    "gap_or_strength": "gap|strength",
    "meta_skill": "Which meta-skill this relates to",
    "sub_skill": "Which sub-skill specifically",
    "framework": "Which framework/wisdom source informs this feedback",
    "action": "Specific, actionable suggestion (1-2 sentences)",
    "wisdom_quote": "Optional brief quote from framework"
  }` : 'null'},
  "refined_analysis": {
    "primary_emotion": "The dominant emotion you detected",
    "skill_gaps": ["List of skill gaps you identified"],
    "skill_strengths": ["List of strengths demonstrated"]
  },
  "safety_response": {
    "action": "${safetyCheck.action}",
    "proceed": ${safetyCheck.action === 'proceed'}
  }
}

${safetyCheck.action !== 'proceed' ? `
IMPORTANT: Safety check flagged this message. ${safetyCheck.message || ''}
If action is "resources", provide supportive response with resources.
If action is "clarify", ask clarifying question about context.
` : ''}

Remember:
- Persona response should be realistic and challenging (this is practice!)
- Coach intervention should be brief and actionable (only if canIntervene is true)
- Focus on the most significant skill gap or strength
- Use ${context.coachPersonality} tone for coach feedback`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      userMessage, 
      signals, 
      context, 
      conversationHistory,
      safetyCheck 
    } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const prompt = buildPrompt(userMessage, signals, context, conversationHistory, safetyCheck);

    console.log('[dialogue-engine] Processing message for session:', context.scenarioId);
    console.log('[dialogue-engine] Safety check action:', safetyCheck.action);
    console.log('[dialogue-engine] Can intervene:', signals.coachingReadiness.canIntervene);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: 'You are a dialogue simulation engine. Always respond with valid JSON only, no markdown formatting.' 
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[dialogue-engine] AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Usage limit reached. Please add credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let content = data.choices?.[0]?.message?.content || '';
    
    // Clean markdown formatting if present
    content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    console.log('[dialogue-engine] Raw response:', content.substring(0, 200));

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch (parseError) {
      console.error('[dialogue-engine] JSON parse error:', parseError);
      // Return a fallback response
      parsedResponse = {
        persona_response: {
          message: "I appreciate your response. Could you elaborate on that point?",
          emotion: "curious",
          followup_question: null
        },
        coaching_intervention: null,
        refined_analysis: {
          primary_emotion: "neutral",
          skill_gaps: [],
          skill_strengths: []
        },
        safety_response: {
          action: "proceed",
          proceed: true
        }
      };
    }

    console.log('[dialogue-engine] Success - returning response');

    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[dialogue-engine] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error',
      persona_response: {
        message: "I'm having trouble processing that. Could you rephrase?",
        emotion: "concerned"
      },
      coaching_intervention: null,
      safety_response: { action: "proceed", proceed: true }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
