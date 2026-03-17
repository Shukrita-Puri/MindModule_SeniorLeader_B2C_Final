import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action: 'TRACK_ENGAGEMENT' | 'GET_ENGAGEMENTS' | 'LOG_CHECKIN_SKIP' | 'SAVE_CHECKIN' | 'GET_RECENT_SANCTUARY_EVENTS' | 'GET_COMPLETION_COUNTS' | 'GET_SANCTUARY_DATA' | 'STORE_PHYSIOLOGICAL_EVENT' | 'GET_PHYSIOLOGICAL_HISTORY' | 'ANALYZE_PHYSIOLOGICAL_PATTERN' | 'IDENTIFY_STRESS_TRIGGERS';
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
  // Physiological event fields
  eventTitle?: string;
  startTime?: string;
  endTime?: string;
  hrv?: number | null;
  restingHeartRate?: number | null;
  sleepScore?: number | null;
  readinessScore?: number | null;
  activityLevel?: 'low' | 'moderate' | 'high' | null;
  source?: 'oura' | 'apple-watch';
  stressLevel?: 'low' | 'medium' | 'high';
  recoveryStatus?: 'critical' | 'low' | 'moderate' | 'optimal';
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

        // Fire-and-forget: log sanctuary completions to behavior_logs for cause-effect insights
        if (eventType === 'session_complete' || eventType === 'practice_completed') {
          supabase.from('behavior_logs').insert({
            user_id: userId,
            behavior_type: 'sanctuary_event',
            event_title: contentType || category || 'sanctuary',
            energy_after: null,
            created_at: new Date().toISOString(),
          }).then(({ error: blErr }) => {
            if (blErr) console.error('[user-events] behavior_log insert error:', blErr);
          });
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

      // ============ PHYSIOLOGICAL EVENT ACTIONS ============

      case 'STORE_PHYSIOLOGICAL_EVENT': {
        const { 
          eventTitle, eventType, startTime, endTime,
          hrv, restingHeartRate, sleepScore, readinessScore,
          activityLevel, source, stressLevel, recoveryStatus 
        } = body;

        if (!eventTitle || !startTime || !endTime || !source) {
          return new Response(
            JSON.stringify({ success: false, error: 'eventTitle, startTime, endTime, and source are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check for duplicate (same user, title, start time within 1 minute)
        const { data: existing } = await supabase
          .from('physiological_events')
          .select('id')
          .eq('user_id', userId)
          .eq('event_title', eventTitle)
          .gte('start_time', new Date(new Date(startTime).getTime() - 60000).toISOString())
          .lte('start_time', new Date(new Date(startTime).getTime() + 60000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) {
          console.log('[user-events] Physiological event already recorded:', eventTitle);
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: 'already_recorded' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('physiological_events')
          .insert({
            user_id: userId,
            event_title: eventTitle,
            event_type: eventType || 'meeting',
            start_time: startTime,
            end_time: endTime,
            hrv: hrv || null,
            resting_heart_rate: restingHeartRate || null,
            sleep_score: sleepScore || null,
            readiness_score: readinessScore || null,
            activity_level: activityLevel || null,
            source,
            stress_level: stressLevel || 'medium',
            recovery_status: recoveryStatus || 'moderate'
          })
          .select()
          .single();

        if (error) {
          console.error('[user-events] Error storing physiological event:', error);
          throw error;
        }

        console.log('[user-events] Physiological event stored:', eventTitle);
        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'GET_PHYSIOLOGICAL_HISTORY': {
        const { days } = body;
        const daysBack = days || 90; // Default 90 days history
        const since = new Date();
        since.setDate(since.getDate() - daysBack);

        const { data, error } = await supabase
          .from('physiological_events')
          .select('*')
          .eq('user_id', userId)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[user-events] Error fetching physiological history:', error);
          throw error;
        }

        console.log('[user-events] Physiological history:', data?.length || 0, 'events');
        return new Response(
          JSON.stringify({ success: true, data: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'ANALYZE_PHYSIOLOGICAL_PATTERN': {
        const { eventTitle, eventType } = body;

        if (!eventTitle && !eventType) {
          return new Response(
            JSON.stringify({ success: false, error: 'eventTitle or eventType required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Query similar events (90 days)
        const since = new Date();
        since.setDate(since.getDate() - 90);

        let query = supabase
          .from('physiological_events')
          .select('*')
          .eq('user_id', userId)
          .gte('created_at', since.toISOString());

        // Can't do OR in supabase easily, so fetch all and filter
        const { data: allEvents, error } = await query;

        if (error) {
          console.error('[user-events] Error analyzing pattern:', error);
          throw error;
        }

        // Filter similar events
        const similarEvents = (allEvents || []).filter((e: any) =>
          (eventTitle && e.event_title?.toLowerCase().includes(eventTitle.toLowerCase())) ||
          (eventType && e.event_type === eventType)
        );

        if (similarEvents.length === 0) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                hasPattern: false,
                avgHRV: 0,
                avgReadiness: 0,
                avgSleep: 0,
                occurrences: 0,
                elevated: false,
                trend: 'insufficient-data',
                dominantRecoveryStatus: 'unknown'
              }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Calculate averages
        const hrvValues = similarEvents.map((e: any) => e.hrv).filter((h: any) => h !== null) as number[];
        const readinessValues = similarEvents.map((e: any) => e.readiness_score).filter((r: any) => r !== null) as number[];
        const sleepValues = similarEvents.map((e: any) => e.sleep_score).filter((s: any) => s !== null) as number[];

        const avgHRV = hrvValues.length > 0 ? hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length : 0;
        const avgReadiness = readinessValues.length > 0 ? readinessValues.reduce((sum, v) => sum + v, 0) / readinessValues.length : 0;
        const avgSleep = sleepValues.length > 0 ? sleepValues.reduce((sum, v) => sum + v, 0) / sleepValues.length : 0;

        // Determine trend (compare first half vs second half)
        let trend: string = 'insufficient-data';

        if (similarEvents.length >= 4) {
          const midpoint = Math.floor(similarEvents.length / 2);
          const firstHalf = similarEvents.slice(midpoint); // Older
          const secondHalf = similarEvents.slice(0, midpoint); // Newer

          const firstHalfReadiness = firstHalf.map((e: any) => e.readiness_score).filter((r: any) => r !== null) as number[];
          const secondHalfReadiness = secondHalf.map((e: any) => e.readiness_score).filter((r: any) => r !== null) as number[];

          if (firstHalfReadiness.length > 0 && secondHalfReadiness.length > 0) {
            const firstAvg = firstHalfReadiness.reduce((sum, v) => sum + v, 0) / firstHalfReadiness.length;
            const secondAvg = secondHalfReadiness.reduce((sum, v) => sum + v, 0) / secondHalfReadiness.length;

            const diff = secondAvg - firstAvg;
            if (diff > 5) trend = 'improving';
            else if (diff < -5) trend = 'worsening';
            else trend = 'stable';
          }
        }

        // Find dominant recovery status
        const recoveryStatuses = similarEvents.map((e: any) => e.recovery_status);
        const statusCounts: Record<string, number> = {};
        recoveryStatuses.forEach((status: string) => {
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        const dominantRecoveryStatus = Object.entries(statusCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

        console.log('[user-events] Pattern analysis:', similarEvents.length, 'similar events');
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              hasPattern: true,
              avgHRV: Math.round(avgHRV),
              avgReadiness: Math.round(avgReadiness),
              avgSleep: Math.round(avgSleep),
              occurrences: similarEvents.length,
              elevated: avgHRV > 75,
              trend,
              dominantRecoveryStatus
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'IDENTIFY_STRESS_TRIGGERS': {
        // Get last 90 days of events
        const since = new Date();
        since.setDate(since.getDate() - 90);

        const { data, error } = await supabase
          .from('physiological_events')
          .select('*')
          .eq('user_id', userId)
          .gte('created_at', since.toISOString())
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[user-events] Error identifying stress triggers:', error);
          throw error;
        }

        // Group by event type
        const grouped: Record<string, any[]> = {};
        (data || []).forEach((event: any) => {
          if (!grouped[event.event_type]) {
            grouped[event.event_type] = [];
          }
          grouped[event.event_type].push(event);
        });

        // Calculate averages for each type
        const triggers = Object.entries(grouped).map(([type, events]) => {
          const readinessValues = events.map(e => e.readiness_score).filter(r => r !== null) as number[];
          const hrvValues = events.map(e => e.hrv).filter(h => h !== null) as number[];
          const sleepValues = events.map(e => e.sleep_score).filter(s => s !== null) as number[];

          const avgReadiness = readinessValues.length > 0
            ? readinessValues.reduce((sum, v) => sum + v, 0) / readinessValues.length
            : 0;
          const avgHRV = hrvValues.length > 0
            ? hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length
            : 0;
          const avgSleep = sleepValues.length > 0
            ? sleepValues.reduce((sum, v) => sum + v, 0) / sleepValues.length
            : 0;

          // Calculate stress level
          let stressLevel: string = 'medium';
          if (avgReadiness > 0) {
            if (avgReadiness < 50) stressLevel = 'high';
            else if (avgReadiness < 70) stressLevel = 'medium';
            else stressLevel = 'low';
          } else if (avgHRV > 0) {
            if (avgHRV > 85) stressLevel = 'high';
            else if (avgHRV > 65) stressLevel = 'medium';
            else stressLevel = 'low';
          }

          return {
            eventType: type,
            avgReadiness: Math.round(avgReadiness),
            avgHRV: Math.round(avgHRV),
            avgSleep: Math.round(avgSleep),
            occurrences: events.length,
            stressLevel
          };
        }).sort((a, b) => b.occurrences - a.occurrences);

        console.log('[user-events] Stress triggers:', triggers.length, 'event types');
        return new Response(
          JSON.stringify({ success: true, data: triggers }),
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