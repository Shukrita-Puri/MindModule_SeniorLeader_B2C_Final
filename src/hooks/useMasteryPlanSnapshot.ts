/**
 * useMasteryPlanSnapshot — read-only access to the persisted day-of Plan
 * payload stored in `mastery_plan_snapshots` by `generate-mastery-plan`.
 *
 * Phase 3.6: diagnostic only. The hook does NOT trigger generation, does
 * NOT fall back to other windows, and is not yet the UI source of truth.
 * It exists so we can verify what the backend persisted before flipping
 * `/executive-home` to a snapshot-read-first model.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import { localISODate } from '@/utils/persistentBriefCache';

export type MrsWindow = 'morning' | 'afternoon' | 'evening';
export type MasteryPlanSnapshotStatus = 'ready' | 'error' | 'pending';

export interface MasteryPlanSnapshot {
  id: string;
  planJson: Record<string, unknown> | null;
  horizonModules: unknown[];
  priorities: unknown[];
  recommendedPracticeIds: string[];
  planLedger: Record<string, unknown> | null;
  status: MasteryPlanSnapshotStatus;
  errorJson: Record<string, unknown> | null;
  generatedAt: string | null;
  inputSignature: string | null;
  planDate: string;
  mrsWindow: MrsWindow;
  dayKind: string | null;
  horizonIso: string | null;
  deliveredAt: string | null;
  viewedAt: string | null;
}

const DEBUG =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
function dbg(...args: unknown[]) {
  if (DEBUG) console.log('[useMasteryPlanSnapshot:debug]', ...args);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}
function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function useMasteryPlanSnapshot() {
  const { user } = useAuth();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
  const planDate = localISODate();

  return useQuery<MasteryPlanSnapshot | null>({
    queryKey: ['mastery-plan-snapshot', effectiveUserId, planDate],
    enabled: !!effectiveUserId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!effectiveUserId) return null;

      // Read via authenticated Edge Function — the browser Supabase
      // client is anon-keyed and RLS on `mastery_plan_snapshots` scopes
      // by auth.jwt()->>'sub', so a direct read always returns null for
      // Auth0 users.
      const token = DEV_MODE ? null : await getAuthToken().catch(() => null);
      const { data: resp, error } = await supabase.functions.invoke(
        'get-mastery-plan-snapshot',
        {
          body: { planDate },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const data = (resp as { data?: Record<string, any> | null } | null)?.data ?? null;

      if (error) {
        dbg('query error', error.message);
        // eslint-disable-next-line no-console
        console.warn('[useMasteryPlanSnapshot] no row', {
          effectiveUserId,
          planDate,
          error: error.message,
        });
        return null;
      }
      if (!data) {
        dbg('no snapshot', { effectiveUserId, planDate });
        // eslint-disable-next-line no-console
        console.warn('[useMasteryPlanSnapshot] no row', {
          effectiveUserId,
          planDate,
          error: null,
        });
        return null;
      }

      const snapshot: MasteryPlanSnapshot = {
        id: (data as any).id as string,
        planJson: asRecord((data as any).plan_json),
        horizonModules: asArray((data as any).horizon_modules),
        priorities: asArray((data as any).priorities),
        recommendedPracticeIds: asStringArray((data as any).recommended_practice_ids),
        planLedger: asRecord((data as any).plan_ledger),
        status: ((data as any).status ?? 'ready') as MasteryPlanSnapshotStatus,
        errorJson: asRecord((data as any).error_json),
        generatedAt: ((data as any).generated_at ?? null) as string | null,
        inputSignature: ((data as any).input_signature ?? null) as string | null,
        planDate: ((data as any).plan_date ?? planDate) as string,
        mrsWindow: ((data as any).mrs_window ?? 'morning') as MrsWindow,
        dayKind: ((data as any).day_kind ?? null) as string | null,
        horizonIso: ((data as any).horizon_iso ?? null) as string | null,
        deliveredAt: ((data as any).delivered_at ?? null) as string | null,
        viewedAt: ((data as any).viewed_at ?? null) as string | null,
      };

      dbg('snapshot loaded', {
        status: snapshot.status,
        generatedAt: snapshot.generatedAt,
        priorities: snapshot.priorities.length,
        horizonModules: snapshot.horizonModules.length,
      });
      // eslint-disable-next-line no-console
      console.info('[useMasteryPlanSnapshot] loaded', {
        planDate,
        status: snapshot.status,
        horizonModules: snapshot.horizonModules.length,
        priorities: snapshot.priorities.length,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[plan-snapshot][render] source=snapshot canonicalWindow=morning planDate=${planDate} found=true`,
      );

      return snapshot;
    },
  });
}
