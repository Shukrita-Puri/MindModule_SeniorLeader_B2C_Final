import { useQuery } from '@tanstack/react-query';
import { addDays, format, startOfWeek } from 'date-fns';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { useAuth } from '@/hooks/useAuth';
import { fetchMrsDailySeries } from '@/services/mrsDailySeries';

/**
 * Weekly readiness dots for the Insights trajectory card.
 *
 * Uses the same React Query plumbing as `useMrsTrend` (retries + refetch on
 * mount/focus) so a slow native auth-token hydration on iOS no longer leaves
 * the dot row permanently grey: the 401 now throws and is retried instead of
 * being swallowed into an empty map.
 */
export function useMrsWeekSeries() {
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id ?? null;

  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const mondayISO = format(monday, 'yyyy-MM-dd');
  const sundayISO = format(addDays(monday, 6), 'yyyy-MM-dd');

  const query = useQuery<Record<string, number>>({
    queryKey: ['mrs-week-series', userId, mondayISO],
    enabled: DEV_MODE || !!userId,
    staleTime: 5 * 60 * 1000,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { byDate } = await fetchMrsDailySeries(userId, mondayISO, sundayISO);
      return byDate;
    },
  });

  return {
    weekScores: query.data ?? {},
    isLoading: query.isPending || query.isFetching,
    /** true when every retry failed — dots are "unknown", not "no data" */
    isError: query.isError,
  };
}
