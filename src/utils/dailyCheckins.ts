import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

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
  clarity_level?: number | null;
  confidence_level?: number | null;
  time_window?: string | null;
}

// ─── Time window detection ─────────────────────────────────────────

export function getCurrentTimeWindow(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

function getNextWindowName(currentWindow: string): string {
  if (currentWindow === 'morning') return 'afternoon (12pm)';
  if (currentWindow === 'afternoon') return 'evening (5pm)';
  return 'tomorrow morning';
}

// ─── Check if user can check in now ────────────────────────────────

export async function canCheckInNow(): Promise<{
  canCheckIn: boolean;
  reason?: string;
  nextWindow?: string;
}> {
  const timeWindow = getCurrentTimeWindow();
  const today = new Date().toISOString().split('T')[0];

  try {
    if (DEV_MODE) {
      const { data } = await supabase
        .from('daily_checkins')
        .select('id')
        .eq('user_id', DEV_USER.id)
        .eq('checkin_date', today)
        .eq('time_window', timeWindow)
        .maybeSingle();

      if (data) {
        return {
          canCheckIn: false,
          reason: `You already checked in this ${timeWindow}.`,
          nextWindow: getNextWindowName(timeWindow)
        };
      }
      return { canCheckIn: true };
    }

    const accessToken = await getAuthToken();
    if (!accessToken) return { canCheckIn: true };

    const { data } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_CHECKIN_FOR_WINDOW', checkinDate: today, timeWindow }
    });

    if (data?.data) {
      return {
        canCheckIn: false,
        reason: `You already checked in this ${timeWindow}.`,
        nextWindow: getNextWindowName(timeWindow)
      };
    }
    return { canCheckIn: true };
  } catch {
    return { canCheckIn: true };
  }
}

// ─── Get check-ins ─────────────────────────────────────────────────

export async function getCheckins(days: number = 30): Promise<CheckinData[]> {
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
    const accessToken = await getAuthToken();
    if (!accessToken) return [];

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

// ─── Get today's most recent check-in ──────────────────────────────

export async function getTodayCheckin(): Promise<CheckinData | null> {
  if (DEV_MODE) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', DEV_USER.id)
        .eq('checkin_date', today)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as CheckinData | null;
    } catch (error) {
      console.error('[dailyCheckins] DEV_MODE failed to fetch today checkin:', error);
      return null;
    }
  }

  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return null;

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_MOST_RECENT_CHECKIN_TODAY' }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyCheckins] Failed to fetch today checkin:', error);
    return null;
  }
}

// ─── Get check-in for specific window ──────────────────────────────

export async function getCheckinForWindow(
  checkinDate: string,
  timeWindow: 'morning' | 'afternoon' | 'evening'
): Promise<CheckinData | null> {
  if (DEV_MODE) {
    try {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', DEV_USER.id)
        .eq('checkin_date', checkinDate)
        .eq('time_window', timeWindow)
        .maybeSingle();

      if (error) throw error;
      return data as CheckinData | null;
    } catch (error) {
      console.error('[dailyCheckins] DEV_MODE failed to fetch window checkin:', error);
      return null;
    }
  }

  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return null;

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_CHECKIN_FOR_WINDOW', checkinDate, timeWindow }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyCheckins] Failed to fetch window checkin:', error);
    return null;
  }
}

// ─── Get check-in range ────────────────────────────────────────────

export async function getCheckinRange(startDate: string, endDate: string): Promise<CheckinData[]> {
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
    const accessToken = await getAuthToken();
    if (!accessToken) return [];

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

// ─── Save check-in ────────────────────────────────────────────────

export async function saveCheckin(checkinData: Omit<CheckinData, 'id' | 'user_id'>): Promise<CheckinData | null> {
  const timeWindow = checkinData.time_window || getCurrentTimeWindow();

  if (DEV_MODE) {
    console.log('[dailyCheckins] DEV_MODE: Saving check-in directly to DB...', {
      user_id: DEV_USER.id,
      checkin_date: checkinData.checkin_date,
      time_window: timeWindow,
      outcome: checkinData.outcome,
      energy_balance: checkinData.energy_balance
    });

    try {
      const { data, error } = await supabase
        .from('daily_checkins')
        .upsert({
          user_id: DEV_USER.id,
          checkin_date: checkinData.checkin_date,
          time_window: timeWindow,
          outcome: checkinData.outcome,
          energy_balance: checkinData.energy_balance,
          skipped: checkinData.skipped,
          timestamp: checkinData.timestamp,
          state_tags: checkinData.state_tags,
          data_sources: checkinData.data_sources as import('@/integrations/supabase/types').Json,
          clarity_level: checkinData.clarity_level,
          confidence_level: checkinData.confidence_level,
        }, { onConflict: 'user_id,checkin_date,time_window' })
        .select()
        .maybeSingle();

      if (error) {
        console.error('[dailyCheckins] DEV_MODE save FAILED:', error);
        return null;
      }

      console.log('[dailyCheckins] DEV_MODE save SUCCESS:', data);
      localStorage.setItem('hasEverCheckedIn', 'true');
      return data as CheckinData;
    } catch (error) {
      console.error('[dailyCheckins] DEV_MODE failed to save checkin:', error);
      return null;
    }
  }

  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return null;

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'SAVE_CHECKIN',
        checkinData: {
          ...checkinData,
          time_window: timeWindow
        }
      }
    });

    if (error) throw error;
    const result = data?.data || null;
    if (result) {
      localStorage.setItem('hasEverCheckedIn', 'true');
    }
    return result;
  } catch (error) {
    console.error('[dailyCheckins] Failed to save checkin:', error);
    return null;
  }
}
