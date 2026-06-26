/**
 * useCurrentBriefSnapshot — read-only access to the latest current-window
 * `brief_snapshots` row for the signed-in user.
 *
 * Phase 3.8 (Brief snapshot-read-first). DecisionReadinessBrief prefers
 * this hook's payload over a live `compute-outer-readiness` round-trip.
 * MRS still flows through `useOuterReadiness` — this hook never replaces
 * that contract globally, it only exposes brief-shaped fields so the
 * Brief card can render from the persisted snapshot.
 *
 * Stale-window protection:
 *   The query is scoped to `local_date = localISODate()` AND
 *   `time_window = currentPeriodLocal()`. We never fall back to a
 *   previous window — if the current window has no row, the hook
 *   returns `null` and the Brief card falls back to live compute.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import {
  localISODate,
  currentPeriod as currentPeriodLocal,
} from '@/utils/persistentBriefCache';
import { BRIEF_PROMPT_VERSION } from '@/constants/briefPromptVersion';

export type BriefWindow = 'morning' | 'afternoon' | 'evening';

export interface CurrentBriefSnapshot {
  briefId: string;
  localDate: string;
  timeWindow: BriefWindow;
  // ── Brief copy (generated columns COALESCE refined → baseline) ──
  phrase: string | null;
  bodyText: string | null;
  leanOn: string | null;
  leanOnSource: string | null;
  watchFor: string | null;
  watchForSource: string | null;
  briefSource: 'llm' | 'deterministic' | null;
  driver: string | null;
  // ── Score / tier / state ──
  innerReadinessScore: number | null;
  innerReadinessTier: string | null;
  innerReadinessTierDisplayed: string | null;
  innerReadinessScoreBaseline: number | null;
  innerReadinessScoreRefined: number | null;
  innerReadinessState: 'baseline' | 'refined' | 'awaiting' | null;
  // ── Signal pills + snapshots ──
  signalPills: unknown[] | null;
  wearableSnapshot: Record<string, unknown> | null;
  checkinSnapshot: Record<string, unknown> | null;
  checkInOutcome: string | null;
  // ── Pulled from payload_json ──
  behaviourSnapshot: Record<string, unknown> | null;
  sourceProvenance: Record<string, unknown> | null;
  // ── Derived ──
  /** Row is usable for rendering — either has copy or is an explicit awaiting row. */
  isRenderable: boolean;
  /** True for an awaiting row (phrase/body null but the row exists for this window). */
  isAwaitingRow: boolean;
  updatedAt: string | null;
}

const DEBUG =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
function dbg(...args: unknown[]) {
  if (DEBUG) console.log('[useCurrentBriefSnapshot:debug]', ...args);
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}
function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

const SELECT_COLUMNS = [
  'id',
  'local_date',
  'time_window',
  'updated_at',
  // Generated COALESCE columns
  'phrase',
  'body_text',
  'lean_on',
  'lean_on_source',
  'watch_for',
  'watch_for_source',
  'score',
  'tier',
  'signal_pills',
  // Split columns we still need for state/baseline-vs-refined surface
  'refined_state',
  'baseline_state',
  'refined_score',
  'baseline_score',
  'brief_source',
  'driver',
  'wearable_snapshot',
  'checkin_snapshot',
  'payload_json',
].join(', ');

export function useCurrentBriefSnapshot() {
  const { user } = useAuth();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
  const localDate = localISODate();
  const timeWindow = currentPeriodLocal() as BriefWindow;

  return useQuery<CurrentBriefSnapshot | null>({
    queryKey: [
      'current-brief-snapshot',
      effectiveUserId,
      localDate,
      timeWindow,
      BRIEF_PROMPT_VERSION,
    ],
    enabled: !!effectiveUserId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!effectiveUserId) return null;

      const { data, error } = await supabase
        .from('brief_snapshots')
        .select(SELECT_COLUMNS)
        .eq('user_id', effectiveUserId)
        .eq('local_date', localDate)
        .eq('time_window', timeWindow)
        // Prompt-version filter: after a backend rollback an older-prompt
        // row could be the most-recently-updated row for this window
        // (compute-outer-readiness upserts on
        //   user_id, local_date, time_window, input_signature, prompt_version
        // so different prompt versions live as distinct rows). Without
        // this filter the UI could serve a brief produced by an inactive
        // prompt contract. Keep `BRIEF_PROMPT_VERSION` in sync with
        // `supabase/functions/_shared/brief-prompt-version.ts`.
        .eq('prompt_version', BRIEF_PROMPT_VERSION)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        dbg('query error', error.message);
        return null;
      }
      if (!data) {
        dbg('no current-window row', { effectiveUserId, localDate, timeWindow });
        return null;
      }

      const row = data as Record<string, any>;
      const payload = asRecord(row.payload_json);
      const checkin = asRecord(row.checkin_snapshot);
      const wearable = asRecord(row.wearable_snapshot);
      const phrase = (row.phrase ?? null) as string | null;
      const bodyText = (row.body_text ?? null) as string | null;
      const state =
        (row.refined_state as string | null) ??
        (row.baseline_state as string | null) ??
        null;

      const isAwaitingRow = phrase == null && bodyText == null;
      // A row is renderable for the Brief card only when it carries copy.
      // Awaiting rows are flagged separately — DecisionReadinessBrief still
      // gates the awaiting copy on the live engine status to avoid masking
      // a real cold-start.
      const isRenderable = !isAwaitingRow && !!phrase;

      const snapshot: CurrentBriefSnapshot = {
        briefId: row.id as string,
        localDate: row.local_date as string,
        timeWindow: row.time_window as BriefWindow,
        phrase,
        bodyText,
        leanOn: (row.lean_on ?? null) as string | null,
        leanOnSource: (row.lean_on_source ?? null) as string | null,
        watchFor: (row.watch_for ?? null) as string | null,
        watchForSource: (row.watch_for_source ?? null) as string | null,
        briefSource: (row.brief_source ?? null) as
          | 'llm'
          | 'deterministic'
          | null,
        driver: (row.driver ?? null) as string | null,
        innerReadinessScore: (row.score ?? null) as number | null,
        innerReadinessTier: (row.tier ?? null) as string | null,
        // We don't persist a separate `tier_displayed`; fall back to tier.
        innerReadinessTierDisplayed: (row.tier ?? null) as string | null,
        innerReadinessScoreBaseline:
          (row.baseline_score ?? null) as number | null,
        innerReadinessScoreRefined:
          (row.refined_score ?? null) as number | null,
        innerReadinessState:
          state === 'refined' || state === 'baseline' || state === 'awaiting'
            ? state
            : isAwaitingRow
              ? 'awaiting'
              : null,
        signalPills: asArray(row.signal_pills),
        wearableSnapshot: wearable,
        checkinSnapshot: checkin,
        checkInOutcome: (checkin?.checkInOutcome ?? null) as string | null,
        behaviourSnapshot: asRecord(payload?.behaviour_snapshot),
        sourceProvenance: asRecord(payload?.source_provenance),
        isRenderable,
        isAwaitingRow,
        updatedAt: (row.updated_at ?? null) as string | null,
      };

      dbg('loaded', {
        briefId: snapshot.briefId,
        isRenderable,
        isAwaitingRow,
        state: snapshot.innerReadinessState,
      });
      return snapshot;
    },
  });
}