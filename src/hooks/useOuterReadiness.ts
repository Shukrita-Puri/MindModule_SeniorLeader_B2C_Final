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
import { HOME_SNAPSHOT_ONLY } from '@/config/homeSnapshotMode';
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
  integrationStatus?: {
    wearable?: {
      connectionStatus: 'connected' | 'connected_but_waiting_for_data' | 'sync_delayed' | 'permission_revoked' | 'disconnected' | 'error' | 'unknown';
      syncStatus: 'synced' | 'waiting_for_data' | 'sync_delayed' | 'error' | 'watch_unavailable' | 'unknown';
      hasTodayData: boolean;
      hasRecentData: boolean;
      hasHistoricalData: boolean;
      lastSyncAt: string | null;
      lastSampleAt: string | null;
    } | null;
    calendar?: {
      provider: string | null;
      connectionStatus: 'connected' | 'connected_no_events' | 'permission_revoked' | 'disconnected' | 'error';
      needsReconnect: boolean;
      lastSyncAt: string | null;
    } | null;
  };
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
  highStakesEventsDetailed?: Array<{
    title: string;
    localTime: string | null;
    category: string | null;
  }>;
  remainingHighStakes?: string[];
  nextHighStakesEvent?: { title: string; minutesUntil: number } | null;
  checkInCountTotal?: number;
  consecutiveLowConfidence?: number;
  coachStrength?: string | null;
  clarityLevel?: number | null;
  confidenceLevel?: number | null;
  mentalSharpnessLevel?: number | null;
  // Signal Pills v3 — Mind Check-in dimensions echoed by the server.
  // Used by buildExecutivePills to compute the refined-state tier of
  // the Cognitive (clarity) and Resilience (emotion+regulation+pressure)
  // pills without re-querying daily_checkins.
  emotionLevel?: number | null;
  pressureLevel?: number | null;
  regulationLevel?: number | null;
  // Wearable anchor for the Resilience pill (0–100). Null when the
  // provider does not expose overnight efficiency.
  sleepEfficiency?: number | null;
  // Signal Pills v3 — divergence flags. supplyDemandGap caps the
  // Cognitive pill GREEN → AMBER; regulationRisk floors the Resilience
  // pill at AMBER.
  supplyDemandGap?: boolean;
  regulationRisk?: boolean;
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
  // MRS v3 — soft-guard tier cap echoed from server. UI components MUST
  // render `innerReadinessTierDisplayed` when present (falls back to
  // `innerReadinessTier` for the score number itself, which is uncapped).
  innerReadinessTierDisplayed?: string | null;
  innerReadinessTierCapReason?: 'SUSTAINED_DEFICIT' | 'CONSECUTIVE_LOAD' | null;
  // MRS v3 §3.3 — refined-score surface echoed from server.
  // `innerReadinessScore` keeps its contract (= the displayed number) so the
  // hero and existing readers don't shift; these expose the underlying split.
  innerReadinessScoreBaseline?: number | null;
  innerReadinessScoreRefined?: number | null;
  innerReadinessState?: 'baseline' | 'refined' | 'awaiting' | null;
  innerReadinessRefinedContribution?: number | null;
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
   * Phase 1 — structured engine status propagated from `computeEnergyState`.
   * Distinguishes a true cold-start awaiting state from a transient
   * compute/auth failure so the UI can render a retry block rather than
   * the "Awaiting signals" copy.
   */
  engineStatus?: 'ready' | 'awaiting' | 'auth-failure' | 'session-failure' | 'inner-failure' | 'outer-failure' | 'stale' | 'unknown-error';
  /**
   * Optional machine-readable reason for a failure `engineStatus`. Present when
   * the hook short-circuits due to a missing token, token-fetch timeout, or a
   * non-2xx response from the edge function. Not written on success paths.
   */
  engineFailureReason?:
    | 'missing-auth-token'
    | 'auth-token-timeout'
    | 'http-401'
    | 'http-403'
    | 'http-5xx'
    | 'edge-invoke-error';
  /**
   * MRS v3 baseline-of-truth — canonical client-facing signal source contract.
   *   • 'cold-start' — no baseline AND no check-in → render skeleton
   *   • 'baseline'   — wearable/calendar/patterns present, no check-in
   *   • 'refined'    — check-in present (with or without baseline)
   * Components MUST gate skeletons on `briefMode === 'cold-start'`. In
   * baseline mode pills, score, and brief copy must render.
   */
  briefMode?: 'cold-start' | 'baseline' | 'refined';
  /** Per-surface source provenance for audit chips. */
  sourceProvenance?: {
    mrs: { sources: string[]; primary: string | null; refinedBy: 'checkin' | null };
    brief: { sources: string[]; briefSource: 'llm' | 'deterministic' };
    pills: {
      decision_readiness: string[];
      physical_reserves: string[];
      resilience_capacity: string[];
    };
  } | null;
  /** Pill↔MRS coherence audit. `inSync: false` means the engine corrected drift. */
  pillCoherence?: {
    inSync: boolean;
    adjustments: Array<{ pill: string; from: string; to: string; reason: string }>;
  } | null;
  /** Baseline-only score (wearable + calendar + patterns), independent of check-in. */
  baselineReadinessScore?: number | null;
  /**
   * Period-scoped flags (mirrors compute-outer-readiness contract). The UI
   * MUST drive period-sensitive decisions (e.g. "is the score live?") off
   * these instead of inferring from `checkInOutcome`, which can leak day-
   * scoped state from an earlier window.
   */
  hasCurrentPeriodCheckIn?: boolean;
  hasFreshWearable?: boolean;
  hasCurrentPeriodSignal?: boolean;
  // Signal Pills v3 — server-built pill payload + qualifier bundle.
  // `signalPills` mirrors the deterministic 3-pill engine on the server.
  // `pillQualifiers` is the SSOT bracketed enrichment (delta3d / vsDow /
  // peakStreak for Mind dims; delta3d / vsBaselinePct for wearable).
  // Tier is driven by today's value only — qualifiers are display-only.
  signalPills?: Array<{
    key: 'decision_readiness' | 'physical_reserves' | 'resilience_capacity';
    label: string;
    tier: 'green' | 'amber' | 'red' | 'neutral';
    tierLabel?: string;
    coldStartLabel?: string | null;
    contributors?: Record<string, unknown>;
    qualifiers?: Record<string, unknown>;
  }> | null;
  pillQualifiers?: {
    clarity: { delta3d: number | null; vsDow: number | null; peakStreak: number };
    emotion: { delta3d: number | null; vsDow: number | null; peakStreak: number };
    pressure: { delta3d: number | null; vsDow: number | null; peakStreak: number };
    regulation: { delta3d: number | null; vsDow: number | null; peakStreak: number };
    hrv: { delta3d: number | null; vsBaselinePct: number | null };
    sleep: { durationDelta7d: number | null; scoreVsBaseline: number | null };
    rhr: { vsBaselinePct: number | null };
  } | null;
  // Dev-only — populated when MRS tier and pill mix had to be reconciled.
  coherenceWarning?: string | null;
  /**
   * LLM diagnostics echoed from compute-outer-readiness. Used exclusively
   * for browser-console debugging via [PRB][llm]. Never render to users.
   *   • llmFallbackReason — reason code from the LLM path when the brief
   *     fell back to awaiting (e.g. `workspace_credit_limit`,
   *     `attempt1_parse_failed`, `attempt2_atomic_em_dash_body`).
   *   • validatorRejections — compact per-rule rejection records.
   */
  llmFallbackReason?: string | null;
  validatorRejections?: Array<Record<string, unknown>> | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function asHighStakesDetailed(
  value: unknown,
): Array<{ title: string; localTime: string | null; category: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const rec = asRecord(item);
      if (!rec) return null;
      const title = asString(rec.title);
      if (!title) return null;
      return {
        title,
        localTime: asString(rec.localTime),
        category: asString(rec.category),
      };
    })
    .filter((x): x is { title: string; localTime: string | null; category: string | null } =>
      x !== null
    );
}

function asIsoString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function asDateOnlyString(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeSignalPills(value: unknown): OuterReadinessData['signalPills'] {
  if (!Array.isArray(value)) return null;
  const keys = new Set(['decision_readiness', 'physical_reserves', 'resilience_capacity']);
  const tiers = new Set(['green', 'amber', 'red', 'neutral']);
  type Pill = NonNullable<OuterReadinessData['signalPills']>[number];
  const pills: Pill[] = value
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const key = asString(row.key);
      const label = asString(row.label);
      const tier = asString(row.tier);
      if (!key || !label || !tier || !keys.has(key) || !tiers.has(tier)) return null;
      const pill: Pill = {
        key: key as 'decision_readiness' | 'physical_reserves' | 'resilience_capacity',
        label,
        tier: tier as 'green' | 'amber' | 'red' | 'neutral',
        tierLabel: asString(row.tierLabel) ?? undefined,
        coldStartLabel: asString(row.coldStartLabel) ?? null,
        contributors: asRecord(row.contributors) ?? undefined,
        qualifiers: asRecord(row.qualifiers) ?? undefined,
      };
      return pill;
    })
    .filter((item): item is Pill => item !== null);
  return pills;
}

function normalizePillQualifiers(value: unknown): OuterReadinessData['pillQualifiers'] {
  const row = asRecord(value);
  if (!row) return null;
  const mind = (key: string) => {
    const item = asRecord(row[key]);
    return {
      delta3d: asFiniteNumber(item?.delta3d) ?? null,
      vsDow: asFiniteNumber(item?.vsDow) ?? null,
      peakStreak: asFiniteNumber(item?.peakStreak) ?? 0,
    };
  };
  return {
    clarity: mind('clarity'),
    emotion: mind('emotion'),
    pressure: mind('pressure'),
    regulation: mind('regulation'),
    hrv: {
      delta3d: asFiniteNumber(asRecord(row.hrv)?.delta3d) ?? null,
      vsBaselinePct: asFiniteNumber(asRecord(row.hrv)?.vsBaselinePct) ?? null,
    },
    sleep: {
      durationDelta7d: asFiniteNumber(asRecord(row.sleep)?.durationDelta7d) ?? null,
      scoreVsBaseline: asFiniteNumber(asRecord(row.sleep)?.scoreVsBaseline) ?? null,
    },
    rhr: {
      vsBaselinePct: asFiniteNumber(asRecord(row.rhr)?.vsBaselinePct) ?? null,
    },
  };
}

export function normalizeOuterReadinessPayload(input: unknown): OuterReadinessData {
  const raw = asRecord(input) ?? {};
  const wearableStatus = asRecord(raw.wearableStatus);
  const wearableIntegration = asRecord(asRecord(raw.integrationStatus)?.wearable);
  const calendarIntegration = asRecord(asRecord(raw.integrationStatus)?.calendar);
  const nextHighStakesEvent = asRecord(raw.nextHighStakesEvent);
  const nextEvent = asRecord(raw.nextEvent);

  return {
    ...(raw as unknown as OuterReadinessData),
    phrase: asString(raw.phrase) ?? '',
    context: asString(raw.context) ?? '',
    leanOn: asString(raw.leanOn) ?? '',
    watchFor: asString(raw.watchFor) ?? '',
    driver: asString(raw.driver) ?? '',
    dataSources: asStringArray(raw.dataSources),
    bodyText: asString(raw.bodyText) ?? undefined,
    leanOnSource: asString(raw.leanOnSource) ?? undefined,
    watchForSource: asString(raw.watchForSource) ?? undefined,
    briefId: asString(raw.briefId) ?? null,
    calendarState:
      raw.calendarState === 'active' || raw.calendarState === 'connected_no_events' || raw.calendarState === 'not_connected'
        ? raw.calendarState
        : undefined,
    integrationStatus: {
      wearable: wearableIntegration
        ? {
            connectionStatus: (asString(wearableIntegration.connectionStatus) as any) ?? 'unknown',
            syncStatus: (asString(wearableIntegration.syncStatus) as any) ?? 'unknown',
            hasTodayData: asBoolean(wearableIntegration.hasTodayData),
            hasRecentData: asBoolean(wearableIntegration.hasRecentData),
            hasHistoricalData: asBoolean(wearableIntegration.hasHistoricalData),
            lastSyncAt: asIsoString(wearableIntegration.lastSyncAt),
            lastSampleAt: asIsoString(wearableIntegration.lastSampleAt),
          }
        : null,
      calendar: calendarIntegration
        ? {
            provider: asString(calendarIntegration.provider),
            connectionStatus: (asString(calendarIntegration.connectionStatus) as any) ?? 'disconnected',
            needsReconnect: asBoolean(calendarIntegration.needsReconnect),
            lastSyncAt: asIsoString(calendarIntegration.lastSyncAt),
          }
        : null,
    },
    hasWearable: asBoolean(raw.hasWearable),
    hasCalendar: asBoolean(raw.hasCalendar),
    hasHistoricalData: asBoolean(raw.hasHistoricalData),
    awaitingSignals: asBoolean(raw.awaitingSignals),
    awaitingReason: asString(raw.awaitingReason) === 'no-checkin-no-wearable'
      ? 'no-checkin-no-wearable'
      : null,
    briefMode:
      raw.briefMode === 'cold-start' || raw.briefMode === 'baseline' || raw.briefMode === 'refined'
        ? raw.briefMode
        : undefined,
    wearableStatus: wearableStatus
      ? {
          isConnected: asBoolean(wearableStatus.isConnected),
          hasTodayData: asBoolean(wearableStatus.hasTodayData),
          hasRecentData: asBoolean(wearableStatus.hasRecentData),
          isStale: asBoolean(wearableStatus.isStale),
          sourceAgeDays: asFiniteNumber(wearableStatus.sourceAgeDays) ?? null,
          metricsAvailable: {
            hrv: asBoolean(asRecord(wearableStatus.metricsAvailable)?.hrv),
            sleep: asBoolean(asRecord(wearableStatus.metricsAvailable)?.sleep),
            rhr: asBoolean(asRecord(wearableStatus.metricsAvailable)?.rhr),
          },
          sourceRowDate: asDateOnlyString(wearableStatus.sourceRowDate),
          dataSource: asString(wearableStatus.dataSource) ?? null,
        }
      : undefined,
    highStakesEvents: asStringArray(raw.highStakesEvents),
    highStakesEventsDetailed: asHighStakesDetailed(raw.highStakesEventsDetailed),
    remainingHighStakes: asStringArray(raw.remainingHighStakes),
    nextHighStakesEvent: nextHighStakesEvent
      ? {
          title: asString(nextHighStakesEvent.title) ?? '',
          minutesUntil: asFiniteNumber(nextHighStakesEvent.minutesUntil) ?? 0,
        }
      : null,
    nextEvent: nextEvent
      ? {
          title: asString(nextEvent.title) ?? '',
          minutesUntil: asFiniteNumber(nextEvent.minutesUntil) ?? 0,
        }
      : null,
    hrvDeviation: asFiniteNumber(raw.hrvDeviation) ?? null,
    sleepDeviation: asFiniteNumber(raw.sleepDeviation) ?? null,
    rhrDeviation: asFiniteNumber(raw.rhrDeviation) ?? null,
    sleepDuration: asFiniteNumber(raw.sleepDuration) ?? null,
    rhrValue: asFiniteNumber(raw.rhrValue) ?? null,
    sleepScore: asFiniteNumber(raw.sleepScore) ?? null,
    hrvValue: asFiniteNumber(raw.hrvValue) ?? null,
    hrValue: asFiniteNumber(raw.hrValue) ?? null,
    hrBaseline: asFiniteNumber(raw.hrBaseline) ?? null,
    hrDeviation: asFiniteNumber(raw.hrDeviation) ?? null,
    hrvBaseline: asFiniteNumber(raw.hrvBaseline) ?? null,
    sleepBaseline: asFiniteNumber(raw.sleepBaseline) ?? null,
    rhrBaseline: asFiniteNumber(raw.rhrBaseline) ?? null,
    innerReadinessScore: asFiniteNumber(raw.innerReadinessScore) ?? null,
    innerReadinessScoreBaseline: asFiniteNumber(raw.innerReadinessScoreBaseline) ?? null,
    innerReadinessScoreRefined: asFiniteNumber(raw.innerReadinessScoreRefined) ?? null,
    innerReadinessRefinedContribution: asFiniteNumber(raw.innerReadinessRefinedContribution) ?? null,
    innerReadinessState:
      raw.innerReadinessState === 'baseline' || raw.innerReadinessState === 'refined' || raw.innerReadinessState === 'awaiting'
        ? raw.innerReadinessState
        : null,
    signalPills: normalizeSignalPills(raw.signalPills),
    pillQualifiers: normalizePillQualifiers(raw.pillQualifiers),
    weekAheadShape: asRecord(raw.weekAheadShape) ?? null,
    sourceProvenance: (asRecord(raw.sourceProvenance) as OuterReadinessData['sourceProvenance']) ?? null,
    pillCoherence: (asRecord(raw.pillCoherence) as OuterReadinessData['pillCoherence']) ?? null,
    baselineReadinessScore: asFiniteNumber(raw.baselineReadinessScore) ?? null,
    hasCurrentPeriodCheckIn: asBoolean(raw.hasCurrentPeriodCheckIn),
    hasFreshWearable: asBoolean(raw.hasFreshWearable),
    hasCurrentPeriodSignal: asBoolean(raw.hasCurrentPeriodSignal),
    coherenceWarning: asString(raw.coherenceWarning) ?? null,
  };
}

async function fetchOuterReadinessFresh(userId: string | undefined): Promise<OuterReadinessData | null> {
  if (!userId) return null;

  // Structured failure stub – identical shape to a successful response so MRS,
  // Decision Readiness Brief and Today's Priorities can render their retry /
  // auth-recovery blocks instead of degrading into cold-start copy.
  const buildFailureStub = (
    engineStatus: NonNullable<OuterReadinessData['engineStatus']>,
    reason?: OuterReadinessData['engineFailureReason'],
  ): OuterReadinessData => ({
    phrase: '',
    context: '',
    leanOn: '',
    watchFor: '',
    driver: '',
    dataSources: [],
    engineStatus,
    engineFailureReason: reason,
    awaitingSignals: false,
    briefMode: undefined,
    innerReadinessScore: null,
    innerReadinessTier: null,
  } as OuterReadinessData);

  // Energy state already reads today's check-in. Reuse those echoed fields so
  // the executive home brief does not make a second daily-checkins request.
  const energyState = await computeEnergyState(userId);

  // Phase 1 — if the inner engine returned a hard failure (auth/inner/unknown),
  // do NOT call compute-outer-readiness. That EF would return `awaitingSignals`
  // for what is actually an infrastructure blip, blanking all three home cards.
  // Return a structured error stub so the UI can render a retry block.
  const innerStatus = energyState.engineStatus;
  if (
    innerStatus === 'auth-failure' ||
    innerStatus === 'inner-failure' ||
    innerStatus === 'unknown-error'
  ) {
    console.warn(
      '[useOuterReadiness] Inner engine failed — short-circuiting with engineStatus =',
      innerStatus,
    );
    return buildFailureStub(innerStatus);
  }

  // Build auth headers – in DEV_MODE, skip Auth0 token and pass userId in body
  const headers: Record<string, string> = {};
  if (!DEV_MODE) {
    let token: string | null = null;
    let timedOut = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        token = await getAuthToken();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/timeout/i.test(message)) {
          timedOut = true;
        }
        console.warn('[useOuterReadiness] getAuthToken threw:', message);
        token = null;
      }
      if (token) break;
      await new Promise(r => setTimeout(r, 500));
    }
    if (!token) {
      // Do NOT return null here — that made the UI degrade into cold-start /
      // "awaiting signals" copy for what is really an expired/missing session.
      // Return a structured auth-failure so MRS / Brief / Today's Priorities
      // can prompt the user to sign in again.
      console.warn(
        '[useOuterReadiness] No Auth0 token after retries – returning auth-failure stub',
        { timedOut },
      );
      return buildFailureStub(
        'auth-failure',
        timedOut ? 'auth-token-timeout' : 'missing-auth-token',
      );
    }
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Calendar load/pressure now computed server-side – no need to send from client
  const res = await supabase.functions.invoke('compute-outer-readiness', {
    body: {
      innerReadinessTier: energyState.energyTier,
      innerReadinessScore: energyState.overallBalance ?? null,
      clarityLevel: energyState.clarityLevel ?? null,
      confidenceLevel: energyState.confidenceLevel ?? null,
      mentalSharpnessLevel: energyState.mentalSharpnessLevel ?? null,
      // MRS v3 §3.2 — the 4 Mind Check-in dimensions. Server uses them only
      // for echoing/persistence (the inner-readiness EF already blended them
      // into the score via energyStateEngine).
      emotionLevel: energyState.emotionLevel ?? null,
      pressureLevel: energyState.pressureLevel ?? null,
      regulationLevel: energyState.regulationLevel ?? null,
      checkInOutcome: energyState.checkInOutcome || null,
      timezoneOffset: new Date().getTimezoneOffset(),
      // MRS v3 — forward soft-guard tier cap so the server can persist the
      // displayed tier into daily_context_snapshot in one round trip.
      tierDisplayed: energyState.tierDisplayed ?? energyState.energyTier,
      tierCapReason: energyState.tierCapReason ?? null,
      // MRS v3 §3.3 — forward refined-score split so the server can persist
      // it into daily_context_snapshot in the same round trip.
      innerReadinessScoreBaseline: energyState.scoreBaseline ?? null,
      innerReadinessScoreRefined: energyState.scoreRefined ?? null,
      innerReadinessState: energyState.readinessState ?? 'baseline',
      innerReadinessRefinedContribution: energyState.refinedContribution ?? null,
      weightProvenance: energyState.weightProvenance ?? null,
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
    // supabase-js wraps non-2xx responses in a FunctionsHttpError with
    // `context.status`. Classify auth failures separately from backend crashes
    // so the UI shows "sign in again" instead of "readiness engine crashed".
    const rawStatus =
      (res.error as { context?: { status?: number } })?.context?.status ??
      (res.error as { status?: number })?.status ??
      null;
    const status = typeof rawStatus === 'number' ? rawStatus : null;
    console.error('[useOuterReadiness] Edge function error:', {
      status,
      message: res.error instanceof Error ? res.error.message : String(res.error),
    });
    if (status === 401) {
      return buildFailureStub('auth-failure', 'http-401');
    }
    if (status === 403) {
      return buildFailureStub('session-failure', 'http-403');
    }
    if (status !== null && status >= 500) {
      return buildFailureStub('outer-failure', 'http-5xx');
    }
    // Network / invoke-level error with no HTTP status — treat as outer
    // failure so the retry block renders, but tag the reason distinctly.
    return buildFailureStub('outer-failure', 'edge-invoke-error');
  }

  const data = normalizeOuterReadinessPayload(res.data);
  // Phase 1 — stamp the engine status onto the server response so consumers
  // have one canonical field to read. Server has no opinion on this; the
  // client owns the inner/auth/outer infrastructure-failure taxonomy.
  data.engineStatus = innerStatus ?? 'ready';
  console.log('[useOuterReadiness] Brief received:', {
    phrase: data.phrase,
    driver: data.driver,
    calendarState: data.calendarState,
    dataSources: data.dataSources,
    engineStatus: data.engineStatus,
  });
  // [PRB] Diagnostic — live outer-readiness normalized payload.
  // Fires only on a real network fetch (not cache hits). No PII / tokens.
  console.log('[PRB][outer]', {
    effectiveUserId: userId,
    localDate: localISODate(),
    currentPeriod: currentPeriodLocal(),
    briefMode: data.briefMode ?? null,
    awaitingSignals: !!data.awaitingSignals,
    engineStatus: data.engineStatus,
    innerReadinessScore: data.innerReadinessScore ?? null,
    innerReadinessScoreBaseline: data.innerReadinessScoreBaseline ?? null,
    innerReadinessScoreRefined: data.innerReadinessScoreRefined ?? null,
    innerReadinessState: data.innerReadinessState ?? null,
    innerReadinessTier: data.innerReadinessTier ?? null,
    innerReadinessTierDisplayed: data.innerReadinessTierDisplayed ?? null,
    hasPhrase: !!data.phrase,
    hasBodyText: !!data.bodyText,
    briefId: data.briefId ?? null,
    hasSignalPills: Array.isArray(data.signalPills) && data.signalPills.length > 0,
  });

  // [PRB][llm] Diagnostic — categorize why the LLM Brief slot rendered
  // what it did. Purely for browser-console debugging: reason codes only,
  // no prompt text, no tokens, no PII.
  const llmReason = (data as any).llmFallbackReason as string | null | undefined;
  const rejections = (data as any).validatorRejections as unknown[] | null | undefined;
  const hasPhrase = !!data.phrase;
  const hasBodyText = !!data.bodyText;
  const hasScore = typeof data.innerReadinessScore === 'number';
  const category: string = (() => {
    const r = (llmReason || '').toLowerCase();
    if (r) {
      if (r.includes('credit_limit') || r.includes('402') || r.includes('billing')) return 'provider_credit';
      if (r.includes('timeout') || r.includes('abort')) return 'provider_timeout';
      if (r.includes('atomic') || r.includes('em_dash') || r.includes('validation') || (Array.isArray(rejections) && rejections.length > 0)) return 'validator_failure';
      if (r.includes('parse')) return 'parse_failed';
      if (r.includes('returned_null') || r.includes('http-') || r.includes('gateway') || r.includes('workspace_credit')) return 'provider_failure';
      return 'provider_failure';
    }
    if (data.awaitingSignals && !hasScore) return 'true_cold_start';
    if (hasScore && !hasPhrase && !hasBodyText) return 'score_present_copy_missing';
    if (hasPhrase && hasBodyText) return 'fully_rendered';
    return 'unknown';
  })();
  console.log('[PRB][llm]', {
    briefId: data.briefId ?? null,
    briefSource: data.briefSource ?? null,
    engineStatus: data.engineStatus ?? null,
    briefMode: data.briefMode ?? null,
    awaitingSignals: !!data.awaitingSignals,
    awaitingReason: (data as any).awaitingReason ?? null,
    innerReadinessState: data.innerReadinessState ?? null,
    llmFallbackReason: llmReason ?? null,
    validatorRejectionCount: Array.isArray(rejections) ? rejections.length : 0,
    hasPhrase,
    hasBodyText,
    hasScore,
    category,
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

export interface UseOuterReadinessOptions {
  /**
   * When true and `HOME_SNAPSHOT_ONLY` is enabled, the React Query is
   * disabled: no `compute-outer-readiness` / `compute-inner-readiness`
   * network call fires, no `calendar_connections` / `calendar_events`
   * / `daily_context_snapshot` / `daily-checkins` reads happen from the
   * live `computeEnergyState` pipeline. Snapshot-only Executive Home
   * callers (`MrsPage`, `DecisionReadinessBrief`, `TodayThreePriorities`)
   * MUST pass this so the three home pages don't stampede live readiness
   * on mount. Manual refresh (`useExecutiveHomeCardsRefresh`) still
   * regenerates the snapshots via the cron/build orchestrator.
   *
   * Callers on other surfaces (Insights, Coach, admin) omit the option
   * and continue to hit the live compute path unchanged.
   */
  snapshotOnly?: boolean;
}

export function useOuterReadiness(options?: UseOuterReadinessOptions) {
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

  // Executive Home snapshot-only guard. When the caller opts in AND the
  // global snapshot-only flag is on, we short-circuit the React Query
  // entirely so no live compute pipeline runs on Home mount. A manual
  // force-refresh (set by `clearOuterReadinessCache`) re-enables the
  // query for a single fetch cycle.
  const snapshotOnlyDisabled =
    options?.snapshotOnly === true && HOME_SNAPSHOT_ONLY && !forceRefresh;

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
          `prb-cache-v2:${effectiveUserId}:`,
          `prb-awaiting-v2:${effectiveUserId}:`,
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
  // payload so a cold-start user doesn't trigger a fresh edge call on
  // every mount / iOS foreground. The awaiting cache is only ever written
  // for `briefMode === 'cold-start'` (see queryFn below), so a baseline-
  // mode user can never accidentally rehydrate into a skeleton.
  const initialData = forceRefresh
    ? null
    : (cached
        && cached.briefMode !== 'cold-start'
        && !cached.awaitingSignals
        && cached.phrase
        && cached.bodyText)
      ? cached
      : (cachedAwaiting && cachedAwaiting.briefMode === 'cold-start')
        ? cachedAwaiting
        : null;
  if (initialData) {
    dbg('initialData hydrated from', initialData.briefMode === 'cold-start' ? 'awaiting-cache' : 'brief-cache', {
      key: initialData.briefMode === 'cold-start' ? awaitingKey : persistentKey,
    });
  }

  return useQuery({
    queryKey: ['outer-readiness', effectiveUserId, period],
    queryFn: async () => {
      // Snapshot-only home mode: cron owns generation via
      // `build-executive-home-cards`. Home load must NOT invoke
      // `compute-outer-readiness`. If a persistent cache exists, use it;
      // otherwise return null and let snapshot-read hooks
      // (useMrsSnapshot / useCurrentBriefSnapshot) drive the UI.
      // Manual force-refresh (admin/pull-to-refresh) still runs a live
      // compute — it sets `forceRefreshKey` in sessionStorage.
      if (HOME_SNAPSHOT_ONLY && !forceRefresh) {
        console.log('[PRB][render] source=snapshot skipped=compute-outer-readiness reason=home-snapshot-only', {
          hasInitialData: !!initialData,
          period,
        });
        return initialData ?? null;
      }
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
        data.briefMode !== 'cold-start' &&
        !data.awaitingSignals &&
        data.phrase &&
        data.bodyText
      ) {
        writePersistent(persistentKey, data, msUntilWindowEnd());
        // A real brief supersedes any awaiting marker for this window.
        if (awaitingKey) clearPersistent(awaitingKey);
      } else if (data?.briefMode === 'cold-start' || data?.awaitingSignals) {
        // If we already have a valid real brief cached for today's window,
        // preserve it rather than replacing it with an empty/awaiting skeleton.
        if (cached && cached.phrase && cached.bodyText) {
          dbg('Network returned awaitingSignals/cold-start, but preserving existing cached brief', { key: persistentKey });
          return cached;
        }
        if (persistentKey) clearPersistent(persistentKey);
        if (awaitingKey) writePersistent(awaitingKey, data, msUntilWindowEnd());
      }
      if (forceRefreshKey && typeof window !== 'undefined') {
        try { window.sessionStorage.removeItem(forceRefreshKey); } catch { /* ignore */ }
      }
      return data ?? cached ?? null;
    },
    enabled: !!effectiveUserId && !snapshotOnlyDisabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    // Executive Home now reads via snapshot hooks; the live compute path is
    // reserved for non-home surfaces (Insights, Coach) and manual refresh.
    // We no longer force `refetchOnMount: 'always'` because it caused every
    // Home mount (all 3 swipe pages) to re-invoke `compute-outer-readiness`
    // and its `computeEnergyState` fan-out (calendar_connections,
    // calendar_events, daily_context_snapshot, daily-checkins,
    // compute-inner-readiness). Snapshot mode disables the query outright;
    // non-snapshot callers get the standard staleTime-driven behaviour.
    refetchOnMount: snapshotOnlyDisabled ? false : 'always',
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
