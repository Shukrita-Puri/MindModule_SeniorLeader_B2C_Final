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
  // Extended configuration
  personalityStyle?: string;
  voiceStyle?: string;
  additionalContext?: string;
  attachments?: Array<{ name: string; type: string; content?: string }>;
}

interface ConversationMessage {
  role: 'user' | 'persona' | 'coach';
  content: string;
}

function getPersonalityStyleGuidance(style: string): string {
  const styles: Record<string, string> = {
    'warm-supportive': `Be encouraging, patient, and confidence-building. Use gentle probing questions.
Acknowledge the student's efforts before offering suggestions. Create a safe space for exploration.
Use phrases like "That's a great start...", "I appreciate that perspective...", "What if we explored..."`,
    
    'analytical-direct': `Be logical, precise, and cut to the chase. No unnecessary fluff or padding.
Ask pointed, specific questions. Expect clear reasoning and evidence.
Use phrases like "Let's be specific...", "What evidence supports...", "Walk me through the logic..."`,
    
    'challenging-probing': `Play devil's advocate and push back on assumptions. Test resilience and conviction.
Challenge weak arguments constructively. Probe for depth of understanding.
Use phrases like "But couldn't someone argue...", "What about the counterpoint...", "Convince me why..."`,
    
    'neutral-professional': `Stay balanced, formal, and objective throughout. Neither warm nor cold.
Maintain professional distance while being fair. Ask standard interview questions.
Use phrases like "Could you elaborate...", "Please explain...", "What are your thoughts on..."`
  };
  
  return styles[style] || styles['neutral-professional'];
}

function getVoiceStyleGuidance(voice: string): string {
  const voices: Record<string, string> = {
    'masculine': `Use confident, assertive language patterns. Direct statements over hedged language.
Speak with authority and decisiveness. Less collaborative framing, more declarative.`,
    
    'feminine': `Use collaborative, empathetic language patterns. Include more acknowledgment and validation.
Frame questions inclusively. Show warmth while maintaining professionalism.`
  };
  
  return voices[voice] || '';
}

function buildPrompt(
  userMessage: string,
  signals: DetectedSignals,
  context: SessionContext,
  conversationHistory: ConversationMessage[],
  safetyCheck: { action: string; contextType: string; message?: string }
): string {
  const historyText = conversationHistory
    .slice(-10)
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n');

  // Build personality and voice guidance sections
  const personalityGuidance = context.personalityStyle 
    ? `\n**Personality Style: ${context.personalityStyle}**\n${getPersonalityStyleGuidance(context.personalityStyle)}`
    : '';
  
  const voiceGuidance = context.voiceStyle 
    ? `\n**Voice Style: ${context.voiceStyle}**\n${getVoiceStyleGuidance(context.voiceStyle)}`
    : '';

  // Build user context section
  const userContextSection = context.additionalContext?.trim()
    ? `\n## USER'S PREPARATION CONTEXT\nThe student has shared this context for the practice session:\n"${context.additionalContext}"\n\nConsider this when asking questions or providing responses. Respect any specific areas they want to focus on or avoid.`
    : '';

  // Build attachments section
  const attachmentsSection = context.attachments && context.attachments.length > 0
    ? `\n## ATTACHED FILES\nThe user provided these files for context:\n${context.attachments.map(f => `- ${f.name} (${f.type})${f.content ? `\n  Preview: ${f.content.substring(0, 300)}...` : ''}`).join('\n')}\n\nReference these naturally if relevant (e.g., "I see from your personal statement that..." or "Looking at your CV...").`
    : '';

  // Build scenario context section for persona inference
  const scenarioContextSection = context.scenarioContext 
    ? `- Scenario Context: ${JSON.stringify(context.scenarioContext)}`
    : '';

  return `You are running a dialogue simulation with TWO roles:

## ROLE 1: PERSONA (${context.personaRole})
- Base Role: ${context.personaRole}
- Communication Style: ${context.personaCommunicationStyle}
- Background: ${context.personaBackground}
- Scenario: ${context.scenarioTitle}
${scenarioContextSection}
${personalityGuidance}
${voiceGuidance}
${userContextSection}

**CRITICAL PERSONA INFERENCE:**
You MUST intelligently adapt the persona based on ALL available context:
1. If the scenario involves "Oxbridge", "Cambridge", "Oxford", or "university" → This is a UNIVERSITY context (e.g., University Dean, University Professor)
2. If the scenario involves "school", "prefect", "head boy/girl", or "boarding house" → This is a SECONDARY SCHOOL context (e.g., School Dean, School Teacher)
3. Use the additional context, attachments, and scenario details to determine specifics like:
   - A "Dean" in a university interview scenario = University Dean or Admissions Dean
   - A "Dean" in a school prefect scenario = School Dean / Head of House
   - A "Teacher" in an Oxbridge scenario = University Tutor/Professor
   - A "Teacher" in a school scenario = Subject Teacher

Always match your persona's vocabulary, expectations, and questions to the inferred context.

As the persona, you respond in-character to the student's messages. Be realistic and appropriately challenging based on the scenario.

## ROLE 2: META SKILLS COACH (Hidden from persona dialogue)
- Personality: ${context.coachPersonality}
- Purpose: Observe the student's communication skills and provide targeted feedback
- Rate Limit: ${context.interventionCount}/5 interventions used this session

The coach provides brief, actionable feedback when skill gaps or strengths are detected. Coach interventions appear SEPARATELY from persona responses.
${attachmentsSection}

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
    console.log('[dialogue-engine] Personality style:', context.personalityStyle);
    console.log('[dialogue-engine] Voice style:', context.voiceStyle);
    console.log('[dialogue-engine] Has additional context:', !!context.additionalContext);
    console.log('[dialogue-engine] Attachments count:', context.attachments?.length || 0);

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
