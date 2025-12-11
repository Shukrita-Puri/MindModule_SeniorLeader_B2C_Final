import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// INPUT VALIDATION SCHEMAS
// ============================================

const SignalsSchema = z.object({
  sentiment: z.object({
    score: z.number().optional(),
    label: z.string().optional(),
    polarity: z.string().optional(),
    intensity: z.number().optional(),
    confidence: z.number().optional(),
    trendShift: z.number().optional(),
    markers: z.array(z.string()).optional()
  }).optional(),
  
  // Client sends ARRAY of EmotionResult
  emotions: z.array(z.object({
    type: z.string(),
    confidence: z.number().optional(),
    indicators: z.array(z.string()).optional()
  })).optional(),
  
  // Client sends objects with { detected, indicators, level? }
  eiBehaviors: z.object({
    empathy: z.object({
      detected: z.boolean().optional(),
      indicators: z.array(z.string()).optional()
    }).optional(),
    selfRegulation: z.object({
      detected: z.boolean().optional(),
      indicators: z.array(z.string()).optional()
    }).optional(),
    perspectiveTaking: z.object({
      detected: z.boolean().optional(),
      indicators: z.array(z.string()).optional()
    }).optional(),
    reflectiveStatement: z.object({
      detected: z.boolean().optional(),
      indicators: z.array(z.string()).optional()
    }).optional(),
    escalationPattern: z.object({
      detected: z.boolean().optional(),
      level: z.number().optional(),
      indicators: z.array(z.string()).optional()
    }).optional(),
    // Legacy fallbacks
    empathyLevel: z.string().optional(),
    selfRegulationLevel: z.string().optional()
  }).optional(),
  
  // Client sends ARRAY of SkillGap
  skillGaps: z.array(z.object({
    metaSkill: z.string(),
    subSkill: z.string(),
    cluster: z.string(),
    confidence: z.number().optional(),
    indicators: z.array(z.string()).optional()
  })).optional(),
  
  skillStrengths: z.array(z.object({
    metaSkill: z.string(),
    subSkill: z.string(),
    cluster: z.string(),
    confidence: z.number().optional(),
    indicators: z.array(z.string()).optional()
  })).optional(),
  
  conversationFlow: z.object({
    responseType: z.string().optional(),
    topicShift: z.boolean().optional(),
    questionsAsked: z.number().optional(),
    questionAsked: z.boolean().optional(),
    assumptionsMade: z.union([z.boolean(), z.array(z.string())]).optional(),
    acknowledgementsGiven: z.boolean().optional(),
    acknowledgedOther: z.boolean().optional()
  }).optional(),
  
  riskAssessment: z.object({
    escalationRisk: z.string().optional(),
    interventionUrgency: z.string().optional(),
    riskFactors: z.array(z.string()).optional()
  }).optional(),
  
  riskFlags: z.object({
    crisisIndicators: z.boolean().optional(),
    escalationRisk: z.string().optional(),
    interventionUrgency: z.string().optional()
  }).optional(),
  
  coachingReadiness: z.object({
    opennessScore: z.number().optional(),
    openToFeedback: z.boolean().optional(),
    breakthroughPotential: z.boolean().optional(),
    inBreakthroughMoment: z.boolean().optional(),
    masteryDemonstrated: z.union([z.array(z.string()), z.boolean()]).optional(),
    demonstratingMastery: z.boolean().optional(),
    canIntervene: z.boolean().optional(),
    recommendIntervention: z.boolean().optional(),
    reason: z.string().optional(),
    reasonIfNot: z.string().optional()
  }).optional()
}).optional();

const ContextSchema = z.object({
  persona: z.object({
    name: z.string().max(200),
    role: z.string().max(200),
    background: z.string().max(2000).optional(),
    personality_traits: z.array(z.string().max(100)).max(20).optional(),
    voice_style: z.string().max(100).optional(),
    evaluation_signals: z.record(z.any()).optional()
  }).optional(),
  coach: z.object({
    style: z.enum(['supportive', 'challenging', 'minimal']).optional(),
    intervention_count: z.number().int().min(0).max(100).optional()
  }).optional(),
  scenario: z.object({
    name: z.string().max(200).optional(),
    title: z.string().max(200).optional(),
    context: z.record(z.any()).optional(),
    target_meta_skills: z.array(z.string().max(100)).max(20).optional()
  }).optional(),
  scenarioId: z.string().max(200).optional(),
  userArchetype: z.string().max(200).nullable().optional(),
  growthPriority: z.string().max(200).nullable().optional(),
  energyState: z.string().max(100).nullable().optional(),
  energyBalance: z.number().nullable().optional(),
  duration_minutes: z.number().int().min(1).max(120).optional(),
  elapsed_minutes: z.number().min(0).max(120).optional(),
  intervention_count: z.number().int().min(0).max(100).optional(),
  message_count: z.number().int().min(0).max(500).optional(),
  calendarContext: z.object({
    upcoming_count: z.number().int().min(0).optional(),
    high_stakes: z.boolean().optional()
  }).nullable().optional(),
  historicalPatterns: z.object({
    session_count: z.number().int().min(0).optional(),
    common_gaps: z.array(z.string().max(100)).max(20).optional(),
    strengths: z.array(z.string().max(100)).max(20).optional(),
    onboarding_gaps: z.array(z.string().max(100)).max(20).optional()
  }).nullable().optional(),
  additionalContext: z.string().max(5000).nullable().optional(),
  attachments: z.array(z.object({
    name: z.string().max(200),
    type: z.string().max(100),
    content: z.string().max(50000).optional()
  })).max(10).optional(),
  personalityStyle: z.string().max(100).optional(),
  practiceDuration: z.number().int().min(1).max(120).optional()
});

const ConversationHistorySchema = z.array(z.object({
  role: z.string().max(50).optional(),
  sender: z.string().max(50).optional(),
  content: z.string().max(10000)
})).max(100);

const SafetyCheckSchema = z.object({
  triggered: z.boolean().optional(),
  category: z.string().max(100).optional(),
  severity: z.string().max(50).optional(),
  reason: z.string().max(1000).optional(),
  recommendedAction: z.string().max(500).optional()
}).optional();

const DialogueEngineInputSchema = z.object({
  type: z.enum(['opening', 'response']).optional().default('response'),
  userMessage: z.string().min(1).max(5000),
  signals: SignalsSchema,
  context: ContextSchema,
  conversationHistory: ConversationHistorySchema.optional(),
  safetyCheck: SafetyCheckSchema,
  // Configuration from /practice/configure for opening message generation
  configuration: z.object({
    scenarioCategory: z.string().max(200).optional(), // Flexible - accepts any category from DB
    scenarioId: z.string().max(200).optional(),
    isCustomScenario: z.boolean().optional(),
    customScenarioText: z.string().max(2000).optional(),
    personaType: z.string().max(100).optional(), // Flexible - accepts any persona type
    customPersonaText: z.string().max(1000).optional(),
    personalityStyle: z.enum(['warm-supportive', 'analytical-direct', 'challenging-probing', 'neutral-professional', 'custom']).optional(),
    customPersonalityText: z.string().max(1000).optional(),
    voiceStyle: z.enum(['masculine', 'feminine', 'neutral']).optional(),
    practiceDuration: z.number().int().min(5).max(60).optional(),
    additionalContext: z.string().max(5000).optional(),
    attachments: z.array(z.object({
      name: z.string().max(200),
      type: z.string().max(100),
      content: z.string().max(50000).optional()
    })).max(10).optional()
  }).optional()
});

// ============================================
// TYPE DEFINITIONS
// ============================================

interface DetectedSignals {
  sentiment: {
    polarity: string;
    intensity: number;
    confidence: number;
    trendShift: number;
    markers: string[];
  };
  emotions: {
    primary: string;
    secondary: string | null;
    markers: string[];
  };
  eiBehaviors: {
    empathyLevel: string;
    selfRegulationLevel: string;
    perspectiveTaking: boolean;
    reflectiveStatements: boolean;
    escalationPattern: string;
  };
  skillGaps: {
    selfMastery: string[];
    socialMastery: string[];
    severity: string;
  };
  conversationFlow: {
    responseType: string;
    topicShift: boolean;
    questionAsked: boolean;
    assumptionsMade: boolean;
    acknowledgedOther: boolean;
  };
  riskFlags: {
    crisisIndicators: boolean;
    escalationRisk: string;
    interventionUrgency: string;
  };
  coachingReadiness: {
    openToFeedback: boolean;
    inBreakthroughMoment: boolean;
    demonstratingMastery: boolean;
    recommendIntervention: boolean;
    reason: string;
  };
}

interface PersonaConfig {
  name: string;
  role: string;
  background: string;
  personality_traits: string[];
  voice_style: string;
  evaluation_signals: Record<string, any>;
}

interface CoachConfig {
  style: 'supportive' | 'challenging' | 'minimal';
  intervention_count: number;
}

interface ScenarioConfig {
  name: string;
  title: string;
  context: Record<string, any>;
  target_meta_skills: string[];
}

interface SessionContext {
  userArchetype: string | null;
  growthPriority: string | null;
  energyState: string | null;
  energyBalance: number | null;
  duration_minutes: number;
  elapsed_minutes: number;
  intervention_count: number;
  message_count: number;
  calendarContext: {
    upcoming_count: number;
    high_stakes: boolean;
  } | null;
  historicalPatterns: {
    session_count: number;
    common_gaps: string[];
    strengths: string[];
    onboarding_gaps: string[];
  } | null;
  additionalContext: string | null;
  attachments: Array<{ name: string; type: string; content?: string }>;
  personalityStyle: string;
  practiceDuration: number;
}

interface SafetyCheck {
  triggered: boolean;
  category: string | null;
  severity: string | null;
  context: string | null;
  action: string;
  requiresClarification: boolean;
  clarificationPrompt: string | null;
  resources: string[];
  responseGuidance: string | null;
}

interface ConversationMessage {
  sender: string;
  content: string;
}

// ============================================
// UNIFIED PROMPT BUILDER
// ============================================

function buildUnifiedPrompt(params: {
  userMessage: string;
  conversationHistory: ConversationMessage[];
  detectedSignals: DetectedSignals;
  personaConfig: PersonaConfig;
  coachConfig: CoachConfig;
  scenarioConfig: ScenarioConfig;
  sessionContext: SessionContext;
  safetyCheck: SafetyCheck;
}): string {
  const {
    userMessage,
    conversationHistory,
    detectedSignals,
    personaConfig,
    coachConfig,
    scenarioConfig,
    sessionContext,
    safetyCheck
  } = params;

  // Get personality style guidance
  const getPersonalityStyleGuidance = (style: string): string => {
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
  };

  // Get voice style guidance
  const getVoiceStyleGuidance = (voice: string): string => {
    const voices: Record<string, string> = {
      'masculine': `Use confident, assertive language patterns. Direct statements over hedged language.
Speak with authority and decisiveness. Less collaborative framing, more declarative.`,
      'feminine': `Use collaborative, empathetic language patterns. Include more acknowledgment and validation.
Frame questions inclusively. Show warmth while maintaining professionalism.`
    };
    return voices[voice] || '';
  };

  // Get coaching style guidance - now ADAPTIVE based on conversation context
  const getCoachingStyleGuidance = (style: string): string => {
    // If adaptive or unknown, return adaptive guidance
    if (style === 'adaptive' || !['supportive', 'challenging', 'minimal'].includes(style)) {
      return `**ADAPTIVE COACHING MODE:**
You dynamically choose the most appropriate tone for each intervention based on:
- User's current skill level and confidence in this exchange
- Whether they need encouragement or a push
- The emotional state of the conversation
- How they've responded to previous feedback

**CHOOSE YOUR TONE FOR THIS INTERVENTION:**
- Use "supportive" when user needs encouragement, is struggling, or lacks confidence
- Use "challenging" when user is coasting, not pushing themselves, or needs accountability
- Use "direct" when user needs clear, no-nonsense guidance without extra warmth

**TONE BEHAVIORS:**
- Supportive: Celebrate progress, frame gaps as growth opportunities, use "Great attempt at...", "I noticed you're developing..."
- Challenging: Call out missed opportunities, set high expectations, use "You missed an opportunity to...", "Push yourself to..."
- Direct: Be clear and efficient, no fluff, just actionable feedback

IMPORTANT: In your response, set the "tone" field to what you actually chose (supportive, challenging, or direct).`;
    }
    
    const styles: Record<string, string> = {
      'supportive': `**SUPPORTIVE COACHING MODE:**
- Be encouraging and celebrate progress with each intervention
- Acknowledge effort and strengths before suggesting improvements
- Frame gaps as growth opportunities, not criticisms
- Use phrases like "Great attempt at...", "I noticed you're developing...", "One way to build on this..."
- Keep interventions gentle and affirming
- Provide frequent positive reinforcement`,
      'challenging': `**CHALLENGING COACHING MODE:**
- Push the student out of their comfort zone
- Directly call out missed opportunities and weak points
- Be honest and direct about skill gaps
- Use phrases like "You missed an opportunity to...", "That wasn't your best...", "You need to work on..."
- Set high expectations and hold them accountable
- Balance directness with respect—challenge, don't discourage`,
      'minimal': `**MINIMAL COACHING MODE:**
- Intervene ONLY for significant skill gaps or breakthrough moments
- Let the conversation flow naturally without frequent interruptions
- Save feedback for major teaching moments only
- Only intervene if the gap/strength is truly significant
- Prioritize user's flow state over comprehensive feedback
- When you do intervene, be brief and impactful`
    };
    return styles[style] || styles['supportive'];
  };

  // Build conversation history text
  const historyText = conversationHistory
    .map(m => `**${m.sender.toUpperCase()}**: ${m.content}`)
    .join('\n\n');

  // Build attachments section
  const attachmentsSection = sessionContext.attachments && sessionContext.attachments.length > 0
    ? sessionContext.attachments.map(f => 
        `- ${f.name} (${f.type})${f.content ? `\n  Preview: ${f.content.substring(0, 300)}...` : ''}`
      ).join('\n')
    : 'No attachments provided';

  // Build safety section
  const safetySection = safetyCheck.triggered ? `
### ⚠️ SAFETY ALERT
- Category: ${safetyCheck.category}
- Severity: ${safetyCheck.severity}
- Context Detected: ${safetyCheck.context}
- Action Required: ${safetyCheck.action}
${safetyCheck.requiresClarification ? `
- Clarification Needed: ${safetyCheck.clarificationPrompt}
` : ''}
${safetyCheck.resources.length > 0 ? `
- Resources to Provide:
${safetyCheck.resources.map(r => `  • ${r}`).join('\n')}
` : ''}
${safetyCheck.responseGuidance ? `
- Response Guidance: ${safetyCheck.responseGuidance}
` : ''}` : '### Safety Status: Clear';

  // Build calendar context section
  const calendarSection = sessionContext.calendarContext ? `
- Upcoming Events: ${sessionContext.calendarContext.upcoming_count}
- High-Stakes Today: ${sessionContext.calendarContext.high_stakes ? 'Yes' : 'No'}
` : 'No calendar data available';

  // Build historical patterns section
  const historicalSection = sessionContext.historicalPatterns ? `
- Sessions Completed: ${sessionContext.historicalPatterns.session_count}
- Common Gaps: ${sessionContext.historicalPatterns.common_gaps.join(', ') || 'None identified'}
- Strengths: ${sessionContext.historicalPatterns.strengths.join(', ') || 'None identified'}
- Onboarding Gaps: ${sessionContext.historicalPatterns.onboarding_gaps.join(', ') || 'None'}
` : 'First session - no historical data';

  return `
# DIALOGUE ROOM: UNIFIED RESPONSE SYSTEM

You are operating a dual-entity dialogue system with TWO distinct voices:
1. **AI PERSONA**: The conversation partner the user is practicing with
2. **META SKILLS COACH**: A feedback-focused coach providing guidance (NOT collaborative, NOT conversational)

---

## ENTITY 1: AI PERSONA

### PERSONA IDENTITY
- Name: ${personaConfig.name}
- Role: ${personaConfig.role}
- Background: ${personaConfig.background}
- Personality: ${personaConfig.personality_traits.join(', ')}
- Voice Style: ${personaConfig.voice_style}
- Scenario: ${scenarioConfig.title}
- Scenario Context: ${JSON.stringify(scenarioConfig.context)}

### PERSONA BEHAVIOR RULES
1. Stay fully in character as ${personaConfig.name}
2. React authentically based on how the user communicates
3. Adjust difficulty based on user performance (detected via signals)
4. NEVER break character to coach - that's the Meta Skills Coach's job
5. If user shows strong skills, increase challenge subtly
6. If user struggles, ease back while staying realistic

**Persona Personality Style: ${sessionContext.personalityStyle}**
${getPersonalityStyleGuidance(sessionContext.personalityStyle)}

**Persona Voice Style: ${personaConfig.voice_style}**
${getVoiceStyleGuidance(personaConfig.voice_style)}

**Practice Duration: ${sessionContext.practiceDuration} minutes**
Pace the conversation appropriately. For shorter sessions (15-20min), get to core quickly. For longer sessions (25-30min), allow more depth.

## USER'S PREPARATION CONTEXT
"${sessionContext.additionalContext || 'No additional context provided'}"

## ATTACHED FILES
${attachmentsSection}

**CRITICAL PERSONA INFERENCE:**
Intelligently adapt persona based on scenario context:
- "Oxbridge/Cambridge/Oxford/university" → UNIVERSITY context
- "school/prefect/head boy/boarding house" → SECONDARY SCHOOL context

### EVALUATION SIGNALS (What persona notices)
${JSON.stringify(personaConfig.evaluation_signals, null, 2)}

---

## ENTITY 2: META SKILLS COACH & THINKING PARTNER

### COACH ROLE
You are a **feedback-focused coach**, not a collaborative partner. Your job is to:
- Provide observation-based feedback on the user's responses
- Identify skill gaps and strengths
- Apply relevant frameworks and wisdom
- Give specific, actionable guidance
- Acknowledge user reactions briefly, then redirect to practice

**CRITICAL LANGUAGE RULE**: Always address the user in second person ("You said...", "You expressed...", "You showed..."). NEVER use third person ("The user stated...", "The user said...").

${getCoachingStyleGuidance(coachConfig.style)}

### COACH BEHAVIOR RULES
1. **Feedback-focused, NOT collaborative** - You observe and guide, not discuss
2. **Brief acknowledgment** - If user reacts to feedback, acknowledge briefly then redirect
3. **No extended dialogue** - Coach interventions are one-way guidance
4. **Framework-grounded** - Always tie feedback to a framework or wisdom source
5. **Action-oriented** - Every intervention MUST end with a specific, concrete action step
6. **Second person language** - Always use "You" when referring to the user, never "the user"
7. **Context-aware** - Always check if user's response addresses what the persona just asked
8. **Tone locked** - Your tone MUST match the selected coaching style: "${coachConfig.style}"

### CONVERSATION CONTEXT CHECK (CRITICAL)
Before providing any feedback, ALWAYS:
1. **Identify the last persona question**: What did ${personaConfig.name} ask or want to know?
2. **Check if user addressed it**: Did the user's response actually answer or engage with that question?
3. **Detect misdirection**: If user responded with something unrelated, off-topic, or avoided the question entirely, THIS IS A SKILL GAP that must be coached

### COACH IS NOT:
- A conversation partner (that's the persona)
- A therapist (refer out for mental health)
- Collaborative or engaging in back-and-forth discussion
- Open to negotiation about feedback

---

## SELF MASTERY META-SKILLS FRAMEWORK

### Cluster: SELF MASTERY
Core Function: Managing the Inner World — cultivating awareness, resilience, and self-direction

| Meta-Skill | Sub-Skills | Soft Skills |
|------------|------------|-------------|
| **Emotional Intelligence** | Emotional Regulation, Self-Awareness, Mindfulness, Emotional Mastery, Self-Compassion | Empathy, Active Listening, Compassion |
| **Self-Regulation** | Goal Setting, Purpose Alignment, Identity Alignment, Focus, Discipline | Self-Motivation, Integrity, Growth Mindset |
| **Learning Agility** | Self-Directed Learning, Reflective Thinking, Unlearning, Adaptability to Feedback, Continuous Improvement | Curiosity, Openness to Change |
| **Emotional Resilience** | Stress Management, Perseverance, Optimism, Emotional Recovery | Positivity, Self-Confidence, Empathy, Compassion |

### Cluster: SOCIAL MASTERY (for reference)
| Meta-Skill | Sub-Skills | Soft Skills |
|------------|------------|-------------|
| **Social Awareness** | Empathy, Perspective Taking, Active Listening, Social Cue Reading | Compassion, Cultural Sensitivity |
| **Relationship Management** | Influence, Communication Clarity, Conflict Resolution, Rapport Building, Boundary Setting | Diplomacy, Trustworthiness, Collaboration |

---

## DETECTED SIGNALS (Rule-Based Analysis)

These signals were detected BEFORE this LLM call. Use them as context hints.
You may refine or override based on your deeper understanding of the conversation.

### Sentiment Analysis
- Polarity: ${detectedSignals.sentiment.polarity}
- Intensity: ${detectedSignals.sentiment.intensity} (0-1 scale)
- Confidence: ${detectedSignals.sentiment.confidence}
- Trend: ${detectedSignals.sentiment.trendShift > 0 ? 'Improving' : detectedSignals.sentiment.trendShift < 0 ? 'Declining' : 'Stable'}
- Markers: ${detectedSignals.sentiment.markers.join(', ') || 'None'}

### Emotion Detection
- Primary Emotion: ${detectedSignals.emotions.primary}
- Secondary Emotion: ${detectedSignals.emotions.secondary || 'None'}
- Emotion Markers: ${detectedSignals.emotions.markers.join(', ') || 'None'}

### EI Behavior Assessment
- Empathy Level: ${detectedSignals.eiBehaviors.empathyLevel}
- Self-Regulation Level: ${detectedSignals.eiBehaviors.selfRegulationLevel}
- Perspective Taking: ${detectedSignals.eiBehaviors.perspectiveTaking ? 'Present' : 'Absent'}
- Reflective Statements: ${detectedSignals.eiBehaviors.reflectiveStatements ? 'Present' : 'Absent'}
- Escalation Pattern: ${detectedSignals.eiBehaviors.escalationPattern}

### Meta-Skill Gap Detection
- Self Mastery Gaps: ${detectedSignals.skillGaps.selfMastery.join(', ') || 'None'}
- Social Mastery Gaps: ${detectedSignals.skillGaps.socialMastery.join(', ') || 'None'}
- Gap Severity: ${detectedSignals.skillGaps.severity}

### Conversation Flow
- Response Type: ${detectedSignals.conversationFlow.responseType}
- Topic Shift: ${detectedSignals.conversationFlow.topicShift ? 'Yes' : 'No'}
- Question Asked: ${detectedSignals.conversationFlow.questionAsked ? 'Yes' : 'No'}
- Assumptions Made: ${detectedSignals.conversationFlow.assumptionsMade ? 'Yes' : 'No'}
- Acknowledged Other: ${detectedSignals.conversationFlow.acknowledgedOther ? 'Yes' : 'No'}

### Risk Assessment
- Crisis Indicators: ${detectedSignals.riskFlags.crisisIndicators ? 'YES - HANDLE WITH CARE' : 'None'}
- Escalation Risk: ${detectedSignals.riskFlags.escalationRisk}
- Intervention Urgency: ${detectedSignals.riskFlags.interventionUrgency}

### Coaching Readiness
- Open to Feedback: ${detectedSignals.coachingReadiness.openToFeedback ? 'Yes' : 'No'}
- In Breakthrough Moment: ${detectedSignals.coachingReadiness.inBreakthroughMoment ? 'YES - DO NOT INTERRUPT' : 'No'}
- Demonstrating Mastery: ${detectedSignals.coachingReadiness.demonstratingMastery ? 'Yes - Let them practice' : 'No'}
- Recommend Intervention: ${detectedSignals.coachingReadiness.recommendIntervention ? 'Yes' : 'No'}
- Reason: ${detectedSignals.coachingReadiness.reason}

---

## SESSION CONTEXT

### User Profile
- Archetype: ${sessionContext.userArchetype || 'Not specified'}
- Growth Priority: ${sessionContext.growthPriority || 'Not specified'}
- Energy State: ${sessionContext.energyState || 'Not specified'}
- Energy Balance: ${sessionContext.energyBalance || 'N/A'}

### Session State
- Scenario: ${scenarioConfig.name}
- Target Skills: ${scenarioConfig.target_meta_skills.join(', ')}
- Duration: ${sessionContext.duration_minutes} minutes
- Elapsed: ${sessionContext.elapsed_minutes} minutes
- Total Interventions So Far: ${coachConfig.intervention_count}
- Messages Exchanged: ${sessionContext.message_count}

### Calendar Context (if available)
${calendarSection}

### Historical Patterns (30-60 day)
${historicalSection}

---

## INTERVENTION TRIGGER CONDITIONS

### MUST INTERVENE - Off-Topic or Misdirected Response
Trigger when:
- User's response does NOT address the question the persona just asked
- User goes off-topic or provides irrelevant information
- User misunderstands the question and answers something else
- User deflects or avoids the actual question

**Action**: Point out what the persona actually asked and guide user to address it directly.
**Example observation**: "You didn't address what ${personaConfig.name} asked. They wanted to know about your motivation for this field, but you talked about your hobbies. Try bringing your response back to their actual question."
**Example action_step**: "In your next response, directly answer their question about [specific topic they asked about]"

### MUST INTERVENE - Critical Skill Gap
Trigger when detected signals show:
- gap_severity: "critical"
- risk_flags.escalation_risk: "high"
- Self-regulation dysregulated
- Multiple simultaneous gaps

### MUST INTERVENE - User Shows Distress
Trigger when:
- User expresses frustration with AI/system ("this isn't working", "you're not helping")
- Emotional_regulation_gap + high sentiment intensity
- Repeated defensive responses

**Special Case - AI Persona Failure:**
If user shows frustration because persona hallucinates or breaks character:
1. Coach acknowledges the technical issue briefly
2. Uses this as a Self Mastery teaching moment
3. Example: "I notice some frustration there—completely understandable when things don't flow as expected. This is actually a perfect micro-moment to practice emotional regulation. Take a breath. The tool will recalibrate. Your ability to reset matters more than the glitch."

### GROWTH/BREAKTHROUGH TRIGGERS (Positive Reinforcement)
Trigger when:
- User demonstrates perspective_taking: true
- User shows reflective_statements: true
- Escalation pattern: "de-escalating"
- User acknowledges other's viewpoint
- User pauses before responding (self-regulation)

Example positive intervention:
"Excellent. You navigated that with exactly the kind of emotional composure that high-pressure scenarios demand. Notice how pausing shifted the dynamic."

### DO NOT INTERVENE WHEN
- In breakthrough moment (let them complete the realization)
- Demonstrating mastery (let them practice)
- Too soon after last intervention (< 45 seconds)
- Rate limit reached (3 interventions in 2 minutes)

---

## FRAMEWORK & WISDOM LIBRARY

### FRAMEWORK RULES (CRITICAL)
- ONLY use frameworks and quotes from THIS LIBRARY BELOW
- NEVER invent framework names (e.g., "Authentic Self-Expression" is NOT valid)
- NEVER generate your own wisdom quotes - use ONLY the exact quotes provided below
- If no framework fits perfectly, choose the CLOSEST match from this library
- The attribution MUST be a real person or recognized technique listed here

### FRAMEWORK REPETITION RULES (IMPORTANT)
- Track which frameworks have been used in recent interventions
- Do NOT repeat the same framework within 2-3 consecutive interventions
- With 24+ frameworks available, USE VARIETY
- If the same framework is genuinely the best fit, wait at least 3 exchanges before reusing
- Only repeat if absolutely no other framework applies

### ANCIENT WISDOM (source: "ancient_wisdom")
- **Stoicism (Viktor Frankl)**: "Between stimulus and response there is a space. In that space is our power to choose our response."
- **Stoicism (Marcus Aurelius)**: "You have power over your mind, not outside events. Realize this, and you will find strength."
- **Stoicism (Epictetus)**: "It's not what happens to you, but how you react to it that matters."
- **Buddhism (Jon Kabat-Zinn)**: "You cannot control the waves, but you can learn to surf."
- **Buddhism (Thích Nhất Hạnh)**: "Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor."
- **Samurai Bushido (Miyamoto Musashi)**: "Think lightly of yourself and deeply of the world."
- **Greek Philosophy (Socrates)**: "Know thyself."
- **Greek Philosophy (Aristotle)**: "We are what we repeatedly do. Excellence, then, is not an act, but a habit."

### HIGH PERFORMER WISDOM (source: "high_performer")
- **Elite Athletes (Billie Jean King)**: "Pressure is a privilege."
- **Elite Athletes (Michael Jordan)**: "I've failed over and over and over again in my life. And that is why I succeed."
- **Navy SEALs (Tactical Breathing)**: Box breathing: inhale 4 counts, hold 4, exhale 4, hold 4. Used for tactical composure under fire.
- **Surgeons (Medical Tradition)**: "Slow is smooth, smooth is fast."
- **Negotiators (Chris Voss)**: "Never split the difference. Tactical empathy means understanding the feelings behind what someone says."
- **Fighter Pilots (John Boyd)**: OODA Loop: Observe, Orient, Decide, Act. Speed of decision-making wins.

### COMMUNICATION & PERSUASION (source: "high_performer")
- **Active Listening (Stephen Covey)**: "Most people do not listen with the intent to understand; they listen with the intent to reply."
- **Mirroring (Chris Voss)**: Repeat the last 1-3 words to build rapport and encourage elaboration.
- **Radical Candor (Kim Scott)**: "Care personally, challenge directly."

### PRACTICAL FRAMEWORKS (source: "practical")
- **STOP Technique**: Stop, Take a breath, Observe, Proceed. A mindfulness pause before reacting.
- **Name It to Tame It (Dan Siegel)**: Labeling emotions activates prefrontal cortex and reduces amygdala reactivity.
- **Perspective Ladder**: Self → Other → Observer → Future Self. Each rung creates emotional distance.
- **The 90-Second Rule (Jill Bolte Taylor)**: Emotional chemicals flush from the body in 90 seconds if you don't re-trigger them.
- **RAIN (Tara Brach)**: Recognize, Allow, Investigate, Nurture. A framework for processing difficult emotions.
- **Centering (Sports Psychology)**: Focus on your center of gravity before high-stakes moments.

### PSYCHOLOGY (source: "psychology")
- **Emotional Granularity (Lisa Feldman Barrett)**: Using specific emotion words leads to better regulation than vague terms.
- **Cognitive Reframing (Aaron Beck)**: Changing interpretation of events changes emotional response.
- **Window of Tolerance (Dan Siegel)**: Optimal zone between hyperarousal and hypoarousal where we function best.
- **Growth Mindset (Carol Dweck)**: Abilities develop through dedication and hard work; talent is just the starting point.
- **Self-Distancing (Ethan Kross)**: Using third person ("What would [name] do?") reduces emotional reactivity.
- **Yerkes-Dodson Law**: Optimal performance requires optimal arousal - not too little, not too much.

---

## SAFETY PROTOCOLS

${safetySection}

### CORE SAFETY PRINCIPLES
1. **Warm, calm, compassionate** tone in all situations
2. **Never make medical, legal, or diagnostic claims**
3. **Never promise to keep users safe** - encourage professional help
4. **Default to UK resources** (user location: London)

### CONTEXT-AWARE HANDLING
- If discussing sensitive topics AS PART OF SCENARIO/DEBATE: Allow academic discussion
- If personal experience detected: Provide resources, express empathy
- If context unclear: Ask clarifying question before proceeding

### ABSOLUTE BLOCKS (Never generate, regardless of context)
- Instructions for self-harm, violence, or illegal activity
- Child exploitation content
- Terrorism promotion or recruitment
- Malware/hacking instructions

---

## CONVERSATION HISTORY

${historyText || 'No previous messages'}

---

## CURRENT USER MESSAGE

**USER**: ${userMessage}

---

## OUTPUT FORMAT

Respond with a JSON object containing:

\`\`\`json
{
  "persona_response": {
    "content": "The in-character response from ${personaConfig.name}",
    "emotion": "The persona's emotional state",
    "internal_assessment": "What the persona thinks of the user's performance"
  },

  "coaching_intervention": {
    "should_intervene": true/false,
    "type": "skill_gap" | "positive_reinforcement" | "safety" | "system_recovery" | "off_topic" | null,
    "observation": "What you observed - use 'You said/showed/expressed...' format, NEVER 'The user stated...'",
    "gap_or_strength": "The specific skill gap or strength identified (include 'off-topic response' if user didn't address persona's question)",
    "meta_skill": "emotional_intelligence" | "self_regulation" | "learning_agility" | "emotional_resilience",
    "sub_skill": "The specific sub-skill",
    "framework_name": "MUST be one of these EXACT names from the library: Stoicism, Buddhism, Samurai Bushido, Greek Philosophy, Elite Athletes, Navy SEALs, Surgeons, Negotiators, Fighter Pilots, Active Listening, Mirroring, Radical Candor, STOP Technique, Name It to Tame It, Perspective Ladder, The 90-Second Rule, RAIN, Centering, Emotional Granularity, Cognitive Reframing, Window of Tolerance, Growth Mindset, Self-Distancing, Yerkes-Dodson Law",
    "framework_source": "ancient_wisdom" | "high_performer" | "psychology" | "practical",
    "framework_wisdom": "MUST be the EXACT quote from the FRAMEWORK & WISDOM LIBRARY section above with the author name in parentheses. NEVER make up quotes.",
    "framework_application": "1-line (max 20 words) explaining how THIS framework applies to THIS specific moment. Include a mini-example or how it helps right now. E.g., 'Here, pausing before responding would have let you address their actual concern about experience.' or 'Applying this: acknowledge their skepticism first, then share your genuine motivation.'",
    "action_step": "MANDATORY - NEVER LEAVE EMPTY. Must be a specific, concrete action for the user's NEXT response. Examples: 'In your next response, directly answer their question about why you chose this university', 'Acknowledge their concern first, then explain your reasoning', 'Ask them a clarifying question about what they're looking for'. BAD examples (NEVER USE): empty string, 'be more confident', 'try harder', 'improve your response'",
    "tone": "supportive | challenging | direct (CHOOSE the tone you used for THIS intervention)"
  },

  "refined_analysis": {
    "sentiment_override": "Only if rule-based was wrong",
    "emotion_override": "Only if rule-based was wrong",
    "additional_gaps": ["Any gaps not detected by rules"],
    "additional_strengths": ["Any strengths not detected by rules"]
  },

  "safety_response": {
    "is_safety_situation": true/false,
    "clarification_asked": "Question asked if context unclear",
    "resources_provided": ["Resource strings if needed"],
    "empathy_statement": "Supportive statement if needed"
  },

  "session_note": "Brief note for analytics (what happened this turn)"
}
\`\`\`

---

## FINAL REMINDERS

1. **Persona stays in character** - Never break to coach
2. **Coach is feedback-focused** - Not conversational
3. **Safety is non-negotiable** - When triggered, handle appropriately
4. **Use detected signals as hints** - You can refine them
5. **Rate limit interventions** - Quality over quantity
6. **Be specific** - Vague feedback is useless
7. **End with action** - Every intervention MUST have a concrete action_step (NEVER empty)
8. **Check context first** - Before any intervention, identify what the persona asked and whether the user addressed it
9. **Detect off-topic responses** - If user's response doesn't match the persona's question, flag this as a skill gap
10. **Adaptive tone** - Choose the most appropriate tone (supportive, challenging, or direct) for each intervention based on context

## ACTION STEP REQUIREMENTS (MANDATORY)

Every action_step MUST be:
1. **SPECIFIC** to this exact conversation moment
2. **ACTIONABLE** - something the user can do in their very next message
3. **RELEVANT** - tied to the persona's question and scenario context
4. **CONCRETE** - not vague like "try to improve" or "be better"

GOOD action_step examples:
- "In your next response, directly answer their question about why you chose this subject"
- "Acknowledge their concern about your gap year, then pivot to what you learned from it"
- "Ask them a clarifying question about what specific qualities they're looking for"
- "Start your response by addressing the point they raised about your experience"
- "Bring the conversation back to their original question about your research interests"

BAD action_step examples (NEVER USE THESE):
- "" (empty)
- "Be more confident"
- "Try harder"
- "Improve your communication"
- "Do better next time"
- Generic advice that doesn't relate to the specific moment
`;
}

// ============================================
// HELPER: Transform legacy signals to new format
// ============================================

function transformSignals(legacySignals: any): DetectedSignals {
  return {
    sentiment: {
      polarity: legacySignals?.sentiment?.label || 'neutral',
      intensity: legacySignals?.sentiment?.intensity || 0.5,
      confidence: legacySignals?.sentiment?.confidence || 0.5,
      trendShift: 0,
      markers: []
    },
    emotions: {
      primary: legacySignals?.emotions?.[0]?.type || 'neutral',
      secondary: legacySignals?.emotions?.[1]?.type || null,
      markers: legacySignals?.emotions?.[0]?.indicators || []
    },
    eiBehaviors: {
      empathyLevel: legacySignals?.eiBehaviors?.empathyLevel || 'moderate',
      selfRegulationLevel: legacySignals?.eiBehaviors?.selfRegulationLevel || 'moderate',
      perspectiveTaking: legacySignals?.eiBehaviors?.perspectiveTaking || false,
      reflectiveStatements: legacySignals?.eiBehaviors?.reflectiveStatements || false,
      escalationPattern: legacySignals?.eiBehaviors?.escalationPattern || 'stable'
    },
    skillGaps: {
      selfMastery: legacySignals?.skillGaps?.filter((g: any) => g.cluster === 'self_mastery').map((g: any) => g.subSkill) || [],
      socialMastery: legacySignals?.skillGaps?.filter((g: any) => g.cluster === 'social_mastery').map((g: any) => g.subSkill) || [],
      severity: legacySignals?.riskAssessment?.interventionUrgency || 'low'
    },
    conversationFlow: {
      responseType: legacySignals?.conversationFlow?.responseType || 'statement',
      topicShift: legacySignals?.conversationFlow?.topicShift || false,
      questionAsked: (legacySignals?.conversationFlow?.questionsAsked || 0) > 0,
      assumptionsMade: false,
      acknowledgedOther: false
    },
    riskFlags: {
      crisisIndicators: false,
      escalationRisk: legacySignals?.riskAssessment?.escalationRisk || 'low',
      interventionUrgency: legacySignals?.riskAssessment?.interventionUrgency || 'low'
    },
    coachingReadiness: {
      openToFeedback: legacySignals?.coachingReadiness?.canIntervene || true,
      inBreakthroughMoment: legacySignals?.coachingReadiness?.breakthroughPotential || false,
      demonstratingMastery: false,
      recommendIntervention: legacySignals?.coachingReadiness?.canIntervene || true,
      reason: ''
    }
  };
}

// ============================================
// HELPER: Transform legacy context to new format
// ============================================

function transformContext(legacyContext: any): {
  personaConfig: PersonaConfig;
  coachConfig: CoachConfig;
  scenarioConfig: ScenarioConfig;
  sessionContext: SessionContext;
} {
  return {
    personaConfig: {
      name: legacyContext.personaName || 'Interviewer',
      role: legacyContext.personaRole || 'Professional',
      background: legacyContext.personaBackground || '',
      personality_traits: [legacyContext.personaCommunicationStyle || 'professional'],
      voice_style: legacyContext.voiceStyle || 'neutral',
      evaluation_signals: {}
    },
    coachConfig: {
      style: legacyContext.coachingStyle || legacyContext.coachPersonality || 'supportive',
      intervention_count: legacyContext.interventionCount || 0
    },
    scenarioConfig: {
      name: legacyContext.scenarioId || '',
      title: legacyContext.scenarioTitle || 'Practice Session',
      context: legacyContext.scenarioContext || {},
      target_meta_skills: ['emotional_intelligence', 'self_regulation']
    },
    sessionContext: {
      userArchetype: null,
      growthPriority: null,
      energyState: null,
      energyBalance: null,
      duration_minutes: legacyContext.practiceDuration || 20,
      elapsed_minutes: 0,
      intervention_count: legacyContext.interventionCount || 0,
      message_count: legacyContext.messageCount || 0,
      calendarContext: null,
      historicalPatterns: null,
      additionalContext: legacyContext.additionalContext || null,
      attachments: legacyContext.attachments || [],
      personalityStyle: legacyContext.personalityStyle || 'neutral-professional',
      practiceDuration: legacyContext.practiceDuration || 20
    }
  };
}

// ============================================
// HELPER: Transform legacy safety check
// ============================================

function transformSafetyCheck(legacySafety: any): SafetyCheck {
  return {
    triggered: legacySafety?.action !== 'proceed',
    category: null,
    severity: null,
    context: legacySafety?.contextType || null,
    action: legacySafety?.action || 'proceed',
    requiresClarification: legacySafety?.action === 'clarify',
    clarificationPrompt: legacySafety?.message || null,
    resources: [],
    responseGuidance: legacySafety?.message || null
  };
}

// ============================================
// MAIN SERVER
// ============================================

// Build opening message prompt for session start
function buildOpeningMessagePrompt(config: any, context: any): string {
  const personaType = config?.personaType || 'admissions';
  const personalityStyle = config?.personalityStyle || 'neutral-professional';
  const scenarioId = config?.scenarioId || context?.scenarioId || 'general';
  const scenarioCategory = config?.scenarioCategory || 'pressure';
  const voiceStyle = config?.voiceStyle || 'neutral';
  const practiceDuration = config?.practiceDuration || 20;
  const additionalContext = config?.additionalContext || context?.additionalContext || '';
  const attachments = config?.attachments || context?.attachments || [];
  const isCustomScenario = config?.isCustomScenario || false;
  const customScenarioText = config?.customScenarioText || '';
  const customPersonaText = config?.customPersonaText || '';
  const customPersonalityText = config?.customPersonalityText || '';
  const personaName = context?.persona?.name || context?.personaName || 'Interviewer';
  const personaRole = context?.persona?.role || context?.personaRole || 'Professional';

  return `
# OPENING MESSAGE GENERATION

You are generating the FIRST message from an AI persona to start a practice conversation.
This message sets the tone for the entire session.

## CONFIGURATION CONSTRAINTS (FIXED OPTIONS)

The user selected from predefined options. Your opening message MUST align with these exact selections:

### SELECTED CONFIGURATION
- **Scenario Category**: ${scenarioCategory}
- **Specific Scenario**: ${isCustomScenario ? `CUSTOM: "${customScenarioText}"` : scenarioId}
- **Persona Type**: ${personaType === 'custom' ? `CUSTOM: "${customPersonaText}"` : personaType}
- **Personality Style**: ${personalityStyle === 'custom' ? `CUSTOM: "${customPersonalityText}"` : personalityStyle}
- **Voice Style**: ${voiceStyle}
- **Practice Duration**: ${practiceDuration} minutes
- **Persona Name**: ${personaName}
- **Persona Role**: ${personaRole}

### VALID SCENARIO CATEGORIES (for reference)
- "leadership" → Leadership Moments: inspire, align, elevate others
- "difficult" → Difficult Conversations: navigate tension with composure
- "pressure" → High-Pressure Situations: perform with precision under stress
- "change" → Moments of Change: guide transitions with confidence
- "recovery" → Recovery & Resilience: restore calm after disruption

### VALID PERSONA TYPES (for reference)
- "classmate" → Peer, same-age student (casual, age-appropriate)
- "teacher" → Teacher/Professor with authority (authoritative but encouraging)
- "admissions" → University Admissions Officer (evaluative role)
- "dean" → Dean/Head of School (senior authority)
- "student-leader" → Club President/Student Leader (peer leader)
- "parent" → Parent/Guardian (family dynamic)
- "coach" → Coach/Sports Mentor (motivational authority)
- "counselor" → School Counselor (supportive guidance)
- "alumni" → Graduate/Former Student (peer-ish, experience-sharing)

### PERSONALITY STYLE BEHAVIORS (MANDATORY - Match Exactly)
ONLY 4 predefined styles exist. Match the selected style EXACTLY:

**warm-supportive**: 
- Friendly, encouraging, builds rapport, puts at ease
- Uses: "Great to meet you!", "I'm looking forward to...", "Take your time..."
- Creates psychological safety before diving in

**analytical-direct**:
- Efficient, to-the-point, time-conscious, fact-focused
- Uses: "Let's begin.", "We have X minutes.", "Walk me through..."
- Values clarity and gets to business quickly

**challenging-probing**:
- Intellectually rigorous (NOT rude), tests thinking, asks "why"
- Uses: "I'm curious what sets you apart...", "Convince me...", "What makes you different..."
- Pushes for depth WITHOUT being dismissive or condescending
- ⚠️ CRITICAL: "Challenging" means intellectually demanding, NOT rude, cold, or arrogant

**neutral-professional**:
- Balanced, formal, objective, measured
- Uses: "Thank you for coming.", "Could you tell me...", "Please explain..."
- Neither warm nor cold, standard professional demeanor

### VOICE STYLE GUIDANCE
- "masculine": Confident, assertive language. Direct statements over hedged language.
- "feminine": Collaborative, empathetic language. More acknowledgment and validation.

## OPENING MESSAGE RULES (CRITICAL)

1. **LOCATION-NEUTRAL**: Never assume physical presence or location
   - ❌ NEVER: "Sit down", "Come in", "These networking events", "Welcome to our office"
   - ✅ ALWAYS: "Good morning", "Thanks for connecting", "I've been looking forward to this"

2. **MATCH PERSONALITY EXACTLY**: Use the exact style selected above
   - If warm-supportive: Be genuinely warm and encouraging
   - If analytical-direct: Get to business efficiently
   - If challenging-probing: Be intellectually demanding (NOT rude)
   - If neutral-professional: Stay balanced and formal

3. **CHALLENGING ≠ RUDE**: This is critical
   - ✅ GOOD: "I'm genuinely curious what sets you apart from other candidates"
   - ✅ GOOD: "Tell me something that's not on your application"
   - ❌ BAD: "Sit down. I've read hundreds of applications like yours"
   - ❌ BAD: "Why should I waste my time with you?"

4. **SCENARIO-APPROPRIATE**: Match formality and context
   - Interview scenarios → More formal opening
   - Peer/social scenarios → More casual opening
   - Leadership scenarios → Audience-aware, motivational

5. **LEVERAGE USER CONTEXT IF PROVIDED**:
${additionalContext ? `   - User's additional context: "${additionalContext}" - subtly reference this` : '   - No additional context provided'}
${attachments.length > 0 ? `   - User attached ${attachments.length} file(s): ${attachments.map((a: any) => a.name).join(', ')} - acknowledge if relevant` : '   - No attachments'}

6. **OPENING LENGTH**: 1-3 sentences maximum. Natural, conversational.

7. **FULL IMMERSION - THIS IS REAL**: 
   - ❌ NEVER: "practice", "training", "session", "exercise", "simulation", "role-play"
   - ❌ NEVER: "We have X minutes for this practice"
   - ✅ ALWAYS: Treat this as the ACTUAL scenario (real interview, real meeting, real conversation)
   - The persona NEVER breaks character to acknowledge this is practice
   - You are THAT person, in THAT role, having a REAL conversation

## OUTPUT FORMAT

Respond with ONLY a JSON object:

\`\`\`json
{
  "opening_message": {
    "content": "The opening message from the persona (1-3 sentences, location-neutral, personality-matched)",
    "emotion": "friendly" | "professional" | "curious" | "warm" | "neutral" | "analytical"
  }
}
\`\`\`

Generate the opening message now.
`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rawBody = await req.json();
    
    // Validate input with Zod schema
    const parseResult = DialogueEngineInputSchema.safeParse(rawBody);
    if (!parseResult.success) {
      console.error('[dialogue-engine] Input validation failed:', parseResult.error.errors);
      return new Response(JSON.stringify({ 
        error: 'Invalid input',
        details: parseResult.error.errors.map(e => ({
          path: e.path.join('.'),
          message: e.message
        }))
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { type, userMessage, signals, context, conversationHistory, safetyCheck, configuration } = parseResult.data;

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    // Handle opening message generation
    if (type === 'opening') {
      console.log('[dialogue-engine] Generating opening message');
      console.log('[dialogue-engine] Configuration:', JSON.stringify(configuration || {}, null, 2));
      
      const openingPrompt = buildOpeningMessagePrompt(configuration, context);
      
      const openingResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are generating an opening message from a persona in a realistic scenario. Stay fully in character. Never reference this as practice, training, or simulation. Respond with valid JSON only.' },
            { role: 'user', content: openingPrompt }
          ],
          max_tokens: 500
        }),
      });

      if (!openingResponse.ok) {
        console.error('[dialogue-engine] Opening message generation failed:', openingResponse.status);
        // Return fallback opening
        return new Response(JSON.stringify({
          opening_message: {
            content: "Good morning. Thank you for joining me today. I'm looking forward to our conversation.",
            emotion: "professional"
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const openingData = await openingResponse.json();
      let openingContent = openingData.choices?.[0]?.message?.content || '';
      openingContent = openingContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      try {
        const parsedOpening = JSON.parse(openingContent);
        console.log('[dialogue-engine] Opening message generated successfully');
        return new Response(JSON.stringify(parsedOpening), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (parseError) {
        console.error('[dialogue-engine] Opening parse error:', parseError);
        return new Response(JSON.stringify({
          opening_message: {
            content: "Good morning. Thank you for joining me today. I'm looking forward to our conversation.",
            emotion: "professional"
          }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Regular response flow (type === 'response')
    // Transform legacy formats to new unified format
    const detectedSignals = transformSignals(signals);
    const { personaConfig, coachConfig, scenarioConfig, sessionContext } = transformContext(context);
    const safetyCk = transformSafetyCheck(safetyCheck);

    // Transform conversation history format
    const formattedHistory: ConversationMessage[] = (conversationHistory || []).map((m: any) => ({
      sender: m.role || m.sender || 'user',
      content: m.content || ''
    }));

    // Build the unified prompt
    const prompt = buildUnifiedPrompt({
      userMessage,
      conversationHistory: formattedHistory,
      detectedSignals,
      personaConfig,
      coachConfig,
      scenarioConfig,
      sessionContext,
      safetyCheck: safetyCk
    });

    console.log('[dialogue-engine] Processing message for session:', context?.scenarioId);
    console.log('[dialogue-engine] Coaching style:', coachConfig.style);
    console.log('[dialogue-engine] Personality style:', sessionContext.personalityStyle);
    console.log('[dialogue-engine] Practice duration:', sessionContext.practiceDuration);
    console.log('[dialogue-engine] Safety triggered:', safetyCk.triggered);

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
            content: 'You are a dialogue simulation engine. Always respond with valid JSON only, no markdown formatting or code blocks.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 2000
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
    
    console.log('[dialogue-engine] Raw response length:', content.length);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(content);
    } catch (parseError) {
      console.error('[dialogue-engine] JSON parse error:', parseError);
      console.error('[dialogue-engine] Raw content:', content.substring(0, 500));
      
      // Fallback response
      parsedResponse = {
        persona_response: {
          content: "I appreciate your response. Could you elaborate on that point?",
          emotion: "curious",
          internal_assessment: "Unable to fully assess"
        },
        coaching_intervention: {
          should_intervene: false,
          type: null,
          observation: null,
          gap_or_strength: null,
          meta_skill: null,
          sub_skill: null,
          framework_name: null,
          framework_source: null,
          framework_wisdom: null,
          action_step: null,
          tone: null
        },
        refined_analysis: {
          sentiment_override: null,
          emotion_override: null,
          additional_gaps: [],
          additional_strengths: []
        },
        safety_response: {
          is_safety_situation: false,
          clarification_asked: null,
          resources_provided: [],
          empathy_statement: null
        },
        session_note: "Parse error - using fallback"
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
        content: "I'm having trouble processing that. Could you rephrase?",
        emotion: "concerned",
        internal_assessment: "System error"
      },
      coaching_intervention: { should_intervene: false },
      safety_response: { is_safety_situation: false }
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
