// Wearable Context Analyzer - Unified interface for all wearable metrics
import { supabase } from "@/integrations/supabase/client";

export interface WearableContext {
  // Core metrics
  readinessScore: number | null;
  sleepScore: number | null;
  activityScore: number | null;
  hrv: number | null;
  restingHeartRate: number | null;
  
  // Detailed metrics from raw_data
  totalSleepMinutes: number | null;
  deepSleepMinutes: number | null;
  remSleepMinutes: number | null;
  steps: number | null;
  activeCalories: number | null;
  temperatureDeviation: number | null;
  
  // Derived states
  sleepQuality: 'poor' | 'fair' | 'good' | 'excellent' | 'unknown';
  energyLevel: 'depleted' | 'low' | 'moderate' | 'high' | 'unknown';
  hrvStatus: 'elevated' | 'normal' | 'low' | 'unknown';
  recoveryStatus: 'critical' | 'low' | 'moderate' | 'optimal' | 'unknown';
  activityReadiness: 'rest-needed' | 'light-activity' | 'ready' | 'unknown';
  
  // Data availability
  hasData: boolean;
  dataSource: 'oura' | 'apple-watch' | 'none';
  lastUpdated: Date | null;
}

/**
 * Get comprehensive wearable context for a user
 * Priority: Supabase data -> localStorage fallback
 */
export async function getWearableContext(userId?: string): Promise<WearableContext> {
  let context: WearableContext = {
    readinessScore: null,
    sleepScore: null,
    activityScore: null,
    hrv: null,
    restingHeartRate: null,
    totalSleepMinutes: null,
    deepSleepMinutes: null,
    remSleepMinutes: null,
    steps: null,
    activeCalories: null,
    temperatureDeviation: null,
    sleepQuality: 'unknown',
    energyLevel: 'unknown',
    hrvStatus: 'unknown',
    recoveryStatus: 'unknown',
    activityReadiness: 'unknown',
    hasData: false,
    dataSource: 'none',
    lastUpdated: null
  };

  // Try to fetch from Supabase first
  if (userId) {
    try {
      const { data: wearable, error } = await supabase
        .from('wearable_data')
        .select('*')
        .eq('user_id', userId)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (wearable && !error) {
        const rawData = wearable.raw_data as any;
        
        context = {
          readinessScore: null, // No readiness score in HealthKit
          sleepScore: wearable.sleep_score,
          activityScore: null,
          hrv: wearable.hrv ? Number(wearable.hrv) : null,
          restingHeartRate: wearable.resting_heart_rate,
          totalSleepMinutes: wearable.total_sleep_minutes,
          deepSleepMinutes: wearable.deep_sleep_minutes,
          remSleepMinutes: wearable.rem_sleep_minutes,
          steps: wearable.steps,
          activeCalories: wearable.active_calories,
          temperatureDeviation: null,
          sleepQuality: classifySleepQuality(wearable.sleep_score),
          energyLevel: calculateEnergyLevel(null, wearable.sleep_score),
          hrvStatus: await classifyHRVStatus(wearable.hrv ? Number(wearable.hrv) : null, userId),
          recoveryStatus: wearable.recovery_status as any || 'unknown',
          activityReadiness: 'unknown',
          hasData: true,
          dataSource: 'apple-watch',
          lastUpdated: new Date(wearable.created_at)
        };
        return context;
      }
    } catch (error) {
      console.log('Could not fetch from Supabase, falling back to localStorage:', error);
    }
  }

  // Fallback to localStorage (Apple Watch / HealthKit data)
  const appleWatchData = JSON.parse(localStorage.getItem('appleWatchData') || localStorage.getItem('wearableData') || '{}');

  if (appleWatchData.hrv) {
    context = {
      readinessScore: null,
      sleepScore: appleWatchData.sleepScore || null,
      activityScore: null,
      hrv: appleWatchData.hrv || null,
      restingHeartRate: appleWatchData.restingHR || null,
      totalSleepMinutes: appleWatchData.totalSleepMinutes || null,
      deepSleepMinutes: appleWatchData.deepSleepMinutes || null,
      remSleepMinutes: null,
      steps: appleWatchData.steps || null,
      activeCalories: appleWatchData.activeCalories || null,
      temperatureDeviation: null,
      sleepQuality: classifySleepQuality(appleWatchData.sleepScore),
      energyLevel: calculateEnergyLevel(null, appleWatchData.sleepScore),
      hrvStatus: await classifyHRVStatus(appleWatchData.hrv, userId || ''),
      recoveryStatus: 'unknown',
      activityReadiness: 'unknown',
      hasData: true,
      dataSource: 'apple-watch',
      lastUpdated: null
    };
  }

  return context;
}

/**
 * Classify sleep quality based on score
 */
export function classifySleepQuality(score: number | null): 'poor' | 'fair' | 'good' | 'excellent' | 'unknown' {
  if (score === null || score === undefined) return 'unknown';
  if (score < 50) return 'poor';
  if (score < 70) return 'fair';
  if (score < 85) return 'good';
  return 'excellent';
}

/**
 * Calculate energy level based on readiness and sleep
 */
export function calculateEnergyLevel(
  readiness: number | null, 
  sleep: number | null
): 'depleted' | 'low' | 'moderate' | 'high' | 'unknown' {
  const avgScore = readiness !== null && sleep !== null 
    ? (readiness + sleep) / 2 
    : readiness || sleep;
    
  if (avgScore === null || avgScore === undefined) return 'unknown';
  if (avgScore < 40) return 'depleted';
  if (avgScore < 60) return 'low';
  if (avgScore < 80) return 'moderate';
  return 'high';
}

/**
 * Classify HRV status relative to user's baseline
 */
export async function classifyHRVStatus(
  hrv: number | null, 
  userId: string
): Promise<'elevated' | 'normal' | 'low' | 'unknown'> {
  if (hrv === null || hrv === undefined) return 'unknown';
  
  // Get user's 7-day HRV baseline
  const baseline = await getUserHRVBaseline(userId);
  
  if (!baseline) {
    // Use absolute thresholds if no baseline
    if (hrv > 85) return 'elevated';
    if (hrv < 40) return 'low';
    return 'normal';
  }
  
  const deviation = hrv - baseline;
  if (deviation > 15) return 'elevated'; // More than 15 above baseline = stress
  if (deviation < -15) return 'low'; // More than 15 below = poor recovery
  return 'normal';
}

/**
 * Classify recovery status based on readiness score
 */
export function classifyRecoveryStatus(readiness: number | null): 'critical' | 'low' | 'moderate' | 'optimal' | 'unknown' {
  if (readiness === null || readiness === undefined) return 'unknown';
  if (readiness < 40) return 'critical';
  if (readiness < 60) return 'low';
  if (readiness < 80) return 'moderate';
  return 'optimal';
}

/**
 * Classify activity readiness based on readiness + yesterday's activity
 */
export function classifyActivityReadiness(
  readiness: number | null,
  yesterdayMetMinHigh: number | null
): 'rest-needed' | 'light-activity' | 'ready' | 'unknown' {
  if (readiness === null || readiness === undefined) return 'unknown';
  
  // High activity yesterday + low readiness = rest needed
  if (yesterdayMetMinHigh && yesterdayMetMinHigh > 500 && readiness < 50) {
    return 'rest-needed';
  }
  
  if (readiness < 50) return 'rest-needed';
  if (readiness < 70) return 'light-activity';
  return 'ready';
}

/**
 * Calculate user's 30-day rolling HRV baseline
 */
export async function getUserHRVBaseline(userId: string): Promise<number | null> {
  if (!userId) return null;
  
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data, error } = await supabase
      .from('wearable_data')
      .select('hrv')
      .eq('user_id', userId)
      .gte('summary_date', thirtyDaysAgo.toISOString().split('T')[0])
      .not('hrv', 'is', null);
    
    if (error || !data || data.length === 0) return null;
    
    const sum = data.reduce((acc, d) => acc + (Number(d.hrv) || 0), 0);
    return Math.round(sum / data.length);
  } catch (error) {
    console.log('Could not calculate HRV baseline:', error);
    return null;
  }
}

/**
 * Compute HRV pattern context from 30-day history for Inner Readiness Layer 3.
 * Detects day-of-week and time-of-day patterns, plus divergence from check-in data.
 */
export interface HRVPatternContext {
  weekdayAvg: number | null;
  weekendAvg: number | null;
  dayOfWeekAvgs: Record<string, number>; // e.g. { Mon: 45, Tue: 52 ... }
  morningAvg: number | null;
  afternoonAvg: number | null;
  eveningAvg: number | null;
  baseline30d: number | null;
  totalSamples: number;
  /** Number of unique days with HRV data in 30-day window */
  sampleDays: number;
  /** Confidence tier based on data density: <7 days = low, 7-14 = medium, 15+ = high */
  baselineConfidence: 'low' | 'medium' | 'high';
  /** Detected recurring patterns like "3 Mondays with low HRV while reporting strong" */
  patternObservations: string[];
}

export async function computeHRVPatternContext(userId: string): Promise<HRVPatternContext | null> {
  if (!userId) return null;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.toISOString().split('T')[0];

    // Fetch wearable data + check-ins in parallel
    const [wearableResult, checkinResult] = await Promise.all([
      supabase
        .from('wearable_data')
        .select('hrv, summary_date, hrv_samples')
        .eq('user_id', userId)
        .gte('summary_date', cutoff)
        .not('hrv', 'is', null)
        .order('summary_date', { ascending: true }),
      supabase
        .from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', userId)
        .gte('checkin_date', cutoff),
    ]);

    const wearableRows = wearableResult.data || [];
    const checkinRows = checkinResult.data || [];

    if (wearableRows.length === 0) return null;

    // Build check-in lookup by date
    const checkinByDate: Record<string, string> = {};
    for (const c of checkinRows) {
      checkinByDate[c.checkin_date] = c.outcome;
    }

    // Day-of-week aggregation
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayBuckets: Record<string, number[]> = {};
    const weekdayValues: number[] = [];
    const weekendValues: number[] = [];
    const morningValues: number[] = [];
    const afternoonValues: number[] = [];
    const eveningValues: number[] = [];
    let total = 0;
    let sum = 0;

    for (const row of wearableRows) {
      const hrv = Number(row.hrv);
      if (isNaN(hrv) || hrv <= 0) continue;

      const dt = new Date(row.summary_date + 'T12:00:00Z');
      const dayIdx = dt.getDay();
      const dayName = dayNames[dayIdx];

      if (!dayBuckets[dayName]) dayBuckets[dayName] = [];
      dayBuckets[dayName].push(hrv);

      if (dayIdx === 0 || dayIdx === 6) weekendValues.push(hrv);
      else weekdayValues.push(hrv);

      sum += hrv;
      total++;

      // Time-of-day from hrv_samples if available
      const samples = row.hrv_samples as any[];
      if (Array.isArray(samples)) {
        for (const s of samples) {
          const h = s.hour;
          if (h >= 6 && h < 12) morningValues.push(s.value);
          else if (h >= 12 && h < 18) afternoonValues.push(s.value);
          else eveningValues.push(s.value);
        }
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const dayOfWeekAvgs: Record<string, number> = {};
    for (const [day, vals] of Object.entries(dayBuckets)) {
      dayOfWeekAvgs[day] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    const baseline30d = total > 0 ? Math.round(sum / total) : null;

    // Pattern detection: find days where HRV is consistently low but check-in says strong/focused
    const patternObservations: string[] = [];

    // Confidence tier based on unique days with data
    const sampleDays = total;
    const baselineConfidence: 'low' | 'medium' | 'high' = sampleDays >= 15 ? 'high' : sampleDays >= 7 ? 'medium' : 'low';

    if (baseline30d && total >= 3) {
      for (const [day, vals] of Object.entries(dayBuckets)) {
        if (vals.length < 2) continue;
        const dayAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
        const deviationPct = ((dayAvg - baseline30d) / baseline30d) * 100;

        if (Math.abs(deviationPct) >= 10) {
          // Check if check-in outcome contradicts HRV on this day
          const contradictions = wearableRows.filter(r => {
            const dt = new Date(r.summary_date + 'T12:00:00Z');
            return dayNames[dt.getDay()] === day && checkinByDate[r.summary_date];
          }).filter(r => {
            const outcome = checkinByDate[r.summary_date];
            const hrv = Number(r.hrv);
            // Low HRV but positive outcome
            if (hrv < baseline30d * 0.85 && (outcome === 'focused' || outcome === 'steady')) return true;
            // High HRV but negative outcome
            if (hrv > baseline30d * 1.15 && (outcome === 'drained' || outcome === 'overwhelmed')) return true;
            return false;
          });

          if (contradictions.length >= 2) {
            const direction = deviationPct < 0 ? 'lower' : 'higher';
            patternObservations.push(
              `${contradictions.length} ${day}s this month show ${direction} HRV while you reported feeling ${contradictions.length > 0 ? checkinByDate[contradictions[0].summary_date] : 'strong'}`
            );
          }
        }
      }

      // Weekday vs weekend pattern
      const wdAvg = avg(weekdayValues);
      const weAvg = avg(weekendValues);
      if (wdAvg && weAvg && Math.abs(wdAvg - weAvg) > baseline30d * 0.15) {
        if (wdAvg < weAvg) {
          patternObservations.push('Your weekday HRV runs notably lower than weekends — your work week carries measurable physiological load');
        } else {
          patternObservations.push('Your weekend HRV runs lower than weekdays — your recovery pattern may be disrupted');
        }
      }
    }

    return {
      weekdayAvg: avg(weekdayValues),
      weekendAvg: avg(weekendValues),
      dayOfWeekAvgs,
      morningAvg: avg(morningValues),
      afternoonAvg: avg(afternoonValues),
      eveningAvg: avg(eveningValues),
      baseline30d,
      totalSamples: total,
      sampleDays,
      baselineConfidence,
      patternObservations,
    };
  } catch (error) {
    console.warn('[wearableContextAnalyzer] HRV pattern computation failed:', error);
    return null;
  }
}

/**
 * Detect physiological trends over time
 */
export async function detectPhysiologicalTrends(userId: string, days: number = 7): Promise<{
  sleepTrend: 'improving' | 'stable' | 'declining' | 'insufficient-data';
  readinessTrend: 'improving' | 'stable' | 'declining' | 'insufficient-data';
  hrvTrend: 'improving' | 'stable' | 'declining' | 'insufficient-data';
  activityTrend: 'increasing' | 'stable' | 'decreasing' | 'insufficient-data';
}> {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    
    const { data, error } = await supabase
      .from('wearable_data')
      .select('*')
      .eq('user_id', userId)
      .gte('summary_date', daysAgo.toISOString().split('T')[0])
      .order('summary_date', { ascending: true });
    
    if (error || !data || data.length < 4) {
      return {
        sleepTrend: 'insufficient-data',
        readinessTrend: 'insufficient-data',
        hrvTrend: 'insufficient-data',
        activityTrend: 'insufficient-data'
      };
    }
    
    const midpoint = Math.floor(data.length / 2);
    const firstHalf = data.slice(0, midpoint);
    const secondHalf = data.slice(midpoint);
    
    const sleepAvg1 = average(firstHalf.map(d => d.sleep_score).filter(s => s !== null));
    const sleepAvg2 = average(secondHalf.map(d => d.sleep_score).filter(s => s !== null));
    
    // wearable_data doesn't have readiness_score or activity_score
    // Use sleep_score as a proxy for readiness trend
    const readinessAvg1 = sleepAvg1;
    const readinessAvg2 = sleepAvg2;
    
    const hrvAvg1 = average(firstHalf.map(d => d.hrv).filter(h => h !== null));
    const hrvAvg2 = average(secondHalf.map(d => d.hrv).filter(h => h !== null));
    
    // Use steps as activity proxy
    const activityAvg1 = average(firstHalf.map(d => d.steps).filter(a => a !== null));
    const activityAvg2 = average(secondHalf.map(d => d.steps).filter(a => a !== null));
    
    return {
      sleepTrend: calculateTrend(sleepAvg1, sleepAvg2, 5),
      readinessTrend: calculateTrend(readinessAvg1, readinessAvg2, 5),
      hrvTrend: calculateTrend(hrvAvg1, hrvAvg2, 5, true), // HRV: higher = more stress
      activityTrend: calculateActivityTrend(activityAvg1, activityAvg2, 5)
    };
  } catch (error) {
    console.log('Could not detect trends:', error);
    return {
      sleepTrend: 'insufficient-data',
      readinessTrend: 'insufficient-data',
      hrvTrend: 'insufficient-data',
      activityTrend: 'insufficient-data'
    };
  }
}

function average(values: (number | null)[]): number | null {
  const filtered = values.filter(v => v !== null) as number[];
  if (filtered.length === 0) return null;
  return filtered.reduce((sum, v) => sum + v, 0) / filtered.length;
}

function calculateTrend(
  avg1: number | null, 
  avg2: number | null, 
  threshold: number,
  inverse: boolean = false
): 'improving' | 'stable' | 'declining' | 'insufficient-data' {
  if (avg1 === null || avg2 === null) return 'insufficient-data';
  
  const diff = avg2 - avg1;
  const actualDiff = inverse ? -diff : diff; // For HRV, lower is better
  
  if (actualDiff > threshold) return 'improving';
  if (actualDiff < -threshold) return 'declining';
  return 'stable';
}

function calculateActivityTrend(
  avg1: number | null, 
  avg2: number | null, 
  threshold: number
): 'increasing' | 'stable' | 'decreasing' | 'insufficient-data' {
  if (avg1 === null || avg2 === null) return 'insufficient-data';
  
  const diff = avg2 - avg1;
  if (diff > threshold) return 'increasing';
  if (diff < -threshold) return 'decreasing';
  return 'stable';
}
