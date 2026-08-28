import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import {
  currentPeriod as currentPeriodLocal,
  localISODate,
  clear as clearPersistent,
  cacheKeys,
} from '@/utils/persistentBriefCache';
import { clearOuterReadinessCache } from '@/hooks/useOuterReadiness';
import { clearEnergyStateCache } from '@/utils/energyStateEngine';
import { toast } from 'sonner';

const COOLDOWN_MS = 30_000;
let lastRefreshAt = 0;

export function useExecutiveHomeCardsRefresh() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;

  return useMutation({
    mutationFn: async () => {
      if (!effectiveUserId) throw new Error('Sign in to refresh your cards.');
      const now = Date.now();
      if (now - lastRefreshAt < COOLDOWN_MS) {
        throw new Error('Cards were just refreshed. Give it a moment.');
      }
      lastRefreshAt = now;

      const headers: Record<string, string> = {};
      if (DEV_MODE) headers['x-dev-user-id'] = effectiveUserId;
      const token = await getAuthToken();
      if (token) headers.Authorization = `Bearer ${token}`;

      const localDate = localISODate();
      const window = currentPeriodLocal();
      console.info('[exec-home][refresh:start]', {
        localDate,
        window,
        trigger: 'manual_refresh',
      });
      const { data, error } = await supabase.functions.invoke('build-executive-home-cards', {
        headers,
        body: {
          mode: 'manual_refresh',
          userId: DEV_MODE ? effectiveUserId : undefined,
          localDate,
          window,
        },
      });
      if (error) {
        console.warn('[exec-home][refresh:response]', {
          localDate,
          window,
          status: 'error',
          error: error.message,
        });
        throw new Error(error.message || 'Refresh failed.');
      }
      const rawResults = Array.isArray((data as any)?.results) ? (data as any).results : null;
      if (!rawResults) {
        console.warn('[exec-home][refresh:response]', {
          localDate,
          window,
          status: 'success',
          malformed: true,
          raw: data,
        });
      } else {
        console.info('[exec-home][refresh:response]', {
          localDate,
          window,
          status: 'success',
          resultCount: rawResults.length,
          results: rawResults.map((r: any) => ({
            userId: r?.userId,
            localDate: r?.localDate,
            window: r?.window,
            mrsStatus: r?.mrsStatus ?? r?.mrs?.status ?? null,
            briefStatus: r?.briefStatus ?? r?.brief?.status ?? null,
            planStatus: r?.planStatus ?? r?.plan?.status ?? null,
            dayType: r?.dayType ?? null,
          })),
        });
      }
      return data;
    },
    onSuccess: async () => {
      clearEnergyStateCache();
      // Manual refresh is ONE atomic backend operation:
      // `build-executive-home-cards` has already regenerated MRS, Brief and
      // Plan server-side. We only evict client caches and re-read the three
      // persisted snapshots — we must NOT arm the force-refresh marker,
      // which would fire a second live `compute-outer-readiness` from the
      // client and drop all three cards back into a loading/awaiting flip.
      clearOuterReadinessCache(effectiveUserId, {
        forceLiveCompute: false,
        clearPersistentBrief: false,
      });
      const localDate = localISODate();
      const window = currentPeriodLocal();
      console.info('[exec-home][refresh:invalidate]', {
        queries: [
          'mrs-snapshot',
          'current-brief-snapshot',
          'mastery-plan-snapshot',
        ],
        localDate,
        window,
      });
      // Refetch (not just invalidate) so we can wait for the refreshed
      // snapshots before touching the browser's per-window Brief cache.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ['mrs-snapshot'] }),
        queryClient.refetchQueries({ queryKey: ['current-brief-snapshot'] }),
        queryClient.refetchQueries({ queryKey: ['mastery-plan-snapshot'] }),
      ]);
      // The browser keeps its own per-user/date/window copy of the Brief in
      // localStorage — that behaviour is intentional and stays. Only AFTER
      // the refreshed snapshots have been read do we drop the current
      // window's stale entry, so the card cannot repaint pre-refresh text
      // and never shows a gap while regeneration is in flight. Other
      // windows/days are untouched.
      if (effectiveUserId) {
        clearPersistent(cacheKeys.brief(effectiveUserId, window, localDate));
        clearPersistent(cacheKeys.briefAwaiting(effectiveUserId, window, localDate));
      }
      toast.success("Today's cards refreshed");
    },

    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not refresh cards.');
    },
  });
}
