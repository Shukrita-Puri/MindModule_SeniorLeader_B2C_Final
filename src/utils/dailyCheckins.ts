import { supabase } from '@/integrations/supabase/client';

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
  state_tags?: string[];
  energy_balance?: number;
  skipped?: boolean;
  timestamp: string;
  data_sources?: Record<string, unknown>;
}

export async function getCheckins(days: number = 30): Promise<CheckinData[]> {
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
