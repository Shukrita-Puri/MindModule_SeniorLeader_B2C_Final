import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

// Alias for backward compat within this file
const getAccessToken = getAuthToken;

// Local time window helper (mirrors dailyCheckins.getCurrentTimeWindow)
function getCurrentTimeWindowForRituals(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export interface RitualData {
  id?: string;
  ritual_date: string;
  user_id?: string;
  created_at?: string;
  updated_at?: string;
  soundscape_completed?: boolean;
  soundscape_completed_at?: string | null;
  guided_practice_completed?: boolean;
  guided_practice_completed_at?: string | null;
  micro_exercise_completed?: boolean;
  micro_exercise_completed_at?: string | null;
  completion_status?: string;
  recommended_practice_ids?: string[];
  completed_practice_ids?: string[];
  recommended_practices_count?: number;
  session_period?: string;
}

export async function getRituals(days: number = 30): Promise<RitualData[]> {
  // DEV_MODE: Direct database query
  if (DEV_MODE) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toLocaleDateString('en-CA');
    
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .select('*')
      .eq('user_id', DEV_USER.id)
      .gte('ritual_date', startDateStr)
      .order('ritual_date', { ascending: false });
    
    if (error) {
      console.error('[dailyRituals] DEV_MODE getRituals error:', error);
      return [];
    }
    return data || [];
  }
  
  // Production: Use edge function
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyRituals] No access token available');
      return [];
    }

    const { data, error } = await supabase.functions.invoke('daily-rituals', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_RITUALS', days }
    });

    if (error) throw error;
    return data?.data || [];
  } catch (error) {
    console.error('[dailyRituals] Failed to fetch rituals:', error);
    return [];
  }
}

export async function getTodayRitual(sessionPeriod?: 'morning' | 'afternoon' | 'evening'): Promise<RitualData | null> {
  const today = new Date().toLocaleDateString('en-CA');
  
  // DEV_MODE: Direct database query
  if (DEV_MODE) {
    let query = supabase
      .from('daily_ritual_completions')
      .select('*')
      .eq('user_id', DEV_USER.id)
      .eq('ritual_date', today);
    
    if (sessionPeriod) {
      query = query.eq('session_period', sessionPeriod);
    }
    
    const { data, error } = await query
      .order('updated_at', { ascending: false })
      .maybeSingle();
    
    if (error) {
      console.error('[dailyRituals] DEV_MODE getTodayRitual error:', error);
      return null;
    }
    return data || null;
  }
  
  // Production: Use edge function
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyRituals] No access token available');
      return null;
    }

    const { data, error } = await supabase.functions.invoke('daily-rituals', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_TODAY_RITUAL', sessionPeriod }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyRituals] Failed to fetch today ritual:', error);
    return null;
  }
}

// Get ritual for a specific time period today
export async function getRitualForPeriod(period: 'morning' | 'afternoon' | 'evening'): Promise<RitualData | null> {
  return getTodayRitual(period);
}

export async function getRitualRange(startDate: string, endDate: string): Promise<RitualData[]> {
  // DEV_MODE: Direct database query
  if (DEV_MODE) {
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .select('*')
      .eq('user_id', DEV_USER.id)
      .gte('ritual_date', startDate)
      .lte('ritual_date', endDate)
      .order('ritual_date', { ascending: false });
    
    if (error) {
      console.error('[dailyRituals] DEV_MODE getRitualRange error:', error);
      return [];
    }
    return data || [];
  }
  
  // Production: Use edge function
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyRituals] No access token available');
      return [];
    }

    const { data, error } = await supabase.functions.invoke('daily-rituals', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_RITUAL_RANGE', startDate, endDate }
    });

    if (error) throw error;
    return data?.data || [];
  } catch (error) {
    console.error('[dailyRituals] Failed to fetch ritual range:', error);
    return [];
  }
}

export async function upsertRitual(ritualData: Omit<RitualData, 'id' | 'user_id'>): Promise<RitualData | null> {
  // DEV_MODE: Direct database upsert
  if (DEV_MODE) {
    const upsertData = {
      ...ritualData,
      user_id: DEV_USER.id,
      session_period: ritualData.session_period || getCurrentTimeWindowForRituals()
    };
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .upsert(upsertData, { onConflict: 'user_id,ritual_date,session_period' })
      .select()
      .maybeSingle();
    
    if (error) {
      console.error('[dailyRituals] DEV_MODE upsertRitual error:', error);
      return null;
    }
    return data || null;
  }
  
  // Production: Use edge function
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyRituals] No access token available');
      return null;
    }

    const { data, error } = await supabase.functions.invoke('daily-rituals', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'UPSERT_RITUAL', ritualData }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyRituals] Failed to upsert ritual:', error);
    return null;
  }
}

// Helper to update ritual completion with status recalculation
// Uses atomic COMPLETE_PRACTICE action (single server call) to avoid race conditions
export async function updateRitualCompletion(
  practiceType: 'soundscape' | 'guided_practice' | 'micro_exercise',
  practiceId: string,
  practiceQueue?: { id: string }[]
): Promise<void> {
  const timestamp = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA');
  
  console.log(`[dailyRituals ${timestamp}] updateRitualCompletion called:`, { practiceType, practiceId, queueLength: practiceQueue?.length });
  
  // DEV_MODE: Direct database — single atomic upsert
  if (DEV_MODE) {
    console.log(`[dailyRituals ${timestamp}] DEV_MODE: Atomic update`);
    
    try {
      // Get existing ritual for current period
      const currentPeriod = getCurrentTimeWindowForRituals();
      const existingRitual = await getTodayRitual(currentPeriod);
      const existingIds = existingRitual?.completed_practice_ids || [];
      const newCompletedIds = existingIds.includes(practiceId) ? existingIds : [...existingIds, practiceId];
      
      const ritualData: Omit<RitualData, 'id' | 'user_id'> = {
        ritual_date: today,
        completed_practice_ids: newCompletedIds,
      };

      if (practiceType === 'soundscape') {
        ritualData.soundscape_completed = true;
        ritualData.soundscape_completed_at = new Date().toISOString();
      } else if (practiceType === 'guided_practice') {
        ritualData.guided_practice_completed = true;
        ritualData.guided_practice_completed_at = new Date().toISOString();
      } else if (practiceType === 'micro_exercise') {
        ritualData.micro_exercise_completed = true;
        ritualData.micro_exercise_completed_at = new Date().toISOString();
      }

      if (practiceQueue) {
        ritualData.recommended_practice_ids = practiceQueue.map(p => p.id);
        ritualData.recommended_practices_count = practiceQueue.length;
      }

      // Calculate status in single pass
      const totalRecommended = ritualData.recommended_practices_count || existingRitual?.recommended_practices_count || 3;
      ritualData.completion_status = newCompletedIds.length >= totalRecommended && newCompletedIds.length > 0
        ? 'full'
        : newCompletedIds.length > 0
          ? 'partial'
          : 'skipped';

      const result = await upsertRitual(ritualData);
      console.log(`[dailyRituals ${timestamp}] DEV_MODE atomic result:`, result ? 'SUCCESS' : 'FAILED');
    } catch (error) {
      console.error(`[dailyRituals ${timestamp}] DEV_MODE update failed:`, error);
    }
    return;
  }
  
  // Production: Single atomic COMPLETE_PRACTICE call via edge function
  try {
    const accessToken = await getAccessToken();
    console.log(`[dailyRituals ${timestamp}] Access token:`, accessToken ? 'present' : 'MISSING');
    
    if (!accessToken) {
      console.warn(`[dailyRituals ${timestamp}] No access token available - ritual completion will NOT be saved!`);
      return;
    }

    const { data, error } = await supabase.functions.invoke('daily-rituals', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'COMPLETE_PRACTICE',
        practiceType,
        practiceId,
        practiceQueue,
        sessionPeriod: getCurrentTimeWindowForRituals()
      }
    });

    if (error) {
      console.error(`[dailyRituals ${timestamp}] COMPLETE_PRACTICE error:`, error);
      return;
    }

    console.log(`[dailyRituals ${timestamp}] COMPLETE_PRACTICE success:`, data?.data?.completion_status);
  } catch (error) {
    console.error(`[dailyRituals ${timestamp}] Failed to update ritual completion:`, error);
  }
}
