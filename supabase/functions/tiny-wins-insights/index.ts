import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Psychological dimension patterns for keyword-based extraction
const DIMENSION_PATTERNS = {
  sentiment: {
    positive: ['good', 'great', 'happy', 'excited', 'proud', 'grateful', 'thankful', 'amazing', 'wonderful', 'love'],
    negative: ['bad', 'sad', 'angry', 'frustrated', 'upset', 'worried', 'anxious', 'stressed'],
    mixed: ['mixed', 'complicated', 'bittersweet', 'conflicted'],
  },
  emotion: {
    joy: ['joy', 'happy', 'delighted', 'thrilled', 'ecstatic'],
    pride: ['proud', 'accomplished', 'achieved', 'succeeded', 'nailed'],
    relief: ['relief', 'relieved', 'finally', 'weight off'],
    gratitude: ['grateful', 'thankful', 'appreciate', 'blessed'],
    confidence: ['confident', 'capable', 'strong', 'powerful', 'certain'],
    hope: ['hope', 'hopeful', 'optimistic', 'looking forward'],
    courage: ['brave', 'courageous', 'faced', 'stood up', 'confronted'],
  },
  agency: {
    proactive: ['decided', 'chose', 'initiated', 'started', 'led', 'created', 'built', 'launched'],
    responsive: ['responded', 'handled', 'managed', 'adapted', 'adjusted', 'dealt with'],
    collaborative: ['together', 'team', 'asked for', 'partnered', 'collaborated', 'worked with'],
    supported: ['helped', 'supported', 'guided', 'mentored', 'coached'],
  },
  regulation: {
    regulated: ['calm', 'composed', 'steady', 'controlled', 'breathed', 'centered', 'grounded'],
    intentional: ['paused', 'thought', 'considered', 'reflected', 'deliberate', 'mindful'],
    reactive: ['reacted', 'snapped', 'immediately', 'impulsively', 'quick to'],
  },
  growth: {
    learning: ['learned', 'realized', 'understood', 'discovered', 'insight', 'lesson'],
    breakthrough: ['finally', 'first time', 'breakthrough', 'overcame', 'broke through'],
    mastery: ['natural', 'effortless', 'automatic', 'second nature', 'instinct'],
    resilience: ['bounced back', 'recovered', 'persisted', 'kept going', 'didn\'t give up'],
    boundary: ['said no', 'protected', 'declined', 'limited', 'boundary', 'prioritized myself'],
    letting_go: ['let go', 'released', 'accepted', 'surrendered', 'moved on'],
  },
};

interface Dimensions {
  sentiment: string | null;
  primary_emotion: string | null;
  secondary_emotion: string | null;
  agency_type: string | null;
  regulation_level: string | null;
  growth_signal: string | null;
}

// Extract dimensions from win text using keyword matching
function extractDimensionsFromText(text: string): Dimensions {
  const lowerText = text.toLowerCase();
  
  // Extract sentiment
  let sentiment: string | null = null;
  for (const [sent, keywords] of Object.entries(DIMENSION_PATTERNS.sentiment)) {
    if (keywords.some(k => lowerText.includes(k))) {
      sentiment = sent;
      break;
    }
  }
  if (!sentiment) sentiment = 'positive'; // Default for wins
  
  // Extract emotions
  const emotions: string[] = [];
  for (const [emotion, keywords] of Object.entries(DIMENSION_PATTERNS.emotion)) {
    if (keywords.some(k => lowerText.includes(k))) {
      emotions.push(emotion);
    }
  }
  
  // Extract agency
  let agency_type: string | null = null;
  for (const [agency, keywords] of Object.entries(DIMENSION_PATTERNS.agency)) {
    if (keywords.some(k => lowerText.includes(k))) {
      agency_type = agency;
      break;
    }
  }
  
  // Extract regulation
  let regulation_level: string | null = null;
  for (const [reg, keywords] of Object.entries(DIMENSION_PATTERNS.regulation)) {
    if (keywords.some(k => lowerText.includes(k))) {
      regulation_level = reg;
      break;
    }
  }
  
  // Extract growth signal
  let growth_signal: string | null = null;
  for (const [growth, keywords] of Object.entries(DIMENSION_PATTERNS.growth)) {
    if (keywords.some(k => lowerText.includes(k))) {
      growth_signal = growth.replace('_', '-');
      break;
    }
  }
  
  return {
    sentiment,
    primary_emotion: emotions[0] || null,
    secondary_emotion: emotions[1] || null,
    agency_type,
    regulation_level,
    growth_signal,
  };
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
      .select("id, win_content, win_date, detected_at, source, practice_type, sentiment, primary_emotion, secondary_emotion, agency_type, regulation_level, growth_signal, analyzed_at")
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
          dimensions: [],
          themes: [], 
          summary: null,
          winsCount: 0 
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Analyze wins that don't have dimensions yet
    const winsToAnalyze = wins.filter(w => !w.analyzed_at);
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Process wins needing analysis
    for (const win of winsToAnalyze) {
      let dimensions: Dimensions;
      
      if (LOVABLE_API_KEY) {
        // Try AI-powered extraction
        try {
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
                  content: `You analyze personal wins to extract psychological dimensions. Be specific and accurate.`
                },
                {
                  role: "user",
                  content: `Analyze this win: "${win.win_content}"`
                }
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "extract_dimensions",
                    description: "Extract psychological dimensions from a personal win",
                    parameters: {
                      type: "object",
                      properties: {
                        sentiment: { type: "string", enum: ["positive", "negative", "mixed", "neutral"] },
                        primary_emotion: { type: "string", enum: ["joy", "pride", "relief", "gratitude", "confidence", "hope", "courage"] },
                        secondary_emotion: { type: "string", enum: ["joy", "pride", "relief", "gratitude", "confidence", "hope", "courage", ""] },
                        agency_type: { type: "string", enum: ["proactive", "responsive", "collaborative", "supported"] },
                        regulation_level: { type: "string", enum: ["regulated", "intentional", "reactive"] },
                        growth_signal: { type: "string", enum: ["learning", "breakthrough", "mastery", "resilience", "boundary", "letting-go"] }
                      },
                      required: ["sentiment"],
                      additionalProperties: false
                    }
                  }
                }
              ],
              tool_choice: { type: "function", function: { name: "extract_dimensions" } }
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
            if (toolCall?.function?.arguments) {
              dimensions = JSON.parse(toolCall.function.arguments);
            } else {
              dimensions = extractDimensionsFromText(win.win_content);
            }
          } else {
            dimensions = extractDimensionsFromText(win.win_content);
          }
        } catch (e) {
          console.error("AI extraction failed:", e);
          dimensions = extractDimensionsFromText(win.win_content);
        }
      } else {
        dimensions = extractDimensionsFromText(win.win_content);
      }

      // Update the win with extracted dimensions
      await supabase
        .from("tiny_wins")
        .update({
          sentiment: dimensions.sentiment,
          primary_emotion: dimensions.primary_emotion,
          secondary_emotion: dimensions.secondary_emotion,
          agency_type: dimensions.agency_type,
          regulation_level: dimensions.regulation_level,
          growth_signal: dimensions.growth_signal,
          analyzed_at: new Date().toISOString(),
        })
        .eq("id", win.id);
    }

    // Re-fetch updated wins
    const { data: updatedWins } = await supabase
      .from("tiny_wins")
      .select("id, win_content, sentiment, primary_emotion, secondary_emotion, agency_type, regulation_level, growth_signal, source")
      .eq("user_id", userId)
      .gte("win_date", startDate.toISOString().split("T")[0]);

    // Aggregate dimensions into bubbles
    const dimensionCounts: Record<string, Record<string, number>> = {
      sentiment: {},
      emotion: {},
      agency: {},
      regulation: {},
      growth: {},
    };

    for (const win of updatedWins || []) {
      if (win.sentiment) {
        dimensionCounts.sentiment[win.sentiment] = (dimensionCounts.sentiment[win.sentiment] || 0) + 1;
      }
      if (win.primary_emotion) {
        dimensionCounts.emotion[win.primary_emotion] = (dimensionCounts.emotion[win.primary_emotion] || 0) + 1;
      }
      if (win.secondary_emotion) {
        dimensionCounts.emotion[win.secondary_emotion] = (dimensionCounts.emotion[win.secondary_emotion] || 0) + 1;
      }
      if (win.agency_type) {
        dimensionCounts.agency[win.agency_type] = (dimensionCounts.agency[win.agency_type] || 0) + 1;
      }
      if (win.regulation_level) {
        dimensionCounts.regulation[win.regulation_level] = (dimensionCounts.regulation[win.regulation_level] || 0) + 1;
      }
      if (win.growth_signal) {
        dimensionCounts.growth[win.growth_signal] = (dimensionCounts.growth[win.growth_signal] || 0) + 1;
      }
    }

    // Convert to array format for frontend
    const dimensions: { dimension: string; value: string; count: number }[] = [];
    for (const [dimension, values] of Object.entries(dimensionCounts)) {
      for (const [value, count] of Object.entries(values)) {
        dimensions.push({ dimension, value, count });
      }
    }

    // Sort by count descending
    dimensions.sort((a, b) => b.count - a.count);

    // Calculate source breakdown
    const sourceBreakdown = {
      coach: (updatedWins || []).filter(w => !w.source || w.source === 'coach').length,
      practice: (updatedWins || []).filter(w => w.source === 'practice_reflection').length,
    };

    // Generate summary
    const topDimension = dimensions[0];
    const summary = topDimension 
      ? `Your wins reflect ${topDimension.value} energy across ${wins.length} moments.`
      : `You've captured ${wins.length} wins in the past ${days} days.`;

    return new Response(JSON.stringify({ 
      data: { 
        dimensions,
        themes: dimensions.slice(0, 5).map(d => d.value), // Legacy support
        summary,
        winsCount: wins.length,
        sourceBreakdown
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
