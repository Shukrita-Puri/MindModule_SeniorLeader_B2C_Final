import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_RATINGS = new Set(['up', 'neutral', 'down']);
const MAX_FEEDBACK_LEN = 2000;

interface RequestBody {
  briefId?: string;
  rating?: 'up' | 'neutral' | 'down' | null;
  feedback?: string | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { briefId, rating, feedback } = body;

    if (!briefId || typeof briefId !== 'string') {
      return new Response(JSON.stringify({ error: 'briefId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (rating !== null && rating !== undefined && !VALID_RATINGS.has(rating)) {
      return new Response(JSON.stringify({ error: 'rating must be up, neutral, or down' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let trimmedFeedback: string | null = null;
    if (typeof feedback === 'string' && feedback.trim().length > 0) {
      trimmedFeedback = feedback.trim().slice(0, MAX_FEEDBACK_LEN);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify ownership before update (service role bypasses RLS, so we must enforce explicitly)
    const { data: existing, error: readErr } = await supabase
      .from('brief_snapshots')
      .select('id, user_id')
      .eq('id', briefId)
      .maybeSingle();

    if (readErr || !existing) {
      return new Response(JSON.stringify({ error: 'Brief not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (existing.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const updatePayload: Record<string, unknown> = {
      user_rating: rating ?? null,
      feedback_text: trimmedFeedback,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from('brief_snapshots')
      .update(updatePayload)
      .eq('id', briefId)
      .eq('user_id', userId);

    if (updateErr) {
      console.error('[brief-rating] Update failed:', updateErr.message);
      return new Response(JSON.stringify({ error: 'Failed to save rating' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[brief-rating] Fatal error:', (err as Error)?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});