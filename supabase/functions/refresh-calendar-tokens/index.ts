import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ========== AES-256-GCM Helpers ==========
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
async function encryptJson(payload: unknown, keyB64: string): Promise<{ ivB64: string; ctB64: string }> {
  const keyBytes = b64ToBytes(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
  return { ivB64: bytesToB64(iv), ctB64: bytesToB64(ct) };
}
async function decryptJson(ctB64: string, ivB64: string, keyB64: string): Promise<unknown> {
  const keyBytes = b64ToBytes(keyB64);
  const iv = b64ToBytes(ivB64);
  const ct = b64ToBytes(ctB64);
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv.buffer as ArrayBuffer }, key, ct.buffer as ArrayBuffer);
  return JSON.parse(new TextDecoder().decode(new Uint8Array(pt)));
}

const REFRESH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface UserResult {
  userId: string;
  provider: string;
  outcome: 'refreshed' | 'reconnect_required' | 'failed' | 'skipped';
  reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[refresh-calendar-tokens] cron_refresh_started at', new Date().toISOString());

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const encKeyB64 = Deno.env.get('TOKEN_ENC_KEY_B64');
    if (!encKeyB64) {
      console.error('[refresh-calendar-tokens] TOKEN_ENC_KEY_B64 not configured');
      return new Response(
        JSON.stringify({ error: 'Encryption key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const googleClientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
    const googleClientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';

    // Find active connections with tokens expiring within the refresh window
    const cutoff = new Date(Date.now() + REFRESH_WINDOW_MS).toISOString();

    const { data: connections, error: connErr } = await serviceClient
      .from('calendar_connections')
      .select('id, user_id, provider, token_expires_at, access_token_enc, refresh_token_enc, token_iv, refresh_token_iv, token_enc_v')
      .eq('is_active', true)
      .lte('token_expires_at', cutoff);

    if (connErr) {
      console.error('[refresh-calendar-tokens] Query error:', connErr);
      throw connErr;
    }

    const total = connections?.length || 0;
    console.log('[refresh-calendar-tokens] Found', total, 'connections expiring before', cutoff);

    if (total === 0) {
      return new Response(
        JSON.stringify({ success: true, totalScanned: 0, refreshed: 0, reconnectRequired: 0, failed: 0, details: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let refreshedCount = 0;
    let reconnectCount = 0;
    let failedCount = 0;
    const details: UserResult[] = [];

    for (const conn of connections!) {
      try {
        console.log('[refresh-calendar-tokens] token_near_expiry_refresh_start user:', conn.user_id, 'provider:', conn.provider, 'expires:', conn.token_expires_at);

        // Decrypt refresh token — use refresh_token_iv if available, fall back to token_iv for legacy rows
        if (!conn.refresh_token_enc) {
          console.warn('[refresh-calendar-tokens] reconnect_required:no_refresh_token user:', conn.user_id);
          await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', conn.id);
          reconnectCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'reconnect_required', reason: 'no_refresh_token' });
          continue;
        }

        const refreshIv = conn.refresh_token_iv || conn.token_iv;
        if (!refreshIv) {
          console.warn('[refresh-calendar-tokens] reconnect_required:no_iv user:', conn.user_id);
          await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', conn.id);
          reconnectCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'reconnect_required', reason: 'no_iv' });
          continue;
        }

        let refreshToken: string | null = null;
        try {
          const dec = await decryptJson(conn.refresh_token_enc, refreshIv, encKeyB64) as { token: string | null };
          refreshToken = dec.token;
        } catch (e) {
          console.error('[refresh-calendar-tokens] reconnect_required:refresh_decrypt_failed user:', conn.user_id, e);
          await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', conn.id);
          reconnectCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'reconnect_required', reason: 'refresh_decrypt_failed' });
          continue;
        }

        if (!refreshToken) {
          console.warn('[refresh-calendar-tokens] reconnect_required:null_refresh_token user:', conn.user_id);
          await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', conn.id);
          reconnectCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'reconnect_required', reason: 'null_refresh_token' });
          continue;
        }

        // Refresh based on provider
        if (conn.provider === 'google') {
          const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: googleClientId,
              client_secret: googleClientSecret,
              refresh_token: refreshToken,
              grant_type: 'refresh_token',
            }),
          });

          const refreshData = await refreshRes.json();

          if (refreshData.error) {
            console.error('[refresh-calendar-tokens] token_refresh_failed user:', conn.user_id, 'error:', refreshData.error);
            await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', conn.id);
            reconnectCount++;
            details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'reconnect_required', reason: `refresh_failed:${refreshData.error}` });
            continue;
          }

          // Encrypt new access token (gets its own IV)
          const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();
          const { ivB64: newAccessIv, ctB64: newAccessEnc } = await encryptJson({ token: refreshData.access_token }, encKeyB64);

          const updatePayload: Record<string, unknown> = {
            access_token_enc: newAccessEnc,
            token_iv: newAccessIv,
            token_expires_at: newExpiresAt,
          };

          // Only rotate refresh token if Google returns a new one
          if (refreshData.refresh_token) {
            const { ivB64: newRefreshIv, ctB64: newRefreshEnc } = await encryptJson({ token: refreshData.refresh_token }, encKeyB64);
            updatePayload.refresh_token_enc = newRefreshEnc;
            updatePayload.refresh_token_iv = newRefreshIv;
            console.log('[refresh-calendar-tokens] token_refresh_success user:', conn.user_id, '— rotated refresh token');
          } else {
            // Preserve existing refresh token and its IV — do NOT overwrite
            console.log('[refresh-calendar-tokens] token_refresh_success user:', conn.user_id, '— kept existing refresh token');
          }

          await serviceClient.from('calendar_connections').update(updatePayload).eq('id', conn.id);
          refreshedCount++;
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'refreshed' });
        } else {
          // Outlook or other providers — skip for now
          details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'skipped', reason: 'unsupported_provider' });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('[refresh-calendar-tokens] Exception for user:', conn.user_id, msg);
        failedCount++;
        details.push({ userId: conn.user_id, provider: conn.provider, outcome: 'failed', reason: msg });
      }
    }

    console.log(`[refresh-calendar-tokens] cron_refresh_completed — refreshed=${refreshedCount} reconnect=${reconnectCount} failed=${failedCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        totalScanned: total,
        refreshed: refreshedCount,
        reconnectRequired: reconnectCount,
        failed: failedCount,
        details,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[refresh-calendar-tokens] Fatal:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
