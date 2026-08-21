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
import { getAuthToken } from '@/services/authTokenService';
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
  clarityLevel: number | null;
  confidenceLevel: number | null;
  mentalSharpnessLevel: number | null;
  emotionLevel: number | null;
  pressureLevel: number | null;
  regulationLevel: number | null;
  // ── Pulled from payload_json ──
  behaviourSnapshot: Record<string, unknown> | null;
  sourceProvenance: Record<string, unknown> | null;
  // ── Derived ──
  /** Row has usable LLM copy (phrase + body). */
  hasRenderableCopy: boolean;
  /** Row has usable score payload (numeric score, non-awaiting state, signals ready). */
  hasRenderableScore: boolean;
  /**
   * Row is usable for rendering — either copy or score payload is present.
   * A row with score/tier/signal_pills but null phrase/body is still
   * renderable: the Brief card can show the score + signals and fall
   * back to neutral awaiting prose for the copy slot.
   */
  isRenderable: boolean;
  /** True only when neither copy nor score payload is present. */
  isAwaitingRow: boolean;
  updatedAt: string | null;
  // ── LLM diagnostics (persisted equivalents; browser-console only) ──
  llmFallbackReason: string | null;
  validatorRejections: unknown[] | null;
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
function asFiniteNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function readSnapshotString(
  snapshot: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!snapshot) return null;
  for (const key of keys) {
    const value = snapshot[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }
  return null;
}
function readSnapshotNumber(
  snapshot: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!snapshot) return null;
  for (const key of keys) {
    const value = asFiniteNumber(snapshot[key]);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

const CHECKIN_ONLY_CONTRIBUTOR_KEYS = new Set([
  'clarityLevel',
  'confidenceLevel',
  'mentalSharpnessLevel',
  'emotionLevel',
  'pressureLevel',
  'regulationLevel',
]);

export function sanitizeSignalPillsForCheckInFreshness(
  signalPills: unknown[] | null,
  hasCurrentCheckIn: boolean,
): unknown[] | null {
  if (!Array.isArray(signalPills)) return null;
  if (hasCurrentCheckIn) return signalPills;

  return signalPills.map((pill) => {
    if (!pill || typeof pill !== 'object' || Array.isArray(pill)) return pill;

    const typedPill = pill as Record<string, unknown>;
    const contributors =
      typedPill.contributors &&
      typeof typedPill.contributors === 'object' &&
      !Array.isArray(typedPill.contributors)
        ? { ...(typedPill.contributors as Record<string, unknown>) }
        : null;

    if (contributors) {
      for (const key of CHECKIN_ONLY_CONTRIBUTOR_KEYS) {
        delete contributors[key];
      }
    }

    return {
      ...typedPill,
      contributors: contributors ?? typedPill.contributors,
      contributedByCheckIn: false,
    };
  });
}

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
    // Snapshot-read model: cron owns generation. Read once per window,
    // cache generously, and never auto-poll for late-arriving LLM copy.
    // Manual recovery paths invalidate this query explicitly.
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 3 * 60 * 1000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!effectiveUserId) return null;
      console.log('[PRB][snapshot] requested', {
        effectiveUserId,
        localDate,
        timeWindow,
        autoPoll: false,
      });

      // Read via authenticated Edge Function — the shared browser client
      // is anon-keyed only, so a direct table read is filtered by RLS on
      // `brief_snapshots` (auth.jwt()->>'sub' = user_id) and returns null
      // for Auth0 users. The Edge Function verifies the Auth0 token and
      // reads with the service role scoped to the verified `userId`.
      const token = DEV_MODE ? null : await getAuthToken().catch(() => null);
      const { data: resp, error } = await supabase.functions.invoke(
        'get-current-brief-snapshot',
        {
          body: {
            localDate,
            timeWindow,
            // Keep BRIEF_PROMPT_VERSION in sync with
            // supabase/functions/_shared/brief-prompt-version.ts so a
            // stale prompt-version row can never render.
            promptVersion: BRIEF_PROMPT_VERSION,
          },
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );

      const data = (resp as { data?: Record<string, any> | null } | null)?.data ?? null;

      if (error) {
        dbg('query error', error.message);
        return null;
      }
      if (!data) {
        dbg('no current-window row', { effectiveUserId, localDate, timeWindow });
        console.log('[PRB][snapshot]', {
          effectiveUserId,
          localDate,
          timeWindow,
          rowExists: false,
        });
        return null;
      }

      const row = data as Record<string, any>;
      const payload = asRecord(row.payload_json);
      const checkin = asRecord(row.checkin_snapshot);
      const wearable = asRecord(row.wearable_snapshot);
      const checkInOutcome = readSnapshotString(checkin, [
        'checkInOutcome',
        'check_in_outcome',
        'outcome',
      ]);
      const clarityLevel = readSnapshotNumber(checkin, [
        'clarityLevel',
        'clarity_level',
      ]);
      const confidenceLevel = readSnapshotNumber(checkin, [
        'confidenceLevel',
        'confidence_level',
      ]);
      const mentalSharpnessLevel = readSnapshotNumber(checkin, [
        'mentalSharpnessLevel',
        'mental_sharpness_level',
      ]);
      const emotionLevel = readSnapshotNumber(checkin, [
        'emotionLevel',
        'emotion_level',
      ]);
      const pressureLevel = readSnapshotNumber(checkin, [
        'pressureLevel',
        'pressure_level',
      ]);
      const regulationLevel = readSnapshotNumber(checkin, [
        'regulationLevel',
        'regulation_level',
      ]);
      const phrase = (row.phrase ?? null) as string | null;
      const bodyText = (row.body_text ?? null) as string | null;
      const state =
        (row.refined_state as string | null) ??
        (row.baseline_state as string | null) ??
        null;
      const baselineScore =
        typeof row.baseline_score === 'number' && Number.isFinite(row.baseline_score)
          ? row.baseline_score
          : null;
      const refinedScore =
        typeof row.refined_score === 'number' && Number.isFinite(row.refined_score)
          ? row.refined_score
          : null;

      const score = (row.score ?? null) as number | null;
      const scoreState =
        state === 'refined' || state === 'baseline' || state === 'awaiting'
          ? state
          : null;
      // Score payload is renderable when we have a numeric score AND the
      // state is not the explicit awaiting label. LLM copy failure alone
      // must NOT gate score/tier/signal_pills — those come from the
      // wearable/calendar/check-in pipelines.
      const hasRenderableScore =
        typeof score === 'number' &&
        Number.isFinite(score) &&
        scoreState !== 'awaiting';
      const hasRenderableCopy = !!phrase && !!bodyText;
      const isRenderable = hasRenderableCopy || hasRenderableScore;
      // Only fully awaiting when neither copy nor score payload is present.
      const isAwaitingRow = !isRenderable;

      // TODO(brief-snapshot-read-first): `wearableStatus` (freshness +
      // source tier) and the full unified source provenance are NOT yet
      // reconstructable from `brief_snapshots` alone. As a result the
      // Brief card still depends on the live `useOuterReadiness` payload
      // for `wearableStatus`, and snapshot-read-first for the Brief is
      // INCOMPLETE until `wearable_snapshot` (and/or
      // `daily_context_snapshot.window=*`) is rich enough to derive the
      // unified wearable contract here. When that lands, drop the
      // overlay-on-live merge in `DecisionReadinessBrief.tsx` and let
      // this hook be the sole source for the Brief card.
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
          baselineScore,
        innerReadinessScoreRefined:
          refinedScore,
        innerReadinessState:
          state === 'refined' || state === 'baseline' || state === 'awaiting'
            ? state
            : isAwaitingRow
              ? 'awaiting'
              : null,
        signalPills: sanitizeSignalPillsForCheckInFreshness(
          asArray(row.signal_pills),
          !!checkInOutcome,
        ),
        wearableSnapshot: wearable,
        checkinSnapshot: checkin,
        checkInOutcome,
        clarityLevel,
        confidenceLevel,
        mentalSharpnessLevel,
        emotionLevel,
        pressureLevel,
        regulationLevel,
        behaviourSnapshot: asRecord(payload?.behaviour_snapshot),
        sourceProvenance: asRecord(payload?.source_provenance),
        hasRenderableCopy,
        hasRenderableScore,
        isRenderable,
        isAwaitingRow,
        updatedAt: (row.updated_at ?? null) as string | null,
        llmFallbackReason: (row.llm_fallback_reason ?? null) as string | null,
        validatorRejections: Array.isArray(row.validator_rejections)
          ? (row.validator_rejections as unknown[])
          : null,
      };

      dbg('loaded', {
        briefId: snapshot.briefId,
        hasRenderableCopy,
        hasRenderableScore,
        isRenderable,
        isAwaitingRow,
        state: snapshot.innerReadinessState,
      });
      // [PRB] Diagnostic — snapshot fetch result (fires only on network
      // fetch, not on every render). Compact object; no PII, no tokens.
      console.log('[PRB][snapshot]', {
        effectiveUserId,
        localDate,
        timeWindow,
        rowExists: true,
        briefId: snapshot.briefId,
        briefSource: snapshot.briefSource,
        innerReadinessScore: snapshot.innerReadinessScore,
        innerReadinessScoreBaseline: snapshot.innerReadinessScoreBaseline,
        innerReadinessScoreRefined: snapshot.innerReadinessScoreRefined,
        innerReadinessState: snapshot.innerReadinessState,
        hasPhrase: !!snapshot.phrase,
        hasBodyText: !!snapshot.bodyText,
        hasSignalPills: Array.isArray(snapshot.signalPills) && snapshot.signalPills.length > 0,
        isRenderable: snapshot.isRenderable,
        isAwaitingRow: snapshot.isAwaitingRow,
      });
      // [PRB][snapshot-llm] Diagnostic — persisted LLM failure reason on
      // the snapshot row, so a snapshot with missing copy still shows WHY.
      console.log('[PRB][snapshot-llm]', {
        briefId: snapshot.briefId,
        briefSource: snapshot.briefSource,
        hasPhrase: !!snapshot.phrase,
        hasBodyText: !!snapshot.bodyText,
        hasRenderableScore: snapshot.hasRenderableScore,
        isAwaitingRow: snapshot.isAwaitingRow,
        llmFallbackReason: snapshot.llmFallbackReason,
        validatorRejectionCount: Array.isArray(snapshot.validatorRejections)
          ? snapshot.validatorRejections.length
          : 0,
      });
      return snapshot;
    },
  });
}
