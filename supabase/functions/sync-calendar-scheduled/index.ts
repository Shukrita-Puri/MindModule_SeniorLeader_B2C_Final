import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[sync-calendar-scheduled] Starting scheduled sync...');

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Only active connections
    const { data: connections, error: connError } = await serviceClient
      .from('calendar_connections')
      .select('user_id, provider')
      .eq('is_active', true);

    if (connError) {
      console.error('[sync-calendar-scheduled] Error fetching connections:', connError);
      throw connError;
    }

    const total = connections?.length || 0;
    console.log('[sync-calendar-scheduled] Found', total, 'active connections');

    let successCount = 0;
    let reconnectCount = 0;
    let skippedCount = 0;
    let failureCount = 0;
    const details: { userId: string; provider: string; outcome: string; reason?: string }[] = [];

    for (const conn of connections || []) {
      try {
        const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-calendar`;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

        const response = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            provider: conn.provider,
            _internalUserId: conn.user_id,
            _internalKey: serviceRoleKey,
          }),
        });

        const result = await response.json();

        if (result.success === true) {
          successCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'success' });
          console.log('[sync-calendar-scheduled] ✅', conn.user_id, '—', result.eventCount, 'events');
        } else if (result.reconnectRequired) {
          reconnectCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'reconnect_required', reason: result.reason });
          console.warn('[sync-calendar-scheduled] ⚠️', conn.user_id, '— reconnect_required:', result.reason);
        } else if (result.skipped) {
          skippedCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'skipped', reason: result.reason });
          console.log('[sync-calendar-scheduled] ⏭️', conn.user_id, '— skipped:', result.reason);
        } else {
          failureCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'failure', reason: result.error });
          console.error('[sync-calendar-scheduled] ❌', conn.user_id, '—', result.error);
        }
      } catch (err) {
        failureCount++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'exception', reason: msg });
        console.error('[sync-calendar-scheduled] ❌ exception for', conn.user_id, ':', msg);
      }
    }

    console.log(`[sync-calendar-scheduled] Done. success=${successCount} reconnect=${reconnectCount} skipped=${skippedCount} failure=${failureCount}`);

    return new Response(
      JSON.stringify({ success: true, totalConnections: total, successCount, reconnectCount, skippedCount, failureCount, details }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-calendar-scheduled] Fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
