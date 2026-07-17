import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";
import { redactUserId } from "../_shared/identity/redact-user-id.ts";

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
    | 'GET_RECENT_CHECKINS'
    | 'GET_MONTHLY_LEVELS';
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
    emotion_level?: number;
    pressure_level?: number;
    regulation_level?: number;
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
    console.log(`[daily-checkins] Action: ${action}, User: ${redactUserId(userId)}`);

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

        // MRS v4 §2.1 — update daily_context_snapshot's per-day check-in
        // tracking so the next cron cycle knows the felt-state input is
        // fresh, and the Brief (eventual §10 consumer) can decide whether
        // it's reading a morning or evening check-in. Fire-and-forget; a
        // failure here must not block the check-in write.
        try {
          const { count } = await supabase
            .from('daily_checkins')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('checkin_date', cd.checkin_date);

          const snapshotPayload: Record<string, unknown> = {
            user_id: userId,
            local_date: cd.checkin_date,
            mrs_window: timeWindow,
            check_in_count_today: count ?? 1,
            last_check_in_window: timeWindow,
          };
          const { error: snapErr } = await supabase
            .from('daily_context_snapshot')
            .upsert(snapshotPayload, { onConflict: 'user_id,local_date,mrs_window' });
          if (snapErr) {
            console.warn('[daily-checkins] MRS v4 snapshot count update failed:', snapErr.message ?? snapErr);
          }
        } catch (snapEx) {
          console.warn('[daily-checkins] MRS v4 snapshot count update threw:',
            snapEx instanceof Error ? snapEx.message : snapEx);
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
          // No prior row for this window (user opened /check-in-detail
          // without completing Page 1 first). Create one carrying the
          // body fields so the data is never silently dropped.
          const insertPayload: Record<string, unknown> = {
            ...updatePayload,
            user_id: userId,
            checkin_date: checkinDate,
            time_window: timeWindow ?? 'morning',
            outcome: 'steady',
            skipped: false,
            timestamp: new Date().toISOString(),
          };
          const { data: inserted, error: insertErr } = await supabase
            .from('daily_checkins')
            .insert(insertPayload)
            .select()
            .maybeSingle();
          if (insertErr) {
            console.error('[daily-checkins] UPDATE_BODY_CHECKIN insert-fallback error:', insertErr);
            throw insertErr;
          }
          return new Response(JSON.stringify({ data: inserted }), {
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

      case 'UPDATE_BODY_CHECKIN': {
        const {
          checkinDate, timeWindow, checkinId,
          sleepHours, sleepQuality, sleepWakeType,
          tension, energy, recovery, carry,
        } = body;

        if (!checkinDate && !checkinId) {
          return new Response(JSON.stringify({ error: 'Missing checkinDate or checkinId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        const updatePayload: Record<string, unknown> = {};
        if (sleepHours != null) updatePayload.sleep_hours = sleepHours;
        if (sleepQuality != null) updatePayload.sleep_quality = sleepQuality;
        if (sleepWakeType != null) updatePayload.sleep_wake_type = sleepWakeType;
        if (tension != null) updatePayload.body_tension_level = tension;
        if (energy != null) updatePayload.body_energy_level = energy;
        if (recovery != null) updatePayload.recovery_yesterday_level = recovery;
        if (carry != null) updatePayload.carry_load_level = carry;

        if (Object.keys(updatePayload).length === 0) {
          return new Response(JSON.stringify({ error: 'No body fields provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let targetId = checkinId;
        if (!targetId) {
          let latestQuery = supabase
            .from('daily_checkins')
            .select('id')
            .eq('user_id', userId)
            .eq('checkin_date', checkinDate);
          if (timeWindow) latestQuery = latestQuery.eq('time_window', timeWindow);
          const { data: latestRow, error: latestErr } = await latestQuery
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestErr) {
            console.error('[daily-checkins] UPDATE_BODY_CHECKIN latest lookup error:', latestErr);
            throw latestErr;
          }
          targetId = latestRow?.id;
        }

        if (!targetId) {
          // No prior row for this window (user opened /check-in-detail
          // without completing Page 1 first). Create one carrying the
          // body fields so the data is never silently dropped — mirrors
          // UPDATE_CLARITY_CONFIDENCE's insert-fallback and the client
          // DEV_MODE path in CheckInDetail.tsx.
          const insertPayload: Record<string, unknown> = {
            ...updatePayload,
            user_id: userId,
            checkin_date: checkinDate,
            time_window: timeWindow ?? 'morning',
            outcome: 'steady',
            skipped: false,
            timestamp: new Date().toISOString(),
          };
          const { data: inserted, error: insertErr } = await supabase
            .from('daily_checkins')
            .insert(insertPayload)
            .select()
            .maybeSingle();
          if (insertErr) {
            console.error('[daily-checkins] UPDATE_BODY_CHECKIN insert-fallback error:', insertErr);
            throw insertErr;
          }
          console.log('[daily-checkins] UPDATE_BODY_CHECKIN insert-fallback created row for user:', redactUserId(userId));
          return new Response(JSON.stringify({ data: inserted }), {
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
          console.error('[daily-checkins] UPDATE_BODY_CHECKIN error:', error);
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

        // MRS v3 four-dimension select. Legacy columns
        // (outcome, confidence_level, mental_sharpness_level, energy_balance)
        // are intentionally dropped — the sidebar Assessment row now reads the
        // four MRS v3 dims (clarity, emotion, pressure, regulation) only.
        const { data, error } = await supabase
          .from('daily_checkins')
          .select('id, checkin_date, time_window, clarity_level, emotion_level, pressure_level, regulation_level, created_at')
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

      case 'GET_MONTHLY_LEVELS': {
        // Returns 1–5 dimension levels for the current calendar month so the
        // Performance Streak card can compute Peak / Friction counts without
        // a direct browser read (RLS deny-by-default blocks the Auth0 path).
        // `startDate` / `endDate` are optional; default = month-to-date.
        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().split('T')[0];
        const start = (body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate))
          ? body.startDate : defaultStart;
        const end = (body.endDate && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate))
          ? body.endDate : now.toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('daily_checkins')
          .select('checkin_date, clarity_level, emotion_level, pressure_level, regulation_level')
          .eq('user_id', userId)
          .gte('checkin_date', start)
          .lte('checkin_date', end)
          .order('checkin_date', { ascending: true });

        if (error) {
          console.error('[daily-checkins] GET_MONTHLY_LEVELS error:', error);
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
