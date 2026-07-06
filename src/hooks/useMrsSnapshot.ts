/**
 * useMrsSnapshot — read-only access to the latest current-window
 * `daily_context_snapshot` row for the signed-in user.
 *
 * Phase 3.9 (MRS snapshot-read-first). `MrsPage` prefers this hook's
 * payload over the live `useOuterReadiness` round-trip. The live hook
 * is NOT replaced — when the current-window row is missing, this hook
 * returns `null` and the caller falls back to live compute. We never
 * fall back to a different window or a different day; stale-window
 * readings would silently lie about the user's current state.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import {
  localISODate,
  currentPeriod as currentPeriodLocal,
} from '@/utils/persistentBriefCache';

export type MrsWindow = 'morning' | 'afternoon' | 'evening';
export type MrsReadinessState = 'baseline' | 'refined' | 'awaiting';
export type MrsSnapshotStatus = 'ready' | 'awaiting' | 'unknown';

export interface MrsSnapshot {
  score: number | null;
  tier: string | null;
  tierCapReason: string | null;
  scoreBaseline: number | null;
  scoreRefined: number | null;
  readinessState: MrsReadinessState | null;
  refinedContribution: number | null;
  mrsWindow: MrsWindow;
  weightProvenance: Record<string, unknown> | null;
  signalPills: unknown[] | null;
  /** Mapped from `supply_demand_gap_flag`. */
  divergenceFlag: string | null;
  updatedAt: string | null;
  status: MrsSnapshotStatus;
  /** True when a numeric score is present and the row is for the current window. */
  isRenderable: boolean;
}

const SELECT_COLUMNS = [
  'inner_score',
  'inner_tier',
  'tier_displayed',
  'tier_cap_reason',
  'readiness_score_baseline',
  'readiness_score_refined',
  'readiness_state',
  'refined_contribution',
  'mrs_window',
  'weight_provenance',
  'signal_pills',
  'supply_demand_gap_flag',
  'updated_at',
].join(', ');

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function useMrsSnapshot() {
  const { user } = useAuth();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
  const localDate = localISODate();
  const mrsWindow = currentPeriodLocal() as MrsWindow;

  return useQuery<MrsSnapshot | null>({
    queryKey: ['mrs-snapshot', effectiveUserId, localDate, mrsWindow],
    enabled: !!effectiveUserId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!effectiveUserId) return null;

      const { data, error } = await supabase
        .from('daily_context_snapshot')
        .select(SELECT_COLUMNS)
        .eq('user_id', effectiveUserId)
        .eq('local_date', localDate)
        .eq('mrs_window', mrsWindow)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        // eslint-disable-next-line no-console
        console.warn('[useMrsSnapshot] no row', {
          effectiveUserId,
          localDate,
          mrsWindow,
          error: error?.message ?? null,
        });
        return null;
      }

      const row = data as Record<string, any>;
      const state = (row.readiness_state as string | null) ?? null;
      const readinessState: MrsReadinessState | null =
        state === 'refined' || state === 'baseline' || state === 'awaiting'
          ? state
          : null;

      const refined = asFiniteNumber(row.readiness_score_refined);
      const baseline = asFiniteNumber(row.readiness_score_baseline);
      const inner = asFiniteNumber(row.inner_score);
      const score =
        readinessState === 'refined' && refined !== null
          ? refined
          : (baseline ?? inner);

      const tier =
        (row.tier_displayed as string | null) ??
        (row.inner_tier as string | null) ??
        null;

      const hasScore = score !== null;
      const status: MrsSnapshotStatus = hasScore
        ? 'ready'
        : readinessState === 'awaiting'
          ? 'awaiting'
          : 'unknown';

      // eslint-disable-next-line no-console
      console.info('[useMrsSnapshot] row', {
        effectiveUserId,
        localDate,
        mrsWindow,
        rowWindow: row.mrs_window,
        score,
        baseline,
        refined,
        readinessState,
        tier,
        hasScore,
      });

      return {
        score,
        tier,
        tierCapReason: (row.tier_cap_reason as string | null) ?? null,
        scoreBaseline: baseline,
        scoreRefined: refined,
        readinessState,
        refinedContribution: asFiniteNumber(row.refined_contribution),
        mrsWindow: (row.mrs_window as MrsWindow) ?? mrsWindow,
        weightProvenance: asRecord(row.weight_provenance),
        signalPills: asArray(row.signal_pills),
        divergenceFlag:
          (row.supply_demand_gap_flag as string | null) ?? null,
        updatedAt: (row.updated_at as string | null) ?? null,
        status,
        isRenderable: hasScore,
      };

    },
  });
}
