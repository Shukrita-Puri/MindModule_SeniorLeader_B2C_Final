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
import { getAuthToken } from '@/services/authTokenService';
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

type SignalPillMetadata = {
  isScoreBearing?: boolean;
  freshness?: 'fresh' | 'stale' | 'missing' | 'non_score_bearing' | null;
};

export function hasFreshScoreBearingSignal(signalPills: unknown[] | null): boolean {
  if (!Array.isArray(signalPills) || signalPills.length === 0) return false;

  return signalPills.some((pill) => {
    if (!pill || typeof pill !== 'object' || Array.isArray(pill)) return false;
    const typedPill = pill as SignalPillMetadata;
    if (typedPill.isScoreBearing !== true) return false;
    return typedPill.freshness == null || typedPill.freshness === 'fresh';
  });
}

export function useMrsSnapshot() {
  const { user } = useAuth();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
  const localDate = localISODate();
  const mrsWindow = currentPeriodLocal() as MrsWindow;

  return useQuery<MrsSnapshot | null>({
    queryKey: ['mrs-snapshot', effectiveUserId, localDate, mrsWindow],
    enabled: !!effectiveUserId,
    // 15 min — matches the `build-executive-home-cards` cron cadence. The DB
    // value cannot be fresher than the last cron write, so shorter windows
    // only create pointless refetches that can visibly change the score.
    staleTime: 15 * 60 * 1000,
    queryFn: async () => {
      if (!effectiveUserId) return null;

      // Read via authenticated Edge Function — the shared browser client
      // is anon-keyed only, so a direct table read is filtered by RLS on
      // `daily_context_snapshot` and always returns null for Auth0 users.
      const token = DEV_MODE ? null : await getAuthToken().catch(() => null);
      const { data: resp, error } = await supabase.functions.invoke(
        'get-mrs-snapshot',
        {
          body: { localDate, mrsWindow },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );

      const row = (resp as { data?: Record<string, any> | null } | null)?.data ?? null;
      if (error || !row) {
        // eslint-disable-next-line no-console
        console.warn('[useMrsSnapshot] no row', {
          effectiveUserId,
          localDate,
          mrsWindow,
          error: error?.message ?? null,
        });
        return null;
      }

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
      const signalPills = asArray(row.signal_pills);
      const hasFreshSignal = hasFreshScoreBearingSignal(signalPills);
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
        hasFreshSignal,
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
        signalPills,
        divergenceFlag:
          (row.supply_demand_gap_flag as string | null) ?? null,
        updatedAt: (row.updated_at as string | null) ?? null,
        status,
        isRenderable: hasScore && readinessState !== 'awaiting' && hasFreshSignal,
      };

    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnMount: true,
  });
}
