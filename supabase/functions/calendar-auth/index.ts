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
    
    // For callback action, read from URL params
    let action = url.searchParams.get('action');
    let provider = url.searchParams.get('provider');
    let userId = url.searchParams.get('userId');
    
    // For connect/disconnect actions, read from request body
    if (req.method === 'POST') {
      const body = await req.json();
      action = body.action || action;
      provider = body.provider || provider;
      userId = body.userId || userId;
    }
    
    // Default provider to Google when not explicitly provided (e.g. OAuth callback)
    provider = provider || 'google';

    console.log('[calendar-auth] Action:', action, 'Provider:', provider, 'UserId:', userId);

    // Validate input
    const providerSchema = z.enum(['google', 'outlook']);
    const validProvider = providerSchema.parse(provider);

    // Use service role client for database operations since we're not using backend JWT
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    if (action === 'connect') {
      // Step 1: Generate OAuth URL
      if (!userId) {
        throw new Error('Missing user identifier for connect action');
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
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${userId}`;
        console.log('[calendar-auth] Generated OAuth URL for user:', userId);
      }

      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'callback' || url.searchParams.get('code')) {
      // Step 2: Handle OAuth callback
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state'); // userId
      
      if (!code || !state) {
        throw new Error('Missing code or state');
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

      if (!tokens.access_token) {
        throw new Error('Failed to get access token');
      }

      // Store tokens encrypted in vault
      // First, insert tokens into vault
      const { data: accessTokenVault, error: accessTokenError } = await supabaseClient
        .from('vault.secrets')
        .insert({
          secret: tokens.access_token,
          description: `Calendar access token for user ${state}`
        })
        .select('id')
        .single();

      if (accessTokenError) {
        console.error('Error storing access token in vault:', accessTokenError);
        throw new Error('Failed to encrypt access token');
      }

      let refreshTokenVaultId = null;
      if (tokens.refresh_token) {
        const { data: refreshTokenVault, error: refreshTokenError } = await supabaseClient
          .from('vault.secrets')
          .insert({
            secret: tokens.refresh_token,
            description: `Calendar refresh token for user ${state}`
          })
          .select('id')
          .single();

        if (refreshTokenError) {
          console.error('Error storing refresh token in vault:', refreshTokenError);
          throw new Error('Failed to encrypt refresh token');
        }
        refreshTokenVaultId = refreshTokenVault.id;
      }

      // Store connection with encrypted token references
      const { error: insertError } = await supabaseClient
        .from('calendar_connections')
        .upsert({
          user_id: state,
          provider: validProvider,
          encrypted_access_token_id: accessTokenVault.id,
          encrypted_refresh_token_id: refreshTokenVaultId,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          is_active: true,
        });

      if (insertError) {
        console.error('Error storing calendar connection:', insertError);
        throw insertError;
      }

      // Trigger initial sync
      await supabaseClient.functions.invoke('sync-calendar', {
        body: { provider: validProvider }
      });

      // Redirect back to app with success using FRONTEND_URL
      const baseUrl = Deno.env.get('FRONTEND_URL') || 'https://5bd59ee0-ab8c-409f-bc56-72fe64069377.lovableproject.com';
      
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': `${baseUrl}/onboarding/context-connection?calendar_connected=true`,
        },
      });
    } else if (action === 'disconnect') {
      // Disconnect calendar
      if (!userId) {
        throw new Error('Missing user identifier for disconnect action');
      }
      
      const { error } = await supabaseClient
        .from('calendar_connections')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('provider', validProvider);

      if (error) throw error;
      
      console.log('[calendar-auth] Disconnected calendar for user:', userId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error('Invalid action');
  } catch (error) {
    console.error('Calendar auth error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
