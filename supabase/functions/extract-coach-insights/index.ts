/**
 * Extract Coach Insights Edge Function
 * 
 * Analyzes user messages from coach sessions to extract:
 * - Preferences ("I find X helpful", "X works well for me")
 * - Goals ("I want to work on X", "My focus is X")
 * - Feedback ("That helped", "This didn't resonate")
 * - Challenges ("I struggle with X", "My biggest issue is X")
 * 
 * Uses Lovable AI (Gemini) for intelligent extraction
 * Triggered after coach sessions end
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractedInsight {
  type: 'preference' | 'goal' | 'feedback' | 'challenge';
  content: string;
  contentReference?: string;
  confidence: number;
}

interface RequestBody {
  sessionId: string;
  userId: string;
}

// Verify Auth0 token (matches existing pattern)
async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
  
  if (!auth0Domain) {
    throw new Error('VITE_AUTH0_DOMAIN not configured');
  }
  
  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!response.ok) {
    throw new Error('Invalid token');
  }
  
  const userInfo = await response.json();
  return userInfo.sub;
}

// Build extraction prompt
function buildExtractionPrompt(messages: string[]): string {
  return `Analyze the following user messages from a coaching conversation and extract insights.

USER MESSAGES:
${messages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

Extract insights in these categories:
1. PREFERENCES - Things that work well for the user (e.g., "I find breathing exercises helpful", "Box breathing works for me")
2. GOALS - What the user wants to work on or achieve (e.g., "I want to stay calmer in meetings", "My focus is on emotional regulation")
3. FEEDBACK - Reactions to practices or advice (e.g., "That exercise really helped", "The meditation was too long")
4. CHALLENGES - Things the user struggles with (e.g., "I have trouble focusing", "I get overwhelmed easily")

For each insight, provide:
- type: preference | goal | feedback | challenge
- content: A concise 1-sentence summary of the insight
- confidence: 0.0 to 1.0 (how confident you are this is a genuine insight)

Only extract genuine, meaningful insights. Skip generic statements.
If a message references a specific practice (like "box breathing", "grounding exercise"), include it in the content.

Return ONLY a JSON array of insights. If no insights found, return an empty array [].`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const verifiedUserId = await verifyAuth0Token(authHeader);
    const { sessionId, userId } = await req.json() as RequestBody;

    // Verify user owns this session
    if (verifiedUserId !== userId) {
      return new Response(JSON.stringify({ error: 'User mismatch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[extract-coach-insights] Processing session ${sessionId} for user ${userId}`);

    // Initialize Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch user messages from the session
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
      console.log('[extract-coach-insights] No user messages found in session');
      return new Response(JSON.stringify({ insights: [], message: 'No messages to analyze' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Filter to meaningful messages (> 10 chars)
    const meaningfulMessages = messages
      .map(m => m.content)
      .filter(c => c && c.length > 10);

    if (meaningfulMessages.length === 0) {
      return new Response(JSON.stringify({ insights: [], message: 'No meaningful messages found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Call Lovable AI for extraction
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

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
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[extract-coach-insights] AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      throw new Error('AI extraction failed');
    }

    const aiData = await aiResponse.json();
    const responseContent = aiData.choices?.[0]?.message?.content || '[]';
    
    // Parse AI response
    let extractedInsights: ExtractedInsight[] = [];
    try {
      // Clean up response - remove markdown code blocks if present
      const cleanedContent = responseContent
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      extractedInsights = JSON.parse(cleanedContent);
      
      if (!Array.isArray(extractedInsights)) {
        extractedInsights = [];
      }
    } catch (parseError) {
      console.error('[extract-coach-insights] Failed to parse AI response:', parseError, responseContent);
      extractedInsights = [];
    }

    console.log(`[extract-coach-insights] Extracted ${extractedInsights.length} insights`);

    // Filter to high-confidence insights only
    const validInsights = extractedInsights.filter(i => 
      i.type && 
      i.content && 
      i.confidence >= 0.6 &&
      ['preference', 'goal', 'feedback', 'challenge'].includes(i.type)
    );

    // Store insights in database
    if (validInsights.length > 0) {
      const insightRows = validInsights.map(insight => ({
        user_id: userId,
        insight_type: insight.type,
        insight_content: insight.content,
        content_reference: insight.contentReference || null,
        source_session_id: sessionId,
        confidence_score: insight.confidence,
        is_active: true
      }));

      const { error: insertError } = await supabase
        .from('user_coach_insights')
        .insert(insightRows);

      if (insertError) {
        console.error('[extract-coach-insights] Error storing insights:', insertError);
        // Don't fail the request - insights extraction succeeded
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
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
