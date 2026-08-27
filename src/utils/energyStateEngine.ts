/* eslint-disable no-restricted-syntax -- grandfathered raw calendar_events reads. Tracked in .lovable/plan.md for wiring through mergeCalendarEvents(). Remove this directive once every .from('calendar_events') read below has been replaced. */
/**
 * Energy State Engine – v2.0 (Decision Readiness)
 * Thin client orchestrator: gathers inputs, calls backend for scoring.
 * No proprietary scoring logic lives here.
 */

import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';
// NOTE: getLocalWearableData intentionally NOT imported – DB is canonical source for cross-device consistency
import { getCalendarMetrics, type CalendarLoad, type CalendarPressure, type MasteryType, type MasterySubtype } from './energyStateScoring';
import { getCurrentTimeWindow, getTodayCheckin } from '@/utils/dailyCheckins';
import { getAuthToken as getAuth0Token } from '@/services/authTokenService';
import { localISODate } from '@/utils/persistentBriefCache';
// getLocalWearableData removed – local cache must not override cloud source of truth
import { getUserHRVBaseline, computeHRVPatternContext } from '@/utils/wearableContextAnalyzer';
import { HOME_SNAPSHOT_ONLY } from '@/config/homeSnapshotMode';

// ==================== RETRY GUARDRAIL ====================
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 6; // max 30 min of retrying
let pendingScoreUpdate: { checkinDate: string; score: number; retries: number; timeWindow?: string } | null = null;
let retryTimerId: ReturnType<typeof setTimeout> | null = null;

async function persistCompositeScore(checkinDate: string, score: number, timeWindow?: string): Promise<void> {
  // DEV_MODE: Write directly to DB without Auth0
  if (DEV_MODE) {
    try {
      let query = supabase
        .from('daily_checkins')
        .update({ energy_balance: score })
        .eq('user_id', DEV_USER.id)
        .eq('checkin_date', checkinDate);

      if (timeWindow) {
        query = query.eq('time_window', timeWindow);
      }

      const { error } = await query;

      if (error) {
        console.error('[energyStateEngine] DEV_MODE persistCompositeScore error:', error);
      } else {
        console.log('[energyStateEngine] DEV_MODE composite score persisted:', score);
      }
    } catch (err) {
      console.error('[energyStateEngine] DEV_MODE persistCompositeScore failed:', err);
    }
    return;
  }

  // Clear any existing retry for a different date
  if (pendingScoreUpdate && pendingScoreUpdate.checkinDate !== checkinDate) {
    if (retryTimerId) clearTimeout(retryTimerId);
    retryTimerId = null;
    pendingScoreUpdate = null;
  }

  const isFirstAttempt = !pendingScoreUpdate || pendingScoreUpdate.checkinDate !== checkinDate;
  pendingScoreUpdate = { checkinDate, score, retries: pendingScoreUpdate?.retries ?? 0, timeWindow };

  try {
    // On first attempt, wait up to 3s for token to be ready (avoids unnecessary retry cycle)
    let token: string | null = null;
    if (isFirstAttempt) {
      for (let i = 0; i < 6; i++) {
        token = await getAuth0Token();
        if (token) break;
        await new Promise(r => setTimeout(r, 500));
      }
    } else {
      token = await getAuth0Token();
    }
    if (!token) throw new Error('No Auth0 token available');

    const resolvedWindow = timeWindow || getCurrentTimeWindow();
    const res = await supabase.functions.invoke('daily-checkins', {
      body: { action: 'UPDATE_ENERGY_BALANCE', checkinDate, energyBalance: score, timeWindow: resolvedWindow },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.error) throw new Error(typeof res.error === 'string' ? res.error : res.error.message || 'Edge function error');

    console.log('[energyStateEngine] Composite score persisted:', score);
    pendingScoreUpdate = null;
    if (retryTimerId) { clearTimeout(retryTimerId); retryTimerId = null; }
  } catch (err) {
    console.warn('[energyStateEngine] UPDATE_ENERGY_BALANCE failed (attempt', (pendingScoreUpdate?.retries ?? 0) + 1, '):', err);

    if (pendingScoreUpdate && pendingScoreUpdate.retries < MAX_RETRIES) {
      pendingScoreUpdate.retries++;
      if (retryTimerId) clearTimeout(retryTimerId);
      retryTimerId = setTimeout(() => {
        if (pendingScoreUpdate) {
          persistCompositeScore(pendingScoreUpdate.checkinDate, pendingScoreUpdate.score, pendingScoreUpdate.timeWindow);
        }
      }, RETRY_INTERVAL_MS);
      console.log('[energyStateEngine] Scheduled retry in 5 min (attempt', pendingScoreUpdate.retries, '/', MAX_RETRIES, ')');
    } else {
      console.error('[energyStateEngine] All retries exhausted. Score NOT persisted for', checkinDate);
      pendingScoreUpdate = null;
    }
  }
}


export interface CurrentEnergyState {
  overallBalance: number | null;
  /**
   * Phase 1 status contract — lets downstream surfaces distinguish a true
   * "no signal" cold start from a transient infrastructure failure.
   *   • 'ready'         — backend returned a usable score (or a valid
   *                       awaiting-of-its-own-volition response with signals)
   *   • 'awaiting'      — true cold start: no wearable, no calendar, no check-in
   *   • 'auth-failure'  — Auth0 token unavailable (non-DEV)
   *   • 'inner-failure' — compute-inner-readiness edge function errored
   *   • 'stale'         — DB reads degraded; serving cached/snapshot data
   *   • 'unknown-error' — any other failure path
   *
   * Optional so older readers continue to work without a recompile gate.
   */
  engineStatus?: 'ready' | 'awaiting' | 'auth-failure' | 'inner-failure' | 'stale' | 'unknown-error';
  state: string;
  contextTags: string[];
  energyTags: string[];
  stateTags: string[];
  recommendationPriority: string;
  dataSources: string[];
  confidence: 'low' | 'medium' | 'high';
  calendarDensity?: number;
  calendarLoad?: CalendarLoad;
  calendarPressure?: CalendarPressure;
  wearableFunction?: 'low' | 'medium' | 'high';
  energyTier: 'depleted' | 'managing' | 'strong' | 'peak';
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  recommendation?: {
    primary: MasteryType;
    primarySubtype?: MasterySubtype;
    secondary?: MasteryType;
    secondarySubtype?: MasterySubtype;
    contextStatement: string;
  };
  checkInOutcome?: string;
  clarityLevel?: number | null;
  confidenceLevel?: number | null;
  mentalSharpnessLevel?: number | null;
  // MRS v3 §3.2 — the 4 Mind Check-in dimensions (1–5 or null).
  emotionLevel?: number | null;
  pressureLevel?: number | null;
  regulationLevel?: number | null;
  divergenceFlag?: 'ALIGNED' | 'MASKED_HIGH' | 'RECOVERY_UNDERWAY' | 'SUPPLY_DEMAND_GAP' | 'LIGHT_DAY_STRONG_STATE' | 'INTRADAY_DECLINE';
  hrvDeviation?: number | null;
  tierLabel?: string;
  layersActive?: string[];
  layer3Statement?: string | null;
  // MRS v3 — soft-guard tier cap. `tierDisplayed` is what the UI should
  // render. `tierCapReason` explains the cap when present.
  tierDisplayed?: 'depleted' | 'managing' | 'strong' | 'peak';
  tierDisplayedLabel?: string;
  tierCapReason?: 'SUSTAINED_DEFICIT' | 'CONSECUTIVE_LOAD' | null;
  // MRS v3 §3.3 — refined-score surface. `scoreBaseline` is the raw State 1
  // value; `scoreRefined` is null until a Mind Check-in exists for the window.
  // `overallBalance` already tracks the DISPLAYED score (refined when present).
  scoreBaseline?: number | null;
  scoreRefined?: number | null;
  readinessState?: 'baseline' | 'refined' | 'awaiting';
  refinedContribution?: number | null;
  // Canonical band SSOT — derived once server-side in compute-inner-readiness.
  // Consumers (Brief, validator, Plan bias, one-liner display) should read
  // these instead of re-deriving from `overallBalance`.
  band?: 'full' | 'ready' | 'holding' | 'reserves' | 'empty';
  bandLabel?: string;
  bandValence?: 'low' | 'mid' | 'high';
  // Tri-state wearable status: 'fresh' (used by score), 'stale' (had a row
  // but >48h old — excluded from score), 'missing' (never connected / no rows).
  wearableStatus?: 'fresh' | 'stale' | 'missing';
  // MRS v4 audit payload persisted by compute-outer-readiness.
  weightProvenance?: unknown | null;
}

const ENERGY_STATE_CACHE_MS = 30_000;
const energyStateCache = new Map<string, { expiresAt: number; data: CurrentEnergyState }>();
const energyStateInFlight = new Map<string, Promise<CurrentEnergyState>>();
let energyStateCacheVersion = 0;

function getEnergyStateCacheKey(userId?: string): string {
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId || 'anon';
  const today = new Date().toLocaleDateString('en-CA');
  return `${effectiveUserId}:${today}:${getCurrentTimeWindow()}`;
}

export function clearEnergyStateCache(): void {
  energyStateCacheVersion++;
  energyStateCache.clear();
  energyStateInFlight.clear();
}

type MrsV4Window = 'morning' | 'afternoon' | 'evening';
type MrsV4SubComponentId =
  | 'hrvMorningDeviation'
  | 'sleepDeviation'
  | 'rhrTrend'
  | 'intradayHrDeviation'
  | 'eveningPhysioRead'
  | 'todayFullDayDemand'
  | 'remainingDayDemand'
  | 'realizedSoFarCost'
  | 'todayRealizedDemand'
  | 'tomorrowOpeningDemand'
  | 'patternEngineComposite'
  | 'yesterdayCarryover';

interface MrsV4SubScore {
  id: MrsV4SubComponentId;
  score: number;
  available: boolean;
}

interface ClientPatternSignalsLite {
  hrv_3day_trend?: 'improving' | 'stable' | 'declining' | 'unknown' | null;
  consecutive_high_load_days?: number | null;
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreFromDeviation(deviationPct: number | null, inverse = false): number | null {
  if (typeof deviationPct !== 'number' || !Number.isFinite(deviationPct)) return null;
  return clampScore((inverse ? 55 - deviationPct * 2 : 55 + deviationPct * 2));
}

function scoreFromAbsoluteHrv(hrv: number | null): number | null {
  if (typeof hrv !== 'number' || !Number.isFinite(hrv) || hrv <= 0) return null;
  // Day-1 provisional read: when a fresh HRV value exists but a personal
  // baseline is not mature yet, let HRV count as a real low-confidence
  // State-1 signal instead of blocking MRS entirely.
  if (hrv >= 50) return 75;
  if (hrv >= 30) return 55;
  return 35;
}

function scoreFromDemand(demandScore: number | null): number | null {
  if (typeof demandScore !== 'number' || !Number.isFinite(demandScore)) return null;
  return clampScore(100 - demandScore);
}

function scoreFromPattern(patternSignals: ClientPatternSignalsLite | null): number | null {
  if (!patternSignals) return null;
  if ((patternSignals.consecutive_high_load_days ?? 0) >= 3) return 20;
  if ((patternSignals.consecutive_high_load_days ?? 0) === 0 && patternSignals.hrv_3day_trend === 'improving') return 80;
  switch (patternSignals.hrv_3day_trend) {
    case 'declining': return 30;
    case 'improving': return 70;
    case 'stable': return 50;
    default: return null;
  }
}

function scoreFromRhrTrend(trend: 'falling' | 'stable' | 'rising' | null): number | null {
  if (trend === 'falling') return 80;
  if (trend === 'stable') return 55;
  if (trend === 'rising') return 30;
  return null;
}

function scoreFromAbsoluteRhr(rhr: number | null): number | null {
  if (typeof rhr !== 'number' || !Number.isFinite(rhr) || rhr <= 0) return null;
  if (rhr <= 60) return 75;
  if (rhr <= 75) return 55;
  if (rhr <= 90) return 40;
  return 25;
}

function sleepQualityFromInputs(score: number | null, hours: number | null): 'poor' | 'fair' | 'good' | 'peak' | null {
  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score < 50) return 'poor';
    if (score < 70) return 'fair';
    if (score < 85) return 'good';
    return 'peak';
  }
  if (typeof hours === 'number' && Number.isFinite(hours)) {
    if (hours < 5) return 'poor';
    if (hours < 6.5) return 'fair';
    if (hours < 8) return 'good';
    return 'peak';
  }
  return null;
}

function sub(id: MrsV4SubComponentId, score: number | null): MrsV4SubScore {
  return { id, score: score == null ? 0 : clampScore(score), available: score != null };
}

function buildClientMrsV4SubScores(args: {
  window: MrsV4Window;
  hrvValue: number | null;
  hrvDeviationPct: number | null;
  sleepScore: number | null;
  sleepHours: number | null;
  rhrValue: number | null;
  rhrTrend: 'falling' | 'stable' | 'rising' | null;
  demandScore: number | null;
  patternSignals: ClientPatternSignalsLite | null;
}): MrsV4SubScore[] {
  const hrv = sub(
    'hrvMorningDeviation',
    scoreFromDeviation(args.hrvDeviationPct) ?? scoreFromAbsoluteHrv(args.hrvValue),
  );
  const sleepScore =
    args.sleepScore != null ? clampScore(args.sleepScore)
    : args.sleepHours != null ? clampScore((args.sleepHours / 8) * 100)
    : null;
  const sleep = sub('sleepDeviation', sleepScore);
  const rhr = sub('rhrTrend', scoreFromRhrTrend(args.rhrTrend) ?? scoreFromAbsoluteRhr(args.rhrValue));
  const pattern = sub('patternEngineComposite', scoreFromPattern(args.patternSignals));

  if (args.window === 'morning') {
    return [
      hrv,
      sleep,
      rhr,
      sub('todayFullDayDemand', scoreFromDemand(args.demandScore)),
      pattern,
      sub('yesterdayCarryover', null),
    ];
  }
  if (args.window === 'afternoon') {
    return [
      hrv,
      sleep,
      rhr,
      sub('intradayHrDeviation', null),
      sub('remainingDayDemand', scoreFromDemand(args.demandScore)),
      sub('realizedSoFarCost', scoreFromDemand(args.demandScore)),
      pattern,
    ];
  }
  return [
    hrv,
    sleep,
    rhr,
    sub('eveningPhysioRead', scoreFromDeviation(args.hrvDeviationPct) ?? scoreFromAbsoluteHrv(args.hrvValue)),
    sub('todayRealizedDemand', scoreFromDemand(args.demandScore)),
    sub('tomorrowOpeningDemand', scoreFromDemand(args.demandScore)),
    pattern,
  ];
}

function getLocalDayBounds(now: Date = new Date()): { startISO: string; endISO: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function inferRelationshipPressureClient(metadata: any, title: string, attendeeCount: number): number {
  const lower = `${title || ''} ${JSON.stringify(metadata || {})}`.toLowerCase();
  if (/(client|customer|vendor|supplier|partner|account|proposal|demo)/.test(lower)) return 2;
  if (/(boss|manager|director|vp|1:1|one-on-one|one on one|feedback|review|performance|skip level)/.test(lower)) return 2;
  if (/(direct report|mentee|coaching|onboarding|candidate|interview)/.test(lower)) return 1;
  if (/(team|sync|standup|working session|planning|retro)/.test(lower)) return 1;
  const attendees = metadata?.attendeeSignals?.attendees;
  if (Array.isArray(attendees) && attendees.some((a: any) => a?.responseStatus === 'declined')) return 1;
  if (attendeeCount >= 6) return 1;
  return 0;
}

function deriveFullDayDemandScore(events: any[]): number | null {
  if (!Array.isArray(events)) return null;
  if (events.length === 0) return 0;

  const sorted = [...events].sort(
    (a, b) => new Date(a.start_time || a.startTime).getTime() - new Date(b.start_time || b.startTime).getTime(),
  );
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push(
      (new Date(sorted[i].start_time || sorted[i].startTime).getTime() -
        new Date(sorted[i - 1].end_time || sorted[i - 1].endTime).getTime()) / 60000,
    );
  }

  const count = sorted.length;
  const avgGap = gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : Infinity;
  const totalGapTime = gaps.length ? gaps.reduce((s, g) => s + Math.max(0, g), 0) : Infinity;
  const loadComponent = count >= 4 || (count >= 3 && avgGap < 20) ? 70 : count >= 3 ? 40 : 0;

  let totalPressure = 0;
  const nowMs = Date.now();
  for (const event of sorted) {
    let pressure = 0;
    if (event.is_organizer) pressure += 2;
    const attendees = event.attendees_count || 0;
    if (attendees > 5) pressure += 3;
    else if (attendees > 2) pressure += 1;
    const start = new Date(event.start_time || event.startTime);
    const end = new Date(event.end_time || event.endTime);
    const durationMin = (end.getTime() - start.getTime()) / 60000;
    if (durationMin > 60) pressure += 2;
    else if (durationMin >= 30) pressure += 1;
    if (!event.is_recurring) pressure += 1;
    const hour = start.getHours();
    if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) pressure += 1;
    pressure += inferRelationshipPressureClient(event.event_metadata, event.title || event.eventTitle || '', attendees);
    totalPressure += start.getTime() >= nowMs ? pressure : Math.ceil(pressure * 0.5);
  }

  for (const gap of gaps) {
    if (gap < 5) totalPressure += 3;
    else if (gap < 15) totalPressure += 2;
  }
  if (count >= 3 && totalGapTime < 30) totalPressure += 3;
  const intenseMeetings = sorted.filter((e) => !e.is_recurring && e.is_organizer).length;
  if (count > 0 && intenseMeetings / count > 0.5) totalPressure = Math.ceil(totalPressure * 1.5);

  const pressureComponent = totalPressure >= 6 ? 25 : totalPressure >= 3 ? 15 : 0;
  const hasHighStakes = sorted.some((event) =>
    !event.is_recurring &&
    ((event.attendees_count ?? 0) > 5 || (event.is_organizer && (event.attendees_count ?? 0) > 2)),
  );
  return clampScore(loadComponent + pressureComponent + (hasHighStakes ? 10 : 0));
}

interface OuterReadinessContextPreflight {
  contextOnly?: true;
  calendarState?: 'active' | 'connected_no_events' | 'not_connected';
  calendarUsable?: boolean;
  hasCalendarSignal?: boolean;
  calendarLoad?: CalendarLoad | null;
  calendarPressure?: CalendarPressure | null;
  meetingCount?: number | null;
  /** MRS v4 demand pillar — server-derived (client cannot read events under RLS). */
  demandScore?: number | null;
  fullDayDemandScore?: number | null;
  remainingDemandScore?: number | null;
  realizedDemandScore?: number | null;
}

/**
 * Cold-foreground hardening: on iOS resume the Auth0 token can be briefly
 * unavailable while the session rehydrates. Poll instead of failing on the
 * first miss so the readiness surfaces never paint the failure block for a
 * transient hydration gap.
 */
async function getAuthTokenWithRetry(
  attempts = 6,
  delayMs = 400,
): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const token = await getAuth0Token();
      if (token) return token;
    } catch (err) {
      console.warn('[energyStateEngine] getAuthToken threw during hydration retry:', err);
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

async function fetchOuterReadinessContext(
  authHeaders: Record<string, string>,
  userId?: string,
): Promise<OuterReadinessContextPreflight | null> {
  try {
    const res = await supabase.functions.invoke('compute-outer-readiness', {
      headers: authHeaders,
      body: {
        contextOnly: true,
        innerReadinessTier: 'managing',
        innerReadinessScore: null,
        clarityLevel: null,
        confidenceLevel: null,
        checkInOutcome: null,
        timezoneOffset: new Date().getTimezoneOffset(),
        currentTimezone: (() => {
          try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
          catch { return null; }
        })(),
        ...(DEV_MODE && userId ? { userId } : {}),
      },
    });
    if (res.error) {
      console.warn('[energyStateEngine] outer context preflight failed:', res.error);
      return null;
    }
    return (res.data ?? null) as OuterReadinessContextPreflight | null;
  } catch (err) {
    console.warn('[energyStateEngine] outer context preflight threw:', err);
    return null;
  }
}

/**
 * Snapshot-only stub. Returned to Executive Home surfaces when
 * HOME_SNAPSHOT_ONLY is active so the browser never triggers a
 * `compute-inner-readiness` round-trip on home load. Shape mirrors
 * `buildErrorFallback` exactly (all non-nullable CurrentEnergyState fields
 * present, `energyTier: 'managing'`) so consumers that read
 * `energyState.energyTier` without a null check stay safe.
 */
function buildSnapshotOnlyStub(): CurrentEnergyState {
  const hour = new Date().getHours();
  const timeOfDay =
    hour >= 5 && hour < 12 ? 'morning' as const
    : hour >= 12 && hour < 18 ? 'afternoon' as const
    : 'evening' as const;

  return {
    overallBalance: null,
    engineStatus: 'stale',
    state: 'managing',
    contextTags: [],
    energyTags: [],
    stateTags: [],
    recommendationPriority: 'managing',
    dataSources: ['circadian'],
    confidence: 'low',
    calendarDensity: 0,
    calendarLoad: null,
    calendarPressure: null,
    energyTier: 'managing',
    timeOfDay,
    recommendation: {
      primary: 'pause' as MasteryType,
      contextStatement: 'Reading your saved readiness snapshot.',
    },
    checkInOutcome: undefined,
    divergenceFlag: 'ALIGNED',
    wearableStatus: 'missing',
  };
}

export async function computeEnergyState(
  userId?: string,
  options?: { snapshotOnly?: boolean },
): Promise<CurrentEnergyState> {
  // Home snapshot-only mode: cron owns generation. Return a neutral stub
  // before touching the cache or invoking any edge function, so a later
  // live caller (Coach) still gets a real compute.
  if (options?.snapshotOnly === true && HOME_SNAPSHOT_ONLY) {
    return buildSnapshotOnlyStub();
  }

  const cacheKey = getEnergyStateCacheKey(userId);
  const cached = energyStateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inFlight = energyStateInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const version = energyStateCacheVersion;
  const promise = computeEnergyStateFresh(userId)
    .then((data) => {
      if (version === energyStateCacheVersion) {
        energyStateCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + ENERGY_STATE_CACHE_MS,
        });
      }
      return data;
    })
    .finally(() => {
      if (version === energyStateCacheVersion) {
        energyStateInFlight.delete(cacheKey);
      }
    });

  energyStateInFlight.set(cacheKey, promise);
  return promise;
}

async function computeEnergyStateFresh(userId?: string): Promise<CurrentEnergyState> {
  // 1. Read wearable data – try DB first, fall back to local storage
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
  const todayLocal = localISODate();
  const mrsWindow = getCurrentTimeWindow();
  // Phase 1 — track DB-read degradation so we can mark the final status as
  // 'stale' instead of 'ready' when the snapshot/wearable/checkin reads fail.
  let dbReadDegraded = false;
  let wearableHRV: number | null = null;
  let wearableBaseline: number | null = null;
  let wearableReadiness: number = 0;
  let wearableSleepScore: number | null = null;
  let wearableSleepHours: number | null = null;
  let wearableRhrValue: number | null = null;
  let wearableRhrTrend: 'falling' | 'stable' | 'rising' | null = null;
  let wearableFreshness: 'fresh' | 'stale' | 'missing' = 'missing';
  let wearableSignalsUsed: string[] = [];
  let wearableLatestSummaryDate: string | null = null;

  let hrvPatternContext: any = null;

  let authTokenForRequests: string | null = null;
  if (!DEV_MODE) {
    authTokenForRequests = await getAuthTokenWithRetry();
  }

  // Try DB for latest HRV + baseline + patterns
  if (effectiveUserId) {
    try {
      // Prefer the authenticated edge function `get-wearable-context`.
      // The browser Supabase client is anon-keyed only, so direct RLS-
      // protected reads of `wearable_data` return zero rows for real
      // users — that made the Brief live-path flicker through cold-start
      // (Wearable source: NONE) before the persisted snapshot with the
      // true score loaded. The edge function returns the exact shape the
      // engine used to compute locally, using the service role.
      let latestRow: { data: any } | { data: null } = { data: null };
      let latestHrvRow: { data: any } | { data: null } = { data: null };
      let baseline: number | null = null;
      let patterns: any = null;
      let rhrHistory: { data: any[] } = { data: [] };
      let usedEdgeFunction = false;
      try {
        // Must forward the Auth0 Bearer token — otherwise supabase-js
        // attaches the anon (HS256) JWT and the edge function's
        // Auth0-JWKS verifier rejects it with "Unsupported alg".
        const efRes = await supabase.functions.invoke('get-wearable-context', {
          body: {},
          headers: authTokenForRequests
            ? { Authorization: `Bearer ${authTokenForRequests}` }
            : undefined,
        });
        if (!efRes.error && efRes.data && (efRes.data as any).success) {
          const d = (efRes.data as any).data ?? {};
          latestRow = { data: d.latestRow ?? null };
          latestHrvRow = { data: d.latestHrvRow ?? null };
          baseline = typeof d.baseline === 'number' ? d.baseline : null;
          patterns = d.hrvPatternContext ?? null;
          rhrHistory = { data: Array.isArray(d.rhrHistory) ? d.rhrHistory : [] };
          usedEdgeFunction = true;
        } else if (efRes.error) {
          console.warn(
            '[energyStateEngine] get-wearable-context failed, falling back to direct read:',
            (efRes.error as Error)?.message ?? efRes.error,
          );
        }
      } catch (efErr) {
        console.warn('[energyStateEngine] get-wearable-context threw, falling back:', efErr);
      }

      if (!usedEdgeFunction) {
        // Fallback: legacy direct client reads (return empty for authenticated
        // web users under RLS, but preserved for DEV_MODE and future auth wiring).
        const [_latestRow, _latestHrvRow, _baseline, _patterns, _rhrHistory] = await Promise.all([
        // Latest wearable row with ANY usable physio metric (HRV, RHR, or
        // sleep). Used to gauge freshness + pull sleep/RHR even when today's
        // row has no HRV (Apple Health/Oura often write fields piecewise).
        supabase
          .from('wearable_data')
          .select('hrv, resting_heart_rate, sleep_score, total_sleep_minutes, summary_date, source, source_provider, updated_at')
          .eq('user_id', effectiveUserId)
          .or('hrv.not.is.null,resting_heart_rate.not.is.null,sleep_score.not.is.null,total_sleep_minutes.not.is.null')
          .order('summary_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Most recent HRV-bearing row (separate so HRV deviation can still
        // resolve even if the latest row carries only sleep/RHR).
        supabase
          .from('wearable_data')
          .select('hrv, summary_date')
          .eq('user_id', effectiveUserId)
          .not('hrv', 'is', null)
          .order('summary_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        getUserHRVBaseline(effectiveUserId),
        computeHRVPatternContext(effectiveUserId),
        // Pull last 14 wearable_data rows with RHR to derive a simple 3-day trend
        // vs ~prior 11-day mean. Used only to set `rhrElevated`/`rhrTrend` —
        // never to alter the MRS formula directly.
        supabase
          .from('wearable_data')
          .select('resting_heart_rate, summary_date')
          .eq('user_id', effectiveUserId)
          .not('resting_heart_rate', 'is', null)
          .order('summary_date', { ascending: false })
          .limit(14),
        ]);
        latestRow = _latestRow as any;
        latestHrvRow = _latestHrvRow as any;
        baseline = _baseline;
        patterns = _patterns;
        rhrHistory = _rhrHistory as any;
      }
      // Freshness gate — daily summaries are usable if captured within 48h.
      // Older than that and we treat wearable as stale (do not pass as current).
      const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;
      const nowMs = Date.now();
      const isFresh = (summaryDate?: string | null): boolean => {
        if (!summaryDate) return false;
        const t = new Date(`${summaryDate}T00:00:00Z`).getTime();
        if (!Number.isFinite(t)) return false;
        return nowMs - t <= FRESH_WINDOW_MS + 24 * 60 * 60 * 1000; // allow today's date
      };

      if (latestRow.data) {
        wearableLatestSummaryDate = (latestRow.data as any).summary_date ?? null;
        wearableFreshness = isFresh(wearableLatestSummaryDate) ? 'fresh' : 'stale';
      }

      // HRV — accept from latest HRV-bearing row only if that row itself is fresh.
      if (latestHrvRow.data?.hrv && isFresh((latestHrvRow.data as any).summary_date)) {
        wearableHRV = Number(latestHrvRow.data.hrv);
        wearableBaseline = baseline;
        wearableReadiness = wearableHRV >= 50 ? 75 : wearableHRV >= 30 ? 50 : 25;
        wearableSignalsUsed.push('hrv');
      }

      // Sleep — independent of HRV; only when freshest row is fresh.
      if (latestRow.data && wearableFreshness === 'fresh') {
        const ss = (latestRow.data as any).sleep_score;
        if (ss != null && Number.isFinite(Number(ss))) {
          wearableSleepScore = Number(ss);
          wearableSignalsUsed.push('sleep_score');
        }
        const tsm = (latestRow.data as any).total_sleep_minutes;
        if (tsm != null && Number.isFinite(Number(tsm))) {
          wearableSleepHours = Number(tsm) / 60;
          if (!wearableSignalsUsed.includes('sleep_score')) wearableSignalsUsed.push('sleep_hours');
        }
        const rhr = (latestRow.data as any).resting_heart_rate;
        if (rhr != null && Number.isFinite(Number(rhr)) && Number(rhr) > 0) {
          wearableRhrValue = Number(rhr);
          wearableSignalsUsed.push('rhr');
        }
      }
      // Derive a coarse 3-day RHR trend vs prior history mean.
      const rhrRows = (rhrHistory.data ?? [])
        .map((r: any) => Number(r.resting_heart_rate))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (rhrRows.length >= 5 && wearableFreshness === 'fresh') {
        const recent = rhrRows.slice(0, 3);
        const prior = rhrRows.slice(3);
        const recentMean = recent.reduce((a, b) => a + b, 0) / recent.length;
        const priorMean = prior.reduce((a, b) => a + b, 0) / prior.length;
        const delta = recentMean - priorMean;
        if (delta >= 3) wearableRhrTrend = 'rising';
        else if (delta <= -3) wearableRhrTrend = 'falling';
        else wearableRhrTrend = 'stable';
        wearableSignalsUsed.push('rhr_trend');
      }
      hrvPatternContext = patterns;
    } catch (err) {
      console.warn('[energyStateEngine] DB wearable fetch failed:', err);
      dbReadDegraded = true;
    }
  }

  // Diagnostic: log wearable data source for cross-device debugging
  console.log(
    '[energyStateEngine] Wearable source:',
    wearableHRV !== null ? 'DB' : 'NONE (no fallback)',
    '| HRV:', wearableHRV,
    '| RHR:', wearableRhrValue,
    '| RHR trend:', wearableRhrTrend,
    '| sleepScore:', wearableSleepScore,
    '| sleepHours:', wearableSleepHours,
    '| freshness:', wearableFreshness,
    '| latestSummaryDate:', wearableLatestSummaryDate,
    '| signalsUsed:', wearableSignalsUsed,
  );

  // `hasWearable` is true when ANY fresh physio signal is available.
  // Previously we required HRV; that hid sleep/RHR-only days (common with
  // Apple Health where fields are written piecewise across syncs).
  const hasWearable =
    wearableFreshness === 'fresh' &&
      ((wearableHRV !== null && wearableHRV > 0) ||
      wearableSleepScore !== null ||
      wearableSleepHours !== null ||
      wearableRhrValue !== null ||
      wearableRhrTrend !== null);

  // Fetch calendar events from DB only if connection is active
  let calendarData: any[] = [];
  let calendarConnected = false;
  if (effectiveUserId) {
    try {
      // Gate on active connection – stale events must not power active behavior
      const { data: conn } = await supabase
        .from('calendar_connections')
        .select('is_active')
        .eq('user_id', effectiveUserId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (conn) {
        calendarConnected = true;
      }
      // Always probe calendar_events directly — Apple Calendar (native) users
      // do not always have a `calendar_connections` row, but the server still
      // rates them as Stage 1 calendar-usable. Reading events lets us derive
      // a demand score and feed compute-inner-readiness so MRS doesn't collapse
      // to 'awaiting' when wearable is missing but calendar is usable.
      const { startISO, endISO } = getLocalDayBounds();
      const { data: rawEvents } = await supabase
        .from('calendar_events')
        .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring, event_metadata')
        .eq('user_id', effectiveUserId)
        .gte('start_time', startISO)
        .lte('start_time', endISO)
        .order('start_time', { ascending: true });
      // Cross-provider dedupe (Apple+Google+MSFT mirrors collapse to one).
      // See mem/architecture/event-load-and-dedupe-rules.md.
      const { mergeCalendarEvents } = await import('@/utils/rules/calendarEvents');
      const { isNativeApp } = await import('@/utils/nativeAuth');
      calendarData = mergeCalendarEvents((rawEvents || []) as any[], isNativeApp() ? 'ios' : 'web');
      if (!conn && calendarData.length > 0) {
        // Treat presence of events as a Stage 1 calendar signal so the
        // demand-score fallback below activates.
        calendarConnected = true;
      }
    } catch (err) {
      console.warn('[energyStateEngine] Calendar fetch failed, using empty:', err);
      dbReadDegraded = true;
    }
  }

  const hasCalendar = calendarData.length > 0;

  // MRS v2 — read the canonical daily_context_snapshot row (written by
  // compute-outer-readiness). If today's row exists we forward the demand
  // score + pattern signals to compute-inner-readiness so the score reflects
  // the new calendar/wearable logic end-to-end. Missing row → backend falls
  // back to neutral defaults; no client-side scoring.
  let snapshotDemandScore: number | null = null;
  let snapshotPatternSignals: ClientPatternSignalsLite | null = null;
  let snapshotMorningBaselineScore: number | null = null;
  if (effectiveUserId) {
    try {
      // Phase 2 — daily_context_snapshot is now window-scoped
      // (user_id, local_date, mrs_window). Read the row for the current
      // window; if absent, fall back to the most recent row for today
      // (legacy single-row schema or earlier window in same day).
      const currentWindow = mrsWindow;
      let snap: any = null;
      {
        const { data } = await supabase
          .from('daily_context_snapshot')
          .select('calendar_demand_score, pattern_signals, morning_baseline_score, mrs_window')
          .eq('user_id', effectiveUserId)
          .eq('local_date', todayLocal)
          .eq('mrs_window', currentWindow)
          .maybeSingle();
        snap = data ?? null;
      }
      if (!snap) {
        const { data: legacy } = await supabase
          .from('daily_context_snapshot')
          .select('calendar_demand_score, pattern_signals, morning_baseline_score, mrs_window')
          .eq('user_id', effectiveUserId)
          .eq('local_date', todayLocal)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (legacy) {
          console.warn(
            '[energyStateEngine] daily_context_snapshot legacy fallback: no row for window=' +
              currentWindow + ', using window=' + ((legacy as any)?.mrs_window ?? 'null'),
          );
          snap = legacy;
        }
      }
      // If current-window row is missing morning_baseline_score, hydrate it
      // from the morning row (which owns the anchor).
      if (snap && (snap as any).morning_baseline_score == null && currentWindow !== 'morning') {
        try {
          const { data: morningRow } = await supabase
            .from('daily_context_snapshot')
            .select('morning_baseline_score')
            .eq('user_id', effectiveUserId)
            .eq('local_date', todayLocal)
            .eq('mrs_window', 'morning')
            .maybeSingle();
          if (morningRow && (morningRow as any).morning_baseline_score != null) {
            (snap as any).morning_baseline_score = (morningRow as any).morning_baseline_score;
          }
        } catch { /* non-fatal */ }
      }
      if (snap) {
        const snapRow = snap as {
          calendar_demand_score?: number | null;
          pattern_signals?: ClientPatternSignalsLite | null;
          morning_baseline_score?: number | null;
        };
        snapshotDemandScore = coerceFiniteNumber(snapRow.calendar_demand_score);
        snapshotPatternSignals = snapRow.pattern_signals ?? null;
        snapshotMorningBaselineScore = coerceFiniteNumber(snapRow.morning_baseline_score);
      }
    } catch (err) {
      console.warn('[energyStateEngine] daily_context_snapshot fetch failed:', err);
      dbReadDegraded = true;
    }
  }

  // 2. Fetch check-in data from DB (sole source of truth – no localStorage)
  let clarityLevel: number | null = null;
  let confidenceLevel: number | null = null;
  let mentalSharpnessLevel: number | null = null;
  let emotionLevel: number | null = null;
  let pressureLevel: number | null = null;
  let regulationLevel: number | null = null;
  let storedEnergyBalance: number | null = null;
  let checkInOutcome: string | null = null;
  let checkInTimeWindow: string | null = null;
  let hasCheckIn = false;

  if (userId) {
    const dbCheckin = await getTodayCheckin();
    if (dbCheckin) {
      clarityLevel = dbCheckin.clarity_level ?? null;
      confidenceLevel = dbCheckin.confidence_level ?? null;
      mentalSharpnessLevel = dbCheckin.mental_sharpness_level ?? null;
      emotionLevel = (dbCheckin as any).emotion_level ?? null;
      pressureLevel = (dbCheckin as any).pressure_level ?? null;
      regulationLevel = (dbCheckin as any).regulation_level ?? null;
      storedEnergyBalance = dbCheckin.energy_balance ?? null;
      checkInTimeWindow = dbCheckin.time_window ?? null;
      // DB is authoritative for outcome if available
      if (!dbCheckin.skipped && dbCheckin.outcome) {
        checkInOutcome = dbCheckin.outcome;
        hasCheckIn = true;
      }
    }
  }

  // 3. Call backend scoring function
  try {
    // Get auth token for the EF call
    let authHeaders: Record<string, string> = {};
    if (!DEV_MODE) {
      const token = authTokenForRequests ?? await getAuthTokenWithRetry();
      if (token) {
        authHeaders = { Authorization: `Bearer ${token}` };
      } else {
        // Auth0 token still unavailable after the hydration retry window.
        // Do NOT call the edge function (it would 401), and do NOT paint the
        // hard failure block — on cold foreground this is almost always a
        // transient session-rehydration gap. Degrade to the snapshot-only
        // stub ('stale') so the persisted readiness snapshot renders and the
        // next compute picks up the real token.
        console.warn('[energyStateEngine] Auth0 token unavailable after retries — degrading to stale snapshot render');
        return buildSnapshotOnlyStub();
      }
    }

    const outerContext = await fetchOuterReadinessContext(authHeaders, effectiveUserId);

    // Derive baseline confidence from pattern context
    const baselineConfidence = hrvPatternContext?.baselineConfidence ?? 'low';
    const sampleDays = hrvPatternContext?.sampleDays ?? 0;
    const hrvDeviationPct =
      hasWearable &&
      typeof wearableHRV === 'number' &&
      typeof wearableBaseline === 'number' &&
      wearableBaseline > 0
        ? Math.round(((wearableHRV - wearableBaseline) / wearableBaseline) * 100)
        : null;

    // MRS v3 §3.2 — imminent high-stakes hint. Proper derivation lives in
    // JIT context (cat A/B in next 6h); as a client-side proxy we treat
    // "high" calendar pressure in the next 4h as imminent. This only nudges
    // mind-dim weighting (3% Clarity→Regulation) — never changes the score
    // when no check-in exists.
    const imminentMetricsHint = hasCalendar ? getCalendarMetrics(calendarData) : null;
    const hasImminentHighStakes = imminentMetricsHint?.pressure === 'high';
    const fullDayDemandScore = hasCalendar ? deriveFullDayDemandScore(calendarData) : null;
    // MRS score-bearing signals only: calendar connection alone does NOT
    // manufacture a numeric demand score. Only a real snapshot value or a
    // numeric demand derived from actual events qualifies.
    const demandScoreForV4 =
      snapshotDemandScore ??
      (fullDayDemandScore != null ? fullDayDemandScore : null);
    const hasCalendarSignal =
      hasCalendar ||
      calendarConnected ||
      snapshotDemandScore != null ||
      outerContext?.hasCalendarSignal === true ||
      outerContext?.calendarUsable === true ||
      outerContext?.calendarState === 'active' ||
      outerContext?.calendarState === 'connected_no_events';
    // Do not synthesise a neutral 50 from calendar usability — that would
    // create a fake MRS baseline for users with no real score-bearing signal.
    const effectiveDemandScoreForSubScores = demandScoreForV4 ?? null;
    const mrsSubScores = buildClientMrsV4SubScores({
      window: mrsWindow,
      hrvValue: hasWearable ? wearableHRV : null,
      hrvDeviationPct,
      sleepScore: hasWearable ? wearableSleepScore : null,
      sleepHours: hasWearable ? wearableSleepHours : null,
      rhrValue: hasWearable ? wearableRhrValue : null,
      rhrTrend: hasWearable ? wearableRhrTrend : null,
      demandScore: effectiveDemandScoreForSubScores,
      patternSignals: snapshotPatternSignals,
    });
    const demandScoreForInner = demandScoreForV4 ?? null;
    const mrsSubScoresAvailableCount = Array.isArray(mrsSubScores)
      ? mrsSubScores.filter((s: any) => s && s.available === true).length
      : 0;
    console.log('[energyStateEngine][mrs-score-bearing-signals]', JSON.stringify({
      hasWearable,
      snapshotDemandScore,
      fullDayDemandScore,
      demandScoreForInner,
      hasCalendarSignal,
      mrsSubScoresAvailableCount,
    }));
    console.log('[energyStateEngine][compute-inner-readiness-request]', JSON.stringify({
      demandScore: demandScoreForInner,
      hasCalendarSignal,
      outerCalendarState: outerContext?.calendarState ?? null,
      mrsWindow,
      mrsSubScores,
    }));
    const sleepQuality = sleepQualityFromInputs(
      hasWearable ? wearableSleepScore : null,
      hasWearable ? wearableSleepHours : null,
    );

    const response = await supabase.functions.invoke('compute-inner-readiness', {
      headers: authHeaders,
      body: {
        checkInOutcome: hasCheckIn ? checkInOutcome : null,
        clarityLevel,
        confidenceLevel,
        // MRS v3 §3.2 — Mind Check-in dimensions.
        emotionLevel,
        pressureLevel,
        regulationLevel,
        hasImminentHighStakes,
        wearableHRV: hasWearable ? wearableHRV : null,
        wearableBaseline: hasWearable ? wearableBaseline : null,
        hasCheckIn,
        hasWearable,
        timezoneOffset: new Date().getTimezoneOffset(),
        hrvPatternContext: hasWearable ? hrvPatternContext : null,
        baselineConfidence: hasWearable ? baselineConfidence : undefined,
        sampleDays: hasWearable ? sampleDays : undefined,
        // MRS v3 §3.3 — physiological composite inputs. The edge function
        // blends sleepScore (35%) and RHR trend (15%) on top of HRV (50%).
        // Pass `null` when unavailable; the EF gracefully degrades.
        sleepScore: hasWearable ? wearableSleepScore : null,
        sleepHours: hasWearable ? wearableSleepHours : null,
        rhrTrend: hasWearable ? wearableRhrTrend : null,
        rhrElevated: hasWearable ? wearableRhrTrend === 'rising' : false,
        // Tri-state passthrough so the EF response can echo it back into
        // CurrentEnergyState (stale vs missing must not collapse).
        wearableStatus: wearableFreshness,
        // MRS v2 — calendar demand + pattern signals from the canonical
        // daily_context_snapshot. Null means the snapshot hasn't been
        // populated yet today; the backend handles defaults.
        // Forward the resolved demand score (snapshot → calendar-events fallback)
        // so compute-inner-readiness can backfill the demand subcomponents when
        // Stage 1 calendar signal is usable but `calendar_connections` is missing
        // (e.g. Apple Calendar users). Stage 1 backfill is gated on this value.
        demandScore: demandScoreForInner,
        hasCalendarSignal,
        patternSignals: snapshotPatternSignals,
        // MRS v4 — required baseline inputs. `weightingMode` is now label-only;
        // all score math flows through these sub-components and redistribution.
        mrsWindow,
        mrsSubScores,
        morningBaselineScore: snapshotMorningBaselineScore,
        sleepDeficitMeasurement: {
          available: hasWearable && (wearableSleepScore != null || wearableSleepHours != null),
          sleepTotalMinutes: wearableSleepHours != null ? Math.round(wearableSleepHours * 60) : null,
          sleepQuality,
        },
      },
    });

    if (response.error) throw new Error(response.error.message);

    const result = response.data;

    // MRS source breakdown — annotate dataSources with wearable freshness and
    // which physio signals contributed, so downstream UI/QA can verify the
    // wearable bundle (not just HRV) was used.
    const sourceBreakdown: string[] = Array.isArray(result.dataSources)
      ? [...result.dataSources]
      : [];
    sourceBreakdown.push(`wearable_freshness:${wearableFreshness}`);
    if (wearableSignalsUsed.length > 0) {
      sourceBreakdown.push(`wearable_signals:${wearableSignalsUsed.join('+')}`);
    }
    if (hasCalendar) sourceBreakdown.push('calendar_signal_used');
    if (hasCheckIn) sourceBreakdown.push('checkin_signal_used');

    // Persist composite score to DB with retry guardrail.
    // Guard: only persist when we have a numeric score (post-MRS-pure-fix,
    // result.score may be null when no score-bearing signal exists).
    const todayISO = localISODate();
    if (
      hasCheckIn &&
      typeof result.score === 'number' &&
      Number.isFinite(result.score) &&
      storedEnergyBalance !== result.score
    ) {
      persistCompositeScore(todayISO, result.score, checkInTimeWindow || undefined);
    }

    // Calendar metrics computed client-side (used by Outer Readiness Brief and Performance Plan)
    const calendarMetrics = hasCalendar ? getCalendarMetrics(calendarData) : null;
    const calendarLoad = calendarMetrics?.load ?? null;
    const calendarPressure = calendarMetrics?.pressure ?? null;
    const calendarDensity = calendarMetrics?.density ?? 0;

    // Map tier to mastery type for backward compat with recommendation engine
    const tierToMastery: Record<string, MasteryType> = {
      depleted: 'renewal', managing: 'pause', strong: 'flow', peak: 'flow',
    };
    const primaryMastery: MasteryType = tierToMastery[result.tier] || 'pause';

    return {
      overallBalance: result.score ?? null,
      engineStatus: deriveReadyOrAwaiting({
        score: result.score ?? null,
        hasWearable,
        hasCalendar,
        hasCheckIn,
        dbReadDegraded,
      }),
      state: result.tier,
      contextTags: [],
      energyTags: [],
      stateTags: [],
      recommendationPriority: primaryMastery,
      dataSources: sourceBreakdown,
      confidence: result.confidence,
      calendarDensity,
      calendarLoad,
      calendarPressure,
      wearableFunction: hasWearable ? (wearableReadiness >= 75 ? 'high' : wearableReadiness >= 50 ? 'medium' : 'low') : undefined,
      energyTier: result.tier,
      timeOfDay: result.timeOfDay,
      recommendation: {
        primary: primaryMastery,
        contextStatement: result.contextStatement,
      },
      checkInOutcome: result.checkInOutcome || undefined,
      clarityLevel,
      confidenceLevel,
      mentalSharpnessLevel,
      emotionLevel,
      pressureLevel,
      regulationLevel,
      divergenceFlag: result.divergenceFlag,
      hrvDeviation: result.hrvDeviation,
      tierLabel: result.tierLabel,
      layersActive: result.layersActive || ['base'],
      layer3Statement: result.layer3Statement || null,
      // MRS v3 — soft-guard tier cap passthrough.
      tierDisplayed: result.tierDisplayed ?? result.tier,
      tierDisplayedLabel: result.tierDisplayedLabel ?? result.tierLabel,
      tierCapReason: result.tierCapReason ?? null,
      // MRS v3 §3.3 — refined-score passthrough. `overallBalance` (= result.score)
      // already tracks the displayed value; these expose the underlying split.
      scoreBaseline: result.scoreBaseline ?? null,
      scoreRefined: result.scoreRefined ?? null,
      readinessState: result.readinessState ?? 'baseline',
      refinedContribution: result.refinedContribution ?? null,
      // Canonical band SSOT passthrough.
      band: result.band,
      bandLabel: result.bandLabel,
      bandValence: result.bandValence,
      wearableStatus: result.wearableStatus ?? wearableFreshness,
      weightProvenance: result.weightProvenance ?? null,
    };
  } catch (err) {
    console.error('[energyStateEngine] Backend call failed, using fallback:', err);
    // Phase 1 — surface the failure as 'inner-failure' so the UI shows a
    // retry/error block instead of the awaiting cold-start copy.
    return buildErrorFallback({
      status: 'inner-failure',
      hasCalendar,
      calendarData,
    });
  }
}

/**
 * Phase 1 — shared fallback builder. Returns a minimal `CurrentEnergyState`
 * tagged with the supplied engine status so MRS / Brief / Plan can render
 * an error state distinct from true awaiting signals.
 */
function buildErrorFallback(args: {
  status: 'auth-failure' | 'inner-failure' | 'unknown-error';
  hasCalendar: boolean;
  calendarData: any[];
}): CurrentEnergyState {
  const hour = new Date().getHours();
  const timeOfDay =
    hour >= 5 && hour < 12 ? 'morning' as const
    : hour >= 12 && hour < 18 ? 'afternoon' as const
    : 'evening' as const;

  const fallbackCalendar = args.hasCalendar ? getCalendarMetrics(args.calendarData) : null;
  return {
    overallBalance: null,
    engineStatus: args.status,
    state: 'managing',
    contextTags: [],
    energyTags: [],
    stateTags: [],
    recommendationPriority: 'managing',
    dataSources: ['circadian'],
    confidence: 'low',
    calendarDensity: fallbackCalendar?.density ?? 0,
    calendarLoad: fallbackCalendar?.load ?? null,
    calendarPressure: fallbackCalendar?.pressure ?? null,
    energyTier: 'managing',
    timeOfDay,
    recommendation: {
      primary: 'pause' as MasteryType,
      contextStatement:
        args.status === 'auth-failure'
          ? 'Reconnecting your session — retry in a moment.'
          : 'Unable to compute readiness right now — retry to refresh.',
    },
    checkInOutcome: undefined,
    divergenceFlag: 'ALIGNED',
    wearableStatus: 'missing',
  };
}

/**
 * Phase 1 — distinguish a real cold start (no wearable / calendar / check-in)
 * from a healthy compute that simply produced a null score. Only the former
 * is 'awaiting'; everything else is 'ready' (with possible 'stale' tag when
 * the supporting DB reads degraded).
 */
function deriveReadyOrAwaiting(args: {
  score: number | null;
  hasWearable: boolean;
  hasCalendar: boolean;
  hasCheckIn: boolean;
  dbReadDegraded: boolean;
}): CurrentEnergyState['engineStatus'] {
  if (args.dbReadDegraded) return 'stale';
  if (args.score == null) return 'awaiting';
  return 'ready';
}

export function getEnergyStateInsight(energyState: CurrentEnergyState): string {
  if (energyState.recommendation?.contextStatement) return energyState.recommendation.contextStatement;
  return energyState.overallBalance == null ? 'No recent signals yet.' : `Energy is at ${energyState.overallBalance}%.`;
}
