/**
 * Extract Tool Commitments Edge Function (EF8)
 * 
 * Post-session: AI extraction of tools/practices offered by coach
 * with commitment timeframes, scenarios, and check-in dates.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SCENARIO_EVENT_MAPPING: Record<string, string[]> = {
  stakeholder_management: ['board_meeting', 'investor_call', 'shareholder_meeting', 'all_hands', 'strategic_planning'],
  difficult_conversation: ['one_on_one', 'performance_review', 'termination', 'difficult_conversation', 'team_conflict'],
  giving_feedback: ['performance_review', 'one_on_one', 'skip_level_meeting'],
  receiving_feedback: ['performance_review', 'board_feedback', '360_review', 'investor_feedback'],
  handling_difficult_questions: ['board_meeting', 'investor_call', 'media_interview', 'all_hands', 'press_conference'],
  decision_making: ['strategic_planning', 'board_meeting', 'leadership_team_meeting'],
  time_management: ['strategic_planning', 'calendar_review'],
  goal_setting: ['strategic_planning', 'okr_planning', 'quarterly_review'],
  rumination: ['board_meeting', 'investor_call', 'performance_review', 'strategic_planning', 'crisis_meeting'],
  conflict_avoidance: ['one_on_one', 'difficult_conversation', 'team_conflict', 'performance_review'],
  people_pleasing: ['board_meeting', 'stakeholder_meeting', 'all_hands', 'investor_call'],
  emotional_regulation: ['board_meeting', 'crisis_meeting', 'media_interview', 'investor_call', 'termination'],
  boundary_management: ['one_on_one', 'all_hands', 'stakeholder_meeting'],
  owning_rest: ['vacation', 'personal_time', 'weekend'],
  confidence_building: ['board_meeting', 'investor_pitch', 'all_hands', 'speaking_engagement', 'media_interview'],
  self_forgiveness: ['performance_review', 'board_feedback', 'post_mortem'],
  personal_brand: ['all_hands', 'media_interview', 'conference_keynote', 'panel', 'speaking_engagement'],
  identity_transition: ['first_day', 'onboarding', 'introduction_meeting', 'role_change_announcement'],
  reinvention: ['strategic_planning', 'offsites', 'leadership_retreat'],
  purpose_meaning: ['strategic_planning', 'leadership_retreat', 'personal_reflection'],
  legacy_thinking: ['board_meeting', 'strategic_planning', 'succession_planning'],
  career_planning: ['performance_review', 'career_discussion', 'mentoring_session'],
  transition: ['first_day', 'last_day', 'announcement_meeting', 'handover_meeting'],
};

function inferToolType(description: string): string {
  if (/ask|question/i.test(description)) return 'question';
  if (/breathing|breath|somatic/i.test(description)) return 'protocol';
  if (/write|track|log|journal/i.test(description)) return 'exercise';
  if (/framework|model/i.test(description)) return 'framework';
  return 'reframe';
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch coach (assistant) messages from session
    const { data: messages } = await supabase
      .from('dialogue_messages')
      .select('content')
      .eq('session_id', sessionId)
      .eq('sender_type', 'assistant')
      .order('message_index', { ascending: true });

    const coachMessages = (messages || [])
      .map(m => m.content)
      .filter(c => c && c.length > 20);

    if (coachMessages.length < 1) {
      return new Response(JSON.stringify({ success: true, toolsExtracted: 0 }), {
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
            content: 'You extract tools and practices offered by a coach. Return only valid JSON.'
          },
          {
            role: 'user',
            content: `Extract tools/practices offered by the coach in this conversation.

COACH MESSAGES:
${coachMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

A "tool" is a repeatable practice, question, or framework offered with a commitment timeframe. Examples:
- "Try box breathing before your next 3 board meetings"
- "When you catch yourself ruminating, ask: 'Is this productive or anxiety?'"
- "Before your next commitment, ask: 'Does this energize or deplete me?'"

For each tool, extract:
- tool_name: Short name (e.g., "Box breathing before meetings")
- tool_description: Full instructions
- commitment_timeframe: How long to use it (e.g., "next 3 days", "before next 3 board meetings")
- scenario: What scenario is this addressing? (rumination, difficult_conversation, emotional_regulation, stakeholder_management, confidence_building, etc.)
- check_in_days: When should we check back? (integer, infer from timeframe)

Only include clear, actionable tools with confidence. Return as JSON array. Empty array if no tools found.`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      console.error('[extract-tool-commitments] AI error:', aiResponse.status);
      throw new Error('AI tool extraction failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';

    let extractedTools: any[] = [];
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedTools = JSON.parse(cleaned);
      if (!Array.isArray(extractedTools)) extractedTools = [];
    } catch {
      console.error('[extract-tool-commitments] Parse error');
      extractedTools = [];
    }

    let toolsCreated = 0;
    for (const tool of extractedTools) {
      if (!tool.tool_name) continue;

      const checkInDays = tool.check_in_days || 7;
      const checkInAt = new Date();
      checkInAt.setDate(checkInAt.getDate() + checkInDays);

      const scenarioKey = tool.scenario || '';
      const eventTypes = SCENARIO_EVENT_MAPPING[scenarioKey] || [];

      const { error } = await supabase
        .from('coach_tools_offered')
        .insert({
          user_id: userId,
          session_id: sessionId,
          tool_name: tool.tool_name,
          tool_description: tool.tool_description || null,
          tool_type: inferToolType(tool.tool_description || tool.tool_name),
          commitment_timeframe: tool.commitment_timeframe || null,
          scenario: tool.scenario || null,
          event_types: eventTypes,
          offered_at: new Date().toISOString(),
          check_in_at: checkInAt.toISOString(),
          status: 'pending',
        });

      if (!error) toolsCreated++;
    }

    console.log(`[extract-tool-commitments] ${toolsCreated} tools extracted for session ${sessionId}`);

    return new Response(JSON.stringify({ success: true, toolsExtracted: toolsCreated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[extract-tool-commitments] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
