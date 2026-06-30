import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import {
  currentPeriod as currentPeriodLocal,
  localISODate,
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

      const { data, error } = await supabase.functions.invoke('build-executive-home-cards', {
        headers,
        body: {
          mode: 'manual_refresh',
          userId: DEV_MODE ? effectiveUserId : undefined,
          localDate: localISODate(),
          window: currentPeriodLocal(),
        },
      });
      if (error) throw new Error(error.message || 'Refresh failed.');
      return data;
    },
    onSuccess: async () => {
      clearEnergyStateCache();
      clearOuterReadinessCache(effectiveUserId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mrs-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['current-brief-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['mastery-plan-snapshot'] }),
        queryClient.invalidateQueries({ queryKey: ['outer-readiness'] }),
      ]);
      toast.success("Today's cards refreshed");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Could not refresh cards.');
    },
  });
}
