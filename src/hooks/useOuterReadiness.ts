/**
 * useOuterReadiness – shared hook for the Outer Readiness Brief
 * Calls compute-outer-readiness edge function and caches via react-query.
 * All components that need theme/phrase/leanOn/watchFor share this cache.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { computeEnergyState } from '@/utils/energyStateEngine';
import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import {
  read as readPersistent,
  write as writePersistent,
  clear as clearPersistent,
  clearByPrefixes,
  msUntilWindowEnd,
  cacheKeys,
  localISODate,
  currentPeriod as currentPeriodLocal,
} from '@/utils/persistentBriefCache';

/**
 * In-memory de-dup window for `fetchOuterReadiness`. Aligned with the
 * React Query `staleTime` so the hook and the imperative caller (coach
 * context builder) agree on what counts as "fresh enough". Material
 * data-changing events explicitly call `clearOuterReadinessCache()` so a
 * 5-minute window does not stale-out a real update.
 */
const OUTER_READINESS_CACHE_MS = 5 * 60 * 1000;
const outerReadinessCache = new Map<string, { expiresAt: number; data: OuterReadinessData | null }>();
const outerReadinessInFlight = new Map<string, Promise<OuterReadinessData | null>>();
let outerReadinessCacheVersion = 0;
const OUTER_READINESS_FORCE_REFRESH_PREFIX = 'prb-force-refresh';

const DEBUG_BRIEF =
  typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;
function dbg(...args: unknown[]) {
  if (DEBUG_BRIEF) console.log('[useOuterReadiness:debug]', ...args);
}

function getOuterReadinessCacheKey(userId: string | undefined): string {
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId || 'anon';
  return `${effectiveUserId}:${localISODate()}:${currentPeriodLocal()}`;
}

function getForceRefreshKey(userId: string, period: string, dateISO: string): string {
  return `${OUTER_READINESS_FORCE_REFRESH_PREFIX}:${userId}:${period}:${dateISO}`;
}

/**
 * Drop in-memory de-dup, in-flight promises, and the persistent
 * per-window caches (real brief + awaiting marker) for the current
 * user/date/period. Called by the four legitimate data-changing flows:
 *   • DailyCheckIn save
 *   • CheckInDetail save
 *   • ConnectedData connect / disconnect / sync complete
 *   • Onboarding completion (Stage 7)
 * Anything else (navigation, focus, viewport, tour) MUST NOT call this.
 */
export function clearOuterReadinessCache(userId?: string): void {
  outerReadinessCacheVersion++;
  outerReadinessCache.clear();
  outerReadinessInFlight.clear();
  // Also drop persistent per-window entries so a stale awaiting/brief
  // payload cannot replay after a real check-in or connection change.
  if (typeof window === 'undefined') return;
  try {
    const id = DEV_MODE ? DEV_USER.id : (userId || null);
    if (!id) return;
    const today = localISODate();
    const period = currentPeriodLocal();
    clearPersistent(cacheKeys.brief(id, period, today));
    clearPersistent(cacheKeys.briefAwaiting(id, period, today));
    window.sessionStorage.setItem(getForceRefreshKey(id, period, today), '1');
    dbg('clearOuterReadinessCache: cleared in-memory + persistent, marked force refresh', { id, period, today });
  } catch { /* ignore */ }
}

export interface OuterReadinessData {
  phrase: string;
  context: string;
  leanOn: string;
  watchFor: string;
  driver: string;
  dataSources: string[];
  calendarState?: 'active' | 'connected_no_events' | 'not_connected';
  coachInsightAge?: number;
  coachInsightLabel?: string;
  // New fields for DecisionReadinessBrief
  bodyText?: string;
  leanOnSource?: string;
  watchForSource?: string;
  /**
   * Stable identifier for the brief snapshot row that produced this brief.
   * Same input set on the same day/window returns the same id, so the
   * client can key per-brief UI state (e.g. feedback row) by it and reset
   * automatically when a new brief is generated.
   */
  briefId?: string | null;
  hasWearable?: boolean;
  wearableStatus?: {
    isConnected: boolean;
    hasTodayData: boolean;
    hasRecentData: boolean;
    isStale?: boolean;
    sourceAgeDays?: number | null;
    metricsAvailable: { hrv: boolean; sleep: boolean; rhr: boolean };
    sourceRowDate: string | null;
    dataSource: string | null;
  };
  remainingMeetings?: number;
  wearableDaysConnected?: number;
  hrvDeviation?: number | null;
  sleepDeviation?: number | null;
  rhrDeviation?: number | null;
  sleepDuration?: number | null;
  rhrValue?: number | null;
  sleepScore?: number | null;
  hrvValue?: number | null;
  hrValue?: number | null;
  hrBaseline?: number | null;
  hrDeviation?: number | null;
  hrvBaseline?: number | null;
  sleepBaseline?: number | null;
  rhrBaseline?: number | null;
  wearableDataSource?: string | null;
  hasHistoricalData?: boolean;
  hasCalendar?: boolean;
  calendarLoad?: string;
  meetingCount?: number;
  highStakesEvents?: string[];
  remainingHighStakes?: string[];
  nextHighStakesEvent?: { title: string; minutesUntil: number } | null;
  checkInCountTotal?: number;
  consecutiveLowConfidence?: number;
  coachStrength?: string | null;
  clarityLevel?: number | null;
  confidenceLevel?: number | null;
  mentalSharpnessLevel?: number | null;
  // Enrichment fields
  consecutiveLowClarity?: number;
  typicalDOWOutcome?: string | null;
  yesterdayScore?: number | null;
  scoreTrend?: string | null;
  hasBackToBack?: boolean;
  longestBackToBackHrs?: number | null;
  nextEvent?: { title: string; minutesUntil: number } | null;
  practicesCompletedThisWeek?: number;
  practiceCompletionRate?: number;
  daysSinceCoachSession?: number | null;
  coachSessionImpactDelta?: number | null;
  avgScore7d?: number | null;
  scoreTrajectory7d?: string | null;
  wearableTrend7d?: string | null;
  typicalDOWScore?: number | null;
  divergenceMode?: string | null;
  weekAheadShape?: Record<string, unknown> | null;
  hrvEventCorrelation?: string | null;
  mostEffectivePractice?: string | null;
  // Inner readiness echoed from server — canonical source for the card
  innerReadinessScore?: number | null;
  innerReadinessTier?: string | null;
  checkInOutcome?: string | null;
  briefSource?: 'llm' | 'deterministic';
  /**
   * True when the brief was not generated because no immediate signal is
   * fresh today (no check-in submitted today AND no wearable reading from
   * today). When true, `phrase` / `bodyText` / `leanOn` / `watchFor` are
   * null and the client renders a quiet prompt line in place of the brief.
   * Pills, chips, calendar pill, and score `--` continue to render.
   */
  awaitingSignals?: boolean;
  awaitingReason?: 'no-checkin-no-wearable' | null;
  /**
   * Period-scoped flags (mirrors compute-outer-readiness contract). The UI
   * MUST drive period-sensitive decisions (e.g. "is the score live?") off
   * these instead of inferring from `checkInOutcome`, which can leak day-
   * scoped state from an earlier window.
   */
  hasCurrentPeriodCheckIn?: boolean;
  hasFreshWearable?: boolean;
  hasCurrentPeriodSignal?: boolean;
}

async function fetchOuterReadinessFresh(userId: string | undefined): Promise<OuterReadinessData | null> {
  if (!userId) return null;

  // Energy state already reads today's check-in. Reuse those echoed fields so
  // the executive home brief does not make a second daily-checkins request.
  const energyState = await computeEnergyState(userId);

  // Build auth headers – in DEV_MODE, skip Auth0 token and pass userId in body
  const headers: Record<string, string> = {};
  if (!DEV_MODE) {
    let token: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      token = await getAuthToken();
      if (token) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!token) {
      console.warn('[useOuterReadiness] No Auth0 token after retries – skipping edge call');
      return null;
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Calendar load/pressure now computed server-side – no need to send from client
  const res = await supabase.functions.invoke('compute-outer-readiness', {
    body: {
      innerReadinessTier: energyState.energyTier,
      innerReadinessScore: energyState.overallBalance ?? 50,
      clarityLevel: energyState.clarityLevel ?? null,
      confidenceLevel: energyState.confidenceLevel ?? null,
      mentalSharpnessLevel: energyState.mentalSharpnessLevel ?? null,
      checkInOutcome: energyState.checkInOutcome || null,
      timezoneOffset: new Date().getTimezoneOffset(),
      // MRS v3 — forward soft-guard tier cap so the server can persist the
      // displayed tier into daily_context_snapshot in one round trip.
      tierDisplayed: energyState.tierDisplayed ?? energyState.energyTier,
      tierCapReason: energyState.tierCapReason ?? null,
      // IANA timezone strings let the edge function format event times via Intl
      // in the user's CURRENT clock (correct for travelers) while keeping their
      // home zone available for circadian/jetlag commentary.
      currentTimezone: (() => {
        try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
        catch { return null; }
      })(),
      ...(DEV_MODE ? { userId } : {}),
    },
    headers,
  });

  if (res.error) {
    console.error('[useOuterReadiness] Edge function error:', res.error);
    return null;
  }

  const data = res.data as OuterReadinessData;
  console.log('[useOuterReadiness] Brief received:', {
    phrase: data.phrase,
    driver: data.driver,
    calendarState: data.calendarState,
    dataSources: data.dataSources,
  });

  return data;
}

export async function fetchOuterReadiness(userId: string | undefined): Promise<OuterReadinessData | null> {
  if (!userId) return null;

  const cacheKey = getOuterReadinessCacheKey(userId);
  const cached = outerReadinessCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inFlight = outerReadinessInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const version = outerReadinessCacheVersion;
  const promise = fetchOuterReadinessFresh(userId)
    .then((data) => {
      if (version === outerReadinessCacheVersion) {
        outerReadinessCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + OUTER_READINESS_CACHE_MS,
        });
      }
      return data;
    })
    .finally(() => {
      if (version === outerReadinessCacheVersion) {
        outerReadinessInFlight.delete(cacheKey);
      }
    });

  outerReadinessInFlight.set(cacheKey, promise);
  return promise;
}

function getCurrentPeriod(): string {
  return currentPeriodLocal();
}

export function useOuterReadiness() {
  const { user } = useAuth();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;
  const period = getCurrentPeriod();

  // When server-side brief snapshotting is enabled, the same input set always
  // returns the same canonical brief. We can stop refetching on window focus
  // because identical inputs would just return the cached snapshot anyway —
  // and any material change (check-in, calendar, wearable) explicitly
  // invalidates the query elsewhere.
  const snapshotCacheEnabled =
    import.meta.env.VITE_ENABLE_BRIEF_SNAPSHOT_CACHE === 'true';

  // Persistent per-window cache (survives full app reopen). Hydrate React
  // Query synchronously on mount so the brief renders in the first frame
  // when a valid cached payload exists for this user + period + date.
  //
  // CRITICAL: keys must use the user's LOCAL date, not the UTC ISO date.
  // Otherwise around midnight the cache reads/writes the wrong day and we
  // can hydrate yesterday's payload into today's mount.
  const todayISO = localISODate();
  const persistentKey = effectiveUserId
    ? cacheKeys.brief(effectiveUserId, period, todayISO)
    : null;
  const awaitingKey = effectiveUserId
    ? cacheKeys.briefAwaiting(effectiveUserId, period, todayISO)
    : null;
  const forceRefreshKey = effectiveUserId
    ? getForceRefreshKey(effectiveUserId, period, todayISO)
    : null;
  const forceRefresh =
    typeof window !== 'undefined' &&
    !!forceRefreshKey &&
    window.sessionStorage.getItem(forceRefreshKey) === '1';

  // ── Period-crossover sweep ──────────────────────────────────────────────
  // The Brief is a *current-period* artifact. When the user crosses from
  // afternoon → evening, no afternoon (or morning) cache must be allowed to
  // paint. We detect crossovers via a `prb-last-period` marker and clear
  // any other-period brief keys for today before reading initialData.
  if (typeof window !== 'undefined' && effectiveUserId) {
    try {
      const lastPeriodKey = `prb-last-period:${effectiveUserId}`;
      const lastPeriod = window.localStorage.getItem(lastPeriodKey);
      if (lastPeriod !== period) {
        // Drop any per-period cache rows for this user that are NOT the
        // current period. We scope by user prefix so we don't disturb other
        // users on a shared device.
        const userPrefixes = [
          `prb-cache:${effectiveUserId}:`,
          `prb-awaiting:${effectiveUserId}:`,
        ];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (!k) continue;
          if (!userPrefixes.some(p => k.startsWith(p))) continue;
          // Preserve only the current period's keys; drop every other-period entry.
          if (k !== persistentKey && k !== awaitingKey) {
            try { window.localStorage.removeItem(k); } catch { /* ignore */ }
          }
        }
        window.localStorage.setItem(lastPeriodKey, period);
      }
    } catch { /* ignore storage errors */ }
  }

  // Read AFTER the crossover sweep so we never see a stale other-period row.
  const cached = persistentKey
    ? readPersistent<OuterReadinessData>(persistentKey)
    : null;
  const cachedAwaiting = awaitingKey
    ? readPersistent<OuterReadinessData>(awaitingKey)
    : null;
  // Prefer a real brief if we have one; otherwise hydrate the awaiting
  // payload so a no-signal user doesn't trigger a fresh edge call on
  // every mount / iOS foreground.
  const initialData = forceRefresh
    ? null
    : (cached && !cached.awaitingSignals && cached.phrase && cached.bodyText)
      ? cached
      : (cachedAwaiting && cachedAwaiting.awaitingSignals)
        ? cachedAwaiting
        : null;
  if (initialData) {
    dbg('initialData hydrated from', initialData.awaitingSignals ? 'awaiting-cache' : 'brief-cache', {
      key: initialData.awaitingSignals ? awaitingKey : persistentKey,
    });
  }

  return useQuery({
    queryKey: ['outer-readiness', effectiveUserId, period],
    queryFn: async () => {
      dbg('queryFn invoked → network fetch', {
        key: ['outer-readiness', effectiveUserId, period],
        reason: initialData ? 'manual-invalidate-or-stale' : 'no-initialData',
      });
      const data = await fetchOuterReadiness(effectiveUserId);
      // Write-through: persist real brief payloads so the next reopen renders
      // instantly. Persist the awaiting-signals state separately, scoped to
      // the current window, so a no-signal user does not re-hit the edge
      // function on every mount / focus / iOS foreground. Belt-and-
      // suspenders: a real brief requires phrase + bodyText so a half-built
      // payload (e.g. transient LLM failure) cannot poison the cache.
      if (
        data &&
        persistentKey &&
        !data.awaitingSignals &&
        data.phrase &&
        data.bodyText
      ) {
        writePersistent(persistentKey, data, msUntilWindowEnd());
        // A real brief supersedes any awaiting marker for this window.
        if (awaitingKey) clearPersistent(awaitingKey);
      } else if (data?.awaitingSignals) {
        // No-signal gating decision — persist it for this window so we
        // don't keep recomputing it. Always wipe any prior real-brief
        // entry so we don't accidentally replay it next mount.
        if (persistentKey) clearPersistent(persistentKey);
        if (awaitingKey) writePersistent(awaitingKey, data, msUntilWindowEnd());
      }
      if (forceRefreshKey && typeof window !== 'undefined') {
        try { window.sessionStorage.removeItem(forceRefreshKey); } catch { /* ignore */ }
      }
      return data;
    },
    enabled: !!effectiveUserId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Executive Home should reconcile with the backend on mount. The server
    // snapshot cache returns the saved DB brief when inputs are unchanged, and
    // generates a new one when check-in / wearable / calendar inputs changed.
    // Focus/reconnect refreshes stay disabled so mobile viewport/app lifecycle
    // noise does not churn the brief.
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    // IMPORTANT: do NOT use placeholderData here. Keeping the previous
    // payload alive across refetches is the root cause of the Brief
    // flickering between "live" and "awaiting" — a previous-period brief
    // would paint while the next request was in flight. The synchronous
    // `initialData` hydrate above already prevents skeleton flash for the
    // current period; that is the only carry-over we want.
    initialData: initialData ?? undefined,
  });
}
