import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { days = 14 } = await req.json().catch(() => ({}));

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch tiny wins for the user
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data: wins, error: winsError } = await supabase
      .from("tiny_wins")
      .select("win_content, win_date, detected_at")
      .eq("user_id", userId)
      .gte("win_date", startDate.toISOString().split("T")[0])
      .order("detected_at", { ascending: false });

    if (winsError) {
      console.error("Error fetching tiny wins:", winsError);
      return new Response(JSON.stringify({ error: "Failed to fetch wins" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no wins, return empty response
    if (!wins || wins.length === 0) {
      return new Response(JSON.stringify({ 
        data: { 
          themes: [], 
          summary: null,
          winsCount: 0 
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Lovable AI to analyze patterns
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      // Fallback: Simple keyword extraction without AI
      const simpleThemes = extractSimpleThemes(wins.map(w => w.win_content));
      return new Response(JSON.stringify({ 
        data: { 
          themes: simpleThemes,
          summary: `You've captured ${wins.length} wins in the past ${days} days.`,
          winsCount: wins.length
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const winsText = wins.map(w => `- ${w.win_content}`).join("\n");
    
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
            content: `You are analyzing a senior executive's "Tiny Wins" from the past two weeks. 
Your job is to identify 2-3 patterns or themes that emerge from their wins.
Be specific, insightful, and encouraging. Use executive-level language.
Focus on leadership behaviors, not just tasks completed.`
          },
          {
            role: "user",
            content: `Here are the wins captured:\n\n${winsText}\n\nExtract the patterns and provide a one-sentence insight.`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_win_patterns",
              description: "Extract patterns and themes from tiny wins",
              parameters: {
                type: "object",
                properties: {
                  themes: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-3 pattern/theme labels (e.g., 'Delegation', 'Boundary Setting', 'Strategic Focus')"
                  },
                  summary: {
                    type: "string",
                    description: "One sentence insight about what the user has been winning at"
                  }
                },
                required: ["themes", "summary"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_win_patterns" } }
      }),
    });

    if (!aiResponse.ok) {
      console.error("AI gateway error:", aiResponse.status, await aiResponse.text());
      // Fallback to simple extraction
      const simpleThemes = extractSimpleThemes(wins.map(w => w.win_content));
      return new Response(JSON.stringify({ 
        data: { 
          themes: simpleThemes,
          summary: `You've captured ${wins.length} wins in the past ${days} days.`,
          winsCount: wins.length
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
          themes: parsed.themes || [],
          summary: parsed.summary || null,
          winsCount: wins.length
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback if AI response doesn't have expected format
    const simpleThemes = extractSimpleThemes(wins.map(w => w.win_content));
    return new Response(JSON.stringify({ 
      data: { 
        themes: simpleThemes,
        summary: `You've captured ${wins.length} wins in the past ${days} days.`,
        winsCount: wins.length
      } 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("tiny-wins-insights error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Simple keyword extraction fallback
function extractSimpleThemes(wins: string[]): string[] {
  const text = wins.join(" ").toLowerCase();
  const themes: string[] = [];
  
  const patterns = [
    { keywords: ["delegat", "assign", "hand off"], theme: "Delegation" },
    { keywords: ["no", "decline", "boundar", "protect"], theme: "Boundary Setting" },
    { keywords: ["break", "rest", "pause", "walk"], theme: "Recovery" },
    { keywords: ["focus", "priorit", "deep work"], theme: "Strategic Focus" },
    { keywords: ["listen", "empathy", "team", "support"], theme: "Leadership" },
    { keywords: ["decis", "chose", "commit"], theme: "Decision Making" },
    { keywords: ["calm", "breath", "regulate", "composed"], theme: "Emotional Regulation" },
  ];
  
  for (const pattern of patterns) {
    if (pattern.keywords.some(k => text.includes(k))) {
      themes.push(pattern.theme);
      if (themes.length >= 3) break;
    }
  }
  
  return themes.length > 0 ? themes : ["Personal Growth"];
}
