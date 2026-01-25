import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

// Helper to get access token
async function getAccessToken(): Promise<string | null> {
  try {
    const auth0Client = (window as any).__auth0Client;
    if (auth0Client) {
      return await auth0Client.getAccessTokenSilently();
    }
    return null;
  } catch {
    return null;
  }
}

export interface CheckinData {
  id?: string;
  checkin_date: string;
  user_id?: string;
  outcome: string;
  state_tags?: string[] | null;
  energy_balance?: number | null;
  skipped?: boolean | null;
  timestamp: string;
  data_sources?: Record<string, unknown> | null;
}

export async function getCheckins(days: number = 30): Promise<CheckinData[]> {
  // DEV_MODE: Direct database query
  if (DEV_MODE) {
    try {
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - days);
      
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', DEV_USER.id)
        .gte('checkin_date', daysAgo.toISOString().split('T')[0])
        .order('checkin_date', { ascending: false });
      
      if (error) throw error;
      return (data || []) as CheckinData[];
    } catch (error) {
      console.error('[dailyCheckins] DEV_MODE failed to fetch checkins:', error);
      return [];
    }
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyCheckins] No access token available');
      return [];
    }

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_CHECKINS', days }
    });

    if (error) throw error;
    return data?.data || [];
  } catch (error) {
    console.error('[dailyCheckins] Failed to fetch checkins:', error);
    return [];
  }
}

export async function getTodayCheckin(): Promise<CheckinData | null> {
  // DEV_MODE: Direct database query
  if (DEV_MODE) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', DEV_USER.id)
        .eq('checkin_date', today)
        .maybeSingle();
      
      if (error) throw error;
      return data as CheckinData | null;
    } catch (error) {
      console.error('[dailyCheckins] DEV_MODE failed to fetch today checkin:', error);
      return null;
    }
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyCheckins] No access token available');
      return null;
    }

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_TODAY_CHECKIN' }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyCheckins] Failed to fetch today checkin:', error);
    return null;
  }
}

export async function getCheckinRange(startDate: string, endDate: string): Promise<CheckinData[]> {
  // DEV_MODE: Direct database query
  if (DEV_MODE) {
    try {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', DEV_USER.id)
        .gte('checkin_date', startDate)
        .lte('checkin_date', endDate)
        .order('checkin_date', { ascending: false });
      
      if (error) throw error;
      return (data || []) as CheckinData[];
    } catch (error) {
      console.error('[dailyCheckins] DEV_MODE failed to fetch checkin range:', error);
      return [];
    }
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyCheckins] No access token available');
      return [];
    }

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_CHECKIN_RANGE', startDate, endDate }
    });

    if (error) throw error;
    return data?.data || [];
  } catch (error) {
    console.error('[dailyCheckins] Failed to fetch checkin range:', error);
    return [];
  }
}

export async function saveCheckin(checkinData: Omit<CheckinData, 'id' | 'user_id'>): Promise<CheckinData | null> {
  // DEV_MODE: Direct database upsert
  if (DEV_MODE) {
    try {
      console.log('[dailyCheckins] DEV_MODE: Saving check-in directly to DB');
      
      const { data, error } = await supabase
        .from('daily_checkins')
        .upsert([{
          user_id: DEV_USER.id,
          ...checkinData
        }], { onConflict: 'user_id,checkin_date' })
        .select()
        .single();
      
      if (error) throw error;
      console.log('[dailyCheckins] DEV_MODE: Check-in saved successfully');
      return data as CheckinData;
    } catch (error) {
      console.error('[dailyCheckins] DEV_MODE failed to save checkin:', error);
      return null;
    }
  }

  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyCheckins] No access token available');
      return null;
    }

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'SAVE_CHECKIN', checkinData }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyCheckins] Failed to save checkin:', error);
    return null;
  }
}
