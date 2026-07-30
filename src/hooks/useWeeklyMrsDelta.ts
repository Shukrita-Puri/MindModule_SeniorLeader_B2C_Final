import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE } from '@/config/devMode';

export type ReadinessComposition =
  | 'baseline-only'
  | 'refined-with-baseline'
  | 'check-in-only'
  | 'awaiting'
  | 'unknown';

export type WeeklyMrsDeltaReason =
  | 'composition_mismatch'
  | 'not_enough_history'
  | 'awaiting_signals'
  | null;

export interface WeeklyMrsDelta {
  /** Signed integer delta: this Mon→today AVG minus last Mon→Sun AVG. */
  delta: number | null;
  /** This week's average MRS to date, using the same comparison metric. */
  thisWeekAvg: number | null;
  /** Prior week's average MRS, using the same comparison metric. */
  lastWeekAvg: number | null;
  /** Which input the delta is computed from for today's user. */
  mode: 'baseline' | 'refined';
  /** Pretty pts label e.g. "+4 pts", "−3 pts", or null when delta unknown. */
  label: string | null;
  /** Why the delta was suppressed, if it was. */
  reason: WeeklyMrsDeltaReason;
  /** Composition of the current week window. */
  thisWeekComposition: ReadinessComposition;
  /** Composition of the prior week window. */
  lastWeekComposition: ReadinessComposition;
}

function isoLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Monday of the ISO week containing `d` (in local time). */
function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  out.setDate(out.getDate() + diff);
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

export function useWeeklyMrsDelta() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery<WeeklyMrsDelta>({
    queryKey: ['mrs-weekly-delta', userId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const today = new Date();
      const thisMon = mondayOf(today);
      const lastMon = addDays(thisMon, -7);
      const lastToday = addDays(today, -7);

      const body = {
        action: 'GET_WEEKLY_DELTA' as const,
        thisMonday: isoLocal(thisMon),
        lastMonday: isoLocal(lastMon),
        lastToday: isoLocal(lastToday),
        today: isoLocal(today),
      };

      try {
        const token = DEV_MODE ? null : await getAuthToken();
        const { data, error } = await supabase.functions.invoke('mental-fitness-scores', {
          body,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (error) throw error;
        const payload = data?.data || {};
        const todayState = (payload.todayState as string) === 'refined' ? 'refined' : 'baseline';
        const refinedDelta = typeof payload.refinedDelta === 'number' ? payload.refinedDelta : null;
        const baselineDelta = typeof payload.baselineDelta === 'number' ? payload.baselineDelta : null;
        const reason = (payload.reason as WeeklyMrsDeltaReason) ?? null;
        const thisWeekComposition = (payload.thisWeekComposition as ReadinessComposition) ?? 'unknown';
        const lastWeekComposition = (payload.lastWeekComposition as ReadinessComposition) ?? 'unknown';
        const thisWeekAvg = typeof payload.thisWeekAvg === 'number' ? payload.thisWeekAvg : null;
        const lastWeekAvg = typeof payload.lastWeekAvg === 'number' ? payload.lastWeekAvg : null;
        const comparisonMetric = (payload.comparisonMetric as 'baseline' | 'refined' | undefined)
          ?? (todayState === 'refined' ? 'refined' : 'baseline');
        // Prefer the input matching the comparison metric; fall back to baseline.
        const mode: 'baseline' | 'refined' =
          comparisonMetric === 'refined' && refinedDelta !== null ? 'refined' : 'baseline';
        const delta = mode === 'refined' ? refinedDelta : baselineDelta;
        const label =
          delta === null || reason !== null
            ? null
            : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} pts`;
        return { delta, thisWeekAvg, lastWeekAvg, mode, label, reason, thisWeekComposition, lastWeekComposition };
      } catch {
        return {
          delta: null,
          thisWeekAvg: null,
          lastWeekAvg: null,
          mode: 'baseline',
          label: null,
          reason: 'not_enough_history',
          thisWeekComposition: 'unknown',
          lastWeekComposition: 'unknown',
        };
      }
    },
  });
}
