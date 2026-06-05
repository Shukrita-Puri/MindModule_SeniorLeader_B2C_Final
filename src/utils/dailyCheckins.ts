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
  mental_sharpness_level?: number | null;
  emotion_level?: number | null;
  pressure_level?: number | null;
  regulation_level?: number | null;
  time_window?: string | null;
}

const TODAY_CHECKIN_CACHE_MS = 30_000;
const todayCheckinCache = new Map<string, { expiresAt: number; data: CheckinData | null }>();
const todayCheckinInFlight = new Map<string, Promise<CheckinData | null>>();
let todayCheckinCacheVersion = 0;

function getTodayCheckinCacheKey(): string {
  const userId = DEV_MODE ? DEV_USER.id : 'auth-user';
  const today = new Date().toLocaleDateString('en-CA');
  return `${userId}:${today}:${getCurrentTimeWindow()}`;
}

export function clearTodayCheckinCache(): void {
  todayCheckinCacheVersion++;
  todayCheckinCache.clear();
  todayCheckinInFlight.clear();
  latestTodayCache.clear();
  latestTodayInFlight.clear();
}

// ─── Time window detection ─────────────────────────────────────────

export function getCurrentTimeWindow(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

async function getAuthTokenWithRetry(attempts = 5, delayMs = 500): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const token = await getAuthToken();
    if (token) return token;
    if (attempt < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

// ─── Check if user can check in now ────────────────────────────────

export async function canCheckInNow(): Promise<{
  canCheckIn: boolean;
  reason?: string;
  nextWindow?: string;
}> {
  // Users may check in as many times as they want — no per-window block.
  return { canCheckIn: true };
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
    const accessToken = await getAuthTokenWithRetry();
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

async function fetchTodayCheckinFresh(): Promise<CheckinData | null> {
  const today = new Date().toLocaleDateString('en-CA');
  // Freshness contract: the "today's check-in" used by Brief / MRS / signal
  // pills must be scoped to the CURRENT time window, not the most recent
  // check-in of the day. Otherwise an afternoon check-in leaks into the
  // evening view, freezing MRS and pills against stale state. When no
  // check-in exists for the current window, MRS reverts to baseline and
  // signal pills rebuild from wearable/calendar.
  const currentWindow = getCurrentTimeWindow();

  if (DEV_MODE) {
    try {
      const { data, error } = await supabase
        .from('daily_checkins')
        .select('*')
        .eq('user_id', DEV_USER.id)
        .eq('checkin_date', today)
        .eq('time_window', currentWindow)
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
    const accessToken = await getAuthTokenWithRetry();
    if (!accessToken) return null;

    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'GET_CHECKIN_FOR_WINDOW',
        checkinDate: today,
        timeWindow: currentWindow,
      }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyCheckins] Failed to fetch today checkin:', error);
    return null;
  }
}

export async function getTodayCheckin(): Promise<CheckinData | null> {
  const cacheKey = getTodayCheckinCacheKey();
  const cached = todayCheckinCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inFlight = todayCheckinInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const version = todayCheckinCacheVersion;
  const promise = fetchTodayCheckinFresh()
    .then((data) => {
      if (version === todayCheckinCacheVersion) {
        todayCheckinCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + TODAY_CHECKIN_CACHE_MS,
        });
      }
      return data;
    })
    .finally(() => {
      if (version === todayCheckinCacheVersion) {
        todayCheckinInFlight.delete(cacheKey);
      }
    });

  todayCheckinInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Get latest check-in of today (any window) ─────────────────────
// For Plan / recommendation surfaces that intentionally want the most
// recent check-in of the day regardless of current window. MRS / Brief /
// signal pills must keep using getTodayCheckin() which is current-window
// scoped.

const latestTodayCache = new Map<string, { expiresAt: number; data: CheckinData | null }>();
const latestTodayInFlight = new Map<string, Promise<CheckinData | null>>();

function getLatestTodayCacheKey(): string {
  const userId = DEV_MODE ? DEV_USER.id : 'auth-user';
  const today = new Date().toLocaleDateString('en-CA');
  return `${userId}:${today}:latest`;
}

async function fetchLatestTodayFresh(): Promise<CheckinData | null> {
  const today = new Date().toLocaleDateString('en-CA');

  if (DEV_MODE) {
    try {
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
      console.error('[dailyCheckins] DEV_MODE failed to fetch latest today checkin:', error);
      return null;
    }
  }

  try {
    const accessToken = await getAuthTokenWithRetry();
    if (!accessToken) return null;
    const { data, error } = await supabase.functions.invoke('daily-checkins', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_LATEST_TODAY' }
    });
    if (error) throw error;
    // Fallback: if the function doesn't yet support GET_LATEST_TODAY, the
    // current-window result is still a safe degradation for Plan surfaces.
    return data?.data || null;
  } catch (error) {
    console.error('[dailyCheckins] Failed to fetch latest today checkin:', error);
    return null;
  }
}

export async function getLatestTodayCheckin(): Promise<CheckinData | null> {
  const cacheKey = getLatestTodayCacheKey();
  const cached = latestTodayCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const inFlight = latestTodayInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = fetchLatestTodayFresh()
    .then((data) => {
      latestTodayCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + TODAY_CHECKIN_CACHE_MS,
      });
      return data;
    })
    .finally(() => {
      latestTodayInFlight.delete(cacheKey);
    });

  latestTodayInFlight.set(cacheKey, promise);
  return promise;
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
    const accessToken = await getAuthTokenWithRetry();
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
    const accessToken = await getAuthTokenWithRetry();
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
        .insert({
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
        })
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
    const accessToken = await getAuthTokenWithRetry();
    if (!accessToken) {
      console.warn('[dailyCheckins] No auth token available after retries; check-in not saved');
      return null;
    }

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
