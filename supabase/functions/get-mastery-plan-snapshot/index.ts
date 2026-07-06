// get-mastery-plan-snapshot — authenticated read of the current-window
// `mastery_plan_snapshots` row for the signed-in user. The browser
// Supabase client is anon-keyed only, so direct table reads are filtered
// by RLS and return null for Auth0 users. This function verifies the
// Auth0 token via the shared helper and reads with the service role,
// scoped to the verified `userId`.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  planDate?: string;
  mrsWindow?: 'morning' | 'afternoon' | 'evening';
}

const SELECT_COLUMNS = [
  'id',
  'plan_json',
  'horizon_modules',
  'priorities',
  'recommended_practice_ids',
  'plan_ledger',
  'status',
  'error_json',
  'generated_at',
  'input_signature',
  'plan_date',
  'mrs_window',
  'day_kind',
  'horizon_iso',
  'delivered_at',
  'viewed_at',
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
    const { planDate, mrsWindow } = body;

    if (!planDate || !/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
      return new Response(JSON.stringify({ error: 'planDate (YYYY-MM-DD) required' }), {
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
      .from('mastery_plan_snapshots')
      .select(SELECT_COLUMNS)
      .eq('user_id', userId)
      .eq('plan_date', planDate)
      .eq('mrs_window', mrsWindow)
      .maybeSingle();

    if (error) {
      console.error('[get-mastery-plan-snapshot] read failed:', error.message);
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
    console.error('[get-mastery-plan-snapshot] fatal:', (err as Error)?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});