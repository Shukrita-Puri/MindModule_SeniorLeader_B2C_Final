import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'TRACK_ENGAGEMENT' | 'GET_ENGAGEMENTS' | 'LOG_CHECKIN_SKIP' | 'SAVE_CHECKIN';
  // For TRACK_ENGAGEMENT
  eventType?: string;
  category?: string;
  contentId?: string;
  contentType?: string;
  timestamp?: string;
  metadata?: Record<string, any>;
  // For GET_ENGAGEMENTS
  days?: number;
  // For LOG_CHECKIN_SKIP
  skipDate?: string;
  hasWearable?: boolean;
  hasCalendar?: boolean;
  // For SAVE_CHECKIN
  checkinDate?: string;
  outcome?: string;
  skipped?: boolean;
  stateTags?: string[];
  energyBalance?: number;
  dataSources?: Record<string, any>;
}

async function verifyAuth0Token(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '');
  const auth0Domain = Deno.env.get('AUTH0_DOMAIN');
  
  if (!auth0Domain) {
    throw new Error('AUTH0_DOMAIN not configured');
  }

  const response = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[user-events] Auth0 verification failed:', errorText);
    throw new Error('Invalid or expired token');
  }

  const userInfo = await response.json();
  console.log('[user-events] Auth0 user verified:', userInfo.sub);
  return userInfo.sub;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify Auth0 token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = await verifyAuth0Token(authHeader);

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
