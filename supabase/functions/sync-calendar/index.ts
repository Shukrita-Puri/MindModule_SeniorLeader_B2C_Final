import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      console.error('[sync-calendar] Userinfo error:', userInfoResponse.status, errorText);
      throw new Error('Token verification failed');
    }

    const userInfo = await userInfoResponse.json();
    console.log('[sync-calendar] Token verified via userinfo, user:', userInfo.sub);
    
    if (!userInfo.sub) {
      throw new Error('Token missing sub claim');
    }

    return userInfo.sub;
  } catch (error) {
    console.error('[sync-calendar] Token verification failed:', error);
    throw new Error('Invalid or expired token');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify JWT token and extract user ID - no longer trust client-provided userId
    const authHeader = req.headers.get('Authorization');
    let userId: string;
    
    try {
      userId = await verifyAuth0Token(authHeader);
      console.log('[sync-calendar] Authenticated user:', userId);
    } catch (error) {
      console.error('[sync-calendar] Authentication failed:', error);
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate provider from request body
    const providerSchema = z.object({
      provider: z.enum(['google', 'outlook']),
    });

    const body = await req.json();
    const { provider } = providerSchema.parse(body);

    console.log('[sync-calendar] Starting sync for user:', userId, 'provider:', provider);

    // Use service role for all operations since we're using Auth0 authentication
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get calendar connection
    const { data: connection, error: connectionError } = await serviceClient
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();

    if (connectionError || !connection) {
      console.error('[sync-calendar] Connection not found:', connectionError);
      return new Response(
        JSON.stringify({ error: 'Calendar connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[sync-calendar] Found connection:', connection.id, 'last_sync:', connection.last_sync);

    // Retrieve decrypted access token from vault
    let accessToken: string | null = null;
    
    if (connection.encrypted_access_token_id) {
      const { data: vaultToken, error: vaultError } = await serviceClient
        .from('vault.decrypted_secrets')
        .select('decrypted_secret')
        .eq('id', connection.encrypted_access_token_id)
        .single();
      
      if (!vaultError && vaultToken) {
        accessToken = vaultToken.decrypted_secret;
      }
    }

    if (!accessToken) {
      console.error('[sync-calendar] Failed to retrieve access token from vault');
      return new Response(
        JSON.stringify({ error: 'Failed to retrieve calendar access token. Please reconnect your calendar.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired and refresh if needed
    const tokenExpiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const now = new Date();
    
    if (tokenExpiresAt && tokenExpiresAt <= now) {
      console.log('[sync-calendar] Token expired, attempting refresh...');
      
      // Get refresh token from vault
      let refreshToken: string | null = null;
      
      if (connection.encrypted_refresh_token_id) {
        const { data: vaultRefresh } = await serviceClient
          .from('vault.decrypted_secrets')
          .select('decrypted_secret')
          .eq('id', connection.encrypted_refresh_token_id)
          .single();
        
        if (vaultRefresh) {
          refreshToken = vaultRefresh.decrypted_secret;
        }
      }

      if (!refreshToken) {
        console.error('[sync-calendar] No refresh token available in vault');
        return new Response(
          JSON.stringify({ error: 'Token expired and no refresh token available. Please reconnect your calendar.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Refresh the token
      if (provider === 'google') {
        const clientId = Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID');
        const clientSecret = Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET');
        
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId!,
            client_secret: clientSecret!,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        const refreshData = await refreshResponse.json();
        
        if (refreshData.error) {
          console.error('[sync-calendar] Token refresh failed:', refreshData.error);
          return new Response(
            JSON.stringify({ error: 'Failed to refresh token. Please reconnect your calendar.' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        accessToken = refreshData.access_token;
        const newExpiresAt = new Date(Date.now() + (refreshData.expires_in * 1000));
        
        // Store refreshed token securely in vault
        const { error: storeError } = await serviceClient.rpc('store_calendar_access_token', {
          _connection_id: connection.id,
          _token: accessToken
        });
        
        if (storeError) {
          console.error('[sync-calendar] Failed to store refreshed token in vault:', storeError);
        }
        
        // Update expiration time
        await serviceClient
          .from('calendar_connections')
          .update({ token_expires_at: newExpiresAt.toISOString() })
          .eq('id', connection.id);
        
        console.log('[sync-calendar] Token refreshed and stored in vault, expires:', newExpiresAt.toISOString());
      }
    }

    let events: any[] = [];
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (provider === 'google') {
      console.log('[sync-calendar] Fetching Google Calendar events...');
      
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${nextWeek.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[sync-calendar] Google API error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch calendar events from Google' }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log('[sync-calendar] Google returned', data.items?.length || 0, 'events');
      
      if (data.items) {
        events = data.items.map((event: any) => ({
          external_id: event.id,
          title: event.summary || 'Untitled Event',
          start_time: event.start.dateTime || event.start.date,
          end_time: event.end.dateTime || event.end.date,
          is_organizer: event.organizer?.self || false,
          attendees_count: event.attendees?.length || 0,
          is_recurring: !!event.recurringEventId,
          event_metadata: {
            location: event.location,
            description: event.description,
            hangoutLink: event.hangoutLink,
          },
        }));
      }
    } else if (provider === 'outlook') {
      console.log('[sync-calendar] Fetching Outlook Calendar events...');
      
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}&$orderby=start/dateTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[sync-calendar] Outlook API error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch calendar events from Outlook' }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log('[sync-calendar] Outlook returned', data.value?.length || 0, 'events');
      
      if (data.value) {
        events = data.value.map((event: any) => ({
          external_id: event.id,
          title: event.subject || 'Untitled Event',
          start_time: event.start.dateTime,
          end_time: event.end.dateTime,
          is_organizer: event.isOrganizer || false,
          attendees_count: event.attendees?.length || 0,
          is_recurring: !!event.recurrence,
          event_metadata: {
            location: event.location?.displayName,
            body: event.bodyPreview,
            webLink: event.webLink,
          },
        }));
      }
    }

    // Classify events automatically
    const classifiedEvents = events.map(event => {
      const title = event.title.toLowerCase();
      let eventType = 'meeting';
      let isHighStakes = false;
      
      // Auto-classification logic
      if (title.includes('board') || title.includes('executive')) {
        eventType = 'board-meeting';
        isHighStakes = true;
      } else if (title.includes('presentation') || title.includes('demo') || title.includes('pitch')) {
        eventType = 'presentation';
        isHighStakes = true;
      } else if (title.includes('client') || title.includes('customer')) {
        eventType = 'client-call';
        isHighStakes = event.attendees_count > 5;
      } else if (title.includes('interview')) {
        eventType = 'interview';
        isHighStakes = true;
      } else if (title.includes('1:1') || title.includes('one-on-one')) {
        eventType = 'one-on-one';
      } else if (title.includes('focus') || title.includes('deep work')) {
        eventType = 'deep-work';
      } else if (title.includes('exam') || title.includes('test')) {
        eventType = 'exam';
        isHighStakes = true;
      } else if (title.includes('deadline') || title.includes('submission')) {
        eventType = 'deadline';
        isHighStakes = true;
      }

      return {
        ...event,
        user_id: userId,
        event_metadata: {
          ...event.event_metadata,
          eventType,
          isHighStakes,
        },
      };
    });

    console.log('[sync-calendar] Classified', classifiedEvents.length, 'events');

    // Delete existing events for this user
    const { error: deleteError } = await serviceClient
      .from('calendar_events')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('[sync-calendar] Error deleting old events:', deleteError);
    }

    // Insert new events
    if (classifiedEvents.length > 0) {
      const { error: insertError } = await serviceClient
        .from('calendar_events')
        .insert(classifiedEvents);

      if (insertError) {
        console.error('[sync-calendar] Error inserting events:', insertError);
        throw insertError;
      }
    }

    // Update last_sync timestamp
    const { error: updateError } = await serviceClient
      .from('calendar_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider);

    if (updateError) {
      console.error('[sync-calendar] Error updating last_sync:', updateError);
    }

    console.log('[sync-calendar] Sync complete! Events:', classifiedEvents.length);

    return new Response(
      JSON.stringify({ 
        success: true, 
        eventCount: classifiedEvents.length,
        lastSync: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-calendar] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
