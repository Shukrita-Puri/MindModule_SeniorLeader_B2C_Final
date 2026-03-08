import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'TRACK_ENGAGEMENT' | 'GET_ENGAGEMENTS' | 'LOG_CHECKIN_SKIP' | 'SAVE_CHECKIN' | 'GET_RECENT_SANCTUARY_EVENTS' | 'GET_COMPLETION_COUNTS' | 'GET_SANCTUARY_DATA';
  eventType?: string;
  category?: string;
  contentId?: string;
  contentType?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
  days?: number;
  skipDate?: string;
  hasWearable?: boolean;
  hasCalendar?: boolean;
  checkinDate?: string;
  outcome?: string;
  skipped?: boolean;
  stateTags?: string[];
  energyBalance?: number;
  dataSources?: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    // Parse request body
    const body: RequestBody = await req.json();
    const { action } = body;

    console.log('[user-events] Action:', action, 'User:', userId);

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    switch (action) {
      case 'TRACK_ENGAGEMENT': {
        const { eventType, category, contentId, contentType, timestamp, metadata } = body;
        
        if (!eventType) {
          return new Response(
            JSON.stringify({ success: false, error: 'eventType is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { error } = await supabase
          .from('user_engagements')
          .insert({
            user_id: userId,
            event_type: eventType,
            category: category || null,
            content_id: contentId || null,
            content_type: contentType || null,
            timestamp: timestamp || new Date().toISOString(),
            metadata: metadata || {}
          });

        if (error) {
          console.error('[user-events] Error tracking engagement:', error);
          throw error;
        }

        console.log('[user-events] Engagement tracked:', eventType);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_ENGAGEMENTS': {
        const { days } = body;
        const daysToQuery = days || 30;
        
        const since = new Date();
        since.setDate(since.getDate() - daysToQuery);

        const { data, error } = await supabase
          .from('user_engagements')
          .select('*')
          .eq('user_id', userId)
          .gte('timestamp', since.toISOString())
          .order('timestamp', { ascending: false });

        if (error) {
          console.error('[user-events] Error fetching engagements:', error);
          throw error;
        }

        console.log('[user-events] Found engagements:', data?.length || 0);
        return new Response(
          JSON.stringify({ success: true, data: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'LOG_CHECKIN_SKIP': {
        const { skipDate, hasWearable, hasCalendar } = body;
        const dateToLog = skipDate || new Date().toISOString().split('T')[0];

        const { error } = await supabase
          .from('checkin_skip_events')
          .insert({
            user_id: userId,
            skip_date: dateToLog,
            has_wearable: hasWearable || false,
            has_calendar: hasCalendar || false
          });

        if (error) {
          console.error('[user-events] Error logging checkin skip:', error);
          throw error;
        }

        console.log('[user-events] Checkin skip logged for', dateToLog);
        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'SAVE_CHECKIN': {
        const { checkinDate, outcome, skipped, stateTags, energyBalance, dataSources } = body;
        
        if (!outcome) {
          return new Response(
            JSON.stringify({ success: false, error: 'outcome is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const dateToSave = checkinDate || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('daily_checkins')
          .upsert({
            user_id: userId,
            checkin_date: dateToSave,
            outcome,
            skipped: skipped || false,
            timestamp: new Date().toISOString(),
            state_tags: stateTags || [],
            energy_balance: energyBalance || null,
            data_sources: dataSources || {}
          }, { onConflict: 'user_id,checkin_date' })
          .select()
          .single();

        if (error) {
          console.error('[user-events] Error saving checkin:', error);
          throw error;
        }

        console.log('[user-events] Checkin saved for', dateToSave);
        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_RECENT_SANCTUARY_EVENTS': {
        const limit = (body as any).limit || 5;

        const { data, error } = await supabase
          .from('sanctuary_events')
          .select('id, timestamp, category, content_type')
          .eq('user_id', userId)
          .eq('event_type', 'completed')
          .order('timestamp', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('[user-events] Error fetching sanctuary events:', error);
          throw error;
        }

        console.log('[user-events] Found sanctuary events:', data?.length || 0);
        return new Response(
          JSON.stringify({ success: true, data: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_COMPLETION_COUNTS': {
        const { contentIds, category } = body as any;

        let query = supabase
          .from('sanctuary_events')
          .select('content_id')
          .eq('user_id', userId)
          .eq('event_type', 'completed');

        if (category) {
          query = query.eq('category', category);
        }
        if (contentIds && contentIds.length > 0) {
          query = query.in('content_id', contentIds);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[user-events] Error fetching completion counts:', error);
          throw error;
        }

        // Aggregate counts by content_id
        const counts: Record<string, number> = {};
        (data || []).forEach((row: any) => {
          counts[row.content_id] = (counts[row.content_id] || 0) + 1;
        });

        console.log('[user-events] Completion counts:', Object.keys(counts).length, 'items');
        return new Response(
          JSON.stringify({ success: true, data: counts }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_SANCTUARY_DATA': {
        // Generic query for sanctuary_events used by Insights, Coach, etc.
        const { eventType, category: sanctuaryCategory, days: sanctuaryDays, columns } = body as any;
        const daysBack = sanctuaryDays || 30;
        const since = new Date();
        since.setDate(since.getDate() - daysBack);

        let query = supabase
          .from('sanctuary_events')
          .select(columns || 'content_id, category, timestamp, duration_seconds, event_type, created_at')
          .eq('user_id', userId)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false });

        if (eventType) {
          query = query.eq('event_type', eventType);
        }
        if (sanctuaryCategory) {
          query = query.eq('category', sanctuaryCategory);
        }

        const { data, error } = await query;

        if (error) {
          console.error('[user-events] Error fetching sanctuary data:', error);
          throw error;
        }

        console.log('[user-events] Sanctuary data:', data?.length || 0, 'rows');
        return new Response(
          JSON.stringify({ success: true, data: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[user-events] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
