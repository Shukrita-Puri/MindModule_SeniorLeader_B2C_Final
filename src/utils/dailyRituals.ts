import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import {
  getSupabaseFunctionHeaders,
  getSupabaseFunctionUrl,
  readResponseBody,
} from '@/utils/supabaseFunctions';

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
  plan_ledger?: {
    modules?: unknown[];
    generatedAt?: string;
    generatedPeriod?: string;
    source?: string;
    userEdits?: {
      slotEdits?: Record<string, {
        cancelled?: boolean;
        cancelReason?: string | null;
        replacementEventIds?: string[];
        priorityTag?: 'high' | 'medium' | 'low' | null;
        relationshipTag?: string | null;
        customTags?: string[];
        updatedAt?: string;
      }>;
      updatedAt?: string;
    };
  } | null;
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
    return (data || []) as unknown as RitualData[];
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
    return (data || null) as unknown as RitualData | null;
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

/**
 * Stateful Plan Evolution: union of completed_practice_ids across ALL of
 * today's session_period rows. A practice completed in the morning continues
 * to count as ✓ in the afternoon brief, so the user never feels like the
 * plan "forgot" what they did.
 *
 * Falls back to the current period's row on error.
 */
export async function getTodayCompletedUnion(): Promise<string[]> {
  const today = new Date().toLocaleDateString('en-CA');

  if (DEV_MODE) {
    const { data, error } = await supabase
      .from('daily_ritual_completions')
      .select('completed_practice_ids')
      .eq('user_id', DEV_USER.id)
      .eq('ritual_date', today);
    if (error || !data) return [];
    const set = new Set<string>();
    for (const row of data) for (const id of (row?.completed_practice_ids || [])) set.add(id);
    return Array.from(set);
  }

  // Production: piggy-back on getRituals(1) which already authorises and
  // returns today's rows (one per session_period).
  try {
    const todays = await getRituals(1);
    const set = new Set<string>();
    for (const row of todays) {
      if (row.ritual_date !== today) continue;
      for (const id of (row.completed_practice_ids || [])) set.add(id);
    }
    return Array.from(set);
  } catch {
    return [];
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
    return (data || []) as unknown as RitualData[];
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
  // DEV_MODE: Use edge function path (bypasses RLS via service role)
  if (DEV_MODE) {
    try {
      const { data, error } = await supabase.functions.invoke('daily-rituals', {
        headers: { 'x-dev-user-id': DEV_USER.id },
        body: { action: 'UPSERT_RITUAL', ritualData: { ...ritualData, session_period: ritualData.session_period || getCurrentTimeWindowForRituals() } }
      });
      if (error) throw error;
      return data?.data || null;
    } catch (error) {
      console.error('[dailyRituals] DEV_MODE upsertRitual error:', error);
      // localStorage fallback so completion state persists in dev
      const key = `dev_ritual_${ritualData.ritual_date}_${ritualData.session_period || getCurrentTimeWindowForRituals()}`;
      const existing = JSON.parse(localStorage.getItem(key) || '{}');
      const merged = { ...existing, ...ritualData, user_id: DEV_USER.id };
      localStorage.setItem(key, JSON.stringify(merged));
      return merged as RitualData;
    }
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

function mergePlanEditState(
  existing: NonNullable<NonNullable<RitualData['plan_ledger']>['userEdits']> | undefined,
  slotKey: string,
  patch: {
    cancelled?: boolean;
    cancelReason?: string | null;
    replacementEventIds?: string[];
    priorityTag?: 'high' | 'medium' | 'low' | null;
    relationshipTag?: string | null;
    customTags?: string[];
  },
) {
  const now = new Date().toISOString();
  const slotEdits = { ...(existing?.slotEdits || {}) };
  const current = slotEdits[slotKey] || {};
  slotEdits[slotKey] = {
    ...current,
    ...patch,
    updatedAt: now,
  };
  return {
    slotEdits,
    updatedAt: now,
  };
}

export async function persistPlanLedgerEdit(
  slotIndex: number,
  patch: {
    cancelled?: boolean;
    cancelReason?: string | null;
    replacementEventIds?: string[];
    priorityTag?: 'high' | 'medium' | 'low' | null;
    relationshipTag?: string | null;
    customTags?: string[];
  },
  sessionPeriod?: 'morning' | 'afternoon' | 'evening',
): Promise<RitualData | null> {
  const today = new Date().toLocaleDateString('en-CA');
  const period = sessionPeriod || getCurrentTimeWindowForRituals();
  const slotKey = `slot-${slotIndex}`;

  try {
    const existingRitual = await getTodayRitual(period);
    const existingLedger = existingRitual?.plan_ledger || null;
    const existingEdits = existingLedger?.userEdits;
    const nextLedger = {
      ...(existingLedger || {}),
      userEdits: mergePlanEditState(existingEdits, slotKey, patch),
    };

    return await upsertRitual({
      ritual_date: today,
      session_period: period,
      plan_ledger: nextLedger,
    });
  } catch (error) {
    console.error('[dailyRituals] Failed to persist plan ledger edit:', error);
    return null;
  }
}

export interface PracticeCompletionMeta {
  /** ISO timestamp the practice actually started (used by the impact engine). */
  startedAt?: string | null;
  /** ISO timestamp the practice finished. Defaults to now. */
  completedAt?: string | null;
  /**
   * True when the practice was launched from the daily plan queue.
   * False for ad-hoc launches from the library — those are still logged.
   */
  isPlanPractice?: boolean;
  /** Where the launch came from, e.g. 'plan', 'library', 'jit'. */
  planContext?: string | null;
  /**
   * Auth token captured earlier (e.g. on player mount) so the completion
   * call still has a valid bearer even when the audio-ended event fires
   * after the page loses focus and the Auth0 client becomes unavailable.
   */
  cachedToken?: string | null;
}

// Helper to update ritual completion with status recalculation
// Uses atomic COMPLETE_PRACTICE action (single server call) to avoid race conditions
export async function updateRitualCompletion(
  practiceType: 'soundscape' | 'guided_practice' | 'micro_exercise',
  practiceId: string,
  practiceQueue?: { id: string }[],
  options?: PracticeCompletionMeta,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const today = new Date().toLocaleDateString('en-CA');
  const currentPeriod = getCurrentTimeWindowForRituals();
  const completedAt = options?.completedAt || timestamp;
  const startedAt = options?.startedAt ?? null;
  const isPlanPractice =
    options?.isPlanPractice ?? (practiceQueue ? practiceQueue.some((p) => p.id === practiceId) : false);
  const planContext = options?.planContext ?? (isPlanPractice ? 'plan' : 'library');

  console.log(`[dailyRituals] updateRitualCompletion:`, {
    practiceType, practiceId, queueLength: practiceQueue?.length,
    sessionPeriod: currentPeriod, date: today, timestamp, isPlanPractice, planContext,
  });
  
  // DEV_MODE: Direct database – single atomic upsert
  if (DEV_MODE) {
    console.log(`[dailyRituals] DEV_MODE: Atomic update for period=${currentPeriod}`);
    
    try {
      // Get existing ritual for current period
      const existingRitual = await getTodayRitual(currentPeriod);
      const existingIds = existingRitual?.completed_practice_ids || [];
      const newCompletedIds = existingIds.includes(practiceId) ? existingIds : [...existingIds, practiceId];
      
      const ritualData: Record<string, unknown> = {
        ritual_date: today,
        completed_practice_ids: newCompletedIds,
        is_plan_practice: isPlanPractice,
        plan_context: planContext,
        practice_started_at: startedAt,
        practice_completed_at: completedAt,
      };

      if (practiceType === 'soundscape') {
        ritualData.soundscape_completed = true;
        ritualData.soundscape_completed_at = completedAt;
      } else if (practiceType === 'guided_practice') {
        ritualData.guided_practice_completed = true;
        ritualData.guided_practice_completed_at = completedAt;
      } else if (practiceType === 'micro_exercise') {
        ritualData.micro_exercise_completed = true;
        ritualData.micro_exercise_completed_at = completedAt;
      }

      if (practiceQueue) {
        ritualData.recommended_practice_ids = practiceQueue.map(p => p.id);
        ritualData.recommended_practices_count = practiceQueue.length;
      }

      // Calculate status in single pass
      const totalRecommended = (ritualData.recommended_practices_count as number) || existingRitual?.recommended_practices_count || 3;
      ritualData.completion_status = newCompletedIds.length >= totalRecommended && newCompletedIds.length > 0
        ? 'full'
        : newCompletedIds.length > 0
          ? 'partial'
          : 'skipped';

      const result = await upsertRitual(ritualData as Omit<RitualData, 'id' | 'user_id'>);
      console.log(`[dailyRituals] DEV_MODE result:`, { 
        success: !!result, completedIds: newCompletedIds, 
        status: ritualData.completion_status, period: currentPeriod 
      });
    } catch (error) {
      console.error(`[dailyRituals] DEV_MODE update failed:`, error);
    }
    return;
  }
  
  // Production: Single atomic COMPLETE_PRACTICE call via edge function
  try {
    let accessToken = options?.cachedToken ?? null;

    if (!accessToken) {
      accessToken = await getAccessToken();
    }

    if (!accessToken) {
      // One retry — token refresh can be mid-flight right after a player unmounts.
      await new Promise((r) => setTimeout(r, 600));
      accessToken = await getAccessToken();
    }

    if (!accessToken) {
      console.error(`[dailyRituals] No access token – COMPLETE_PRACTICE NOT saved!`, { practiceId, practiceType });
      return;
    }

    console.log(`[dailyRituals] Invoking COMPLETE_PRACTICE EF:`, { practiceType, practiceId, sessionPeriod: currentPeriod, isPlanPractice, planContext });

    // Use an explicit request here. Unlike the SDK invoke path, this preserves
    // the Auth0 Authorization header through the function gateway in production.
    const response = await fetch(getSupabaseFunctionUrl('daily-rituals'), {
      method: 'POST',
      headers: getSupabaseFunctionHeaders(accessToken),
      body: JSON.stringify({
        action: 'COMPLETE_PRACTICE',
        practiceType,
        practiceId,
        practiceQueue,
        sessionPeriod: currentPeriod,
        isPlanPractice,
        planContext,
        startedAt,
        completedAt,
      }),
    });

    if (!response.ok) {
      const responseBody = await readResponseBody(response);
      throw new Error(
        `daily-rituals COMPLETE_PRACTICE failed (${response.status}): ${responseBody || response.statusText}`,
      );
    }

    const data = await response.json();

    console.log(`[dailyRituals] COMPLETE_PRACTICE success:`, { 
      status: data?.data?.completion_status, 
      completedCount: data?.data?.completed_practice_ids?.length,
      period: currentPeriod
    });
  } catch (error) {
    console.error(`[dailyRituals ${timestamp}] Failed to update ritual completion:`, error, { practiceId, practiceType });
  }
}


