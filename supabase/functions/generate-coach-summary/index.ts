/**
 * Generate Coach Summary Edge Function
 * 
 * Post-session: generates AI summary, extracts key topics, identifies
 * recurring vs new themes by comparing to past 5 summaries.
 * Also: updates existing commitment statuses + writes tools offered.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuth0JWT } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    // Fetch session messages
    const { data: messages, error: msgError } = await supabase
      .from('dialogue_messages')
      .select('sender_type, content, message_index')
      .eq('session_id', sessionId)
      .order('message_index', { ascending: true });

    if (msgError || !messages || messages.length < 2) {
      return new Response(JSON.stringify({ success: true, message: 'Too few messages for summary' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parallel: Fetch past summaries + pending commitments for status update
    const [pastSummariesRes, pendingCommitmentsRes] = await Promise.all([
      supabase
        .from('coach_session_summaries')
        .select('key_topics')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('coach_accountability_tracker')
        .select('id, commitment_text, status')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('committed_at', { ascending: false })
        .limit(10),
    ]);

    const pastTopics = new Set(
      (pastSummariesRes.data || []).flatMap(s => s.key_topics || [])
    );
    const pendingCommitments = pendingCommitmentsRes.data || [];

    // Build conversation transcript
    const transcript = messages
      .map(m => `${m.sender_type === 'user' ? 'USER' : 'COACH'}: ${m.content}`)
      .join('\n\n');

    // Pre-scan user messages for explicit accountability language as fallback hints
    const accountabilityPhrases = [
      'hold me accountable', 'keep me accountable', 'i commit to', 'i want to commit',
      'help me stick to', 'i promise to', 'i will start', 'i pledge to',
      'make sure i', 'remind me to', 'i need to follow through'
    ];
    const userMessages = messages.filter(m => m.sender_type === 'user').map(m => m.content.toLowerCase());
    const detectedAccountability = userMessages
      .filter(msg => accountabilityPhrases.some(phrase => msg.includes(phrase)))
      .map(msg => messages.find(m => m.content.toLowerCase() === msg)?.content || msg);

    const accountabilityHint = detectedAccountability.length > 0
      ? `\nACCOUNTABILITY LANGUAGE DETECTED – the user explicitly asked to be held accountable in these messages. Treat each as a commitment:\n${detectedAccountability.map(m => `- "${m}"`).join('\n')}\n`
      : '';

    // Build commitment context for AI
    const commitmentContext = pendingCommitments.length > 0
      ? `\nPENDING COMMITMENTS (check if discussed/completed in conversation):\n${pendingCommitments.map(c => `- [${c.id}] "${c.commitment_text}"`).join('\n')}\n`
      : '';

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
            content: 'You analyze coaching sessions and generate structured summaries. Return only valid JSON.'
          },
          {
            role: 'user',
            content: `Analyze this coaching session and generate a summary.

CONVERSATION:
${transcript}
${commitmentContext}${accountabilityHint}
GENERATE a JSON object with:
- summary_text: 2-3 sentence summary of what happened
- key_topics: array of 3-5 topic strings (e.g., "board pressure", "emotional regulation")
- dominant_pattern: one of "recalibration" | "clarity" | "renewal"
- emotional_arc: brief phrase describing state shift (e.g., "escalated → grounded")
- commitments_made: array of specific NEW actions the user committed to. IMPORTANT: Look carefully for accountability language like "hold me accountable for...", "I commit to...", "I want to...", "help me stick to...", "I will start...". These are commitments even if phrased as requests. Extract the specific action. Never return an empty array if the user expressed any intent to change behavior or follow through on something.
- commitment_updates: array of objects { id: string, new_status: "progressed" | "completed" | "abandoned", evidence: string } for any EXISTING pending commitments that were discussed (empty array if none discussed)
- practices_recommended: array of practice names/types recommended by the coach (empty if none)
- wisdom_referenced: array of wisdom references used (empty if none)
- breakthrough_moment: string describing significant insight, or null
- session_quality_score: 1-10 overall quality
- leanOnUpdate: one phrase (max 8 words) the user should lean on right now based on what emerged in this session, or null if nothing clear emerged
- watchForUpdate: one phrase (max 8 words) to watch for based on patterns or risks surfaced, or null
- jitRelevantInsight: one sentence (max 15 words) relevant to an upcoming high-stakes event discussed, or null if not applicable
- nextSessionFocus: one phrase for what the next coaching session should focus on, or null

Return ONLY the JSON object.`
          }
        ],
        temperature: 0.3,
        max_tokens: 1500
      })
    });

    if (!aiResponse.ok) {
      console.error('[generate-coach-summary] AI error:', aiResponse.status);
      throw new Error('AI summary generation failed');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '{}';
    
    let summary;
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      summary = JSON.parse(cleaned);
    } catch {
      console.error('[generate-coach-summary] Failed to parse:', content);
      throw new Error('Failed to parse summary');
    }

    // Determine recurring vs new themes
    const keyTopics: string[] = summary.key_topics || [];
    const recurringThemes = keyTopics.filter(t => pastTopics.has(t));
    const newThemes = keyTopics.filter(t => !pastTopics.has(t));

    // Store summary
    const { error: insertError } = await supabase
      .from('coach_session_summaries')
      .upsert({
        user_id: userId,
        session_id: sessionId,
        summary_text: summary.summary_text || 'Session completed',
        key_topics: keyTopics,
        dominant_pattern: summary.dominant_pattern || null,
        emotional_arc: summary.emotional_arc || null,
        commitments_made: summary.commitments_made || [],
        practices_recommended: summary.practices_recommended || [],
        wisdom_referenced: summary.wisdom_referenced || [],
        breakthrough_moment: summary.breakthrough_moment || null,
        recurring_themes: recurringThemes,
        new_themes: newThemes,
        session_quality_score: summary.session_quality_score || null,
        jit_relevant_insight: summary.jitRelevantInsight || null,
        next_session_focus: summary.nextSessionFocus || null,
      }, { onConflict: 'session_id' });

    if (insertError) {
      console.error('[generate-coach-summary] Insert error:', insertError);
    }

    // === GAP 3: Write leanOn/watchFor updates to user_coach_insights ===
    const ENABLE_DOWNSTREAM_FEED = Deno.env.get('ENABLE_DOWNSTREAM_FEED') !== 'false';
    if (ENABLE_DOWNSTREAM_FEED) {
      try {
        const insightRows: any[] = [];
        if (summary.leanOnUpdate) {
          insightRows.push({
            user_id: userId,
            insight_type: 'strength',
            insight_content: summary.leanOnUpdate,
            confidence_score: 0.8,
            source: 'coach_session',
            is_active: true,
          });
        }
        if (summary.watchForUpdate) {
          insightRows.push({
            user_id: userId,
            insight_type: 'growth_area',
            insight_content: summary.watchForUpdate,
            confidence_score: 0.8,
            source: 'coach_session',
            is_active: true,
          });
        }
        if (insightRows.length > 0) {
          // Deactivate previous coach-sourced insights before inserting new ones
          await supabase
            .from('user_coach_insights')
            .update({ is_active: false })
            .eq('user_id', userId)
            .eq('source', 'coach_session')
            .eq('is_active', true);

          const { error: insightError } = await supabase
            .from('user_coach_insights')
            .insert(insightRows);
          if (insightError) console.error('[generate-coach-summary] Insight insert error:', insightError);
          else console.log(`[generate-coach-summary] Wrote ${insightRows.length} coach insights downstream`);
        }
      } catch (e) {
        console.error('[generate-coach-summary] Downstream feed error (non-fatal):', e);
      }
    }

    // Store NEW commitments in accountability tracker
    const commitments: string[] = summary.commitments_made || [];
    if (commitments.length > 0) {
      const commitmentRows = commitments.map(c => ({
        user_id: userId,
        session_id: sessionId,
        commitment_text: c,
        commitment_type: c.toLowerCase().includes('breathing') || c.toLowerCase().includes('practice') ? 'practice' : 'behavior_change',
        check_in_due_date: new Date(Date.now() + (c.toLowerCase().includes('daily') ? 3 : 7) * 86400000).toISOString(),
        status: 'pending',
        pattern_area: summary.dominant_pattern || null,
      }));

      const { error: commitError } = await supabase
        .from('coach_accountability_tracker')
        .insert(commitmentRows);

      if (commitError) {
        console.error('[generate-coach-summary] Commitment insert error:', commitError);
      }
    }

    // === GAP FIX #4: Update EXISTING commitment statuses ===
    const commitmentUpdates: Array<{ id: string; new_status: string; evidence?: string }> = summary.commitment_updates || [];
    let commitmentsUpdated = 0;
    for (const update of commitmentUpdates) {
      if (!update.id || !update.new_status) continue;
      // Verify this commitment belongs to user (already fetched above)
      const owned = pendingCommitments.find(c => c.id === update.id);
      if (!owned) continue;

      const { error: updateError } = await supabase
        .from('coach_accountability_tracker')
        .update({
          status: update.new_status,
          times_checked: 1,
          last_checked_at: new Date().toISOString(),
          completion_evidence: update.evidence || null,
        })
        .eq('id', update.id);

      if (!updateError) commitmentsUpdated++;
    }

    // Tools/practices are now handled by dedicated extract-tool-commitments EF

    // === GAP 6: Coach Surface Messages ===
    const ENABLE_COACH_SURFACE = Deno.env.get('ENABLE_COACH_SURFACE') !== 'false';
    if (ENABLE_COACH_SURFACE) {
      try {
        // Get ALL pending commitments (new + existing)
        const allPendingCommitments = [
          ...(pendingCommitments || []).map(c => c.commitment_text),
          ...commitments,
        ];

        if (allPendingCommitments.length > 0) {
          // Query upcoming calendar events (next 24hrs)
          const { data: upcomingEvents } = await supabase
            .from('calendar_events')
            .select('title, start_time')
            .eq('user_id', userId)
            .gte('start_time', new Date().toISOString())
            .lte('start_time', new Date(Date.now() + 24 * 3600000).toISOString())
            .order('start_time', { ascending: true })
            .limit(10);

          if (upcomingEvents && upcomingEvents.length > 0) {
            // Keyword-match commitments against event titles
            let matchedCommitment: string | null = null;
            let matchedEvent: { title: string; start_time: string } | null = null;

            for (const commitment of allPendingCommitments) {
              const commitWords = commitment.toLowerCase().split(/\s+/).filter(w => w.length > 3);
              for (const event of upcomingEvents) {
                const eventTitle = (event.title || '').toLowerCase();
                const hasMatch = commitWords.some(word => eventTitle.includes(word));
                if (hasMatch) {
                  matchedCommitment = commitment;
                  matchedEvent = event as { title: string; start_time: string };
                  break;
                }
              }
              if (matchedCommitment) break;
            }

            if (matchedCommitment && matchedEvent) {
              // Check if surface message already exists today (not dismissed)
              const todayStart = new Date();
              todayStart.setHours(0, 0, 0, 0);
              const { data: existingMessages } = await supabase
                .from('coach_surface_messages')
                .select('id')
                .eq('user_id', userId)
                .eq('dismissed', false)
                .gte('created_at', todayStart.toISOString())
                .limit(1);

              if (!existingMessages || existingMessages.length === 0) {
                // Generate surface message via LLM
                const surfaceResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${LOVABLE_API_KEY}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash-lite',
                    messages: [{
                      role: 'user',
                      content: `Generate a 15-word max coaching message connecting this commitment to an upcoming event. Voice: direct, C-suite executive coach, no fluff.

Commitment: "${matchedCommitment}"
Event: "${matchedEvent.title}"

Return ONLY the message text, no quotes, no prefix.`
                    }],
                    temperature: 0.5,
                    max_tokens: 60
                  })
                });

                if (surfaceResponse.ok) {
                  const surfaceData = await surfaceResponse.json();
                  const surfaceMessage = (surfaceData.choices?.[0]?.message?.content || '').trim();
                  if (surfaceMessage && surfaceMessage.length > 5 && surfaceMessage.length < 200) {
                    await supabase
                      .from('coach_surface_messages')
                      .insert({
                        user_id: userId,
                        message: surfaceMessage,
                        trigger_condition: 'commitment_event_match',
                        expires_at: new Date(Date.now() + 8 * 3600000).toISOString(),
                      });
                    console.log(`[generate-coach-summary] Surface message created for user ${userId}`);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[generate-coach-summary] Coach surface message error (non-fatal):', e);
      }
    }

    console.log(`[generate-coach-summary] Summary stored for session ${sessionId}, ${commitmentsUpdated} commitments updated`);

    return new Response(JSON.stringify({ 
      success: true, 
      summary: summary.summary_text,
      commitments: commitments.length,
      commitmentsUpdated,
      recurringThemes,
      newThemes
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[generate-coach-summary] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
