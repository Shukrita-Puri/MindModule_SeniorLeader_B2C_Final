import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckInData {
  checkin_date: string;
  outcome: string;
  energy_balance: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify user via Auth0 userinfo
    const token = authHeader.replace("Bearer ", "");
    const AUTH0_DOMAIN = Deno.env.get("AUTH0_DOMAIN");
    
    const userInfoRes = await fetch(`https://${AUTH0_DOMAIN}/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!userInfoRes.ok) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    const userInfo = await userInfoRes.json();
    const userId = userInfo.sub;

    // Get request body
    const { days = 7 } = await req.json().catch(() => ({}));

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch check-ins for the user
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data: checkIns, error: checkInsError } = await supabase
      .from("daily_checkins")
      .select("checkin_date, outcome, energy_balance")
      .eq("user_id", userId)
      .gte("checkin_date", startDate.toISOString().split("T")[0])
      .order("checkin_date", { ascending: true });

    if (checkInsError) {
      console.error("Error fetching check-ins:", checkInsError);
      return new Response(JSON.stringify({ error: "Failed to fetch check-ins" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's archetype from profiles
    const { data: profile } = await supabase
      .from("profiles")
      .select("user_archetype")
      .eq("id", userId)
      .single();

    const userArchetype = profile?.user_archetype || null;

    // If no check-ins, return empty response
    if (!checkIns || checkIns.length === 0) {
      return new Response(JSON.stringify({ 
        data: { 
          distribution: {},
          observation: null,
          checkInCount: 0,
          userArchetype
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate state distribution
    const distribution: Record<string, number> = {};
    checkIns.forEach((checkIn: CheckInData) => {
      const outcome = checkIn.outcome || 'unknown';
      distribution[outcome] = (distribution[outcome] || 0) + 1;
    });

    // Use Lovable AI to generate pattern observation
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      // Fallback: Generate simple observation without AI
      const observation = generateSimpleObservation(checkIns, distribution);
      return new Response(JSON.stringify({ 
        data: { 
          distribution,
          observation,
          checkInCount: checkIns.length,
          userArchetype
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prepare check-in data for AI analysis
    const checkInSummary = checkIns.map((c: CheckInData) => 
      `${c.checkin_date}: ${c.outcome}${c.energy_balance !== null ? ` (balance: ${c.energy_balance})` : ''}`
    ).join("\n");
    
    const distributionSummary = Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .map(([state, count]) => `${state}: ${count} days`)
      .join(", ");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a performance coach analyzing a senior executive's daily energy check-in patterns.
Your job is to provide a brief, insightful observation about their patterns over the past week.
Focus on:
- Dominant states and what they reveal
- Trends (improvement or concern)
- Day-of-week patterns if visible
- Connection between states and self-regulation
Keep the tone encouraging but honest. Be specific, not generic.
${userArchetype ? `The user's archetype is "${userArchetype}" - subtly reference this if relevant.` : ''}`
          },
          {
            role: "user",
            content: `Here are the daily check-ins over ${days} days:\n\n${checkInSummary}\n\nDistribution: ${distributionSummary}\n\nProvide a 2-3 sentence observation about their patterns.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_state_observation",
              description: "Generate an observation about the user's state patterns",
              parameters: {
                type: "object",
                properties: {
                  observation: {
                    type: "string",
                    description: "2-3 sentence observation about the user's state patterns, trends, and what it means for their performance"
                  }
                },
                required: ["observation"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_state_observation" } }
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      // Fallback to simple observation
      const observation = generateSimpleObservation(checkIns, distribution);
      return new Response(JSON.stringify({ 
        data: { 
          distribution,
          observation,
          checkInCount: checkIns.length,
          userArchetype
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ 
        data: { 
          distribution,
          observation: parsed.observation || null,
          checkInCount: checkIns.length,
          userArchetype
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback if AI response doesn't have expected format
    const observation = generateSimpleObservation(checkIns, distribution);
    return new Response(JSON.stringify({ 
      data: { 
        distribution,
        observation,
        checkInCount: checkIns.length,
        userArchetype
      } 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("state-patterns-insights error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Simple observation fallback
function generateSimpleObservation(checkIns: CheckInData[], distribution: Record<string, number>): string {
  const total = checkIns.length;
  const sorted = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
  
  if (sorted.length === 0) return "No check-in data available yet. Start checking in daily to see patterns.";
  
  const [topState, topCount] = sorted[0];
  const percentage = Math.round((topCount / total) * 100);
  
  const stateLabels: Record<string, string> = {
    overwhelmed: "overwhelmed",
    drained: "low energy",
    scattered: "scattered",
    steady: "steady",
    focused: "focused"
  };
  
  const stateLabel = stateLabels[topState] || topState;
  
  if (percentage >= 70) {
    if (topState === 'steady' || topState === 'focused') {
      return `You've been consistently ${stateLabel} this week (${percentage}% of check-ins). This stability is the foundation for sustained performance.`;
    } else {
      return `You've felt ${stateLabel} most of this week (${percentage}% of check-ins). Consider what's driving this pattern and whether your current practices are meeting the need.`;
    }
  } else if (sorted.length >= 2) {
    const [secondState, secondCount] = sorted[1];
    const secondLabel = stateLabels[secondState] || secondState;
    return `Your week has varied between ${stateLabel} (${topCount} days) and ${secondLabel} (${secondCount} days). This variability suggests your regulation practices may be working—keep tuning in.`;
  }
  
  return `You've checked in ${total} times this week. Consistent check-ins build self-awareness, which is the foundation of self-regulation.`;
}
