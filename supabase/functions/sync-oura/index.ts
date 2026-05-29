import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toMinutes(value: unknown): number | null {
  const numeric = toNumber(value);
  return numeric === null ? null : Math.round(numeric / 60);
}

function mapSeries(series: unknown): Array<{ t: string; v: number }> {
  if (!series || (typeof series !== 'object' && !Array.isArray(series))) return [];
  const items = Array.isArray(series)
    ? series
    : (series as { items?: unknown; data?: unknown }).items ?? (series as { items?: unknown; data?: unknown }).data;
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const timestamp =
        typeof row.timestamp === 'string' ? row.timestamp :
        typeof row.datetime === 'string' ? row.datetime :
        typeof row.start_datetime === 'string' ? row.start_datetime :
        typeof row.end_datetime === 'string' ? row.end_datetime :
        typeof row.date === 'string' ? row.date :
        null;
      const value =
        toNumber(row.bpm) ??
        toNumber(row.value) ??
        toNumber(row.hrv) ??
        toNumber(row.heart_rate);
      if (!timestamp || value === null) return null;
      return { t: timestamp, v: Math.round(value) };
    })
    .filter((item): item is { t: string; v: number } => !!item);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get Oura connection
    const { data: connection, error: connError } = await supabaseClient
      .from('oura_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      throw new Error('No active Oura connection found');
    }

    // Retrieve decrypted access token from vault
    const { data: accessToken, error: tokenError } = await supabaseClient
      .rpc('get_oura_access_token', { _connection_id: connection.id });

    if (tokenError || !accessToken) {
      throw new Error('Failed to retrieve Oura access token');
    }

    // Fetch comprehensive data from Oura API v2
    const OURA_API_BASE = 'https://api.ouraring.com/v2/usercollection';
    
    // Get yesterday's date (Oura data is typically available next day)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];
    
    // Fetch from all 4 endpoints
    const headers = {
      'Authorization': `Bearer ${accessToken}`
    };
    
    try {
      // 1. Daily Readiness
      const readinessRes = await fetch(
        `${OURA_API_BASE}/daily_readiness?start_date=${dateStr}&end_date=${dateStr}`,
        { headers }
      );
      const readinessData = readinessRes.ok ? await readinessRes.json() : null;
      
      // 2. Daily Sleep
      const sleepRes = await fetch(
        `${OURA_API_BASE}/daily_sleep?start_date=${dateStr}&end_date=${dateStr}`,
        { headers }
      );
      const sleepData = sleepRes.ok ? await sleepRes.json() : null;
      
      // 3. Daily Activity
      const activityRes = await fetch(
        `${OURA_API_BASE}/daily_activity?start_date=${dateStr}&end_date=${dateStr}`,
        { headers }
      );
      const activityData = activityRes.ok ? await activityRes.json() : null;
      
      // 4. Heart Rate (for HRV)
      const heartRateRes = await fetch(
        `${OURA_API_BASE}/heartrate?start_date=${dateStr}&end_date=${dateStr}`,
        { headers }
      );
      const heartRateData = heartRateRes.ok ? await heartRateRes.json() : null;
      
      // Extract metrics from responses
      const readiness = readinessData?.data?.[0];
      const sleep = sleepData?.data?.[0];
      const activity = activityData?.data?.[0];
      const heartRate = heartRateData?.data?.[0];
      const hrvSamples = mapSeries(sleep?.hrv);
      const hrSamples = [
        ...mapSeries(sleep?.heart_rate),
        ...mapSeries(heartRateData?.data),
      ];
      const readinessScore = toNumber(readiness?.score);
      const sleepScore = toNumber(sleep?.efficiency ?? sleep?.score ?? sleep?.contributors?.total_sleep_duration);
      const activityScore = toNumber(activity?.score);
      const hrv = toNumber(sleep?.average_hrv ?? hrvSamples[0]?.v);
      const restingHeartRate = toNumber(heartRate?.source === 'rest' ? heartRate?.bpm : null) ?? toNumber(sleep?.lowest_heart_rate);
      const heartRateAvg = toNumber(sleep?.average_heart_rate ?? heartRate?.bpm);
      const totalSleepMinutes = toMinutes(sleep?.total_sleep_duration);
      const deepSleepMinutes = toMinutes(sleep?.deep_sleep_duration);
      const remSleepMinutes = toMinutes(sleep?.rem_sleep_duration);
      const steps = toNumber(activity?.steps);
      const activeCalories = toNumber(activity?.active_calories);
      
      // Store in database
      const { error: insertError } = await supabaseClient
        .from('oura_daily_data')
        .upsert({
          user_id: user.id,
          summary_date: dateStr,
          readiness_score: readinessScore,
          sleep_score: sleepScore,
          activity_score: activityScore,
          hrv,
          resting_heart_rate: restingHeartRate,
          raw_data: {
            readiness: readiness || {},
            sleep: sleep || {},
            activity: activity || {},
            heartrate: heartRate || {}
          }
        }, {
          onConflict: 'user_id,summary_date'
        });
      
      if (insertError) {
        throw insertError;
      }

      const { error: wearableError } = await supabaseClient
        .from('wearable_data')
        .upsert({
          user_id: user.id,
          summary_date: dateStr,
          source: 'oura',
          sleep_score: sleepScore,
          hrv,
          resting_heart_rate: restingHeartRate,
          heart_rate: heartRateAvg,
          hr_samples: hrSamples,
          hrv_samples: hrvSamples,
          total_sleep_minutes: totalSleepMinutes,
          deep_sleep_minutes: deepSleepMinutes,
          rem_sleep_minutes: remSleepMinutes,
          active_calories: activeCalories,
          steps,
          raw_data: {
            provider: 'oura',
            readiness_score: readinessScore,
            activity_score: activityScore,
            readiness: readiness || {},
            sleep: sleep || {},
            activity: activity || {},
            heartrate: heartRate || {},
          },
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,summary_date',
        });

      if (wearableError) {
        throw wearableError;
      }
      
    } catch (apiError) {
      // Continue to update last_sync even if API call fails
    }
    
    // Update last sync timestamp
    await supabaseClient
      .from('oura_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', connection.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Oura sync completed successfully',
        synced_date: dateStr
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
