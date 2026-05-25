import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { collapseDuplicateEvents, periodFor } from "../_shared/rules/calendarEvents.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-dev-user-id, x-user-tz-offset, x-client-platform',
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

    // Compute a Today (start of local day) → end of Tomorrow window so the
    // picker shows every still-relevant event, not a rolling 24h slice that
    // chops the afternoon as the day progresses.
    const offsetParam = req.headers.get('x-user-tz-offset');
    const offsetMinutes = offsetParam != null && offsetParam !== ''
      ? Number(offsetParam)
      : new Date().getTimezoneOffset();
    const nowUtc = new Date();
    // Local time = utc - offset (offset is minutes WEST of UTC, like JS getTimezoneOffset).
    const localNow = new Date(nowUtc.getTime() - offsetMinutes * 60 * 1000);
    const localStartOfToday = new Date(localNow);
    localStartOfToday.setHours(0, 0, 0, 0);
    const localEndOfTomorrow = new Date(localStartOfToday);
    localEndOfTomorrow.setDate(localEndOfTomorrow.getDate() + 2); // exclusive upper bound
    // Convert local boundaries back to UTC for the DB query.
    const windowStartUtc = new Date(localStartOfToday.getTime() + offsetMinutes * 60 * 1000);
    const windowEndUtc = new Date(localEndOfTomorrow.getTime() + offsetMinutes * 60 * 1000);

    async function queryTable(table: string): Promise<CalendarEventRow[]> {
      const { data, error } = await supabase
        .from(table)
        .select('id, title, start_time, end_time, provider, is_organizer, attendees_count, is_recurring')
        .eq('user_id', userId)
        .gte('start_time', windowStartUtc.toISOString())
        .lt('start_time', windowEndUtc.toISOString())
        .order('start_time', { ascending: true });
      if (error) {
        console.warn(`[list-replacement-calendar-events] ${table} query error:`, error.message);
        return [];
      }
      return (data || []) as CalendarEventRow[];
    }

    // Always query the raw calendar_events (all providers, all calendars) so we
    // can apply our shared dedupe rule rather than relying on the provider-
    // primacy view which silently drops Apple-mirrored copies on web.
    const rows = await queryTable('calendar_events');

    const rawEvents = rows
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

    // Same event across multiple calendars => keep only one row.
    const platform = (req.headers.get('x-client-platform') || 'web').toLowerCase().includes('ios')
      ? 'ios' : 'web';
    const deduped = collapseDuplicateEvents(rawEvents, platform as 'ios' | 'web');

    // Tag each event with its local-day bucket (today/tomorrow) and period.
    const todayKey = `${localStartOfToday.getFullYear()}-${localStartOfToday.getMonth()}-${localStartOfToday.getDate()}`;
    const nowMs = nowUtc.getTime();
    const events = deduped
      .map((e) => {
        const localStart = new Date(new Date(e.startTime).getTime() - offsetMinutes * 60 * 1000);
        const key = `${localStart.getFullYear()}-${localStart.getMonth()}-${localStart.getDate()}`;
        return {
          ...e,
          dayBucket: (key === todayKey ? 'today' : 'tomorrow') as 'today' | 'tomorrow',
          period: periodFor(localStart),
        };
      })
      // Cross-cutting rule: only show events that haven't ended yet.
      // Today: drop anything whose end_time is in the past.
      // Tomorrow: always future, kept as-is.
      .filter((e) => {
        if (e.dayBucket !== 'today') return true;
        const endMs = new Date(e.endTime).getTime();
        return Number.isFinite(endMs) && endMs > nowMs;
      });

    console.log(`[list-replacement-calendar-events] user=${userId} raw=${rawEvents.length} deduped=${events.length}`);

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