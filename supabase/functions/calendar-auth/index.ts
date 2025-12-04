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
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&state=${encodeURIComponent(userId)}`;
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
      console.log('[calendar-auth] Token response status:', tokenResponse.status);
      console.log('[calendar-auth] Tokens received:', tokens.access_token ? 'yes' : 'no', 'error:', tokens.error);

      if (!tokens.access_token) {
        console.error('[calendar-auth] Token error details:', JSON.stringify(tokens));
        throw new Error(tokens.error_description || tokens.error || 'Failed to get access token');
      }

      // Store tokens directly in calendar_connections table
      const { error: insertError } = await supabaseClient
        .from('calendar_connections')
        .upsert({
          user_id: state,
          provider: validProvider,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          is_active: true,
        });

      if (insertError) {
        console.error('Error storing calendar connection:', insertError);
        throw insertError;
      }

      console.log('[calendar-auth] Calendar connection stored successfully for user:', state);

      // Return HTML page that sends postMessage to parent window and closes popup
      const successHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Calendar Connected</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f7fa}
.box{text-align:center;padding:2rem;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.1)}
h1{color:#22c55e;margin:0 0 0.5rem}
p{color:#666;margin:0}
</style>
</head>
<body>
<div class="box">
<h1>Connected!</h1>
<p>Closing...</p>
</div>
<script>
(function(){
  var msg={type:'calendar_connected',success:true};
  if(window.opener){window.opener.postMessage(msg,'*');setTimeout(function(){window.close()},1000);}
  else if(window.parent!==window){window.parent.postMessage(msg,'*');}
  else{window.location.href='/onboarding/context-connection?calendar_connected=true';}
})();
</script>
</body>
</html>`;

      return new Response(successHtml, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
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
