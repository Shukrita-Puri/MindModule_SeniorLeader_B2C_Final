import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let userId: string;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      const env = Deno.env.get('ENVIRONMENT') || '';
      if (env !== 'production') {
        const devHeader = req.headers.get('x-dev-user-id');
        if (devHeader) {
          userId = devHeader;
          console.log(`[track-jit-skip] DEV bypass: userId=${userId}`);
        } else {
          return auth.errorResponse;
        }
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { eventId, eventType, eventTitle, action, cluster, jitBucketPrimary, jitBucketSecondary, horizon } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: 'Missing action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[track-jit-skip] User: ${userId}, Action: ${action}, Event: ${eventTitle}, Horizon: ${horizon || 'none'}`);

    // Update jit_event_context if eventId provided
    if (eventId) {
      // Per-touch dismissal: append horizon to dismissed_horizons array
      // Also keep dismissed_by_user = true for backward compat (only when ALL touches dismissed or no horizon specified)
      const updatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (horizon && action === 'dismissed') {
        // Append this specific touch to dismissed_horizons using raw SQL via rpc
        // Since we can't do array_append via PostgREST, fetch + merge
        const { data: existingCtx } = await supabase
          .from('jit_event_context')
          .select('dismissed_horizons')
          .eq('calendar_event_id', eventId)
          .eq('user_id', userId)
          .single();

        const priorDismissed: string[] = existingCtx?.dismissed_horizons || [];
        if (!priorDismissed.includes(horizon)) {
          priorDismissed.push(horizon);
        }
        updatePayload.dismissed_horizons = priorDismissed;

        // Only set global dismissed_by_user if BOTH touches are now dismissed
        if (priorDismissed.includes('touch_1') && priorDismissed.includes('touch_2')) {
          updatePayload.dismissed_by_user = true;
        }
      } else {
        // Legacy fallback: no horizon specified, set global dismiss
        updatePayload.dismissed_by_user = true;
      }

      await supabase
        .from('jit_event_context')
        .update(updatePayload)
        .eq('calendar_event_id', eventId)
        .eq('user_id', userId);
    }

    // Insert into jit_preferences
    const { error } = await supabase.from('jit_preferences').insert({
      user_id: userId,
      event_type: eventType || null,
      action,
      event_title: eventTitle || null,
      dismissed: action === 'dismissed',
      skipped_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[track-jit-skip] Insert error:', error);
      throw error;
    }

    // ═══ Stage 1: Cancellation Memory ═══
    // On dismiss/cancel, persist to jit_cancellation_memory for future penalty scoring
    if (action === 'dismissed' || action === 'skipped' || action === 'cancelled') {
      const dimBCluster = cluster || null;
      try {
        const { error: cancelErr } = await supabase.from('jit_cancellation_memory').insert({
          user_id: userId,
          event_type: eventType || null,
          cluster: dimBCluster,
          cancelled_at: new Date().toISOString(),
          penalty_level: 25,
        });
        if (cancelErr) {
          console.error('[track-jit-skip] Cancellation memory insert error:', cancelErr);
        } else {
          console.log(`[track-jit-skip] Cancellation memory saved: type=${eventType} cluster=${dimBCluster}`);
        }
      } catch (e) {
        console.error('[track-jit-skip] Cancellation memory error:', e);
      }
    }

    // ═══ Phase 8: Insights Attribution ═══
    // On plan completion, attribute to behavior_logs with bucket context
    // Weight multipliers: completion ×1.2, reflection ×1.3, recurring improvement ×1.5
    if (action === 'completed' || action === 'reflected' || action === 'recurring_improvement') {
      const primaryBucket = jitBucketPrimary || null;
      const secondaryBucket = jitBucketSecondary || null;

      // Determine weight multiplier based on action type
      let weightMultiplier = 1.0;
      if (action === 'completed') weightMultiplier = 1.2;
      else if (action === 'reflected') weightMultiplier = 1.3;
      else if (action === 'recurring_improvement') weightMultiplier = 1.5;

      try {
        // Primary bucket attribution (70% weight)
        const { error: blErr } = await supabase.from('behavior_logs').insert({
          user_id: userId,
          behavior_type: `jit_plan_${action}`,
          event_title: eventTitle || null,
          energy_after: String(Math.round(0.7 * weightMultiplier * 100) / 100),
          control_level: primaryBucket,
        });
        if (blErr) console.error('[track-jit-skip] primary behavior_log insert error:', blErr);

        // Secondary bucket attribution (30% weight) – if secondary exists
        if (secondaryBucket && secondaryBucket !== primaryBucket) {
          const { error: blErr2 } = await supabase.from('behavior_logs').insert({
            user_id: userId,
            behavior_type: `jit_plan_${action}_secondary`,
            event_title: eventTitle || null,
            energy_after: String(Math.round(0.3 * weightMultiplier * 100) / 100),
            control_level: secondaryBucket,
          });
          if (blErr2) console.error('[track-jit-skip] secondary behavior_log insert error:', blErr2);
        }

        // Mark jit_event_context as completed
        if (eventId) {
          await supabase
            .from('jit_event_context')
            .update({
              completed: true,
              updated_at: new Date().toISOString(),
            })
            .eq('calendar_event_id', eventId)
            .eq('user_id', userId);
        }

        console.log(`[track-jit-skip] Attribution: action=${action} primary=${primaryBucket}(70%) secondary=${secondaryBucket}(30%) multiplier=${weightMultiplier}`);
      } catch (e) {
        console.error('[track-jit-skip] Attribution error:', e);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[track-jit-skip] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
