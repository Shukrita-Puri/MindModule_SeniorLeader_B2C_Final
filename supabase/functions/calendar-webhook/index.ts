import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  extractGraphValidationToken,
  parseGraphNotificationEnvelope,
} from "../_shared/rules/microsoft-graph-subscription.ts";

// Public webhook endpoint — Google calls this. CORS not required for server-to-server,
// but keep the OPTIONS handler clean.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-goog-channel-id, x-goog-channel-token, x-goog-resource-id, x-goog-resource-state, x-goog-message-number, x-goog-resource-uri, x-goog-channel-expiration',
};

async function enqueueSyncForConnection(
  serviceClient: ReturnType<typeof createClient>,
  userId: string,
  provider: string,
  label: string,
): Promise<void> {
  const { data: profile } = await serviceClient
    .from('profiles')
    .select('timezone_offset')
    .eq('id', userId)
    .maybeSingle();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  fetch(`${supabaseUrl}/functions/v1/sync-calendar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') ?? ''}`,
    },
    body: JSON.stringify({
      provider,
      _internalUserId: userId,
      _internalKey: serviceRoleKey,
      timezoneOffset: profile?.timezone_offset ?? 0,
    }),
  }).then(async (r) => {
    const txt = await r.text();
    console.log(`[calendar-webhook:${label}] sync-calendar enqueued user=${userId} status=${r.status}`, txt.slice(0, 200));
  }).catch((err) => {
    console.error(`[calendar-webhook:${label}] sync-calendar enqueue failed user=${userId}`, err);
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // ============ Microsoft Graph handshake ============
    // Graph performs a synchronous validation of the notificationUrl
    // BEFORE the subscription is created. It sends a POST with a
    // `validationToken` query parameter and expects a 200 text/plain
    // response echoing the token verbatim within 10 seconds.
    const graphToken = extractGraphValidationToken(req.url);
    if (graphToken) {
      console.log('[calendar-webhook] Microsoft Graph validation handshake');
      return new Response(graphToken, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ============ Microsoft Graph change notifications ============
    // Graph POSTs a JSON envelope `{ value: [{ subscriptionId,
    // clientState, changeType, resource }] }`. Google uses X-Goog-*
    // headers with empty body, so a JSON body is our disambiguator.
    if (req.method === 'POST' && (req.headers.get('content-type') || '').includes('application/json')) {
      const body = await req.clone().json().catch(() => null);
      if (body && Array.isArray((body as { value?: unknown }).value)) {
        const notifications = parseGraphNotificationEnvelope(body);
        console.log('[calendar-webhook] Microsoft Graph notifications', notifications.length);
        const seenUsers = new Set<string>();
        for (const n of notifications) {
          const { data: conn } = await serviceClient
            .from('calendar_connections')
            .select('user_id, provider, webhook_client_state, is_active')
            .eq('webhook_channel_id', n.subscriptionId)
            .eq('provider', 'microsoft')
            .maybeSingle();
          if (!conn || !conn.is_active) {
            console.warn('[calendar-webhook] Graph notification for unknown/inactive subscription', n.subscriptionId);
            continue;
          }
          if (!conn.webhook_client_state || conn.webhook_client_state !== n.clientState) {
            console.warn('[calendar-webhook] Graph clientState mismatch — rejecting', n.subscriptionId);
            continue;
          }
          if (seenUsers.has(conn.user_id)) continue;
          seenUsers.add(conn.user_id);
          await enqueueSyncForConnection(serviceClient, conn.user_id, 'microsoft', 'graph');
        }
        // Always ack Graph — non-2xx will trigger retries and eventual
        // subscription cancellation.
        return new Response(null, { status: 202 });
      }
    }

    // ============ Google Calendar push notifications ============
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

    // Look up which user this channel belongs to
    const { data: conn, error: connErr } = await serviceClient
      .from('calendar_connections')
      .select('user_id, provider')
      .eq('webhook_channel_id', channelId)
      .eq('provider', 'google')
      .eq('is_active', true)
      .maybeSingle();

    if (connErr || !conn) {
      console.warn('[calendar-webhook] No active connection for channel:', channelId);
      // Still ack — otherwise Google retries indefinitely
      return new Response(null, { status: 200 });
    }

    // Fire-and-forget enqueue of sync-calendar (don't block Google's webhook ack)
    await enqueueSyncForConnection(serviceClient, conn.user_id, conn.provider, 'google');

    // Acknowledge immediately
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('[calendar-webhook] Fatal:', error);
    // Always 200 to prevent Google retry storms — we'll retry via cron anyway
    return new Response(null, { status: 200 });
  }
});