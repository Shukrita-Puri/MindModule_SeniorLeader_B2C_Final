import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// This function is called by a cron job every 4-6 hours
// It syncs calendars for ALL users with active connections
// This enables push notifications based on upcoming calendar events

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[sync-calendar-scheduled] Starting scheduled sync for all users...');

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all active calendar connections
    const { data: connections, error: connError } = await serviceClient
      .from('calendar_connections')
      .select('user_id, provider')
      .eq('is_active', true);

    if (connError) {
      console.error('[sync-calendar-scheduled] Error fetching connections:', connError);
      throw connError;
    }

    console.log('[sync-calendar-scheduled] Found', connections?.length || 0, 'active connections');

    const results: { userId: string; provider: string; success: boolean; error?: string }[] = [];

    // Sync each user's calendar
    for (const conn of connections || []) {
      try {
        console.log('[sync-calendar-scheduled] Syncing for user:', conn.user_id, 'provider:', conn.provider);
        
        // Call the sync-calendar function internally
        const syncUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-calendar`;
        
        const response = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
          body: JSON.stringify({
            provider: conn.provider,
            userId: conn.user_id,
          }),
        });

        const result = await response.json();
        
        if (response.ok) {
          console.log('[sync-calendar-scheduled] Success for user:', conn.user_id, 'events:', result.eventCount);
          results.push({ userId: conn.user_id, provider: conn.provider, success: true });
        } else {
          console.error('[sync-calendar-scheduled] Failed for user:', conn.user_id, result.error);
          results.push({ userId: conn.user_id, provider: conn.provider, success: false, error: result.error });
        }
      } catch (err) {
        console.error('[sync-calendar-scheduled] Error syncing user:', conn.user_id, err);
        results.push({ 
          userId: conn.user_id, 
          provider: conn.provider, 
          success: false, 
          error: err instanceof Error ? err.message : 'Unknown error' 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log('[sync-calendar-scheduled] Completed. Success:', successCount, 'Failures:', failureCount);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalConnections: connections?.length || 0,
        successCount,
        failureCount,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-calendar-scheduled] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
