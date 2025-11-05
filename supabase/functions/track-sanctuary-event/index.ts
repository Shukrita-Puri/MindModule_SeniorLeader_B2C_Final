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

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get the user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const eventData = await req.json();

    // Validate required fields
    if (!eventData.eventType || !eventData.contentId || !eventData.contentType || !eventData.category) {
      throw new Error('Missing required fields');
    }

    // Insert event
    const { data: event, error: insertError } = await supabaseClient
      .from('sanctuary_events')
      .insert({
        user_id: user.id,
        event_type: eventData.eventType,
        content_id: eventData.contentId,
        content_type: eventData.contentType,
        category: eventData.category,
        tags: eventData.tags || [],
        duration_seconds: eventData.durationSeconds || null,
        context_data: eventData.contextData || {},
        effectiveness_rating: eventData.effectivenessRating || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      throw insertError;
    }

    console.log('Event tracked successfully:', event);

    return new Response(JSON.stringify({ success: true, event }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in track-sanctuary-event:', error);
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
