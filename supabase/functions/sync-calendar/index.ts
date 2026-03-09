import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

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

// Helper: safe 200 JSON response
function jsonOk(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Auth0 token verification
async function verifyAuth0Token(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) throw new Error('Missing Authorization header');
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
  if (!auth0Domain) throw new Error('Auth0 domain not configured');

  const res = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Token verification failed');
  const info = await res.json();
  if (!info.sub) throw new Error('Token missing sub claim');
  return info.sub;
}

// Token refresh buffer: refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { provider } = z.object({ provider: z.enum(['google', 'outlook']) }).parse(body);

    // Auth: support both Auth0 token (frontend) and internal scheduled call with userId+internalSecret
    let userId: string;
    const authHeader = req.headers.get('Authorization');
    const internalSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (body._internalUserId && body._internalKey === internalSecret) {
      // Trusted internal call from sync-calendar-scheduled
      userId = body._internalUserId as string;
      console.log('[sync-calendar] Internal call for user:', userId);
    } else {
      try {
        userId = await verifyAuth0Token(authHeader);
      } catch {
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('[sync-calendar] Starting sync for user:', userId, 'provider:', provider);

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Load connection — only active
    const { data: connection, error: connErr } = await serviceClient
      .from('calendar_connections')
      .select('id, user_id, provider, is_active, last_sync, token_expires_at, access_token_enc, refresh_token_enc, token_iv, token_enc_v')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('is_active', true)
      .maybeSingle();

    if (connErr || !connection) {
      console.log('[sync-calendar] connection_inactive_or_missing for user:', userId);
      return jsonOk({ success: false, skipped: true, reason: 'connection_inactive_or_missing', error: 'Calendar is disconnected.' });
    }

    // Get encryption key
    const encKeyB64 = Deno.env.get('TOKEN_ENC_KEY_B64');
    if (!encKeyB64) {
      console.error('[sync-calendar] TOKEN_ENC_KEY_B64 not configured');
      return jsonOk({ success: false, reconnectRequired: false, reason: 'config_error', error: 'Server configuration error.' });
    }

    // Decrypt access token
    let accessToken: string | null = null;
    if (connection.access_token_enc && connection.token_iv) {
      try {
        const dec = await decryptJson(connection.access_token_enc, connection.token_iv, encKeyB64) as { token: string };
        accessToken = dec.token;
      } catch (e) {
        console.error('[sync-calendar] reconnect_required:decrypt_failed', e);
        await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', connection.id);
        return jsonOk({ success: false, reconnectRequired: true, reason: 'decrypt_failed', error: 'Calendar session expired. Please reconnect your calendar.' });
      }
    }

    if (!accessToken) {
      console.error('[sync-calendar] reconnect_required:no_access_token');
      await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', connection.id);
      return jsonOk({ success: false, reconnectRequired: true, reason: 'no_access_token', error: 'Calendar session expired. Please reconnect your calendar.' });
    }

    // Proactive token refresh: refresh if within 5 min of expiry or already expired
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const now = new Date();

    if (expiresAt && now.getTime() >= expiresAt.getTime() - REFRESH_BUFFER_MS) {
      console.log('[sync-calendar] token_near_expiry_refresh_start — expires:', expiresAt.toISOString());

      // Decrypt refresh token
      let refreshToken: string | null = null;
      if (connection.refresh_token_enc && connection.token_iv) {
        try {
          const dec = await decryptJson(connection.refresh_token_enc, connection.token_iv, encKeyB64) as { token: string | null };
          refreshToken = dec.token;
        } catch {
          console.error('[sync-calendar] reconnect_required:refresh_decrypt_failed');
        }
      }

      if (!refreshToken) {
        console.error('[sync-calendar] reconnect_required:no_refresh_token');
        await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', connection.id);
        return jsonOk({ success: false, reconnectRequired: true, reason: 'no_refresh_token', error: 'Calendar session expired. Please reconnect your calendar.' });
      }

      // Refresh the access token
      if (provider === 'google') {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '',
            client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '',
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });
        const refreshData = await refreshRes.json();

        if (refreshData.error) {
          console.error('[sync-calendar] token_refresh_failed:', refreshData.error, refreshData.error_description);
          await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', connection.id);
          return jsonOk({ success: false, reconnectRequired: true, reason: 'refresh_failed', error: 'Calendar session expired. Please reconnect your calendar.' });
        }

        accessToken = refreshData.access_token;
        const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString();

        // Encrypt and persist new access token
        const { ivB64, ctB64: newAccessEnc } = await encryptJson({ token: accessToken }, encKeyB64);
        
        // If Google returns a rotated refresh token, persist it too
        const updatePayload: Record<string, unknown> = {
          access_token_enc: newAccessEnc,
          token_iv: ivB64,
          token_expires_at: newExpiresAt,
        };
        if (refreshData.refresh_token) {
          const { ctB64: newRefreshEnc } = await encryptJson({ token: refreshData.refresh_token }, encKeyB64);
          updatePayload.refresh_token_enc = newRefreshEnc;
          console.log('[sync-calendar] token_refresh_success — rotated refresh token');
        } else {
          console.log('[sync-calendar] token_refresh_success — kept existing refresh token');
        }

        await serviceClient.from('calendar_connections').update(updatePayload).eq('id', connection.id);
      }
    }

    // Fetch calendar events
    interface CalendarEventRow {
      external_id: string;
      title: string;
      start_time: string;
      end_time: string;
      is_organizer: boolean;
      attendees_count: number;
      is_recurring: boolean;
      event_metadata: Record<string, unknown>;
      user_id?: string;
    }

    let events: CalendarEventRow[] = [];
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (provider === 'google') {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${nextWeek.toISOString()}&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('[sync-calendar] Google API error:', response.status, errText);
        // 401 from Google means token actually invalid despite refresh
        if (response.status === 401) {
          await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', connection.id);
          return jsonOk({ success: false, reconnectRequired: true, reason: 'google_api_unauthorized', error: 'Calendar session expired. Please reconnect your calendar.' });
        }
        return jsonOk({ success: false, error: 'Failed to fetch calendar events from Google' });
      }

      const data = await response.json();
      if (data.items) {
        events = data.items.map((event: Record<string, unknown>) => {
          const start = event.start as Record<string, string>;
          const end = event.end as Record<string, string>;
          const organizer = event.organizer as Record<string, unknown> | undefined;
          const attendees = event.attendees as unknown[] | undefined;
          return {
            external_id: event.id as string,
            title: (event.summary as string) || 'Untitled Event',
            start_time: start?.dateTime || start?.date || '',
            end_time: end?.dateTime || end?.date || '',
            is_organizer: !!(organizer?.self),
            attendees_count: attendees?.length || 0,
            is_recurring: !!event.recurringEventId,
            event_metadata: {
              location: event.location,
              description: event.description,
              hangoutLink: event.hangoutLink,
            },
          };
        });
      }
    } else if (provider === 'outlook') {
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}&$orderby=start/dateTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error('[sync-calendar] Outlook API error:', response.status, errText);
        if (response.status === 401) {
          await serviceClient.from('calendar_connections').update({ is_active: false }).eq('id', connection.id);
          return jsonOk({ success: false, reconnectRequired: true, reason: 'outlook_api_unauthorized', error: 'Calendar session expired. Please reconnect your calendar.' });
        }
        return jsonOk({ success: false, error: 'Failed to fetch calendar events from Outlook' });
      }

      const data = await response.json();
      if (data.value) {
        events = data.value.map((event: Record<string, unknown>) => {
          const start = event.start as Record<string, string>;
          const end = event.end as Record<string, string>;
          const loc = event.location as Record<string, string> | undefined;
          const attendees = event.attendees as unknown[] | undefined;
          return {
            external_id: event.id as string,
            title: (event.subject as string) || 'Untitled Event',
            start_time: start?.dateTime || '',
            end_time: end?.dateTime || '',
            is_organizer: !!(event.isOrganizer),
            attendees_count: attendees?.length || 0,
            is_recurring: !!event.recurrence,
            event_metadata: {
              location: loc?.displayName,
              body: event.bodyPreview,
              webLink: event.webLink,
            },
          };
        });
      }
    }

    // Classify events
    const classifiedEvents = events.map(event => {
      const title = event.title.toLowerCase();
      let eventType = 'meeting';
      let isHighStakes = false;
      
      if (title.includes('board') || title.includes('executive')) { eventType = 'board-meeting'; isHighStakes = true; }
      else if (title.includes('presentation') || title.includes('demo') || title.includes('pitch')) { eventType = 'presentation'; isHighStakes = true; }
      else if (title.includes('client') || title.includes('customer')) { eventType = 'client-call'; isHighStakes = event.attendees_count > 5; }
      else if (title.includes('interview')) { eventType = 'interview'; isHighStakes = true; }
      else if (title.includes('1:1') || title.includes('one-on-one')) { eventType = 'one-on-one'; }
      else if (title.includes('focus') || title.includes('deep work')) { eventType = 'deep-work'; }
      else if (title.includes('exam') || title.includes('test')) { eventType = 'exam'; isHighStakes = true; }
      else if (title.includes('deadline') || title.includes('submission')) { eventType = 'deadline'; isHighStakes = true; }

      return {
        ...event,
        user_id: userId,
        event_metadata: { ...event.event_metadata, eventType, isHighStakes },
      };
    });

    console.log('[sync-calendar] Classified', classifiedEvents.length, 'events');

    // Delete + insert
    await serviceClient.from('calendar_events').delete().eq('user_id', userId);

    if (classifiedEvents.length > 0) {
      const { error: insertError } = await serviceClient.from('calendar_events').insert(classifiedEvents);
      if (insertError) {
        console.error('[sync-calendar] Insert error:', insertError);
        throw insertError;
      }
    }

    // Update last_sync
    await serviceClient.from('calendar_connections').update({ last_sync: new Date().toISOString() }).eq('user_id', userId).eq('provider', provider);

    console.log('[sync-calendar] Sync complete! Events:', classifiedEvents.length);

    return jsonOk({ success: true, eventCount: classifiedEvents.length, lastSync: new Date().toISOString() });
  } catch (error) {
    console.error('[sync-calendar] Unhandled error:', error);
    // Return 200 with failure to prevent caller crashes
    return jsonOk({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
  }
});
