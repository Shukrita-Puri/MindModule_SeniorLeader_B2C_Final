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
    // Validate input
    const requestSchema = z.object({
      provider: z.enum(['google', 'outlook']),
    });

    const body = await req.json();
    const { provider } = requestSchema.parse(body);

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get authenticated user
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      throw new Error('Not authenticated');
    }

    const userId = user.id;

    // Get calendar connection
    const { data: connection, error: connectionError } = await supabaseClient
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();

    if (connectionError || !connection) {
      throw new Error('Calendar connection not found');
    }

    // Switch to service role for vault access
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Retrieve decrypted access token from vault
    const { data: accessToken, error: tokenError } = await serviceClient
      .rpc('get_calendar_access_token', { _connection_id: connection.id });

    if (tokenError || !accessToken) {
      throw new Error('Failed to retrieve calendar access token');
    }

    let events: any[] = [];
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (provider === 'google') {
      // Fetch Google Calendar events
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${nextWeek.toISOString()}&singleEvents=true&orderBy=startTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      
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
      // Fetch Outlook Calendar events
      const response = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${now.toISOString()}&endDateTime=${nextWeek.toISOString()}&$orderby=start/dateTime`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const data = await response.json();
      
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

    // Delete existing events for this user
    await serviceClient
      .from('calendar_events')
      .delete()
      .eq('user_id', userId);

    // Insert new events
    const { error: insertError } = await serviceClient
      .from('calendar_events')
      .insert(classifiedEvents);

    if (insertError) {
      throw insertError;
    }

    // Update last_sync timestamp
    await serviceClient
      .from('calendar_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider);

    return new Response(
      JSON.stringify({ success: true, eventCount: classifiedEvents.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
