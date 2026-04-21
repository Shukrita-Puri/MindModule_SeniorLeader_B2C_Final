import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Public webhook endpoint — Google calls this. CORS not required for server-to-server,
// but keep the OPTIONS handler clean.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-resource-id, x-goog-resource-state, x-goog-message-number, x-goog-resource-uri, x-goog-channel-expiration',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Google sends notifications as POST with empty body and a set of X-Goog-* headers.
    const channelId = req.headers.get('x-goog-channel-id');
    const channelToken = req.headers.get('x-goog-channel-token');
    const resourceId = req.headers.get('x-goog-resource-id');
    const resourceState = req.headers.get('x-goog-resource-state');
    const messageNumber = req.headers.get('x-goog-message-number');

    console.log('[calendar-webhook] Notification received', {
      channelId,
      resourceState,
      messageNumber,
    });

    // Validate channel token (set when we registered the watch)
    const expectedToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!channelToken || channelToken !== expectedToken) {
      console.warn('[calendar-webhook] Invalid channel token; rejecting.');
      return new Response('forbidden', { status: 403 });
    }

    // Google's initial "sync" notification doesn't represent a calendar change — ack and exit.
    if (resourceState === 'sync') {
      console.log('[calendar-webhook] Sync notification (channel handshake) — acknowledging.');
      return new Response(null, { status: 200 });
    }

    if (!channelId) {
      return new Response('missing channel id', { status: 400 });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Look up which user this channel belongs to
    const { data: conn, error: connErr } = await serviceClient
      .from('calendar_connections')
      .select('user_id, provider')
      .eq('webhook_channel_id', channelId)
      .eq('is_active', true)
      .maybeSingle();

    if (connErr || !conn) {
      console.warn('[calendar-webhook] No active connection for channel:', channelId);
      // Still ack — otherwise Google retries indefinitely
      return new Response(null, { status: 200 });
    }

    // Look up user's timezone offset so the sync uses the correct "today" boundary
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('timezone_offset')
      .eq('id', conn.user_id)
      .maybeSingle();

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Fire-and-forget enqueue of sync-calendar (don't block Google's webhook ack)
    fetch(`${supabaseUrl}/functions/v1/sync-calendar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') ?? ''}`,
      },
      body: JSON.stringify({
        provider: conn.provider,
        _internalUserId: conn.user_id,
        _internalKey: serviceRoleKey,
        timezoneOffset: profile?.timezone_offset ?? 0,
      }),
    }).then(async (r) => {
      const txt = await r.text();
      console.log('[calendar-webhook] sync-calendar enqueued for', conn.user_id, 'status:', r.status, txt.slice(0, 200));
    }).catch((err) => {
      console.error('[calendar-webhook] sync-calendar enqueue failed for', conn.user_id, err);
    });

    // Acknowledge immediately
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('[calendar-webhook] Fatal:', error);
    // Always 200 to prevent Google retry storms — we'll retry via cron anyway
    return new Response(null, { status: 200 });
  }
});