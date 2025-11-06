import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const action = url.searchParams.get('action');
    const provider = url.searchParams.get('provider'); // 'google' or 'outlook'

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    if (action === 'connect') {
      // Step 1: Generate OAuth URL
      let authUrl = '';
      let clientId = '';
      let redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-auth?action=callback&provider=${provider}`;

      if (provider === 'google') {
        clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
        const scope = 'https://www.googleapis.com/auth/calendar.readonly';
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&state=${user.id}`;
      } else if (provider === 'outlook') {
        clientId = Deno.env.get('OUTLOOK_CLIENT_ID') ?? '';
        const scope = 'Calendars.Read offline_access';
        authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${user.id}`;
      }

      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (action === 'callback') {
      // Step 2: Handle OAuth callback
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state'); // userId
      
      if (!code || !state) {
        throw new Error('Missing code or state');
      }

      let tokenUrl = '';
      let clientId = '';
      let clientSecret = '';
      let redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-auth?action=callback&provider=${provider}`;

      if (provider === 'google') {
        tokenUrl = 'https://oauth2.googleapis.com/token';
        clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
        clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
      } else if (provider === 'outlook') {
        tokenUrl = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
        clientId = Deno.env.get('OUTLOOK_CLIENT_ID') ?? '';
        clientSecret = Deno.env.get('OUTLOOK_CLIENT_SECRET') ?? '';
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

      // Store tokens in database
      const { error: insertError } = await supabaseClient
        .from('calendar_connections')
        .upsert({
          user_id: state,
          provider: provider,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          is_active: true,
        });

      if (insertError) {
        console.error('Error storing calendar connection:', insertError);
        throw insertError;
      }

      // Trigger initial sync
      await supabaseClient.functions.invoke('sync-calendar', {
        body: { userId: state, provider }
      });

      // Redirect back to app with success
      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': `${Deno.env.get('SUPABASE_URL')?.replace('/functions/v1', '')}/executive-home?calendar_connected=true`,
        },
      });
    } else if (action === 'disconnect') {
      // Disconnect calendar
      const { error } = await supabaseClient
        .from('calendar_connections')
        .update({ is_active: false })
        .eq('user_id', user.id)
        .eq('provider', provider);

      if (error) throw error;

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
