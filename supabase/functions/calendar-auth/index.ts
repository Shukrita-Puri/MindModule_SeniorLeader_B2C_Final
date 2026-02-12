import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const key = await crypto.subtle.importKey("raw", keyBytes.buffer as ArrayBuffer, "AES-GCM", false, ["encrypt"]);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)
  );

  return { ivB64: bytesToB64(iv), ctB64: bytesToB64(ciphertext) };
}

// Verify Auth0 token using the userinfo endpoint (works with both JWT and opaque tokens)
async function verifyAuth0Token(authHeader: string | null): Promise<string> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('VITE_AUTH0_DOMAIN');
  
  if (!auth0Domain) {
    throw new Error('Auth0 domain not configured');
  }

  try {
    // Use Auth0's userinfo endpoint to verify token and get user info
    // This works with both JWT tokens (RS256/HS256) and opaque access tokens
    const userInfoResponse = await fetch(`https://${auth0Domain}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!userInfoResponse.ok) {
      const errorText = await userInfoResponse.text();
      console.error('[calendar-auth] Userinfo error:', userInfoResponse.status, errorText);
      throw new Error('Token verification failed');
    }

    const userInfo = await userInfoResponse.json();
    console.log('[calendar-auth] Token verified via userinfo, user:', userInfo.sub);
    
    if (!userInfo.sub) {
      throw new Error('Token missing sub claim');
    }

    return userInfo.sub;
  } catch (error) {
    console.error('[calendar-auth] Token verification failed:', error);
    throw new Error('Invalid or expired token');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const authHeader = req.headers.get('Authorization');
    
    // Use service role client for database operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // For callback action (OAuth redirect), read from URL params - this is the only unauthenticated path
    let action = url.searchParams.get('action');
    let provider = url.searchParams.get('provider');
    
    // State contains the userId for OAuth callback (passed during OAuth initiation)
    const stateUserId = url.searchParams.get('state');
    
    // For connect/disconnect actions, verify JWT and extract user ID
    let authenticatedUserId: string | null = null;
    
    if (req.method === 'POST') {
      const body = await req.json();
      action = body.action || action;
      provider = body.provider || provider;
      
      // Verify token and extract user ID
      try {
        authenticatedUserId = await verifyAuth0Token(authHeader);
        console.log('[calendar-auth] Authenticated user:', authenticatedUserId);
      } catch (error) {
        console.error('[calendar-auth] Authentication failed:', error);
        return new Response(
          JSON.stringify({ error: 'Authentication required' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // Default provider to Google when not explicitly provided
    provider = provider || 'google';

    console.log('[calendar-auth] Action:', action, 'Provider:', provider, 'AuthenticatedUserId:', authenticatedUserId);

    // Validate input
    const providerSchema = z.enum(['google', 'outlook']);
    const validProvider = providerSchema.parse(provider);

    if (action === 'connect') {
      // Step 1: Generate OAuth URL - requires authenticated user
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: 'Authentication required for connect action' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      let authUrl = '';
      let clientId = '';
      let redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-auth`;

      if (validProvider === 'google') {
        clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
        if (!clientId) {
          throw new Error('Google Calendar Client ID not configured');
        }
        const scope = 'https://www.googleapis.com/auth/calendar.readonly';
        // Encode userId + redirectPath in state for OAuth callback
        const statePayload = JSON.stringify({ userId: authenticatedUserId, redirectPath: body?.redirectPath || '/onboarding/context-connection' });
        const encodedState = btoa(statePayload);
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(encodedState)}`;
        console.log('[calendar-auth] Generated OAuth URL for authenticated user:', authenticatedUserId);
      }

      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'callback' || url.searchParams.get('code')) {
      // Step 2: Handle OAuth callback - userId + redirectPath come from state parameter
      const code = url.searchParams.get('code');
      
      if (!code || !stateUserId) {
        throw new Error('Missing code or state');
      }

      // Parse state: try new JSON format first, fall back to plain userId for backward compat
      let validUserId: string;
      let redirectPath = '/onboarding/context-connection';
      
      try {
        const stateData = JSON.parse(atob(decodeURIComponent(stateUserId)));
        validUserId = stateData.userId;
        redirectPath = stateData.redirectPath || redirectPath;
        console.log('[calendar-auth] Parsed state JSON, userId:', validUserId, 'redirectPath:', redirectPath);
      } catch {
        // Backward compatibility: state is just the userId string
        validUserId = decodeURIComponent(stateUserId);
        console.log('[calendar-auth] Legacy state format, userId:', validUserId);
      }

      // Validate the userId - accepts Auth0 format or UUID
      const auth0IdPattern = /^[a-zA-Z0-9-]+\|[a-zA-Z0-9]+$/;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (!auth0IdPattern.test(validUserId) && !uuidPattern.test(validUserId)) {
        throw new Error('Invalid user ID format in state');
      }

      let tokenUrl = '';
      let clientId = '';
      let clientSecret = '';
      let redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-auth`;

      if (validProvider === 'google') {
        tokenUrl = 'https://oauth2.googleapis.com/token';
        clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') ?? '';
        clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') ?? '';
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
      console.log('[calendar-auth] Token response status:', tokenResponse.status);
      console.log('[calendar-auth] Tokens received:', tokens.access_token ? 'yes' : 'no', 'error:', tokens.error);

      if (!tokens.access_token) {
        console.error('[calendar-auth] Token error details:', JSON.stringify(tokens));
        throw new Error(tokens.error_description || tokens.error || 'Failed to get access token');
      }

      // Get encryption key from environment
      const encKeyB64 = Deno.env.get('TOKEN_ENC_KEY_B64');
      if (!encKeyB64) {
        console.error('[calendar-auth] TOKEN_ENC_KEY_B64 not configured');
        throw new Error('Encryption key not configured');
      }

      // Encrypt tokens using AES-256-GCM
      const tokenPayload = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      };

      const { ivB64, ctB64: accessTokenEnc } = await encryptJson({ token: tokens.access_token }, encKeyB64);
      const { ctB64: refreshTokenEnc } = await encryptJson({ token: tokens.refresh_token || null }, encKeyB64);

      console.log('[calendar-auth] Tokens encrypted successfully');

      // Check if connection exists
      const { data: existingConn } = await supabaseAdmin
        .from('calendar_connections')
        .select('id')
        .eq('user_id', validUserId)
        .eq('provider', validProvider)
        .maybeSingle();

      if (existingConn) {
        // Update existing connection with encrypted tokens
        const { error: updateError } = await supabaseAdmin
          .from('calendar_connections')
          .update({
            access_token_enc: accessTokenEnc,
            refresh_token_enc: refreshTokenEnc,
            token_iv: ivB64,
            token_enc_v: 1,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConn.id);

        if (updateError) {
          console.error('[calendar-auth] Error updating calendar connection:', updateError);
          throw new Error(updateError.message || 'Failed to update calendar connection');
        }
        console.log('[calendar-auth] Updated existing connection:', existingConn.id);
      } else {
        // Create new connection with encrypted tokens
        const { error: insertError } = await supabaseAdmin
          .from('calendar_connections')
          .insert({
            user_id: validUserId,
            provider: validProvider,
            access_token_enc: accessTokenEnc,
            refresh_token_enc: refreshTokenEnc,
            token_iv: ivB64,
            token_enc_v: 1,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            is_active: true,
          });

        if (insertError) {
          console.error('[calendar-auth] Error creating calendar connection:', insertError);
          throw new Error(insertError.message || 'Failed to create calendar connection');
        }
        console.log('[calendar-auth] Created new connection for user:', validUserId);
      }

      console.log('[calendar-auth] Calendar connection stored with encrypted tokens for user:', validUserId);

      const frontendUrl = Deno.env.get('FRONTEND_URL');
      if (!frontendUrl) {
        throw new Error('FRONTEND_URL not configured');
      }
      const redirectUrl = `${frontendUrl}${redirectPath}?calendar_connected=true`;
      
      console.log('[calendar-auth] Redirecting to:', redirectUrl);

      return new Response(null, {
        status: 302,
        headers: { 
          'Location': redirectUrl,
        },
      });
    } else if (action === 'disconnect') {
      // Disconnect calendar - requires authenticated user
      if (!authenticatedUserId) {
        return new Response(
          JSON.stringify({ error: 'Authentication required for disconnect action' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const { error } = await supabaseAdmin
        .from('calendar_connections')
        .update({ is_active: false })
        .eq('user_id', authenticatedUserId)
        .eq('provider', validProvider);

      if (error) throw error;
      
      console.log('[calendar-auth] Disconnected calendar for authenticated user:', authenticatedUserId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('[calendar-auth] Error:', error);
    console.error('[calendar-auth] Error type:', typeof error);
    if (error instanceof Error) {
      console.error('[calendar-auth] Error message:', error.message);
      console.error('[calendar-auth] Error stack:', error.stack);
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
