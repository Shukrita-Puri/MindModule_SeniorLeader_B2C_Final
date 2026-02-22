import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.26.0";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verifiedUserId = await verifyAuth0JWT(req.headers.get('Authorization'));
    const { sessionId, userId } = await req.json();

    // Use verified user ID, but allow body userId for backward compat if it matches
    const effectiveUserId = verifiedUserId;

    if (!sessionId) {
      return new Response(JSON.stringify({ error: 'sessionId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch session messages
    const { data: messages, error: msgError } = await supabase
      .from('dialogue_messages')
      .select('id, sender_type, content, message_index')
      .eq('session_id', sessionId)
      .order('message_index', { ascending: true });

    if (msgError || !messages || messages.length < 4) {
      console.log('Not enough messages for probing analysis:', messages?.length || 0);
      return new Response(JSON.stringify({ success: true, analyzed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build conversation pairs: assistant question → user response
    const probePairs: Array<{
      coachMessageId: string;
      coachContent: string;
      userContent: string;
      userMessageId: string;
    }> = [];

    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].sender_type === 'assistant' && messages[i + 1].sender_type === 'user') {
        probePairs.push({
          coachMessageId: messages[i].id,
          coachContent: messages[i].content,
          userContent: messages[i + 1].content,
          userMessageId: messages[i + 1].id,
        });
      }
    }

    if (probePairs.length === 0) {
      return new Response(JSON.stringify({ success: true, analyzed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Analyze all pairs in one AI call
    const analysisPrompt = probePairs.map((pair, i) => 
      `--- Exchange ${i + 1} ---\nCOACH: ${pair.coachContent}\nUSER: ${pair.userContent}`
    ).join('\n\n');

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You analyze coaching conversations to evaluate probing effectiveness and detect breakthrough moments.

For each exchange, determine:
1. Is the coach message a probing question (vs statement, protocol recommendation, or greeting)?
2. If it IS a probe, classify the probe type and evaluate the user's response.
3. If the user's response shows a breakthrough moment, capture it.

Only analyze exchanges where the coach is genuinely probing (asking questions to surface the user's own knowing).`
          },
          {
            role: "user",
            content: `Analyze these coaching exchanges:\n\n${analysisPrompt}`
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "record_probe_analysis",
              description: "Record analysis of a probing exchange between coach and user",
              parameters: {
                type: "object",
                properties: {
                  exchanges: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        exchange_index: { type: "number", description: "0-based index of the exchange" },
                        is_probe: { type: "boolean", description: "Is this a genuine probing question?" },
                        probe_type: { 
                          type: "string", 
                          enum: ["surface_question", "test_knowing", "reflect_wisdom", "reframe_constraint", "name_pattern"],
                          description: "Type of probe"
                        },
                        led_to_insight: { type: "boolean" },
                        insight_markers: { 
                          type: "array", 
                          items: { type: "string" },
                          description: "Phrases indicating insight" 
                        },
                        effectiveness_score: { 
                          type: "number", 
                          description: "1-10 effectiveness score" 
                        },
                        why_effective: { type: "string" },
                        is_breakthrough: { type: "boolean", description: "Did the user have a genuine breakthrough?" },
                        breakthrough_content: { type: "string", description: "What the user realized (if breakthrough)" },
                        breakthrough_type: { 
                          type: "string", 
                          enum: ["pattern_recognition", "decision_clarity", "reframe", "self_awareness"]
                        },
                        topic_area: { type: "string" }
                      },
                      required: ["exchange_index", "is_probe"]
                    }
                  }
                },
                required: ["exchanges"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "record_probe_analysis" } },
        stream: false,
      }),
    });

    if (!response.ok) {
      console.error("AI analysis failed:", response.status);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall) {
      console.log("No analysis returned from AI");
      return new Response(JSON.stringify({ success: true, analyzed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const analysis = JSON.parse(toolCall.function.arguments);
    let probesStored = 0;
    let breakthroughsStored = 0;

    for (const exchange of analysis.exchanges) {
      const pair = probePairs[exchange.exchange_index];
      if (!pair) continue;

      // Store probe effectiveness
      if (exchange.is_probe) {
        const { error: probeError } = await supabase
          .from('coach_probing_effectiveness')
          .insert({
            user_id: effectiveUserId,
            session_id: sessionId,
            message_id: pair.coachMessageId,
            probe_question: pair.coachContent,
            probe_type: exchange.probe_type || 'surface_question',
            user_response: pair.userContent,
            led_to_insight: exchange.led_to_insight || false,
            insight_markers: exchange.insight_markers || [],
            effectiveness_score: exchange.effectiveness_score || 5,
            why_effective: exchange.why_effective || null,
            topic_area: exchange.topic_area || null,
          });

        if (probeError) {
          console.error('Error storing probe:', probeError);
        } else {
          probesStored++;
        }
      }

      // Store breakthrough moment
      if (exchange.is_breakthrough && exchange.breakthrough_content) {
        const { error: btError } = await supabase
          .from('coach_breakthrough_moments')
          .insert({
            user_id: effectiveUserId,
            session_id: sessionId,
            message_id: pair.userMessageId,
            breakthrough_content: exchange.breakthrough_content,
            breakthrough_type: exchange.breakthrough_type || 'self_awareness',
            preceded_by_probe: exchange.is_probe || false,
            probe_question: exchange.is_probe ? pair.coachContent : null,
          });

        if (btError) {
          console.error('Error storing breakthrough:', btError);
        } else {
          breakthroughsStored++;
        }
      }
    }

    console.log(`✅ Probing analysis complete: ${probesStored} probes, ${breakthroughsStored} breakthroughs`);

    return new Response(JSON.stringify({ 
      success: true, 
      probesStored, 
      breakthroughsStored 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error("analyze-probing-effectiveness error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
