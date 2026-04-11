import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { callClaudeText, callClaudeWithTools, CLAUDE_MODELS } from "../_shared/anthropic.ts";

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
    'letting-go': ['let go', 'released', 'accepted', 'surrendered', 'moved on'],
  },
};

// Display labels for C-suite language
const DISPLAY_LABELS: Record<string, string> = {
  emotion: "What you felt",
  agency: "How you showed up",
  regulation: "How you led yourself",
  growth: "What it built",
};

// Per-dimension insight text (moved from client-side)
const DIMENSION_INSIGHTS: Record<string, Record<string, string>> = {
  emotion: {
    pride: "Pride anchors accomplishment in your nervous system. This emotional marker strengthens your internal sense of competence–a key driver of Resilience when facing future challenges.",
    gratitude: "Gratitude shifts your nervous system toward parasympathetic activation. Regular gratitude practice has been shown to increase Resilience and reduce stress reactivity by up to 25%.",
    relief: "Noticing relief indicates you're tracking pressure cycles. This Self-Regulation skill helps you recognize recovery moments and prevent chronic stress accumulation.",
    joy: "Joy captures flow states and peak experiences. Tracking these moments reveals your optimal conditions–key Emotional Intelligence for designing environments that support high performance.",
    confidence: "Confidence in your wins reflects a growing internal locus of control. This self-trust is foundational for making decisive calls under pressure.",
    hope: "Hope signals forward orientation and optimism. Leaders who track hopeful moments build psychological capital that sustains performance through uncertainty.",
    courage: "Courage reflects your willingness to face discomfort. This pattern indicates growing capacity for bold leadership moves and difficult conversations.",
  },
  agency: {
    proactive: "Taking initiative before external pressure reflects strong Self-Regulation. This proactive stance is a hallmark of high-performing leaders who shape conditions rather than react to them.",
    responsive: "Adapting effectively to circumstances shows emotional agility. Your responsiveness indicates mature leadership that reads situations and adjusts without rigidity.",
    collaborative: "Leveraging collective intelligence is advanced leadership. Your collaborative wins show you're building the relational capital that multiplies your impact.",
    supported: "Seeking and accepting support reflects secure leadership. This pattern indicates psychological safety and the wisdom to leverage others' strengths.",
  },
  regulation: {
    regulated: "Regulated states indicate your nervous system capacity is growing. Each time you notice regulation, you're reinforcing the neural circuitry for calm under pressure–essential for executive decision-making.",
    intentional: "Intentional pauses before action reflect meta-cognitive mastery. This deliberate approach to decisions is what separates reactive management from strategic leadership.",
    reactive: "Noticing reactivity is itself a form of Self-Regulation. This meta-awareness creates space between trigger and response, where better choices become possible.",
  },
  growth: {
    learning: "A learning orientation is the engine of growth. By framing experiences as lessons, you're building Resilience and ensuring that even setbacks contribute to your development.",
    breakthrough: "Breakthroughs mark threshold moments in your development. These aren't just wins–they're evidence that sustained effort is reshaping your capabilities.",
    mastery: "Mastery orientation reflects your commitment to continuous improvement. This growth mindset is directly correlated with Resilience–you view challenges as development opportunities rather than threats.",
    resilience: "You're explicitly building Resilience–the capacity to recover from setback. This meta-skill compounds over time, making you more adaptable and less affected by external volatility.",
    boundary: "Setting boundaries is an advanced leadership skill. This pattern shows you're protecting your capacity for what matters most–a critical self-regulation behaviour.",
    'letting-go': "Letting go reflects emotional maturity and trust in outcomes. This capacity to release control where appropriate frees cognitive resources for higher-order decisions.",
  },
};

function getInsightText(dimension: string, value: string, count: number): string {
  const dimensionInsights = DIMENSION_INSIGHTS[dimension];
  if (dimensionInsights) {
    const insight = dimensionInsights[value.toLowerCase()];
    if (insight) return insight;
  }
  return `This pattern appears ${count} times in your recent wins, suggesting it's a significant part of your leadership momentum.`;
}

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
  
  let sentiment: string | null = null;
  for (const [sent, keywords] of Object.entries(DIMENSION_PATTERNS.sentiment)) {
    if (keywords.some(k => lowerText.includes(k))) {
      sentiment = sent;
      break;
    }
  }
  if (!sentiment) sentiment = 'positive';
  
  const emotions: string[] = [];
  for (const [emotion, keywords] of Object.entries(DIMENSION_PATTERNS.emotion)) {
    if (keywords.some(k => lowerText.includes(k))) {
      emotions.push(emotion);
    }
  }
  
  let agency_type: string | null = null;
  for (const [agency, keywords] of Object.entries(DIMENSION_PATTERNS.agency)) {
    if (keywords.some(k => lowerText.includes(k))) {
      agency_type = agency;
      break;
    }
  }
  
  let regulation_level: string | null = null;
  for (const [reg, keywords] of Object.entries(DIMENSION_PATTERNS.regulation)) {
    if (keywords.some(k => lowerText.includes(k))) {
      regulation_level = reg;
      break;
    }
  }
  
  let growth_signal: string | null = null;
  for (const [growth, keywords] of Object.entries(DIMENSION_PATTERNS.growth)) {
    if (keywords.some(k => lowerText.includes(k))) {
      growth_signal = growth;
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
    const userId = await verifyAuth0JWT(req);

    const { days = 30 } = await req.json().catch(() => ({}));

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

    if (!wins || wins.length === 0) {
      return new Response(JSON.stringify({ 
        data: { 
          dimensions: [],
          observation: null,
          patternLine: null,
          summary: null,
          winsCount: 0 
        } 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Analyze wins that don't have dimensions yet
    const winsToAnalyze = wins.filter(w => !w.analyzed_at);
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

    for (const win of winsToAnalyze) {
      let dimensions: Dimensions;
      
      if (ANTHROPIC_API_KEY) {
        try {
          const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              system: "You analyze personal wins to extract psychological dimensions. Be specific and accurate.",
          messages: [
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
            const toolCall = aiData.content?.filter((c: any) => c.type === 'tool_use')?.[0];
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
      .select("id, win_content, win_date, sentiment, primary_emotion, secondary_emotion, agency_type, regulation_level, growth_signal, source")
      .eq("user_id", userId)
      .gte("win_date", startDate.toISOString().split("T")[0]);

    // Aggregate dimensions into counts
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

    // Build dimensions array – EXCLUDE sentiment from client response (internal only)
    const dimensions: { dimension: string; value: string; count: number; displayLabel: string; insight: string }[] = [];
    for (const [dimension, values] of Object.entries(dimensionCounts)) {
      if (dimension === 'sentiment') continue; // Gap 1: sentiment is internal filter only
      for (const [value, count] of Object.entries(values)) {
        dimensions.push({
          dimension,
          value,
          count,
          displayLabel: DISPLAY_LABELS[dimension] || dimension,
          insight: getInsightText(dimension, value, count),
        });
      }
    }

    dimensions.sort((a, b) => b.count - a.count);

    // Identify top emotion and top growth for AI observation
    const topEmotion = dimensions.find(d => d.dimension === 'emotion');
    const topGrowth = dimensions.find(d => d.dimension === 'growth');

    // Gap 3: AI-generated momentum observation
    let observation: string | null = null;
    let patternLine: string | null = null;

    if (topEmotion && topGrowth) {
      patternLine = `Your wins over the past 14 days most reflect ${topEmotion.value} and ${topGrowth.value}`;

      if (ANTHROPIC_API_KEY) {
        try {
          const observationPrompt = `This leader's recent wins most reflect ${topEmotion.value} and ${topGrowth.value}. In one sentence, what does this pattern of wins reveal about their current momentum and how they are leading themselves? Speak directly to the leader. No generic language.`;

          const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-20250514",
              system: "You are a senior executive coach observing patterns in a leader's recent wins. Respond with exactly one sentence. Be direct, specific, and insight-driven. No filler.",
          messages: [
                { role: "user", content: observationPrompt }
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const content = aiData.content?.[0]?.text;
            if (content) {
              observation = content.trim();
            }
          }

          if (aiResponse.status === 429 || aiResponse.status === 402) {
            console.warn("AI rate limit / payment issue for observation, using fallback");
          }
        } catch (e) {
          console.error("AI observation failed:", e);
        }
      }

      // Fallback template
      if (!observation) {
        observation = `Over the past two weeks your wins most reflect ${topEmotion.value} and ${topGrowth.value}.`;
      }
    } else if (topEmotion) {
      observation = `Over the past two weeks your wins most reflect ${topEmotion.value}.`;
      patternLine = `Your wins over the past 14 days most reflect ${topEmotion.value}`;
    } else if (dimensions.length > 0) {
      const top = dimensions[0];
      observation = `Over the past two weeks your wins most reflect ${top.value}.`;
      patternLine = `Your wins over the past 14 days most reflect ${top.value}`;
    }

    // BUG 2 fix: Include win content in response for Auth path
    const winsContent = (updatedWins || []).map(w => ({
      content: w.win_content,
      date: new Date(w.win_date || Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      primary_emotion: w.primary_emotion || null,
      agency_type: w.agency_type || null,
      regulation_level: w.regulation_level || null,
      growth_signal: w.growth_signal || null,
    }));

    return new Response(JSON.stringify({ 
      data: { 
        dimensions,
        observation,
        patternLine,
        summary: `You've captured ${wins.length} wins in the past ${days} days.`,
        winsCount: wins.length,
        winsContent,
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
