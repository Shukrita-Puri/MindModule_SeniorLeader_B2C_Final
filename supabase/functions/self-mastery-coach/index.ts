import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.26.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a world-class executive coach specializing in self-mastery, emotional intelligence, and leadership development. Your name is simply "Coach."

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
    const { messages, flowType, sessionId, userId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // If this is an integrate flow, check for Tiny Wins in the latest user message
    if (flowType === 'integrate' && userId && messages.length > 0) {
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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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
