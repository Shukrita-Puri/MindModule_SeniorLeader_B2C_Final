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
  overallBalance: number;
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
  divergenceFlag?: 'ALIGNED' | 'MASKED_HIGH' | 'RECOVERY_UNDERWAY';
  hrvDeviation?: number | null;
  tierLabel?: string;
  layersActive?: string[];
  layer3Statement?: string | null;
}

const ENERGY_STATE_CACHE_MS = 30_000;
const energyStateCache = new Map<string, { expiresAt: number; data: CurrentEnergyState }>();
const energyStateInFlight = new Map<string, Promise<CurrentEnergyState>>();

function getEnergyStateCacheKey(userId?: string): string {
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId || 'anon';
  const today = new Date().toLocaleDateString('en-CA');
  return `${effectiveUserId}:${today}:${getCurrentTimeWindow()}`;
}

export function clearEnergyStateCache(): void {
  energyStateCache.clear();
  energyStateInFlight.clear();
}

export async function computeEnergyState(userId?: string): Promise<CurrentEnergyState> {
  const cacheKey = getEnergyStateCacheKey(userId);
  const cached = energyStateCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inFlight = energyStateInFlight.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = computeEnergyStateFresh(userId)
    .then((data) => {
      energyStateCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + ENERGY_STATE_CACHE_MS,
      });
      return data;
    })
    .finally(() => {
      energyStateInFlight.delete(cacheKey);
    });

  energyStateInFlight.set(cacheKey, promise);
  return promise;
}

async function computeEnergyStateFresh(userId?: string): Promise<CurrentEnergyState> {
  // 1. Read wearable data – try DB first, fall back to local storage
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
  let wearableHRV: number | null = null;
  let wearableBaseline: number | null = null;
  let wearableReadiness: number = 0;

  let hrvPatternContext: any = null;

  // Try DB for latest HRV + baseline + patterns
  if (effectiveUserId) {
    try {
      const [latestRow, baseline, patterns] = await Promise.all([
        supabase
          .from('wearable_data')
          .select('hrv, updated_at')
          .eq('user_id', effectiveUserId)
          .not('hrv', 'is', null)
          .order('summary_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        getUserHRVBaseline(effectiveUserId),
        computeHRVPatternContext(effectiveUserId),
      ]);
      if (latestRow.data?.hrv) {
        wearableHRV = Number(latestRow.data.hrv);
        wearableBaseline = baseline;
        wearableReadiness = wearableHRV >= 50 ? 75 : wearableHRV >= 30 ? 50 : 25;
      }
      hrvPatternContext = patterns;
    } catch (err) {
      console.warn('[energyStateEngine] DB wearable fetch failed:', err);
    }
  }

  // Diagnostic: log wearable data source for cross-device debugging
  console.log('[energyStateEngine] Wearable source:', wearableHRV !== null ? 'DB' : 'NONE (no fallback)', '| HRV:', wearableHRV);

  const hasWearable = wearableHRV !== null && wearableHRV > 0;

  // Fetch calendar events from DB only if connection is active
  let calendarData: any[] = [];
  if (effectiveUserId) {
    try {
      // Gate on active connection – stale events must not power active behavior
      const { data: conn } = await supabase
        .from('calendar_connections')
        .select('is_active')
        .eq('user_id', effectiveUserId)
        .eq('is_active', true)
        .maybeSingle();

      if (conn) {
        const now = new Date();
        const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
        const { data: events } = await supabase
          .from('calendar_events')
          .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring')
          .eq('user_id', effectiveUserId)
          .gte('start_time', now.toISOString())
          .lte('start_time', fourHoursLater.toISOString());
        calendarData = events || [];
      }
    } catch (err) {
      console.warn('[energyStateEngine] Calendar fetch failed, using empty:', err);
    }
  }

  const hasCalendar = calendarData.length > 0;

  // 2. Fetch check-in data from DB (sole source of truth – no localStorage)
  let clarityLevel: number | null = null;
  let confidenceLevel: number | null = null;
  let mentalSharpnessLevel: number | null = null;
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
      const token = await getAuth0Token();
      if (token) {
        authHeaders = { Authorization: `Bearer ${token}` };
      }
    }

    // Derive baseline confidence from pattern context
    const baselineConfidence = hrvPatternContext?.baselineConfidence ?? 'low';
    const sampleDays = hrvPatternContext?.sampleDays ?? 0;

    const response = await supabase.functions.invoke('compute-inner-readiness', {
      headers: authHeaders,
      body: {
        checkInOutcome: hasCheckIn ? checkInOutcome : null,
        clarityLevel,
        confidenceLevel,
        wearableHRV: hasWearable ? wearableHRV : null,
        wearableBaseline: hasWearable ? wearableBaseline : null,
        hasCheckIn,
        hasWearable,
        timezoneOffset: new Date().getTimezoneOffset(),
        hrvPatternContext: hasWearable ? hrvPatternContext : null,
        baselineConfidence: hasWearable ? baselineConfidence : undefined,
        sampleDays: hasWearable ? sampleDays : undefined,
      },
    });

    if (response.error) throw new Error(response.error.message);

    const result = response.data;

    // Persist composite score to DB with retry guardrail
    const todayISO = localISODate();
    if (hasCheckIn && storedEnergyBalance !== result.score) {
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
      overallBalance: result.score,
      state: result.tier,
      contextTags: [],
      energyTags: [],
      stateTags: [],
      recommendationPriority: primaryMastery,
      dataSources: result.dataSources,
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
      divergenceFlag: result.divergenceFlag,
      hrvDeviation: result.hrvDeviation,
      tierLabel: result.tierLabel,
      layersActive: result.layersActive || ['base'],
      layer3Statement: result.layer3Statement || null,
    };
  } catch (err) {
    console.error('[energyStateEngine] Backend call failed, using fallback:', err);
    // Fallback: return a minimal state so UI doesn't break
    const timeOfDay = new Date().getHours() >= 6 && new Date().getHours() < 12 ? 'morning' as const
      : new Date().getHours() >= 12 && new Date().getHours() < 18 ? 'afternoon' as const
      : 'evening' as const;

    const fallbackCalendar = hasCalendar ? getCalendarMetrics(calendarData) : null;
    const calendarLoad = fallbackCalendar?.load ?? null;
    const calendarPressure = fallbackCalendar?.pressure ?? null;
    const calendarDensity = fallbackCalendar?.density ?? 0;

    return {
      overallBalance: 50,
      state: 'managing',
      contextTags: [],
      energyTags: [],
      stateTags: [],
      recommendationPriority: 'managing',
      dataSources: ['circadian'],
      confidence: 'low',
      calendarDensity,
      calendarLoad,
      calendarPressure,
      energyTier: 'managing',
      timeOfDay,
      recommendation: { primary: 'pause' as MasteryType, contextStatement: 'Unable to compute readiness score. Check-in to get your personalized reading.' },
      checkInOutcome: undefined,
      divergenceFlag: 'ALIGNED',
    };
  }
}

export function getEnergyStateInsight(energyState: CurrentEnergyState): string {
  return energyState.recommendation?.contextStatement || `Energy is at ${energyState.overallBalance}%.`;
}
