/**
 * useOuterReadiness – shared hook for the Outer Readiness Brief
 * Calls compute-outer-readiness edge function and caches via react-query.
 * All components that need theme/phrase/leanOn/watchFor share this cache.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { supabase } from '@/integrations/supabase/client';
import { getTodayCheckin } from '@/utils/dailyCheckins';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';

export interface OuterReadinessData {
  phrase: string;
  context: string;
  leanOn: string;
  watchFor: string;
  driver: string;
  dataSources: string[];
  calendarState?: 'active' | 'connected_no_events' | 'not_connected';
  coachInsightAge?: number;
  coachInsightLabel?: string;
}

export async function fetchOuterReadiness(userId: string | undefined): Promise<OuterReadinessData | null> {
  if (!userId) return null;

  // Get energy state + today's check-in in parallel
  const [energyState, checkin] = await Promise.all([
    computeEnergyState(userId),
    getTodayCheckin(),
  ]);

  // Build auth headers – in DEV_MODE, skip Auth0 token and pass userId in body
  const headers: Record<string, string> = {};
  if (!DEV_MODE) {
    let token: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      token = await getAuthToken();
      if (token) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!token) {
      console.warn('[useOuterReadiness] No Auth0 token after retries – skipping edge call');
      return null;
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Calendar load/pressure now computed server-side – no need to send from client
  const res = await supabase.functions.invoke('compute-outer-readiness', {
    body: {
      innerReadinessTier: energyState.energyTier,
      innerReadinessScore: energyState.overallBalance ?? 50,
      clarityLevel: checkin?.clarity_level ?? null,
      confidenceLevel: checkin?.confidence_level ?? null,
      checkInOutcome: energyState.checkInOutcome || null,
      timezoneOffset: new Date().getTimezoneOffset(),
      ...(DEV_MODE ? { userId } : {}),
    },
    headers,
  });

  if (res.error) {
    console.error('[useOuterReadiness] Edge function error:', res.error);
    return null;
  }

  const data = res.data as OuterReadinessData;
  console.log('[useOuterReadiness] Brief received:', {
    phrase: data.phrase,
    driver: data.driver,
    calendarState: data.calendarState,
    dataSources: data.dataSources,
  });

  return data;
}

export function useOuterReadiness() {
  const { user } = useAuth();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;

  return useQuery({
    queryKey: ['outer-readiness', effectiveUserId],
    queryFn: () => fetchOuterReadiness(effectiveUserId),
    enabled: !!effectiveUserId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    placeholderData: (prev) => prev, // Keep previous data during refetch to avoid skeleton flash
  });
}
