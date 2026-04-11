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
import { callClaudeText, CLAUDE_MODELS } from "../_shared/anthropic.ts";

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
  return `Analyze the following user messages from a coaching conversation and extract insights for the user's profile.

USER MESSAGES:
${messages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

Extract insights in these categories:

## 1. STRENGTH (for "Lean On" in Outer Readiness Brief)
What to look for: Behavioral strengths the COACH observed (not self-reported by user).
Format: One sentence, second person ("You..."), under 20 words, behaviorally specific.
Examples:
- "Your composure in high-stakes moments is your most reliable resource."
- "You regulate yourself mid-conversation – that's real strength."
Criteria: Must be behavioral (what they DO), not aspirational. Must be specific.
Return as: { "type": "strength", "content": "...", "confidence": 0.7-1.0, "pattern_area": "recalibration|clarity|renewal", "meta_skill": "..." }

## 2. GROWTH_AREA (for "Watch For" in Outer Readiness Brief)
What to look for: Recurring patterns or friction points the COACH observed.
Format: One sentence, second person ("You..."), under 20 words, specific and non-judgmental.
Examples:
- "You tend to over-function when others struggle – that costs you."
- "You deflect when questioned – that creates distance."
Criteria: Must be behavioral and correctable. Framed as "pattern to notice" not "flaw to fix".
Return as: { "type": "growth_area", "content": "...", "confidence": 0.7-1.0, "pattern_area": "recalibration|clarity|renewal", "meta_skill": "..." }

## 3. COMMITMENT – Specific actions the user said they would take.
Include check_in_days: 3 for practice-based, 7 for behavior change.

## 4. PATTERN_OBSERVED – Recurring behaviors the coach noticed.

## 5. PREFERENCE – Practices or approaches the user found helpful.

## 6. GOAL – Stated objectives or development areas.

## 7. CHALLENGE – Self-reported difficulties.

## 8. BREAKTHROUGH – Significant moments of insight or shift.

## 9. TRIGGER – Specific situations that activate them emotionally.

## 10. RESISTANCE – What they avoid or deflect from.

## 11. FEEDBACK – Reactions to practices or advice.

For each insight, provide:
- type: one of the above types
- content: A concise 1-sentence summary
- confidence: 0.0 to 1.0 (strength/growth_area require >= 0.7)
- pattern_area: "recalibration" | "clarity" | "renewal" (if applicable)
- meta_skill: relevant meta-skill (if applicable)
- check_in_days: number of days for follow-up (only for commitments)

EXTRACTION RULES:
1. Only extract genuine, meaningful insights (skip generic statements)
2. Confidence must be >= 0.6 to store (>= 0.7 for strength/growth_area)
3. strength and growth_area insights MUST be in second person ("You...")
4. strength and growth_area insights MUST be under 20 words
5. If multiple strength or growth_area candidates exist, return the most specific and behavioral one
6. If no clear strength or growth_area is observed, do not force one

Return ONLY a JSON array of insights. Empty array [] if none found.`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const verifiedUserId = await verifyAuth0JWT(req);
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

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        system: 'You are an expert at analyzing coaching conversations to extract meaningful user insights. Return only valid JSON.',
          messages: [
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
    const responseContent = aiData.content?.[0]?.text || '[]';
    
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

    const validInsights = extractedInsights.filter(i => {
      if (!i.type || !i.content || !validTypes.includes(i.type)) return false;
      // Stricter confidence threshold for strength/growth_area
      if (i.type === 'strength' || i.type === 'growth_area') return i.confidence >= 0.7;
      return i.confidence >= 0.6;
    });

    if (validInsights.length > 0) {
      // Handle strength/growth_area with replacement logic (one active each)
      for (const singletonType of ['strength', 'growth_area'] as const) {
        const newInsight = validInsights.find(i => i.type === singletonType);
        if (!newInsight) continue;

        const { data: existing } = await supabase
          .from('user_coach_insights')
          .select('id, insight_content, confidence_score')
          .eq('user_id', userId)
          .eq('is_active', true)
          .eq('insight_type', singletonType)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing) {
          // Only replace if different AND higher confidence
          if (newInsight.content !== existing.insight_content && newInsight.confidence > (existing.confidence_score || 0)) {
            await supabase.from('user_coach_insights').update({ is_active: false }).eq('id', existing.id);
            await supabase.from('user_coach_insights').insert({
              user_id: userId, insight_type: singletonType, insight_content: newInsight.content,
              source_session_id: sessionId, confidence_score: newInsight.confidence, is_active: true,
              pattern_area: newInsight.pattern_area || null, meta_skill: newInsight.meta_skill || null,
            });
            console.log(`[extract-coach-insights] Replaced ${singletonType} insight`);
          }
        } else {
          await supabase.from('user_coach_insights').insert({
            user_id: userId, insight_type: singletonType, insight_content: newInsight.content,
            source_session_id: sessionId, confidence_score: newInsight.confidence, is_active: true,
            pattern_area: newInsight.pattern_area || null, meta_skill: newInsight.meta_skill || null,
          });
          console.log(`[extract-coach-insights] Inserted new ${singletonType} insight`);
        }
      }

      // Store all other insight types (accumulate, no replacement)
      const otherInsights = validInsights.filter(i => i.type !== 'strength' && i.type !== 'growth_area');
      if (otherInsights.length > 0) {
        const insightRows = otherInsights.map(insight => ({
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

        const { error: insertError } = await supabase.from('user_coach_insights').insert(insightRows);
        if (insertError) {
          console.error('[extract-coach-insights] Error storing insights:', insertError);
        } else {
          console.log(`[extract-coach-insights] Stored ${otherInsights.length} other insights`);
        }
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
