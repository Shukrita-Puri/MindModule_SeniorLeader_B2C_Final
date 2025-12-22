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

export interface RitualData {
  id?: string;
  ritual_date: string;
  user_id?: string;
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
}

export async function getRituals(days: number = 30): Promise<RitualData[]> {
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

export async function getTodayRitual(): Promise<RitualData | null> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyRituals] No access token available');
      return null;
    }

    const { data, error } = await supabase.functions.invoke('daily-rituals', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_TODAY_RITUAL' }
    });

    if (error) throw error;
    return data?.data || null;
  } catch (error) {
    console.error('[dailyRituals] Failed to fetch today ritual:', error);
    return null;
  }
}

export async function getRitualRange(startDate: string, endDate: string): Promise<RitualData[]> {
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
export async function updateRitualCompletion(
  practiceType: 'soundscape' | 'guided_practice' | 'micro_exercise',
  practiceId: string,
  practiceQueue?: { id: string }[]
): Promise<void> {
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.warn('[dailyRituals] No access token available');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Step 1: Get existing data
    const existingRitual = await getTodayRitual();
    const existingIds = existingRitual?.completed_practice_ids || [];
    const newCompletedIds = existingIds.includes(practiceId) ? existingIds : [...existingIds, practiceId];
    
    // Build ritual data based on practice type
    const ritualData: Omit<RitualData, 'id' | 'user_id'> = {
      ritual_date: today,
      completed_practice_ids: newCompletedIds,
    };

    if (practiceType === 'soundscape') {
      ritualData.soundscape_completed = true;
      ritualData.soundscape_completed_at = new Date().toISOString();
      if (practiceQueue) {
        ritualData.recommended_practice_ids = practiceQueue.map(p => p.id);
        ritualData.recommended_practices_count = practiceQueue.length;
      }
    } else if (practiceType === 'guided_practice') {
      ritualData.guided_practice_completed = true;
      ritualData.guided_practice_completed_at = new Date().toISOString();
    } else if (practiceType === 'micro_exercise') {
      ritualData.micro_exercise_completed = true;
      ritualData.micro_exercise_completed_at = new Date().toISOString();
    }

    // Step 2: Upsert the ritual
    await upsertRitual(ritualData);

    // Step 3: Fetch fresh data and calculate status
    const freshRitual = await getTodayRitual();
    if (freshRitual) {
      const completed = [
        freshRitual.soundscape_completed,
        freshRitual.guided_practice_completed,
        freshRitual.micro_exercise_completed
      ].filter(Boolean).length;
      
      const totalRecommended = freshRitual.recommended_practices_count || 3;
      
      const newStatus = completed >= totalRecommended && completed > 0 
        ? 'full' 
        : completed > 0 
          ? 'partial' 
          : 'skipped';
      
      // Step 4: Update status
      await upsertRitual({
        ritual_date: today,
        completion_status: newStatus
      });
    }
  } catch (error) {
    console.error('[dailyRituals] Failed to update ritual completion:', error);
  }
}
