/**
 * useOuterReadiness — shared hook for the Outer Readiness Brief
 * Calls compute-outer-readiness edge function and caches via react-query.
 * All components that need theme/phrase/leanOn/watchFor share this cache.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { supabase } from '@/integrations/supabase/client';
import { getTodayCheckin } from '@/utils/dailyCheckins';

export interface OuterReadinessData {
  phrase: string;
  context: string;
  leanOn: string;
  watchFor: string;
  driver: string;
  dataSources: string[];
}

async function getAuth0Token(): Promise<string | null> {
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

export async function fetchOuterReadiness(userId: string | undefined): Promise<OuterReadinessData | null> {
  if (!userId) return null;

  // Get energy state + today's check-in + profile in parallel
  const [energyState, checkin, token] = await Promise.all([
    computeEnergyState(userId),
    getTodayCheckin(),
    getAuth0Token(),
  ]);
  if (!token) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('user_archetype')
    .eq('id', userId)
    .single();

  const res = await supabase.functions.invoke('compute-outer-readiness', {
    body: {
      innerReadinessTier: energyState.energyTier,
      innerReadinessScore: energyState.overallBalance ?? 50,
      calendarLoad: energyState.calendarLoad || null,
      calendarPressure: energyState.calendarPressure || null,
      archetype: profile?.user_archetype || null,
      clarityLevel: checkin?.clarity_level ?? null,
      confidenceLevel: checkin?.confidence_level ?? null,
      checkInOutcome: energyState.checkInOutcome || null,
    },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.error) {
    console.error('[useOuterReadiness] Edge function error:', res.error);
    return null;
  }

  return res.data as OuterReadinessData;
}

export function useOuterReadiness() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['outer-readiness', user?.id],
    queryFn: () => fetchOuterReadiness(user?.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}
