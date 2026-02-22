/**
 * Extract Coach Insights Edge Function (v2)
 * 
 * Expanded insight types: preference, goal, feedback, challenge,
 * commitment, pattern_observed, breakthrough, resistance, trigger, strength, growth_area
 * 
 * Uses shared auth module for JWT verification.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedInsight {
  type: string;
  content: string;
  contentReference?: string;
  confidence: number;
  pattern_area?: string;
  meta_skill?: string;
  check_in_days?: number;
}

function buildExtractionPrompt(messages: string[]): string {
  return `Analyze the following user messages from a coaching conversation and extract insights.

USER MESSAGES:
${messages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

Extract insights in these categories:
1. PREFERENCE - Things that work well for the user
2. GOAL - What the user wants to work on or achieve
3. FEEDBACK - Reactions to practices or advice
4. CHALLENGE - Things the user struggles with
5. COMMITMENT - Specific actions the user said they would take (include check_in_days: 3 for practice, 7 for behavior)
6. PATTERN_OBSERVED - Recurring behaviors or responses noticed
7. BREAKTHROUGH - Moments of significant insight or shift
8. RESISTANCE - What they avoid or deflect from
9. TRIGGER - Specific situations that activate them emotionally
10. STRENGTH - Demonstrated capability
11. GROWTH_AREA - Identified development need

For each insight, provide:
- type: one of the above types
- content: A concise 1-sentence summary
- confidence: 0.0 to 1.0
- pattern_area: "recalibration" | "clarity" | "renewal" (if applicable)
- meta_skill: relevant meta-skill (if applicable)
- check_in_days: number of days for follow-up (only for commitments)

Only extract genuine, meaningful insights. Skip generic statements.
Return ONLY a JSON array of insights. Empty array [] if none found.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verifiedUserId = await verifyAuth0JWT(req.headers.get('Authorization'));
    const { sessionId, userId } = await req.json();

    if (verifiedUserId !== userId) {
      return new Response(JSON.stringify({ error: 'User mismatch' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[extract-coach-insights] Processing session ${sessionId} for user ${userId}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: messages, error: messagesError } = await supabase
      .from('dialogue_messages')
      .select('content')
      .eq('session_id', sessionId)
      .eq('sender_type', 'user')
      .order('message_index', { ascending: true });

    if (messagesError) {
      console.error('[extract-coach-insights] Error fetching messages:', messagesError);
      throw new Error('Failed to fetch session messages');
    }

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ insights: [], message: 'No messages to analyze' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const meaningfulMessages = messages
      .map(m => m.content)
      .filter(c => c && c.length > 10);

    if (meaningfulMessages.length === 0) {
      return new Response(JSON.stringify({ insights: [], message: 'No meaningful messages found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing coaching conversations to extract meaningful user insights. Return only valid JSON.'
          },
          {
            role: 'user',
            content: buildExtractionPrompt(meaningfulMessages)
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[extract-coach-insights] AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error('AI extraction failed');
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || '[]';
    
    let extractedInsights: ExtractedInsight[] = [];
    try {
      const cleanedContent = responseContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      extractedInsights = JSON.parse(cleanedContent);
      if (!Array.isArray(extractedInsights)) extractedInsights = [];
    } catch {
      console.error('[extract-coach-insights] Failed to parse AI response');
      extractedInsights = [];
    }

    const validTypes = ['preference', 'goal', 'feedback', 'challenge', 'commitment', 
      'pattern_observed', 'breakthrough', 'resistance', 'trigger', 'strength', 'growth_area'];

    const validInsights = extractedInsights.filter(i => 
      i.type && i.content && i.confidence >= 0.6 && validTypes.includes(i.type)
    );

    if (validInsights.length > 0) {
      const insightRows = validInsights.map(insight => ({
        user_id: userId,
        insight_type: insight.type,
        insight_content: insight.content,
        content_reference: insight.contentReference || null,
        source_session_id: sessionId,
        confidence_score: insight.confidence,
        is_active: true,
        pattern_area: insight.pattern_area || null,
        meta_skill: insight.meta_skill || null,
        check_in_date: insight.check_in_days 
          ? new Date(Date.now() + insight.check_in_days * 86400000).toISOString().split('T')[0]
          : null,
        resolution_status: insight.type === 'commitment' ? 'pending' : null,
      }));

      const { error: insertError } = await supabase
        .from('user_coach_insights')
        .insert(insightRows);

      if (insertError) {
        console.error('[extract-coach-insights] Error storing insights:', insertError);
      } else {
        console.log(`[extract-coach-insights] Stored ${validInsights.length} insights`);
      }
    }

    return new Response(JSON.stringify({ 
      insights: validInsights,
      message: `Extracted ${validInsights.length} insights from ${meaningfulMessages.length} messages`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[extract-coach-insights] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
