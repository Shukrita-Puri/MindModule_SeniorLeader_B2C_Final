import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  briefId?: string;
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
    const { briefId } = body;

    if (!briefId || typeof briefId !== 'string') {
      return new Response(JSON.stringify({ error: 'briefId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabase
      .from('brief_snapshots')
      .select('id, user_id, local_date, time_window, daily_checkin_id, refined_phrase, refined_body_text, refined_lean_on, refined_lean_on_source, refined_watch_for, refined_watch_for_source, refined_score, refined_tier, refined_signal_pills, refined_state, baseline_phrase, baseline_body_text, baseline_lean_on, baseline_lean_on_source, baseline_watch_for, baseline_watch_for_source, baseline_score, baseline_tier, baseline_signal_pills, baseline_state, brief_source, driver, wearable_snapshot, checkin_snapshot, created_at')
      .eq('id', briefId)
      .maybeSingle();

    if (error) {
      console.error('[brief-by-id] Read failed:', error.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch brief' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!data) {
      return new Response(JSON.stringify({ error: 'Brief not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (data.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Back-compat projection: legacy clients read `phrase / body_text / lean_on
    // / watch_for / score / tier / signal_pills`. Two-state schema stores them
    // as refined_* (post check-in) or baseline_* (State 1 only). Coalesce
    // refined → baseline so existing readers don't have to branch.
    const d: any = data;
    const projected = {
      ...d,
      phrase: d.refined_phrase ?? d.baseline_phrase ?? null,
      body_text: d.refined_body_text ?? d.baseline_body_text ?? null,
      lean_on: d.refined_lean_on ?? d.baseline_lean_on ?? null,
      lean_on_source: d.refined_lean_on_source ?? d.baseline_lean_on_source ?? null,
      watch_for: d.refined_watch_for ?? d.baseline_watch_for ?? null,
      watch_for_source: d.refined_watch_for_source ?? d.baseline_watch_for_source ?? null,
      score: d.refined_score ?? d.baseline_score ?? null,
      tier: d.refined_tier ?? d.baseline_tier ?? null,
      signal_pills: d.refined_signal_pills ?? d.baseline_signal_pills ?? null,
    };
    return new Response(JSON.stringify({ success: true, data: projected }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[brief-by-id] Fatal error:', (err as Error)?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});