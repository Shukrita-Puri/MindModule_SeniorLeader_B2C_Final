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
      // DEV_MODE bypass: allow fallback when not in production
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

    const { eventId, eventType, eventTitle, action } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: 'Missing action' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[track-jit-skip] User: ${userId}, Action: ${action}, Event: ${eventTitle}`);

    // Update jit_event_context if eventId provided
    if (eventId) {
      await supabase
        .from('jit_event_context')
        .update({ dismissed_by_user: true, updated_at: new Date().toISOString() })
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
