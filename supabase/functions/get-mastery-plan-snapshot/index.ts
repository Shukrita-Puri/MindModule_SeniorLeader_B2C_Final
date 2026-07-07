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
    // Plans are generated for every window (morning/afternoon/evening).
    // Read policy: prefer the current-window snapshot if present, and
    // fall back to the latest ready snapshot for the date only when the
    // current window has not been generated yet. `mrsWindow` is the
    // caller's current local window.
    const requestedWindow =
      mrsWindow === 'morning' || mrsWindow === 'afternoon' || mrsWindow === 'evening'
        ? mrsWindow
        : null;

    const db = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } },
    );

    // Resolution precedence (F4). Ready rows always win over awaiting rows
    // — a non-ready row must never shadow a ready row.
    //
    //   1. Current-window ready
    //   2. Latest same-date ready (across all windows)
    //   3. Current-window awaiting  ← surfaces the honest awaiting state
    //   4. Latest same-date awaiting (across all windows)
    //
    // Error rows are never returned; they exist only for observability
    // and are backfilled to `error` by the generator's outer catch.
    let data: any = null;
    let strategy:
      | 'current_window_ready'
      | 'latest_ready'
      | 'current_window_awaiting'
      | 'latest_awaiting'
      | 'none' = 'none';

    if (requestedWindow) {
      const { data: currentRow, error: currentErr } = await db
        .from('mastery_plan_snapshots')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .eq('plan_date', planDate)
        .eq('mrs_window', requestedWindow)
        .eq('status', 'ready')
        .maybeSingle();
      if (currentErr) {
        console.error('[get-mastery-plan-snapshot] current-window read failed:', currentErr.message);
        return new Response(JSON.stringify({ error: 'Failed to fetch snapshot' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (currentRow) {
        data = currentRow;
        strategy = 'current_window_ready';
      }
    }

    if (!data) {
      const { data: latestRow, error: latestErr } = await db
        .from('mastery_plan_snapshots')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .eq('plan_date', planDate)
        .eq('status', 'ready')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestErr) {
        console.error('[get-mastery-plan-snapshot] fallback read failed:', latestErr.message);
        return new Response(JSON.stringify({ error: 'Failed to fetch snapshot' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (latestRow) {
        data = latestRow;
        strategy = 'latest_ready';
      }
    }

    // Awaiting rows — only considered when no ready row exists. This lets
    // the UI render an explicit awaiting state instead of a stale-but-ready
    // one, while still guaranteeing ready > awaiting precedence.
    if (!data && requestedWindow) {
      const { data: awaitingCurrent, error: awaitingCurrentErr } = await db
        .from('mastery_plan_snapshots')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .eq('plan_date', planDate)
        .eq('mrs_window', requestedWindow)
        .eq('status', 'awaiting')
        .maybeSingle();
      if (awaitingCurrentErr) {
        console.warn(
          '[get-mastery-plan-snapshot] awaiting current-window read failed:',
          awaitingCurrentErr.message,
        );
      } else if (awaitingCurrent) {
        data = awaitingCurrent;
        strategy = 'current_window_awaiting';
      }
    }
    if (!data) {
      const { data: awaitingLatest, error: awaitingLatestErr } = await db
        .from('mastery_plan_snapshots')
        .select(SELECT_COLUMNS)
        .eq('user_id', userId)
        .eq('plan_date', planDate)
        .eq('status', 'awaiting')
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (awaitingLatestErr) {
        console.warn(
          '[get-mastery-plan-snapshot] awaiting latest read failed:',
          awaitingLatestErr.message,
        );
      } else if (awaitingLatest) {
        data = awaitingLatest;
        strategy = 'latest_awaiting';
      }
    }

    console.log(
      `[get-mastery-plan-snapshot] planDate=${planDate} requestedWindow=${requestedWindow ?? 'none'} strategy=${strategy} found=${!!data} selectedWindow=${(data as any)?.mrs_window ?? 'n/a'} generatedAt=${(data as any)?.generated_at ?? 'n/a'}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        data: data ?? null,
        source: {
          strategy,
          requestedWindow,
          selectedWindow: (data as any)?.mrs_window ?? null,
          generatedAt: (data as any)?.generated_at ?? null,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[get-mastery-plan-snapshot] fatal:', (err as Error)?.message);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});