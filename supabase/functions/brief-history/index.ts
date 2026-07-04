import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get('limit') ?? '30', 10);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 30 : limitParam, 1), 100);
    const startDate = url.searchParams.get('startDate');
    const endDate = url.searchParams.get('endDate');
    const deliveredOnly = url.searchParams.get('delivered') === '1';
    const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

    let query = supabase
      .from('brief_snapshots')
      .select('id, local_date, time_window, daily_checkin_id, phrase, body_text, lean_on, lean_on_source, watch_for, watch_for_source, brief_source, driver, score, tier, signal_pills, wearable_snapshot, checkin_snapshot, created_at, delivered_at, viewed_at')
      .eq('user_id', userId);

    if (deliveredOnly) {
      // History is delivery-based, not existence-based. Generated rows stay
      // invisible until the client confirms the card actually rendered.
      query = query.not('delivered_at', 'is', null);
    }

    if (startDate && DATE_RE.test(startDate)) {
      query = query.gte('local_date', startDate);
    }
    if (endDate && DATE_RE.test(endDate)) {
      query = query.lte('local_date', endDate);
    }

    const { data, error } = await query
      .order(deliveredOnly ? 'delivered_at' : 'created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[brief-history] Query failed:', error.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch history' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ briefs: data ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[brief-history] Fatal error:', (err as Error)?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
