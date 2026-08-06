import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-mm-client-platform',
};

// ========== AES-256-GCM Encryption Helpers ==========
function b64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let binaryString = '';
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}

async function encryptJson(payload: unknown, keyB64: string): Promise<{ ivB64: string; ctB64: string }> {
  const keyBytes = b64ToBytes(keyB64);
  if (keyBytes.length !== 32) {
    throw new Error("TOKEN_ENC_KEY_B64 must be 32 bytes (base64-encoded).");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["encrypt"]);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );

  return { ivB64: bytesToB64(iv), ctB64: bytesToB64(ciphertext) };
}

// Verify Auth0 token using the userinfo endpoint
async function verifyAuth0Token(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN') || Deno.env.get('VITE_AUTH0_DOMAIN');
  
  if (!auth0Domain) {
    throw new Error('Auth0 domain not configured');
  }

  const userInfoResponse = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  if (!userInfoResponse.ok) {
    const errorText = await userInfoResponse.text();
    console.error('[calendar-auth] Userinfo error:', userInfoResponse.status, errorText);
    throw new Error('Token verification failed');
  }

  const userInfo = await userInfoResponse.json();
  if (!userInfo.sub) {
    throw new Error('Token missing sub claim');
  }

  return userInfo.sub;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const authHeader = req.headers.get('Authorization');
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let action = url.searchParams.get('action');
    let provider = url.searchParams.get('provider');
    const stateUserId = url.searchParams.get('state');
    
    let authenticatedUserId: string | null = null;
    let body: Record<string, unknown> = {};
    
    if (req.method === 'POST') {
      body = await req.json();
      action = body.action as string || action;
      provider = body.provider as string || provider;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          authenticatedUserId = await verifyAuth0Token(authHeader);
          console.log('[calendar-auth] Authenticated user:', redactUserId(authenticatedUserId));
        } catch (error) {
          console.warn('[calendar-auth] Token auth failed:', error);
        }
      }

      // SECURITY: never trust caller-supplied userId. The user identity for
      // every mutating action (connect, disconnect, update_status) is derived
      // exclusively from the verified Auth0 access token. The old body.userId
      // fallback allowed an unauthenticated caller to bind any account's
      // calendar to their own OAuth consent.
      if (body.userId && !authenticatedUserId) {
        console.warn('[calendar-auth] Rejected body.userId — no verified Bearer token present');
      }
    }
    
    provider = provider || 'google';

    console.log('[calendar-auth] Action:', action, 'Provider:', provider);

    const providerSchema = z.enum(['google', 'microsoft', 'apple']);
    const validProvider = providerSchema.parse(provider);

    if (action === 'connect') {
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: 'User ID required for connect action.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (validProvider === 'apple') {
        // Apple Calendar uses on-device EventKit; no OAuth flow.
        return new Response(
          JSON.stringify({ error: 'Apple Calendar uses on-device permission, not OAuth.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let authUrl = '';
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-auth`;

      if (validProvider === 'google') {
        const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
        if (!clientId) {
          throw new Error('Google Calendar Client ID not configured');
        }
        const scope = 'https://www.googleapis.com/auth/calendar.readonly';
        const statePayload = JSON.stringify({
          userId: authenticatedUserId,
          redirectPath: (body.redirectPath as string) || '/connected-data',
        });
        const encodedState = btoa(statePayload);
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&include_granted_scopes=true&state=${encodeURIComponent(encodedState)}`;
        console.log('[calendar-auth] Generated OAuth URL for user:', redactUserId(authenticatedUserId));
      } else if (validProvider === 'microsoft') {
        const clientId = Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID') ?? '';
        if (!clientId) {
          throw new Error('Microsoft Calendar Client ID not configured');
        }
        // 'common' tenant supports both personal and work/school accounts.
        // offline_access is required for refresh tokens.
        const scope = 'offline_access openid profile email Calendars.Read';
        const statePayload = JSON.stringify({
          userId: authenticatedUserId,
          redirectPath: (body.redirectPath as string) || '/connected-data',
          provider: 'microsoft',
        });
        const encodedState = btoa(statePayload);
        authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(encodedState)}&prompt=consent`;
        console.log('[calendar-auth] Generated Microsoft OAuth URL for user:', redactUserId(authenticatedUserId));
      }

      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'update_status') {
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: 'Authentication required for status update.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (validProvider !== 'apple') {
        return new Response(
          JSON.stringify({ error: 'Status updates are only supported for Apple Calendar here.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Apple Calendar is native-authoritative. The only durable writer for
      // Apple `calendar_connections` is `sync-apple-calendar` invoked by the
      // native iOS bridge. JS opportunistic presence writes are rejected here
      // to prevent stale/local state from fabricating "connected + synced"
      // and to preserve the monotonic guard (native writes stamp
      // status_source='native-ios' + status_authoritative_at).
      console.log(
        '[calendar-auth] Apple update_status rejected — native-authoritative',
        'user=', redactUserId(authenticatedUserId),
      );
      return new Response(
        JSON.stringify({
          success: true,
          applied: false,
          reason: 'apple_status_is_native_authoritative',
          provider: 'apple',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'callback' || url.searchParams.get('code')) {
      // OAuth callback
      const code = url.searchParams.get('code');
      
      if (!code || !stateUserId) {
        throw new Error('Missing code or state');
      }

      let validUserId: string;
      let redirectPath = '/connected-data';
      let stateProvider: string | null = null;

      try {
        const stateData = JSON.parse(atob(decodeURIComponent(stateUserId)));
        validUserId = stateData.userId;
        redirectPath = stateData.redirectPath || redirectPath;
        stateProvider = stateData.provider || null;
      } catch {
        validUserId = decodeURIComponent(stateUserId);
      }

      // Provider may arrive via query (?provider=) or via state payload.
      // State takes precedence so the right token endpoint is used on callback.
      const callbackProvider = (stateProvider || provider || 'google') as 'google' | 'microsoft';
      const validCallbackProvider = providerSchema.parse(callbackProvider);

      const auth0IdPattern = /^[a-zA-Z0-9-]+\|[a-zA-Z0-9]+$/;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const devIdPattern = /^[a-zA-Z0-9-]{3,50}$/;
      
      if (!auth0IdPattern.test(validUserId) && !uuidPattern.test(validUserId) && !devIdPattern.test(validUserId)) {
        throw new Error('Invalid user ID format in state');
      }

      let tokenUrl = '';
      let clientId = '';
      let clientSecret = '';
      const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-auth`;

      if (validCallbackProvider === 'google') {
        tokenUrl = 'https://oauth2.googleapis.com/token';
        clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
        clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';
      } else if (validCallbackProvider === 'microsoft') {
        tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        clientId = Deno.env.get('MICROSOFT_CALENDAR_CLIENT_ID') ?? '';
        clientSecret = Deno.env.get('MICROSOFT_CALENDAR_CLIENT_SECRET') ?? '';
      }

      // Exchange code for tokens
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();
      console.log('[calendar-auth] Token exchange status:', tokenResponse.status, 'has_access:', !!tokens.access_token, 'has_refresh:', !!tokens.refresh_token);

      if (!tokens.access_token) {
        console.error('[calendar-auth] Token error:', JSON.stringify(tokens));
        const frontendUrl = Deno.env.get('FRONTEND_URL');
        const errorRedirect = `${frontendUrl}${redirectPath}?calendar_error=token_exchange_failed`;
        return new Response(null, { status: 302, headers: { 'Location': errorRedirect } });
      }

      // CRITICAL: Warn if no refresh token (Google only sends it on first consent)
      if (!tokens.refresh_token) {
        console.warn('[calendar-auth] ⚠️ no_refresh_token_on_connect – user may have previously consented without revocation. Token refresh will not be possible.');
      }

      const encKeyB64 = Deno.env.get('TOKEN_ENC_KEY_B64');
      if (!encKeyB64) {
        throw new Error('Encryption key not configured');
      }

      // Encrypt access token (with its own IV)
      const { ivB64: accessIv, ctB64: accessTokenEnc } = await encryptJson({ token: tokens.access_token }, encKeyB64);
      
      // Encrypt refresh token separately (with its own IV) – only if present
      let refreshTokenEnc: string | null = null;
      let refreshIv: string | null = null;
      if (tokens.refresh_token) {
        const { ivB64: rIv, ctB64 } = await encryptJson({ token: tokens.refresh_token }, encKeyB64);
        refreshTokenEnc = ctB64;
        refreshIv = rIv;
      }

      const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // calendar_connections is unique on (user_id, provider) — users may connect both Google and Microsoft.
      // Look up the row for this specific provider; insert if missing, update if present.
      const { data: existingConn } = await supabaseAdmin
        .from('calendar_connections')
        .select('id, refresh_token_enc, refresh_token_iv')
        .eq('user_id', validUserId)
        .eq('provider', validCallbackProvider)
        .maybeSingle();

      if (existingConn) {
        const updatePayload: Record<string, unknown> = {
          access_token_enc: accessTokenEnc,
          token_iv: accessIv,
          token_enc_v: 1,
          token_expires_at: tokenExpiresAt,
          is_active: true,
          updated_at: new Date().toISOString(),
        };

        // Only overwrite refresh token if a new one was returned (Google may not return one on re-consent).
        if (refreshTokenEnc && refreshIv) {
          updatePayload.refresh_token_enc = refreshTokenEnc;
          updatePayload.refresh_token_iv = refreshIv;
          console.log('[calendar-auth] Stored new refresh token for user:', redactUserId(validUserId));
        } else {
          console.log('[calendar-auth] Preserved existing refresh token for user:', redactUserId(validUserId));
        }

        const { error: updateError } = await supabaseAdmin
          .from('calendar_connections')
          .update(updatePayload)
          .eq('id', existingConn.id);

        if (updateError) throw new Error(updateError.message || 'Failed to update connection');
        console.log('[calendar-auth] Updated connection:', existingConn.id);
      } else {
        const { error: insertError } = await supabaseAdmin
          .from('calendar_connections')
          .insert({
            user_id: validUserId,
            provider: validCallbackProvider,
            access_token_enc: accessTokenEnc,
            refresh_token_enc: refreshTokenEnc,
            token_iv: accessIv,
            refresh_token_iv: refreshIv,
            token_enc_v: 1,
            token_expires_at: tokenExpiresAt,
            is_active: true,
          });

        if (insertError) throw new Error(insertError.message || 'Failed to create connection');
        console.log('[calendar-auth] Created new connection for user:', redactUserId(validUserId));
      }

      const frontendUrl = Deno.env.get('FRONTEND_URL');
      if (!frontendUrl) throw new Error('FRONTEND_URL not configured');
      const cleanFrontendUrl = frontendUrl.replace(/\/$/, '');
      const cleanRedirectPath = redirectPath && redirectPath.startsWith('/') ? redirectPath : '/profile';
      const redirectUrl = `${cleanFrontendUrl}/oauth-done?calendar_connected=true&provider=${validCallbackProvider}&redirectPath=${encodeURIComponent(cleanRedirectPath)}`;

      // Fire-and-forget: register the Google push-notification watch channel for this user.
      // Failure is non-fatal — the daily cron will pick it up.
      const supaUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (supaUrl && serviceKey && (validCallbackProvider === 'google' || validCallbackProvider === 'microsoft')) {
        fetch(`${supaUrl}/functions/v1/register-calendar-watch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ userId: validUserId, provider: validCallbackProvider }),
        }).then(async (r) => {
          const txt = await r.text();
          console.log('[calendar-auth] register-calendar-watch enqueued user:', redactUserId(validUserId), 'status:', r.status, txt.slice(0, 200));
        }).catch((err) => {
          console.warn('[calendar-auth] register-calendar-watch enqueue failed (non-fatal):', err);
        });
      }

      return new Response(null, { status: 302, headers: { 'Location': redirectUrl } });

    } else if (action === 'disconnect') {
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: 'Authentication required for disconnect action' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Idempotent disconnect: set inactive + clear token fields
      const { error } = await supabaseAdmin
        .from('calendar_connections')
        .update({
          is_active: false,
          access_token_enc: null,
          refresh_token_enc: null,
          token_iv: null,
          refresh_token_iv: null,
          token_expires_at: null,
        })
        .eq('user_id', authenticatedUserId)
        .eq('provider', validProvider);

      if (error) throw error;

      // Apple: also purge events because there's no upstream we can re-sync from
      // without the user re-granting permission on device.
      if (validProvider === 'apple') {
        const { error: delErr } = await supabaseAdmin
          .from('calendar_events')
          .delete()
          .eq('user_id', authenticatedUserId)
          .eq('provider', 'apple');
        if (delErr) {
          console.warn('[calendar-auth] Apple events purge warning (non-fatal):', delErr.message);
        }
      }

      console.log('[calendar-auth] Disconnected provider:', validProvider, 'user:', redactUserId(authenticatedUserId));

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('[calendar-auth] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
