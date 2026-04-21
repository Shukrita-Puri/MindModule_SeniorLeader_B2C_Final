import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========== AES-256-GCM Helpers (same as sync-calendar) ==========
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function decryptJson(ctB64: string, ivB64: string, keyB64: string): Promise<unknown> {
  const keyBytes = b64ToBytes(keyB64);
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, ct.buffer as ArrayBuffer);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}

// Renewal threshold: renew if expiration is within 24h
const RENEW_WINDOW_MS = 24 * 60 * 60 * 1000;
// Google watch channels can live up to 7 days for primary calendar
const WATCH_TTL_SECONDS = 7 * 24 * 60 * 60;

interface WatchResult {
  userId: string;
  outcome: 'registered' | 'renewed' | 'skipped' | 'failed';
  reason?: string;
}

async function registerGoogleWatch(
  accessToken: string,
  webhookUrl: string,
  channelToken: string,
): Promise<{ id: string; resourceId: string; expiration: string } | null> {
  const channelId = crypto.randomUUID();
  const res = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events/watch',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
        token: channelToken,
        params: { ttl: String(WATCH_TTL_SECONDS) },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('[register-calendar-watch] Google watch error:', res.status, errText);
    return null;
  }

  const data = await res.json();
  return {
    id: data.id,
    resourceId: data.resourceId,
    expiration: new Date(parseInt(data.expiration, 10)).toISOString(),
  };
}

async function stopGoogleWatch(accessToken: string, channelId: string, resourceId: string): Promise<void> {
  try {
    await fetch('https://www.googleapis.com/calendar/v3/channels/stop', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id: channelId, resourceId }),
    });
  } catch (e) {
    console.warn('[register-calendar-watch] stopGoogleWatch failed (non-fatal):', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const encKeyB64 = Deno.env.get('TOKEN_ENC_KEY_B64');
    if (!encKeyB64) throw new Error('TOKEN_ENC_KEY_B64 not configured');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured');
    const webhookUrl = `${supabaseUrl}/functions/v1/calendar-webhook`;
    const channelToken = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Optional body { userId } to register a single user (called from calendar-auth on connect).
    // No body = scan-and-renew across all active connections (called from cron).
    let singleUserId: string | null = null;
    try {
      const body = await req.json();
      if (body?.userId) singleUserId = body.userId as string;
    } catch {
      // no body — cron mode
    }

    let query = serviceClient
      .from('calendar_connections')
      .select('id, user_id, provider, access_token_enc, token_iv, webhook_channel_id, webhook_resource_id, webhook_expiration')
      .eq('is_active', true)
      .eq('provider', 'google');

    if (singleUserId) {
      query = query.eq('user_id', singleUserId);
    } else {
      // Cron: only renew expired/expiring or never-registered
      const renewThreshold = new Date(Date.now() + RENEW_WINDOW_MS).toISOString();
      query = query.or(`webhook_expiration.is.null,webhook_expiration.lte.${renewThreshold}`);
    }

    const { data: connections, error: connErr } = await query;
    if (connErr) throw connErr;

    const total = connections?.length || 0;
    console.log('[register-calendar-watch] Processing', total, 'connections; mode:', singleUserId ? 'single' : 'cron');

    const results: WatchResult[] = [];
    let registeredCount = 0;
    let failedCount = 0;

    for (const conn of connections || []) {
      try {
        if (!conn.access_token_enc || !conn.token_iv) {
          results.push({ userId: conn.user_id, outcome: 'skipped', reason: 'no_access_token' });
          continue;
        }

        const dec = await decryptJson(conn.access_token_enc, conn.token_iv, encKeyB64) as { token: string };
        const accessToken = dec.token;

        // Stop previous channel if it exists (best-effort; ignore failures)
        if (conn.webhook_channel_id && conn.webhook_resource_id) {
          await stopGoogleWatch(accessToken, conn.webhook_channel_id, conn.webhook_resource_id);
        }

        const watch = await registerGoogleWatch(accessToken, webhookUrl, channelToken);
        if (!watch) {
          failedCount++;
          results.push({ userId: conn.user_id, outcome: 'failed', reason: 'google_watch_failed' });
          continue;
        }

        await serviceClient
          .from('calendar_connections')
          .update({
            webhook_channel_id: watch.id,
            webhook_resource_id: watch.resourceId,
            webhook_expiration: watch.expiration,
          })
          .eq('id', conn.id);

        registeredCount++;
        results.push({
          userId: conn.user_id,
          outcome: conn.webhook_channel_id ? 'renewed' : 'registered',
        });
        console.log('[register-calendar-watch] ✅', conn.user_id, '→ expires', watch.expiration);
      } catch (err) {
        failedCount++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[register-calendar-watch] Exception for user:', conn.user_id, msg);
        results.push({ userId: conn.user_id, outcome: 'failed', reason: msg });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        totalScanned: total,
        registered: registeredCount,
        failed: failedCount,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[register-calendar-watch] Fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});