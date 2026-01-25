import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.26.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_SYSTEM_PROMPT = `You are an elite executive coach specializing in the inner game of leadership. Your name is simply "Coach."

=== WHO YOU SERVE ===
C-Suite executives and senior leaders carrying extraordinary cognitive and emotional load. They don't need more information—they need space to think, tools to regulate, and someone who understands the weight of their decisions.

=== CORE META-SKILLS YOU DEVELOP ===

1. SELF-REGULATION (Foundation)
   - Recognizing emotional triggers before they hijack behavior
   - Pause-and-pivot techniques under pressure
   - Nervous system regulation for sustained performance
   - Energy management across high-stakes days

2. RESILIENCE & HANDLING AMBIGUITY
   - Thriving without complete information
   - Making decisions with 70% clarity
   - Cognitive reframing when outcomes are uncertain
   - Building tolerance for complexity without resolution

3. EMOTIONAL INTELLIGENCE
   - Reading the room beyond words
   - Calibrating responses to emotional undercurrents
   - Managing up, down, and across with different registers
   - Self-awareness as the foundation of other-awareness

4. CONFIDENCE & PRESENCE
   - Executive presence that commands without demanding
   - Owning the room while creating space for others
   - Recovering quickly from setbacks or public missteps
   - The quiet confidence that comes from self-mastery

5. INFLUENCE, COLLABORATION & PERSUASION
   - Strategic influence without manipulation
   - Building coalitions for complex initiatives
   - Reading resistance and addressing the real objection
   - Aligning stakeholders with competing interests

6. LEARNING AGILITY
   - Extracting lessons from every interaction
   - Updating mental models quickly
   - Curiosity over certainty
   - Treating feedback as data, not judgment

=== YOUR COACHING APPROACH ===

**Respect Their Intelligence**
- They've heard all the frameworks. Don't lecture.
- Ask questions that unlock their own wisdom.
- Trust they can handle direct, even uncomfortable observations.

**Efficiency Over Elaboration**
- Responses: 2-4 sentences maximum (unless guiding a practice)
- One powerful question beats three good ones
- Mirror back what you hear with precision

**State-Aware Coaching**
- OVERWHELMED: Help them ground first, think second
- DRAINED: Validate before energizing
- SCATTERED: One anchor point, not five suggestions
- FOCUSED: Challenge them to go deeper
- STEADY: Help them leverage this state strategically

**The Inner World Focus**
- Help them notice what's happening INSIDE before acting OUTSIDE
- Regulate first, then strategize
- Connect physical sensations to emotional states
- Build self-observation as a leadership skill

=== WHAT MAKES YOU DIFFERENT ===

You don't:
- Give advice they could find in a business book
- Pretend to understand their specific business challenges
- Use jargon or coach-speak
- Over-validate or under-challenge

You do:
- Hold space for the loneliness of leadership
- Name patterns they might be avoiding
- Ask the question they're not asking themselves
- Help them access clarity they already have

=== SIGNATURE TECHNIQUES ===

1. "Somatic Check-In": Before strategizing, ask what they notice in their body
2. "Zoom Out": Help them see the situation from 30,000 feet
3. "The Real Question": Identify the question beneath their question
4. "Name the Pattern": Gently surface recurring themes across conversations
5. "Future Self": Connect today's regulation to tomorrow's leadership impact

Remember: Your job is not to make them feel better. It's to help them see clearly, regulate effectively, and lead from their center.`;

// Build dynamic system prompt with user context
interface CoachContext {
  todayState?: {
    score: number;
    tier: string;
    outcome?: string;
    contextStatement?: string;
  };
  theme?: {
    phrase: string;
    context: string;
    driver?: string;
  };
  jitContext?: {
    trigger: string;
    eventTitle?: string;
    minutesUntil?: number;
  };
  consecutivePattern?: {
    days: number;
    state: string;
  };
  userArchetype?: string;
  identityRole?: string;
  planStatus?: {
    completedModules: string[];
    pendingModules: string[];
  };
  timeOfDay?: string;
  recentPractices?: string[];
  // Guided practice mode
  practiceSteps?: Array<{
    title: string;
    instruction: string;
    duration?: number;
  }>;
  practiceTitle?: string;
}

const buildSystemPrompt = (context?: CoachContext, flowType?: string): string => {
  let prompt = BASE_SYSTEM_PROMPT;
  
  // Add guided practice mode instructions
  if (flowType === 'guided-reflection' && context?.practiceSteps && context?.practiceTitle) {
    prompt += `\n\n=== GUIDED PRACTICE MODE ===
You are guiding the user through a "${context.practiceTitle}" practice.

Steps to guide them through:
${context.practiceSteps.map((step, i) => `${i + 1}. ${step.title}: ${step.instruction}`).join('\n')}

Instructions:
- Walk them through each step conversationally
- After each step, acknowledge their response warmly and transition naturally to the next step
- Don't rush - let them process each reflection
- Capture any "tiny wins" or realizations they share
- At the end, summarize the key insight from their reflection`;
    return prompt;
  }
  
  // Add user context if available
  if (context) {
    const contextLines: string[] = ['\n\n=== USER CONTEXT ==='];
    
    // Today's state
    if (context.todayState) {
      const stateLabel = context.todayState.outcome || context.todayState.tier;
      contextLines.push(`Current State: ${stateLabel} (energy score: ${context.todayState.score}/100)`);
    }
    
    // Theme for today
    if (context.theme) {
      contextLines.push(`Theme for Today: "${context.theme.phrase}"`);
      contextLines.push(`Theme Context: ${context.theme.context}`);
    }
    
    // Upcoming event (JIT)
    if (context.jitContext?.eventTitle) {
      contextLines.push(`Upcoming Event: "${context.jitContext.eventTitle}" in ${context.jitContext.minutesUntil || '?'} minutes`);
    }
    
    // Consecutive pattern
    if (context.consecutivePattern) {
      contextLines.push(`Pattern Alert: Day ${context.consecutivePattern.days} of feeling ${context.consecutivePattern.state}`);
    }
    
    // User archetype
    if (context.userArchetype) {
      contextLines.push(`Executive Archetype: ${context.userArchetype}`);
    }
    
    // Time of day
    if (context.timeOfDay) {
      contextLines.push(`Time of Day: ${context.timeOfDay}`);
    }
    
    // Add guidance
    contextLines.push('');
    contextLines.push('=== PERSONALIZATION GUIDANCE ===');
    contextLines.push('Use this context to personalize your responses:');
    contextLines.push('- Reference the theme or state when relevant');
    contextLines.push('- If they have an upcoming event, help them prepare specifically for it');
    contextLines.push("- If they've been in a low state for multiple days, acknowledge this pattern gently");
    contextLines.push('- Match your energy to their state - calmer for overwhelmed, more energizing for drained');
    
    prompt += contextLines.join('\n');
  }
  
  return prompt;
};

// Patterns to detect Tiny Wins and reflections in user messages
const WIN_PATTERNS = [
  // Achievement patterns
  /(?:my win|my small win|tiny win|today's win|i'm proud|proud of|accomplished|achieved|managed to|successfully|did (?:well|right|good)|good at|nailed|crushed|won|victory|success(?:fully)?)/i,
  /(?:i did|today i|this morning i|this afternoon i|this evening i).{5,100}(?:well|right|good|successfully|proud)/i,
  /(?:one thing.{0,20}did right|thing.{0,20}proud of|win.{0,20}today|success.{0,20}today)/i,
  // Leadership behaviors
  /(?:i stood my ground|i said no|i delegated|i took a break|i paused|i listened)/i,
  // Reflection patterns (for practice reflections and integrate flow)
  /(?:i noticed|i realized|what worked|i learned|helped me|i felt more|i appreciated|i discovered|gave me clarity|i understood|shifted my perspective|i was present|i stayed calm|i chose to)/i,
  /(?:the practice|this exercise|this helped).{5,60}(?:me|my|realize|understand|feel|clarity|perspective)/i,
];

// Detect if a message contains a Tiny Win
const detectTinyWin = (content: string): boolean => {
  return WIN_PATTERNS.some(pattern => pattern.test(content));
};

// Store a Tiny Win in the database
const storeTinyWin = async (
  supabaseUrl: string,
  supabaseKey: string,
  userId: string,
  sessionId: string | null,
  winContent: string
) => {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('tiny_wins').insert({
      user_id: userId,
      session_id: sessionId,
      win_content: winContent,
      win_date: new Date().toISOString().split('T')[0],
      source: 'coach', // Track that this came from coach conversation
    });
    
    if (error) {
      console.error('Error storing tiny win:', error);
    } else {
      console.log('✅ Tiny win stored successfully');
    }
  } catch (err) {
    console.error('Error in storeTinyWin:', err);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, flowType, sessionId, userId, context } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // If this is an integrate flow, check for Tiny Wins in the latest user message
    if ((flowType === 'integrate' || flowType === 'guided-reflection') && userId && messages.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      if (supabaseUrl && supabaseServiceKey) {
        // Check the latest user message for a win
        const latestUserMessage = [...messages].reverse().find((m: { role: string; content: string }) => m.role === 'user');
        if (latestUserMessage && detectTinyWin(latestUserMessage.content)) {
          console.log('🏆 Detected Tiny Win in message:', latestUserMessage.content.substring(0, 100));
          await storeTinyWin(supabaseUrl, supabaseServiceKey, userId, sessionId, latestUserMessage.content);
        }
      }
    }

    // Build dynamic system prompt with context
    const systemPrompt = buildSystemPrompt(context as CoachContext, flowType);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please try again later." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Failed to connect to AI service" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Self Mastery Coach error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});