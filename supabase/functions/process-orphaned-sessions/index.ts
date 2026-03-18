/**
 * Process Orphaned Sessions — Server-side cron cleanup
 * 
 * Finds coach sessions that are still 'active' with no new messages for >5 minutes,
 * marks them as 'completed', and fires all downstream processing functions.
 * This ensures abandoned conversations are never lost.
 * 
 * Triggered via pg_cron every 10 minutes.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
        // No messages at all — mark completed but skip processing
        await supabase
          .from('dialogue_sessions')
          .update({ session_status: 'completed', ended_at: new Date().toISOString() })
          .eq('id', session.id);
        skipped++;
        continue;
      }

      // If last message is within 5 minutes, session might still be active — skip
      const lastMsgTime = new Date(lastMsg.timestamp).getTime();
      if (lastMsgTime > Date.now() - 5 * 60 * 1000) {
        continue;
      }

      // Check message count — need at least 2 messages (1 user + 1 assistant) for processing
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

      // Fire-and-forget: log coach session to behavior_logs with context
      supabase.from('behavior_logs').insert({
        user_id: session.user_id,
        behavior_type: 'coach_session',
        event_title: 'coach',
        energy_after: null,
        context_event_id: session.id,
        created_at: new Date().toISOString(),
      }).then(({ error: blErr }) => {
        if (blErr) console.error('[process-orphaned-sessions] behavior_log insert error:', blErr);
      });

      if (msgCount < 2) {
        console.log(`[process-orphaned-sessions] Session ${session.id} completed with ${msgCount} msgs — too few for downstream`);
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
        console.log(`[process-orphaned-sessions] Session ${session.id} already has summary — skipping downstream`);
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
