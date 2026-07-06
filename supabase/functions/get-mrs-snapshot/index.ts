// get-mrs-snapshot — authenticated read of the current-window
// `daily_context_snapshot` row for the signed-in user.
//
// Client-side `useMrsSnapshot` used to read this row directly via the
// browser Supabase client, but that client is anon-keyed only. RLS on
// `daily_context_snapshot` therefore returned no rows and the MRS gauge
// rendered blank even when the row existed. This function authenticates
// the caller via Auth0 (shared helper) and reads with the service role,
// scoped to the verified `userId`.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  localDate?: string;
  mrsWindow?: 'morning' | 'afternoon' | 'evening';
}

const SELECT_COLUMNS = [
  'inner_score',
  'inner_tier',
  'tier_displayed',
  'tier_cap_reason',
  'readiness_score_baseline',
  'readiness_score_refined',
  'readiness_state',
  'refined_contribution',
  'mrs_window',
  'weight_provenance',
  'signal_pills',
  'supply_demand_gap_flag',
  'updated_at',
].join(', ');

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const { localDate, mrsWindow } = body;

    if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      return new Response(JSON.stringify({ error: 'localDate (YYYY-MM-DD) required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (mrsWindow !== 'morning' && mrsWindow !== 'afternoon' && mrsWindow !== 'evening') {
      return new Response(JSON.stringify({ error: 'mrsWindow must be morning|afternoon|evening' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    const { data, error } = await db
      .from('daily_context_snapshot')
      .select(SELECT_COLUMNS)
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .eq('mrs_window', mrsWindow)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[get-mrs-snapshot] read failed:', error.message);
      return new Response(JSON.stringify({ error: 'Failed to fetch snapshot' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, data: data ?? null }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[get-mrs-snapshot] fatal:', (err as Error)?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});