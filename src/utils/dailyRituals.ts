import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

// Helper to get access token from globally exposed Auth0 client (returns null in DEV_MODE)
async function getAccessToken(): Promise<string | null> {
  if (DEV_MODE) {
    return null; // DEV_MODE uses direct DB access instead
  }
  try {
    const auth0Client = (window as any).__auth0Client;
    if (auth0Client) {
      const token = await auth0Client.getAccessTokenSilently();
      console.log('[dailyRituals] Token obtained successfully');
      return token;
    }
    console.warn('[dailyRituals] No auth0Client on window - Auth0 may not be initialized yet');
    return null;
  } catch (error) {
    console.error('[dailyRituals] Failed to get access token:', error);
    return null;
  }
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

export async function getTodayRitual(): Promise<RitualData | null> {
  const today = new Date().toLocaleDateString('en-CA');
  
  // DEV_MODE: Direct database query
  if (DEV_MODE) {
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .select('*')
      .eq('user_id', DEV_USER.id)
      .eq('ritual_date', today)
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
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .upsert(
        { ...ritualData, user_id: DEV_USER.id },
        { onConflict: 'user_id,ritual_date' }
      )
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
export async function updateRitualCompletion(
  practiceType: 'soundscape' | 'guided_practice' | 'micro_exercise',
  practiceId: string,
  practiceQueue?: { id: string }[]
): Promise<void> {
  const timestamp = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
  
  console.log(`[dailyRituals ${timestamp}] updateRitualCompletion called:`, { practiceType, practiceId, queueLength: practiceQueue?.length });
  
  // DEV_MODE: Direct database operations (no token needed)
  if (DEV_MODE) {
    console.log(`[dailyRituals ${timestamp}] DEV_MODE: Direct DB update`);
    
    try {
      // Get existing ritual
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

      // Upsert the ritual
      const result = await upsertRitual(ritualData);
      console.log(`[dailyRituals ${timestamp}] DEV_MODE upsert result:`, result ? 'SUCCESS' : 'FAILED');
      
      // Calculate and update status
      const freshRitual = await getTodayRitual();
      if (freshRitual) {
        // Use completed_practice_ids as the authoritative count (not just booleans)
        const completedIds = freshRitual.completed_practice_ids || [];
        const totalRecommended = freshRitual.recommended_practices_count || 3;
        const newStatus = completedIds.length >= totalRecommended && completedIds.length > 0 
          ? 'full' 
          : completedIds.length > 0 
            ? 'partial' 
            : 'skipped';
        
        console.log(`[dailyRituals ${timestamp}] DEV_MODE calculated status:`, { completedCount: completedIds.length, totalRecommended, newStatus });
        
        await upsertRitual({
          ritual_date: today,
          completion_status: newStatus
        });
      }
    } catch (error) {
      console.error(`[dailyRituals ${timestamp}] DEV_MODE update failed:`, error);
    }
    return;
  }
  
  // Production: Use edge function with Auth0 token
  try {
    const accessToken = await getAccessToken();
    console.log(`[dailyRituals ${timestamp}] Access token:`, accessToken ? 'present' : 'MISSING');
    
    if (!accessToken) {
      console.warn(`[dailyRituals ${timestamp}] No access token available - ritual completion will NOT be saved!`);
      console.warn(`[dailyRituals ${timestamp}] Check if window.__auth0Client is available:`, !!(window as any).__auth0Client);
      return;
    }

    console.log(`[dailyRituals ${timestamp}] Using ritual_date:`, today);
    
    // Step 1: Get existing data
    console.log(`[dailyRituals ${timestamp}] Fetching existing ritual...`);
    const existingRitual = await getTodayRitual();
    console.log(`[dailyRituals ${timestamp}] Existing ritual:`, existingRitual ? 'found' : 'none');
    
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
    console.log(`[dailyRituals ${timestamp}] Upserting ritual data:`, ritualData);
    const upsertResult = await upsertRitual(ritualData);
    console.log(`[dailyRituals ${timestamp}] Upsert result:`, upsertResult ? 'SUCCESS' : 'FAILED');

    // Step 3: Fetch fresh data and calculate status
    console.log(`[dailyRituals ${timestamp}] Fetching fresh ritual for status calculation...`);
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
      
      console.log(`[dailyRituals ${timestamp}] Calculated status:`, { completed, totalRecommended, newStatus });
      
      // Step 4: Update status
      const statusResult = await upsertRitual({
        ritual_date: today,
        completion_status: newStatus
      });
      console.log(`[dailyRituals ${timestamp}] Status update result:`, statusResult ? 'SUCCESS' : 'FAILED');
    } else {
      console.warn(`[dailyRituals ${timestamp}] Could not fetch fresh ritual for status calculation`);
    }
  } catch (error) {
    console.error(`[dailyRituals ${timestamp}] Failed to update ritual completion:`, error);
  }
}
