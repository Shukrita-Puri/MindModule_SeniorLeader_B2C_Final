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
    // Auth0 JWT verification
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const eventData = await req.json();

    // Validate required fields
    if (!eventData.eventType || !eventData.contentId || !eventData.contentType || !eventData.category) {
      throw new Error('Missing required fields');
    }

    // Service role client for DB operations (RLS bypass)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Event type is passed through directly — DB constraint expects: session_complete, session_start, session_pause, session_skip
    const mappedEventType = eventData.eventType;

    // Insert sanctuary event
    const { data: event, error: insertError } = await supabase
      .from('sanctuary_events')
      .insert({
        user_id: userId,
        event_type: mappedEventType,
        content_id: eventData.contentId,
        content_type: eventData.contentType,
        category: eventData.category,
        tags: eventData.tags || [],
        duration_seconds: eventData.durationSeconds || eventData.duration || null,
        context_data: eventData.contextData || {},
        effectiveness_rating: eventData.effectivenessRating || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[track-sanctuary-event] Insert error:', insertError);
      throw insertError;
    }

    // Also write to practice_sessions for completed events (consolidates dual writes)
    let practiceSessionId: string | null = null;
    if (mappedEventType === 'completed') {
      const durationSeconds = eventData.durationSeconds || eventData.duration || null;
      const now = new Date().toISOString();
      const startedAt = durationSeconds
        ? new Date(Date.now() - durationSeconds * 1000).toISOString()
        : now;

      const { data: session, error: sessionError } = await supabase
        .from('practice_sessions')
        .insert({
          user_id: userId,
          content_id: eventData.contentId,
          content_type: eventData.contentType === 'guided-practice' ? 'guided'
            : eventData.contentType === 'micro-practice' ? 'micro'
            : eventData.contentType,
          category: eventData.category,
          duration_seconds: durationSeconds,
          started_at: startedAt,
          completed_at: now,
          completed: true,
          part_of_ritual: eventData.partOfRitual || false,
          metadata: eventData.metadata || {},
        })
        .select('id')
        .single();

      if (sessionError) {
        console.error('[track-sanctuary-event] practice_sessions insert error:', sessionError);
        // Non-fatal — sanctuary_events is the primary record
      } else {
        practiceSessionId = session?.id || null;
      }
    }

    console.log('[track-sanctuary-event] Event tracked:', mappedEventType, eventData.contentId);

    return new Response(JSON.stringify({ success: true, event, practiceSessionId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[track-sanctuary-event] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
