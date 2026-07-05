import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildMicrosoftSubscriptionCreatePayload,
  buildMicrosoftSubscriptionRenewPayload,
  classifyMicrosoftSubscriptionError,
  MS_GRAPH_RENEW_WINDOW_MS,
} from "../_shared/rules/microsoft-graph-subscription.ts";

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
  provider: 'google' | 'microsoft';
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

// ========== Microsoft Graph subscription helpers ==========
async function createMicrosoftSubscription(
  accessToken: string,
  notificationUrl: string,
  clientState: string,
): Promise<{ id: string; expiration: string } | { error: string; status: number }> {
  const payload = buildMicrosoftSubscriptionCreatePayload({ notificationUrl, clientState });
  const res = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[register-calendar-watch] Microsoft subscription create error:', res.status, text);
    return { error: text, status: res.status };
  }
  const data = await res.json();
  return { id: data.id, expiration: data.expirationDateTime };
}

async function renewMicrosoftSubscription(
  accessToken: string,
  subscriptionId: string,
): Promise<{ expiration: string } | { error: string; status: number }> {
  const payload = buildMicrosoftSubscriptionRenewPayload();
  const res = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[register-calendar-watch] Microsoft subscription renew error:', res.status, text);
    return { error: text, status: res.status };
  }
  const data = await res.json();
  return { expiration: data.expirationDateTime };
}

async function deleteMicrosoftSubscription(accessToken: string, subscriptionId: string): Promise<void> {
  try {
    await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch (e) {
    console.warn('[register-calendar-watch] deleteMicrosoftSubscription failed (non-fatal):', e);
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
    let singleProvider: 'google' | 'microsoft' | null = null;
    try {
      const body = await req.json();
      if (body?.userId) singleUserId = body.userId as string;
      if (body?.provider === 'google' || body?.provider === 'microsoft') singleProvider = body.provider;
    } catch {
      // no body — cron mode
    }

    let query = serviceClient
      .from('calendar_connections')
      .select('id, user_id, provider, access_token_enc, token_iv, webhook_channel_id, webhook_resource_id, webhook_expiration, webhook_client_state')
      .eq('is_active', true)
      .in('provider', ['google', 'microsoft']);

    if (singleUserId) {
      query = query.eq('user_id', singleUserId);
      if (singleProvider) query = query.eq('provider', singleProvider);
    } else {
      // Cron: only renew expired/expiring or never-registered.
      // Google + Microsoft share the same 24h renewal window today.
      const renewMs = Math.min(RENEW_WINDOW_MS, MS_GRAPH_RENEW_WINDOW_MS);
      const renewThreshold = new Date(Date.now() + renewMs).toISOString();
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
          results.push({ userId: conn.user_id, provider: conn.provider, outcome: 'skipped', reason: 'no_access_token' });
          continue;
        }

        const dec = await decryptJson(conn.access_token_enc, conn.token_iv, encKeyB64) as { token: string };
        const accessToken = dec.token;

        if (conn.provider === 'google') {
          // Stop previous channel if it exists (best-effort; ignore failures)
          if (conn.webhook_channel_id && conn.webhook_resource_id) {
            await stopGoogleWatch(accessToken, conn.webhook_channel_id, conn.webhook_resource_id);
          }
          const watch = await registerGoogleWatch(accessToken, webhookUrl, channelToken);
          if (!watch) {
            failedCount++;
            await recordWebhookError(serviceClient, conn.id, 'google_watch_failed');
            results.push({ userId: conn.user_id, provider: 'google', outcome: 'failed', reason: 'google_watch_failed' });
            continue;
          }
          await serviceClient
            .from('calendar_connections')
            .update({
              webhook_channel_id: watch.id,
              webhook_resource_id: watch.resourceId,
              webhook_expiration: watch.expiration,
              webhook_last_registered_at: new Date().toISOString(),
              webhook_last_error: null,
              webhook_last_error_at: null,
            })
            .eq('id', conn.id);
          registeredCount++;
          results.push({
            userId: conn.user_id,
            provider: 'google',
            outcome: conn.webhook_channel_id ? 'renewed' : 'registered',
          });
          console.log('[register-calendar-watch] ✅ google', conn.user_id, '→ expires', watch.expiration);
        } else if (conn.provider === 'microsoft') {
          // Renew in place when a subscription id already exists; otherwise create.
          let subResult: { id?: string; expiration: string } | null = null;
          let clientState = conn.webhook_client_state as string | null;

          if (conn.webhook_channel_id) {
            const r = await renewMicrosoftSubscription(accessToken, conn.webhook_channel_id);
            if ('error' in r) {
              const kind = classifyMicrosoftSubscriptionError(r.status);
              if (kind === 'not_found') {
                // Subscription evaporated — fall through and create fresh.
              } else {
                failedCount++;
                await recordWebhookError(serviceClient, conn.id, `microsoft_renew_${kind}_${r.status}`);
                results.push({ userId: conn.user_id, provider: 'microsoft', outcome: 'failed', reason: `renew_${kind}` });
                continue;
              }
            } else {
              subResult = { id: conn.webhook_channel_id, expiration: r.expiration };
            }
          }

          if (!subResult) {
            if (!clientState) {
              clientState = crypto.randomUUID();
            }
            const r = await createMicrosoftSubscription(accessToken, webhookUrl, clientState);
            if ('error' in r) {
              const kind = classifyMicrosoftSubscriptionError(r.status);
              failedCount++;
              await recordWebhookError(serviceClient, conn.id, `microsoft_create_${kind}_${r.status}`);
              results.push({ userId: conn.user_id, provider: 'microsoft', outcome: 'failed', reason: `create_${kind}` });
              continue;
            }
            subResult = { id: r.id, expiration: r.expiration };
          }

          await serviceClient
            .from('calendar_connections')
            .update({
              webhook_channel_id: subResult.id,
              webhook_resource_id: null, // Graph has no separate resourceId
              webhook_expiration: subResult.expiration,
              webhook_client_state: clientState,
              webhook_last_registered_at: new Date().toISOString(),
              webhook_last_error: null,
              webhook_last_error_at: null,
            })
            .eq('id', conn.id);
          registeredCount++;
          results.push({
            userId: conn.user_id,
            provider: 'microsoft',
            outcome: conn.webhook_channel_id ? 'renewed' : 'registered',
          });
          console.log('[register-calendar-watch] ✅ microsoft', conn.user_id, '→ expires', subResult.expiration);
        } else {
          results.push({ userId: conn.user_id, provider: conn.provider, outcome: 'skipped', reason: 'unsupported_provider' });
        }
      } catch (err) {
        failedCount++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[register-calendar-watch] Exception for user:', conn.user_id, msg);
        results.push({ userId: conn.user_id, provider: conn.provider, outcome: 'failed', reason: msg });
        await recordWebhookError(serviceClient, conn.id, msg);
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

async function recordWebhookError(
  serviceClient: ReturnType<typeof createClient>,
  connectionId: string,
  message: string,
): Promise<void> {
  try {
    await serviceClient
      .from('calendar_connections')
      .update({
        webhook_last_error: message.slice(0, 500),
        webhook_last_error_at: new Date().toISOString(),
      })
      .eq('id', connectionId);
  } catch (e) {
    console.warn('[register-calendar-watch] recordWebhookError failed (non-fatal):', e);
  }
}