/**
 * Detect Recurring Patterns Edge Function
 * 
 * Post-session: analyzes user messages for behavioral patterns,
 * upserts coach_pattern_observations, flags patterns at 3+ observations.
 * Also writes scenario detections to coach_scenarios_detected for JIT integration.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Scenario detection is now handled by dedicated detect-coach-scenarios EF

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

    // Fetch user messages
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
      return new Response(JSON.stringify({ success: true, patternsDetected: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch existing patterns for this user
    const { data: existingPatterns } = await supabase
      .from('coach_pattern_observations')
      .select('id, pattern_type, pattern_description, observation_count, was_named_to_user')
      .eq('user_id', userId)
      .eq('is_active', true);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const existingDesc = (existingPatterns || [])
      .map(p => `- [${p.pattern_type}] ${p.pattern_description}`)
      .join('\n');

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
            content: 'You analyze coaching conversations to detect recurring behavioral patterns. Return only valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze these user messages for behavioral patterns:

USER MESSAGES:
${userMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

${existingDesc ? `EXISTING PATTERNS ALREADY OBSERVED:\n${existingDesc}\n` : ''}
IDENTIFY patterns in these categories:
- trigger: Situations that activate the user emotionally
- avoidance: Topics they deflect from or minimize
- strength: Consistent capabilities they demonstrate
- friction: Recurring difficulty patterns
- regulation_failure: Moments they lose composure

For each pattern, provide:
- pattern_type: trigger | avoidance | strength | friction | regulation_failure
- pattern_description: 1-2 sentence description
- pattern_context: When/where this shows up
- pattern_area: recalibration | clarity | renewal
- confidence: 0.0-1.0
- matches_existing: description of existing pattern it matches (or null if new)

Only include patterns with confidence >= 0.7.
Return a JSON array. Empty array if no clear patterns.`
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      console.error('[detect-recurring-patterns] AI error:', aiResponse.status);
      throw new Error('AI pattern detection failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';
    
    let detectedPatterns: any[] = [];
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      detectedPatterns = JSON.parse(cleaned);
      if (!Array.isArray(detectedPatterns)) detectedPatterns = [];
    } catch {
      console.error('[detect-recurring-patterns] Parse error');
      detectedPatterns = [];
    }

    let patternsUpdated = 0;
    let patternsCreated = 0;
    

    for (const pattern of detectedPatterns) {
      if (!pattern.pattern_type || !pattern.pattern_description) continue;

      // Check if it matches an existing pattern
      const match = (existingPatterns || []).find(ep => 
        pattern.matches_existing && 
        ep.pattern_description.toLowerCase().includes(pattern.matches_existing.toLowerCase().slice(0, 30))
      );

      if (match) {
        // Update existing pattern via RPC
        const { error } = await supabase
          .rpc('increment_pattern_observation', { p_pattern_id: match.id });

        if (!error) patternsUpdated++;
      } else {
        // Create new pattern
        const { error } = await supabase
          .from('coach_pattern_observations')
          .insert({
            user_id: userId,
            session_id: sessionId,
            pattern_type: pattern.pattern_type,
            pattern_description: pattern.pattern_description,
            pattern_context: pattern.pattern_context || null,
            pattern_area: pattern.pattern_area || null,
            first_observed_at: new Date().toISOString(),
            last_observed_at: new Date().toISOString(),
          });

        if (!error) patternsCreated++;
      }

      // Scenario detection is now handled by dedicated detect-coach-scenarios EF
    }

    // Check for patterns ready to be named (3+ observations, not yet named)
    const { data: readyToName } = await supabase
      .from('coach_pattern_observations')
      .select('id, pattern_description, observation_count')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('was_named_to_user', false)
      .gte('observation_count', 3);

    console.log(`[detect-recurring-patterns] Updated: ${patternsUpdated}, Created: ${patternsCreated}, Ready to name: ${readyToName?.length || 0}`);

    return new Response(JSON.stringify({ 
      success: true,
      patternsUpdated,
      patternsCreated,
      patternsReadyToName: (readyToName || []).length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[detect-recurring-patterns] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
