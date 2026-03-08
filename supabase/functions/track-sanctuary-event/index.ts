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

    // Map event types: client sends 'session_complete', DB stores 'completed'
    const eventTypeMap: Record<string, string> = {
      'session_complete': 'completed',
      'session_start': 'started',
      'session_pause': 'paused',
      'session_skip': 'skipped',
    };
    const mappedEventType = eventTypeMap[eventData.eventType] || eventData.eventType;

    // Insert event
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

    console.log('[track-sanctuary-event] Event tracked:', mappedEventType, eventData.contentId);

    return new Response(JSON.stringify({ success: true, event }), {
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
