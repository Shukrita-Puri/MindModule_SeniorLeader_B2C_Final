import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dev-user-id',
};

interface CalendarEventRow {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  provider?: string | null;
  is_organizer?: boolean | null;
  attendees_count?: number | null;
  is_recurring?: boolean | null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let userId: string | null = null;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      const env = Deno.env.get('ENVIRONMENT') || '';
      if (env !== 'production') {
        const devHeader = req.headers.get('x-dev-user-id');
        if (devHeader) userId = devHeader;
        else return auth.errorResponse;
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date();
    const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    async function queryTable(table: string): Promise<CalendarEventRow[]> {
      const { data, error } = await supabase
        .from(table)
        .select('id, title, start_time, end_time, provider, is_organizer, attendees_count, is_recurring')
        .eq('user_id', userId)
        .gte('start_time', now.toISOString())
        .lt('start_time', horizon.toISOString())
        .order('start_time', { ascending: true });
      if (error) {
        console.warn(`[list-replacement-calendar-events] ${table} query error:`, error.message);
        return [];
      }
      return (data || []) as CalendarEventRow[];
    }

    // Try primary, then fall back to web_primary, then legacy calendar_events.
    let rows = await queryTable('primary_calendar_events');
    if (rows.length === 0) rows = await queryTable('web_primary_calendar_events');
    if (rows.length === 0) rows = await queryTable('calendar_events');

    const events = rows
      .filter((r) => r?.id && r?.title && r?.start_time && r?.end_time)
      .map((r) => ({
        id: String(r.id),
        title: String(r.title),
        startTime: String(r.start_time),
        endTime: String(r.end_time),
        provider: r.provider ?? null,
        attendeesCount: r.attendees_count ?? null,
        isOrganizer: r.is_organizer ?? null,
        isRecurring: r.is_recurring ?? null,
      }));

    console.log(`[list-replacement-calendar-events] user=${userId} returned=${events.length}`);

    return new Response(JSON.stringify({ events }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (err) {
    console.error('[list-replacement-calendar-events] fatal:', err);
    return new Response(JSON.stringify({ events: [], error: 'internal_error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});