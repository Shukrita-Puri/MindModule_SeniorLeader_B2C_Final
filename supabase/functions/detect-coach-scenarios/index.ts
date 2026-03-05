/**
 * Detect Coach Scenarios Edge Function (EF7)
 * 
 * Post-session: AI-powered detection of executive coaching scenarios,
 * maps to event types for JIT integration via coach_scenarios_detected.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SCENARIO_EVENT_MAPPING: Record<string, string[]> = {
  // CLARITY SCENARIOS
  stakeholder_management: ['board_meeting', 'investor_call', 'shareholder_meeting', 'all_hands'],
  difficult_conversation: ['one_on_one', 'performance_review', 'termination', 'difficult_conversation'],
  giving_feedback: ['performance_review', 'one_on_one'],
  receiving_feedback: ['performance_review', 'board_feedback', '360_review'],
  handling_difficult_questions: ['board_meeting', 'investor_call', 'media_interview', 'all_hands'],
  // RECALIBRATION SCENARIOS
  rumination: ['board_meeting', 'investor_call', 'performance_review', 'strategic_planning'],
  conflict_avoidance: ['one_on_one', 'difficult_conversation', 'team_conflict'],
  people_pleasing: ['board_meeting', 'stakeholder_meeting', 'all_hands'],
  emotional_regulation: ['board_meeting', 'crisis_meeting', 'media_interview'],
  confidence_building: ['board_meeting', 'investor_pitch', 'all_hands', 'speaking_engagement'],
  // RENEWAL SCENARIOS
  personal_brand: ['all_hands', 'media_interview', 'conference_keynote', 'panel'],
  transition: ['first_day', 'onboarding', 'introduction_meeting'],
};

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch user messages from session
    const { data: messages } = await supabase
      .from('dialogue_messages')
      .select('content')
      .eq('session_id', sessionId)
      .eq('sender_type', 'user')
      .order('message_index', { ascending: true });

    const userMessages = (messages || [])
      .map(m => m.content)
      .filter(c => c && c.length > 15);

    if (userMessages.length < 2) {
      return new Response(JSON.stringify({ success: true, scenariosDetected: 0 }), {
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
            content: 'You analyze coaching conversations to detect executive coaching scenarios. Return only valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze this coaching conversation to detect executive coaching scenarios.

USER MESSAGES:
${userMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

Identify which of these scenarios are present:

RECALIBRATION SCENARIOS:
- rumination (cycling on decisions, unable to let go)
- people_pleasing (difficulty disappointing others, saying no)
- conflict_avoidance (dodging hard conversations)
- emotional_regulation (staying composed under pressure)
- confidence_building (imposter syndrome, self-doubt)

CLARITY SCENARIOS:
- stakeholder_management (board, investors, team)
- difficult_conversation (firing, performance issues)
- giving_feedback
- receiving_feedback
- handling_difficult_questions

RENEWAL SCENARIOS:
- personal_brand (reputation, how perceived)
- transition (role changes, company changes)

For each scenario detected with confidence >= 0.7, return:
- scenario: one of the scenario keys above
- dimension: recalibration | clarity | renewal
- confidence: 0.0-1.0
- evidence: brief quote or description from messages

Return as JSON array. Empty array if no clear scenarios.`
          }
        ],
        temperature: 0.3,
        max_tokens: 800
      })
    });

    if (!aiResponse.ok) {
      console.error('[detect-coach-scenarios] AI error:', aiResponse.status);
      throw new Error('AI scenario detection failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';

    let detectedScenarios: any[] = [];
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      detectedScenarios = JSON.parse(cleaned);
      if (!Array.isArray(detectedScenarios)) detectedScenarios = [];
    } catch {
      console.error('[detect-coach-scenarios] Parse error');
      detectedScenarios = [];
    }

    let scenariosCreated = 0;
    for (const detection of detectedScenarios) {
      if (!detection.scenario || !SCENARIO_EVENT_MAPPING[detection.scenario]) continue;

      const eventTypes = SCENARIO_EVENT_MAPPING[detection.scenario];
      const { error } = await supabase
        .from('coach_scenarios_detected')
        .insert({
          user_id: userId,
          session_id: sessionId,
          scenario: detection.scenario,
          dimension: detection.dimension || null,
          event_types: eventTypes,
          confidence_score: detection.confidence || null,
          evidence: detection.evidence || null,
          detected_at: new Date().toISOString(),
          resolved: false,
        });

      if (!error) scenariosCreated++;
    }

    console.log(`[detect-coach-scenarios] ${scenariosCreated} scenarios detected for session ${sessionId}`);

    return new Response(JSON.stringify({ success: true, scenariosDetected: scenariosCreated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[detect-coach-scenarios] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
