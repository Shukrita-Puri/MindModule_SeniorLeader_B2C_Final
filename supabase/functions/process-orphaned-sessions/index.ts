/**
 * Process Orphaned Sessions – Server-side cron cleanup
 * 
 * Finds coach sessions that are still 'active' with no new messages for >5 minutes,
 * marks them as 'completed', and fires all downstream processing functions.
 * This ensures abandoned conversations are never lost.
 * 
 * Triggered via pg_cron every 10 minutes.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callClaudeText, callClaudeWithTools, CLAUDE_MODELS } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Find active coach sessions (context_type = 'coach') with no recent activity
    const { data: orphanedSessions, error: fetchError } = await supabase
      .from('dialogue_sessions')
      .select('id, user_id')
      .eq('session_status', 'active')
      .eq('context_type', 'coach')
      .is('ended_at', null)
      .lt('created_at', fiveMinutesAgo)
      .limit(50);

    if (fetchError) {
      console.error('[process-orphaned-sessions] Fetch error:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!orphanedSessions || orphanedSessions.length === 0) {
      console.log('[process-orphaned-sessions] No orphaned sessions found');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[process-orphaned-sessions] Found ${orphanedSessions.length} candidate sessions`);

    let processed = 0;
    let skipped = 0;

    for (const session of orphanedSessions) {
      // Check last message timestamp to confirm truly idle >5 min
      const { data: lastMsg } = await supabase
        .from('dialogue_messages')
        .select('timestamp, message_index')
        .eq('session_id', session.id)
        .order('message_index', { ascending: false })
        .limit(1)
        .single();

      if (!lastMsg) {
        // No messages at all – mark completed but skip processing
        await supabase
          .from('dialogue_sessions')
          .update({ session_status: 'completed', ended_at: new Date().toISOString() })
          .eq('id', session.id);
        skipped++;
        continue;
      }

      // If last message is within 5 minutes, session might still be active – skip
      const lastMsgTime = new Date(lastMsg.timestamp).getTime();
      if (lastMsgTime > Date.now() - 5 * 60 * 1000) {
        continue;
      }

      // Check message count – need at least 2 messages (1 user + 1 assistant) for processing
      const { count } = await supabase
        .from('dialogue_messages')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', session.id);

      const msgCount = count || 0;

      // Mark session as completed
      await supabase
        .from('dialogue_sessions')
        .update({
          session_status: 'completed',
          ended_at: new Date().toISOString(),
          total_messages: msgCount,
        })
        .eq('id', session.id);

      // Await behavior_log insert to prevent silent data loss
      try {
        const { error: blErr } = await supabase.from('behavior_logs').insert({
          user_id: session.user_id,
          behavior_type: 'coach_session',
          event_title: 'coach',
          energy_after: null,
          context_event_id: session.id,
          created_at: new Date().toISOString(),
        });
        if (blErr) console.error('[process-orphaned-sessions] behavior_log insert error:', blErr);
      } catch (blCatchErr) {
        console.error('[process-orphaned-sessions] behavior_log insert exception:', blCatchErr);
      }

      if (msgCount < 2) {
        console.log(`[process-orphaned-sessions] Session ${session.id} completed with ${msgCount} msgs – too few for downstream`);
        skipped++;
        continue;
      }

      // Check if summary already exists (avoid duplicate processing)
      const { data: existingSummary } = await supabase
        .from('coach_session_summaries')
        .select('id')
        .eq('session_id', session.id)
        .maybeSingle();

      if (existingSummary) {
        console.log(`[process-orphaned-sessions] Session ${session.id} already has summary – skipping downstream`);
        processed++;
        continue;
      }

      // Fire all downstream functions in parallel using service role
      const payload = JSON.stringify({
        sessionId: session.id,
        userId: session.user_id,
      });

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      };

      const downstreamFns = [
        'extract-coach-insights',
        'analyze-probing-effectiveness',
        'generate-coach-summary',    // summary → then memories are extracted by summary fn or separately
        'detect-recurring-patterns',
        'detect-coach-scenarios',
        'extract-tool-commitments',
        'resolve-session-commitments',
      ];

      const results = await Promise.allSettled(
        downstreamFns.map(fn =>
          fetch(`${supabaseUrl}/functions/v1/${fn}`, {
            method: 'POST',
            headers,
            body: payload,
          }).then(async (res) => {
            const body = await res.text();
            if (!res.ok) {
              console.error(`[process-orphaned-sessions] ${fn} failed (${res.status}):`, body);
            }
            return { fn, status: res.status };
          })
        )
      );

      // Fire extract-session-memories after a short delay to let summary complete
      // (summary is the dependency for memory extraction)
      setTimeout(async () => {
        try {
          await fetch(`${supabaseUrl}/functions/v1/extract-session-memories`, {
            method: 'POST',
            headers,
            body: payload,
          });
        } catch (e) {
          console.error(`[process-orphaned-sessions] extract-session-memories failed:`, e);
        }
      }, 5000);

      // Extract tiny wins from orphaned session messages via AI
      try {
        const { data: sessionMessages } = await supabase
          .from('dialogue_messages')
          .select('content, sender_type')
          .eq('session_id', session.id)
          .order('message_index', { ascending: true });

        if (sessionMessages && sessionMessages.length >= 2) {
          const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
          if (LOVABLE_API_KEY) {
            // Filter to user-only messages – wins must come from user's own statements
            const aiMessages = sessionMessages
              .filter(m => m.sender_type === 'user')
              .map(m => ({ role: 'user' as const, content: m.content }));

            const winResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${ANTHROPIC_API_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash-lite',
                messages: [
                  {
                    role: 'system',
                    content: `You are given ONLY user messages from a coaching conversation. Every message is something the user said – no coach responses are included.

Extract genuine tiny wins – actions they took, achievements, growth moments, or things they are proud of.

A win MUST contain an ACTION VERB – the user must describe something they DID, ACHIEVED, CHOSE, REALIZED, or COMPLETED.

DO NOT treat the following as wins:
- Generic greetings or small talk
- Questions the user asks without describing an action
- Complaints, venting, or purely negative statements (e.g., "feeling overwhelmed", "stressed out", "struggling with")
- Status descriptions without an action verb (e.g., "workload is heavy", "things are busy")

DO treat these as wins:
- Specific actions the user took
- Behaviors they're proud of
- Realizations or growth moments
- Reflections on what went well
- Moments of self-awareness
- Choosing differently than usual
- Completing or delivering something
- Progress on a pattern they've been working on

If the user shared a genuine win, consolidate it into one clear statement.
If no genuine win is present, do NOT force one – it's better to miss than to capture a complaint as a win.`
                  },
                  ...aiMessages,
                ],
                tools: [{
                  type: 'function',
                  function: {
                    name: 'store_tiny_win',
                    description: 'Store a tiny win when the user shares a genuine personal achievement or positive reflection.',
                    parameters: {
                      type: 'object',
                      properties: {
                        win_content: {
                          type: 'string',
                          description: 'The actual win or achievement the user described.',
                        },
                      },
                      required: ['win_content'],
                    },
                  },
                }],
                stream: false,
              }),
            });

            if (winResponse.ok) {
              const winData = await winResponse.json();
              const toolCalls = winData.choices?.[0]?.message?.tool_calls;
              if (toolCalls) {
                for (const tc of toolCalls) {
                  if (tc.function?.name === 'store_tiny_win') {
                    const args = JSON.parse(tc.function.arguments);
                    const winContent = args.win_content?.trim();
                      // Quality gate: reject non-wins
                      const NON_WIN_PATTERNS = /^(feeling\s+(overwhelmed|stressed|anxious|burned|drained|exhausted|frustrated|stuck)|struggling\s+with|things\s+are\s+(tough|hard|busy|heavy)|workload\s+is|lots?\s+going\s+on|i('m|\s+am)\s+(overwhelmed|stressed|anxious|burned|drained|exhausted|frustrated|stuck))/i;
                      if (winContent && winContent.length >= 10 && !NON_WIN_PATTERNS.test(winContent)) {
                      await supabase.from('tiny_wins').insert({
                        user_id: session.user_id,
                        session_id: session.id,
                        win_content: winContent,
                        win_date: new Date().toISOString().split('T')[0],
                        source: 'coach',
                      });
                      console.log(`[process-orphaned-sessions] ✅ Tiny win extracted: ${winContent.substring(0, 60)}`);
                    }
                  }
                }
              }
            }
          }
        }
      } catch (winErr) {
        console.error(`[process-orphaned-sessions] Tiny win extraction error:`, winErr);
      }

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      console.log(`[process-orphaned-sessions] Session ${session.id}: ${succeeded}/${downstreamFns.length} downstream succeeded (${msgCount} msgs)`);
      processed++;
    }

    console.log(`[process-orphaned-sessions] Done: ${processed} processed, ${skipped} skipped`);

    return new Response(JSON.stringify({ processed, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    console.error('[process-orphaned-sessions] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
