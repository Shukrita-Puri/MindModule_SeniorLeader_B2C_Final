/**
 * Resolve Session Commitments Edge Function
 * 
 * Post-session: Analyzes conversation to detect if any pending commitments
 * were discussed and updates their status (progressed/completed/abandoned).
 * This bridges Gap #3 – update-commitment-status was never called from client.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";
import { callClaudeText, CLAUDE_MODELS } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    // Fetch pending commitments for user
    const { data: commitments } = await supabase
      .from('coach_accountability_tracker')
      .select('id, commitment_text, commitment_type, committed_at, times_checked, pattern_area')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('committed_at', { ascending: false })
      .limit(10);

    if (!commitments || commitments.length === 0) {
      return new Response(JSON.stringify({ success: true, updated: 0, message: 'No pending commitments' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch conversation messages from this session
    const { data: messages } = await supabase
      .from('dialogue_messages')
      .select('content, sender_type')
      .eq('session_id', sessionId)
      .order('message_index', { ascending: true });

    const conversation = (messages || [])
      .filter(m => m.content && m.content.length > 10)
      .map(m => `${m.sender_type === 'user' ? 'USER' : 'COACH'}: ${m.content}`)
      .join('\n');

    if (conversation.length < 50) {
      return new Response(JSON.stringify({ success: true, updated: 0, message: 'Conversation too short' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

    const commitmentList = commitments.map((c, i) => 
      `${i + 1}. [ID: ${c.id}] "${c.commitment_text}"`
    ).join('\n');

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
            content: 'You analyze coaching conversations to detect if pending commitments were discussed. Return only valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze this coaching conversation to determine if any of these pending commitments were discussed and what their new status should be.

PENDING COMMITMENTS:
${commitmentList}

CONVERSATION:
${conversation}

For each commitment that was CLEARLY discussed in the conversation, return:
- id: the commitment ID
- status: one of "checked" (coach asked about it), "progressed" (user made progress), "completed" (user finished it), "abandoned" (user decided not to do it)
- evidence: brief quote or description from the conversation

Only include commitments that were explicitly discussed. If none were discussed, return an empty array.
Return as JSON array.`
          }
        ],
        temperature: 0.2,
        max_tokens: 600
      })
    });

    if (!aiResponse.ok) {
      console.error('[resolve-session-commitments] AI error:', aiResponse.status);
      throw new Error('AI commitment analysis failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '[]';

    let updates: any[] = [];
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      updates = JSON.parse(cleaned);
      if (!Array.isArray(updates)) updates = [];
    } catch {
      console.error('[resolve-session-commitments] Parse error');
      updates = [];
    }

    const validStatuses = ['checked', 'progressed', 'completed', 'abandoned'];
    let updatedCount = 0;

    for (const update of updates) {
      if (!update.id || !validStatuses.includes(update.status)) continue;
      
      // Verify commitment belongs to user
      const commitment = commitments.find(c => c.id === update.id);
      if (!commitment) continue;

      const { error } = await supabase
        .from('coach_accountability_tracker')
        .update({
          status: update.status,
          times_checked: (commitment.times_checked || 0) + 1,
          last_checked_at: new Date().toISOString(),
          outcome_note: update.evidence || null,
          ...(update.status === 'completed' || update.status === 'abandoned' 
            ? { resolved_at: new Date().toISOString() } 
            : {}),
        })
        .eq('id', update.id);

      if (!error) updatedCount++;
    }

    console.log(`[resolve-session-commitments] Updated ${updatedCount} commitments for session ${sessionId}`);

    return new Response(JSON.stringify({ success: true, updated: updatedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[resolve-session-commitments] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
