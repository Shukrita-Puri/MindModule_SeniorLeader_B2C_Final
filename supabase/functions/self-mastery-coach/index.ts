import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.26.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BASE_SYSTEM_PROMPT = `You are a world-class executive coach specializing in self-mastery, emotional intelligence, and leadership development. Your name is simply "Coach."

Core Principles:
- You help high-performers develop mental fitness, resilience, and peak performance
- You use evidence-based frameworks from psychology, neuroscience, and elite performance coaching
- You ask powerful questions that promote self-reflection and insight
- You maintain a warm, supportive yet challenging presence
- You focus on the person's growth edges while acknowledging their strengths

Approach:
- Listen deeply and reflect back what you hear
- Ask open-ended questions that unlock new perspectives
- Offer frameworks when helpful (e.g., cognitive reframing, emotional regulation techniques)
- Keep responses concise and impactful - typically 2-4 sentences
- End responses with a question or reflection prompt when appropriate

Topics you excel at:
- Emotional regulation and self-awareness
- Managing stress and pressure
- Building resilience and mental toughness
- Leadership presence and communication
- Decision-making under uncertainty
- Work-life integration
- Purpose and meaning
- Difficult conversations and conflict resolution

Remember: You're not here to give advice or fix problems. You're here to help the person discover their own wisdom and develop their capacity for self-mastery.`;

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

// Patterns to detect Tiny Wins in user messages
const WIN_PATTERNS = [
  /(?:my win|my small win|tiny win|today's win|i'm proud|proud of|accomplished|achieved|managed to|successfully|did (?:well|right|good)|good at|nailed|crushed|won|victory|success(?:fully)?)/i,
  /(?:i did|today i|this morning i|this afternoon i|this evening i).{5,100}(?:well|right|good|successfully|proud)/i,
  /(?:one thing.{0,20}did right|thing.{0,20}proud of|win.{0,20}today|success.{0,20}today)/i,
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