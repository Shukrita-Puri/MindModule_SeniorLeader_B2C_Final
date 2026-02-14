/**
 * Energy State Engine — v2.0 (Inner Readiness)
 * Thin client orchestrator: gathers inputs, calls backend for scoring.
 * No proprietary scoring logic lives here.
 */

import { supabase } from '@/integrations/supabase/client';
import { getCalendarMetrics, type CalendarLoad, type CalendarPressure, type MasteryType, type MasterySubtype } from './energyStateScoring';

// Helper to get Auth0 access token via global client
async function getAuth0Token(): Promise<string | null> {
  try {
    const auth0Client = (window as any).__auth0Client;
    if (auth0Client) {
      return await auth0Client.getAccessTokenSilently();
    }
    return null;
  } catch {
    return null;
  }
}

// ==================== RETRY GUARDRAIL ====================
const RETRY_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 6; // max 30 min of retrying
let pendingScoreUpdate: { checkinDate: string; score: number; retries: number } | null = null;
let retryTimerId: ReturnType<typeof setTimeout> | null = null;

async function persistCompositeScore(checkinDate: string, score: number): Promise<void> {
  // Clear any existing retry for a different date
  if (pendingScoreUpdate && pendingScoreUpdate.checkinDate !== checkinDate) {
    if (retryTimerId) clearTimeout(retryTimerId);
    retryTimerId = null;
    pendingScoreUpdate = null;
  }

  pendingScoreUpdate = { checkinDate, score, retries: pendingScoreUpdate?.retries ?? 0 };

  try {
    const token = await getAuth0Token();
    if (!token) throw new Error('No Auth0 token available');

    const res = await supabase.functions.invoke('daily-checkins', {
      body: { action: 'UPDATE_ENERGY_BALANCE', checkinDate, energyBalance: score },
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
          persistCompositeScore(pendingScoreUpdate.checkinDate, pendingScoreUpdate.score);
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
  divergenceFlag?: 'ALIGNED' | 'MASKED_HIGH' | 'RECOVERY_UNDERWAY';
  hrvDeviation?: number | null;
  tierLabel?: string;
}

// Fetch today's check-in from DB to get clarity/confidence
async function fetchTodayCheckin(userId: string): Promise<{ outcome: string | null; clarity: number | null; confidence: number | null } | null> {
  try {
    const token = await getAuth0Token();
    if (!token) return null;

    const response = await supabase.functions.invoke('daily-checkins', {
      body: { action: 'GET_TODAY_CHECKIN' },
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.error || !response.data?.data) return null;
    const row = response.data.data;
    return {
      outcome: row.skipped ? null : row.outcome,
      clarity: row.clarity_level,
      confidence: row.confidence_level,
    };
  } catch {
    return null;
  }
}

export async function computeEnergyState(userId?: string): Promise<CurrentEnergyState> {
  // 1. Read raw inputs from localStorage
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || localStorage.getItem('todayCheckIn') || '{}');
  const checkInSkipped = JSON.parse(localStorage.getItem('checkInSkipped') || '{}');
  const wearableData = JSON.parse(localStorage.getItem('wearableData') || '{}');
  const calendarData = JSON.parse(localStorage.getItem('calendarEvents') || '[]');

  const today = new Date().toDateString();
  const checkInToday = checkInData.timestamp && new Date(checkInData.timestamp).toDateString() === today;
  const hasCheckInLocal = checkInToday && checkInData.outcome && !checkInData.skipped && !checkInSkipped.skipped;

  const hasWearable = (wearableData.readiness > 0 || wearableData.hrv > 0);
  const hasCalendar = calendarData.length > 0;

  // 2. Fetch clarity/confidence from DB (not in localStorage)
  let clarityLevel: number | null = null;
  let confidenceLevel: number | null = null;
  let checkInOutcome: string | null = hasCheckInLocal ? checkInData.outcome : null;
  let hasCheckIn = !!hasCheckInLocal;

  if (userId) {
    const dbCheckin = await fetchTodayCheckin(userId);
    if (dbCheckin) {
      clarityLevel = dbCheckin.clarity;
      confidenceLevel = dbCheckin.confidence;
      // DB is authoritative for outcome if available
      if (dbCheckin.outcome) {
        checkInOutcome = dbCheckin.outcome;
        hasCheckIn = true;
      }
    }
  }

  // 3. Call backend scoring function
  try {
    const response = await supabase.functions.invoke('compute-inner-readiness', {
      body: {
        checkInOutcome: hasCheckIn ? checkInOutcome : null,
        clarityLevel,
        confidenceLevel,
        wearableHRV: hasWearable ? (wearableData.hrv || null) : null,
        wearableBaseline: hasWearable ? (wearableData.baseline || null) : null,
        hasCheckIn,
        hasWearable,
        timezoneOffset: new Date().getTimezoneOffset(),
      },
    });

    if (response.error) throw new Error(response.error.message);

    const result = response.data;

    // Persist composite score to DB with retry guardrail
    const todayISO = new Date().toISOString().split('T')[0];
    if (hasCheckIn) {
      persistCompositeScore(todayISO, result.score);
    }

    // Calendar metrics computed client-side (used by Theme for Today, not Inner Readiness score)
    const { load: calendarLoad, pressure: calendarPressure, density: calendarDensity } =
      hasCalendar ? getCalendarMetrics(calendarData) : { load: 'low' as CalendarLoad, pressure: 'low' as CalendarPressure, density: 0 };

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
      wearableFunction: hasWearable ? (wearableData.readiness >= 75 ? 'high' : wearableData.readiness >= 50 ? 'medium' : 'low') : undefined,
      energyTier: result.tier,
      timeOfDay: result.timeOfDay,
      recommendation: {
        primary: primaryMastery,
        contextStatement: result.contextStatement,
      },
      checkInOutcome: result.checkInOutcome || undefined,
      divergenceFlag: result.divergenceFlag,
      hrvDeviation: result.hrvDeviation,
      tierLabel: result.tierLabel,
    };
  } catch (err) {
    console.error('[energyStateEngine] Backend call failed, using fallback:', err);
    // Fallback: return a minimal state so UI doesn't break
    const timeOfDay = new Date().getHours() >= 6 && new Date().getHours() < 12 ? 'morning' as const
      : new Date().getHours() >= 12 && new Date().getHours() < 18 ? 'afternoon' as const
      : 'evening' as const;

    const { load: calendarLoad, pressure: calendarPressure, density: calendarDensity } =
      hasCalendar ? getCalendarMetrics(calendarData) : { load: 'low' as CalendarLoad, pressure: 'low' as CalendarPressure, density: 0 };

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
