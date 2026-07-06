// get-current-brief-snapshot — authenticated read of the latest
// `brief_snapshots` row for the current window / prompt version.
//
// The browser Supabase client is anon-keyed only, so a direct table read
// is filtered by RLS on `brief_snapshots` (which requires
// auth.jwt()->>'sub' = user_id) and always returns null for Auth0 users.
// This function verifies the Auth0 token via the shared helper and reads
// with the service role scoped to the verified `userId`.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  localDate?: string;
  timeWindow?: 'morning' | 'afternoon' | 'evening';
  promptVersion?: string;
}

const SELECT_COLUMNS = [
  'id',
  'local_date',
  'time_window',
  'updated_at',
  'phrase',
  'body_text',
  'lean_on',
  'lean_on_source',
  'watch_for',
  'watch_for_source',
  'score',
  'tier',
  'signal_pills',
  'refined_state',
  'baseline_state',
  'refined_score',
  'baseline_score',
  'brief_source',
  'driver',
  'wearable_snapshot',
  'checkin_snapshot',
  'payload_json',
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
    const { localDate, timeWindow, promptVersion } = body;

    if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
      return new Response(JSON.stringify({ error: 'localDate (YYYY-MM-DD) required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (timeWindow !== 'morning' && timeWindow !== 'afternoon' && timeWindow !== 'evening') {
      return new Response(JSON.stringify({ error: 'timeWindow must be morning|afternoon|evening' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!promptVersion || typeof promptVersion !== 'string') {
      return new Response(JSON.stringify({ error: 'promptVersion required' }), {
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
      .from('brief_snapshots')
      .select(SELECT_COLUMNS)
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .eq('time_window', timeWindow)
      .eq('prompt_version', promptVersion)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[get-current-brief-snapshot] read failed:', error.message);
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
    console.error('[get-current-brief-snapshot] fatal:', (err as Error)?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});