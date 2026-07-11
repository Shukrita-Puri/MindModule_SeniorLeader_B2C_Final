/**
 * useMasteryPlanSnapshot — read-only access to the persisted day-of Plan
 * payload stored in `mastery_plan_snapshots` by `generate-mastery-plan`.
 *
 * Snapshot-first contract (post Phase 3.7): this hook IS the primary
 * source of truth for the Plan card on `/executive-home`. It does not
 * trigger generation and does not fall back to other windows client-side
 * — the edge function `get-mastery-plan-snapshot` performs the
 * current-window-first + latest-ready cross-window fallback and stamps
 * `source.strategy` / `source.crossWindowFallback` on the response so
 * the UI can distinguish an exact hit from a fallback hit.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import { localISODate, currentPeriod as currentPeriodLocal } from '@/utils/persistentBriefCache';

export type MrsWindow = 'morning' | 'afternoon' | 'evening';
export type MasteryPlanSnapshotStatus = 'ready' | 'awaiting' | 'error' | 'pending';

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
  const mrsWindow = currentPeriodLocal() as MrsWindow;

  return useQuery<MasteryPlanSnapshot | null>({
    queryKey: ['mastery-plan-snapshot', effectiveUserId, planDate, mrsWindow],
    enabled: !!effectiveUserId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!effectiveUserId) return null;

      console.info('[plan-snapshot][fetch:start]', {
        effectiveUserId,
        planDate,
        requestedWindow: mrsWindow,
      });

      // Read via authenticated Edge Function — the browser Supabase
      // client is anon-keyed and RLS on `mastery_plan_snapshots` scopes
      // by auth.jwt()->>'sub', so a direct read always returns null for
      // Auth0 users.
      const token = DEV_MODE ? null : await getAuthToken().catch(() => null);
      const { data: resp, error } = await supabase.functions.invoke(
        'get-mastery-plan-snapshot',
        {
          // Send the current window so the reader prefers the
          // current-window snapshot; it falls back to the latest
          // ready row for the day if the current window has not
          // been generated yet.
          body: { planDate, mrsWindow },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const data = (resp as { data?: Record<string, any> | null } | null)?.data ?? null;
      const source = (resp as { source?: Record<string, any> | null } | null)?.source ?? null;

      if (error) {
        dbg('query error', error.message);
        console.warn('[plan-snapshot][fetch:error]', {
          effectiveUserId,
          planDate,
          requestedWindow: mrsWindow,
          error: error.message,
        });
        return null;
      }
      if (!data) {
        dbg('no snapshot', { effectiveUserId, planDate });
        console.info('[plan-snapshot][fetch:empty]', {
          effectiveUserId,
          planDate,
          requestedWindow: mrsWindow,
          sourceStrategy: source?.strategy ?? null,
          selectedWindow: source?.selectedWindow ?? null,
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
      console.info('[plan-snapshot][fetch:response]', {
        effectiveUserId,
        planDate,
        requestedWindow: mrsWindow,
        sourceStrategy: source?.strategy ?? null,
        selectedWindow: snapshot.mrsWindow,
        found: true,
        snapshotId: snapshot.id,
        status: snapshot.status,
        generatedAt: snapshot.generatedAt,
        horizonModulesCount: snapshot.horizonModules.length,
        prioritiesCount: snapshot.priorities.length,
        hasPlanJson: !!snapshot.planJson,
      });

      return snapshot;
    },
  });
}
