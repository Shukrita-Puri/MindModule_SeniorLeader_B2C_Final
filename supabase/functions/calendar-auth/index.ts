import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    
    // Create Supabase client with user's auth token for authenticated requests
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
    
    // For connect/disconnect actions, require authentication and get userId from JWT
    let authenticatedUserId: string | null = null;
    
    if (req.method === 'POST') {
      const body = await req.json();
      action = body.action || action;
      provider = body.provider || provider;
      
      // For POST requests (connect/disconnect), extract user from JWT - DO NOT trust client-provided userId
      if (authHeader) {
        const supabaseUser = createClient(
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_ANON_KEY') ?? '',
          { global: { headers: { Authorization: authHeader } } }
        );
        
        const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
        if (userError || !user) {
          console.error('[calendar-auth] Auth error:', userError);
          return new Response(
            JSON.stringify({ error: 'Unauthorized - valid authentication required' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        authenticatedUserId = user.id;
      } else {
        return new Response(
          JSON.stringify({ error: 'Unauthorized - missing authorization header' }),
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
        // Pass authenticated userId in state for OAuth callback
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(authenticatedUserId)}`;
        console.log('[calendar-auth] Generated OAuth URL for authenticated user:', authenticatedUserId);
      }

      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'callback' || url.searchParams.get('code')) {
      // Step 2: Handle OAuth callback - userId comes from state parameter (set during connect)
      const code = url.searchParams.get('code');
      
      if (!code || !stateUserId) {
        throw new Error('Missing code or state');
      }

      // Validate the userId from state is a valid UUID format
      const uuidSchema = z.string().uuid();
      const validUserId = uuidSchema.parse(stateUserId);

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

      // Store tokens securely in Vault using RPC functions
      // First, check if connection exists
      const { data: existingConn } = await supabaseAdmin
        .from('calendar_connections')
        .select('id')
        .eq('user_id', validUserId)
        .single();

      if (existingConn) {
        // Update existing connection - store tokens in vault
        const { error: accessTokenError } = await supabaseAdmin.rpc('store_calendar_access_token', {
          _connection_id: existingConn.id,
          _token: tokens.access_token
        });
        
        if (accessTokenError) {
          console.error('[calendar-auth] Error storing access token in vault:', accessTokenError);
        }

        if (tokens.refresh_token) {
          const { error: refreshTokenError } = await supabaseAdmin.rpc('store_calendar_refresh_token', {
            _connection_id: existingConn.id,
            _token: tokens.refresh_token
          });
          
          if (refreshTokenError) {
            console.error('[calendar-auth] Error storing refresh token in vault:', refreshTokenError);
          }
        }

        // Update connection metadata (without plaintext tokens)
        const { error: updateError } = await supabaseAdmin
          .from('calendar_connections')
          .update({
            provider: validProvider,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingConn.id);

        if (updateError) {
          console.error('[calendar-auth] Error updating calendar connection:', updateError);
          throw new Error(updateError.message || 'Failed to update calendar connection');
        }
      } else {
        // Create new connection record first (without tokens)
        const { data: newConn, error: insertError } = await supabaseAdmin
          .from('calendar_connections')
          .insert({
            user_id: validUserId,
            provider: validProvider,
            token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
            is_active: true,
          })
          .select('id')
          .single();

        if (insertError || !newConn) {
          console.error('[calendar-auth] Error creating calendar connection:', insertError);
          throw new Error(insertError?.message || 'Failed to create calendar connection');
        }

        // Now store tokens in vault
        const { error: accessTokenError } = await supabaseAdmin.rpc('store_calendar_access_token', {
          _connection_id: newConn.id,
          _token: tokens.access_token
        });
        
        if (accessTokenError) {
          console.error('[calendar-auth] Error storing access token in vault:', accessTokenError);
        }

        if (tokens.refresh_token) {
          const { error: refreshTokenError } = await supabaseAdmin.rpc('store_calendar_refresh_token', {
            _connection_id: newConn.id,
            _token: tokens.refresh_token
          });
          
          if (refreshTokenError) {
            console.error('[calendar-auth] Error storing refresh token in vault:', refreshTokenError);
          }
        }
      }

      console.log('[calendar-auth] Calendar connection stored securely for user:', validUserId);

      // Redirect back to the app with success parameter
      const frontendUrl = Deno.env.get('FRONTEND_URL') || 'https://5bd59ee0-ab8c-409f-bc56-72fe64069377.lovableproject.com';
      const redirectUrl = `${frontendUrl}/onboarding/context-connection?calendar_connected=true`;
      
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
