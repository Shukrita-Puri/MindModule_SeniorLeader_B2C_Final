import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  action:
    | 'GET_CHECKINS'
    | 'GET_TODAY_CHECKIN'
    | 'SAVE_CHECKIN'
    | 'GET_CHECKIN_RANGE'
    | 'UPDATE_CLARITY_CONFIDENCE'
    | 'UPDATE_ENERGY_BALANCE'
    | 'UPDATE_BODY_CHECKIN'
    | 'GET_MOST_RECENT_CHECKIN_TODAY'
    | 'GET_CHECKIN_FOR_WINDOW'
    | 'GET_ALL_CHECKINS_TODAY'
    | 'INFER_CURRENT_STATE'
    | 'GET_RECENT_CHECKINS';
  days?: number;
  startDate?: string;
  endDate?: string;
  checkinDate?: string;
  clarity?: number;
  confidence?: number;
  mentalSharpness?: number;
  energyBalance?: number;
  timeWindow?: 'morning' | 'afternoon' | 'evening';
  checkinId?: string;
  usedFor?: string;
  // Body Performance Check-in fields
  sleepHours?: number;
  sleepQuality?: number;
  sleepWakeType?: number;
  tension?: number;
  energy?: number;
  recovery?: number;
  carry?: number;
  checkinData?: {
    checkin_date: string;
    time_window: string;
    outcome: string;
    state_tags?: string[];
    energy_balance?: number;
    clarity_level?: number;
    confidence_level?: number;
    skipped?: boolean;
    timestamp: string;
    data_sources?: Record<string, unknown>;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json() as RequestBody;
    const { action } = body;
    console.log(`[daily-checkins] Action: ${action}, User: ${userId}`);

    switch (action) {
      case 'GET_CHECKINS': {
        const daysToFetch = body.days || 30;
        const start = new Date();
        start.setDate(start.getDate() - daysToFetch);

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .gte('checkin_date', start.toISOString().split('T')[0])
          .order('checkin_date', { ascending: false });

        if (error) {
          console.error('[daily-checkins] GET_CHECKINS error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_TODAY_CHECKIN': {
        // Returns most recent check-in today (backward compatible)
        const today = body.checkinDate || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .eq('checkin_date', today)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[daily-checkins] GET_TODAY_CHECKIN error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_MOST_RECENT_CHECKIN_TODAY': {
        const today = body.checkinDate || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .eq('checkin_date', today)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[daily-checkins] GET_MOST_RECENT_CHECKIN_TODAY error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_CHECKIN_FOR_WINDOW': {
        const { checkinDate, timeWindow } = body;

        if (!checkinDate || !timeWindow) {
          return new Response(
            JSON.stringify({ error: 'checkinDate and timeWindow required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .eq('checkin_date', checkinDate)
          .eq('time_window', timeWindow)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[daily-checkins] GET_CHECKIN_FOR_WINDOW error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_ALL_CHECKINS_TODAY': {
        const today = body.checkinDate || new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .eq('checkin_date', today)
          .order('timestamp', { ascending: true });

        if (error) {
          console.error('[daily-checkins] GET_ALL_CHECKINS_TODAY error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'GET_CHECKIN_RANGE': {
        if (!body.startDate || !body.endDate) {
          return new Response(JSON.stringify({ error: 'Missing date range' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('user_id', userId)
          .gte('checkin_date', body.startDate)
          .lte('checkin_date', body.endDate)
          .order('checkin_date', { ascending: true });

        if (error) {
          console.error('[daily-checkins] GET_CHECKIN_RANGE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'SAVE_CHECKIN': {
        if (!body.checkinData) {
          return new Response(
            JSON.stringify({ error: 'Missing checkin data' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const cd = body.checkinData;

        // Default time_window if not provided (backward compatibility)
        const timeWindow = cd.time_window || 'morning';

        const { data, error } = await supabase
          .from('daily_checkins')
          .insert({
            user_id: userId,
            checkin_date: cd.checkin_date,
            time_window: timeWindow,
            outcome: cd.outcome,
            energy_balance: cd.energy_balance,
            clarity_level: cd.clarity_level,
            confidence_level: cd.confidence_level,
            state_tags: cd.state_tags,
            skipped: cd.skipped || false,
            timestamp: cd.timestamp,
            data_sources: cd.data_sources || {}
          })
          .select()
          .single();

        if (error) {
          console.error('[daily-checkins] SAVE_CHECKIN error:', error);
          throw error;
        }

        // Fire-and-forget: trigger pattern learning
        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
          const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
          fetch(`${supabaseUrl}/functions/v1/learn-checkin-patterns`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${req.headers.get('authorization')?.replace('Bearer ', '') || supabaseAnonKey}`,
            },
            body: JSON.stringify({ userId }),
          }).catch(e => console.warn('[daily-checkins] Pattern learning trigger failed:', e));
        } catch (e) {
          console.warn('[daily-checkins] Pattern learning trigger error:', e);
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'UPDATE_CLARITY_CONFIDENCE': {
        const { checkinDate, clarity, confidence, mentalSharpness, emotion, pressure, regulation, timeWindow, checkinId } = body;

        if (!checkinDate || clarity == null || confidence == null) {
          return new Response(JSON.stringify({ error: 'Missing checkinDate, clarity, or confidence' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const updatePayload: Record<string, unknown> = {
          clarity_level: clarity,
          confidence_level: confidence,
        };
        if (mentalSharpness != null) {
          updatePayload.mental_sharpness_level = mentalSharpness;
          console.log('[daily-checkins] Persisting mental_sharpness_level:', mentalSharpness);
        }
        if (emotion != null) updatePayload.emotion_level = emotion;
        if (pressure != null) updatePayload.pressure_level = pressure;
        if (regulation != null) updatePayload.regulation_level = regulation;

        let targetId = checkinId;
        if (!targetId) {
          // Backward-compatible fallback for older clients: resolve the latest
          // matching check-in id so updates target one row even when duplicates
          // exist for (user, date, [window]).
          let latestQuery = supabase
            .from('daily_checkins')
            .select('id')
            .eq('user_id', userId)
            .eq('checkin_date', checkinDate);
          if (timeWindow) {
            latestQuery = latestQuery.eq('time_window', timeWindow);
          }
          const { data: latestRow, error: latestErr } = await latestQuery
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestErr) {
            console.error('[daily-checkins] UPDATE_CLARITY_CONFIDENCE latest lookup error:', latestErr);
            throw latestErr;
          }

          targetId = latestRow?.id;
        }

        if (!targetId) {
          return new Response(JSON.stringify({ data: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_checkins')
          .update(updatePayload)
          .eq('id', targetId)
          .eq('user_id', userId)
          .select()
          .maybeSingle();

        if (error) {
          console.error('[daily-checkins] UPDATE_CLARITY_CONFIDENCE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'UPDATE_ENERGY_BALANCE': {
        // moved below
        // (kept here as marker — see UPDATE_BODY_CHECKIN above)
        const { checkinDate, energyBalance, timeWindow } = body;

        if (!checkinDate || energyBalance == null) {
          return new Response(JSON.stringify({ error: 'Missing checkinDate or energyBalance' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        // Resolve the latest matching row id (scoped by window if provided),
        // then update by id so duplicates don't fan out.
        let latestQuery = supabase
          .from('daily_checkins')
          .select('id')
          .eq('user_id', userId)
          .eq('checkin_date', checkinDate);
        if (timeWindow) {
          latestQuery = latestQuery.eq('time_window', timeWindow);
        }
        const { data: latestRow, error: latestErr } = await latestQuery
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestErr) {
          console.error('[daily-checkins] UPDATE_ENERGY_BALANCE latest lookup error:', latestErr);
          throw latestErr;
        }

        if (!latestRow?.id) {
          return new Response(JSON.stringify({ data: null }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const { data, error } = await supabase
          .from('daily_checkins')
          .update({ energy_balance: energyBalance })
          .eq('id', latestRow.id)
          .select()
          .maybeSingle();

        if (error) {
          console.error('[daily-checkins] UPDATE_ENERGY_BALANCE error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'INFER_CURRENT_STATE': {
        // Delegate to infer-current-state edge function
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const authHeader = req.headers.get('authorization') || '';

        const inferResponse = await fetch(`${supabaseUrl}/functions/v1/infer-current-state`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
          },
          body: JSON.stringify({ usedFor: body.usedFor || 'general' }),
        });

        const inferData = await inferResponse.json();

        return new Response(JSON.stringify({ data: inferData?.data || inferData }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: inferResponse.status,
        });
      }

      case 'GET_RECENT_CHECKINS': {
        const limit = (body as any).limit || 5;

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('id, checkin_date, time_window, outcome, energy_balance, clarity_level, confidence_level, mental_sharpness_level, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) {
          console.error('[daily-checkins] GET_RECENT_CHECKINS error:', error);
          throw error;
        }

        return new Response(JSON.stringify({ data: data || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[daily-checkins] Error:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
