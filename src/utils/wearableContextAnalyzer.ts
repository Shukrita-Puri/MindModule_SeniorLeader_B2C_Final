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
      const { data: ouraData, error } = await supabase
        .from('oura_daily_data')
        .select('*')
        .eq('user_id', userId)
        .order('summary_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ouraData && !error) {
        // Parse raw_data as object
        const rawData = ouraData.raw_data as any;
        const sleepData = rawData?.sleep || {};
        const activityData = rawData?.activity || {};
        const readinessData = rawData?.readiness || {};
        
        context = {
          readinessScore: ouraData.readiness_score,
          sleepScore: ouraData.sleep_score,
          activityScore: ouraData.activity_score,
          hrv: ouraData.hrv,
          restingHeartRate: ouraData.resting_heart_rate,
          totalSleepMinutes: sleepData.total_sleep_duration ? Math.floor(sleepData.total_sleep_duration / 60) : null,
          deepSleepMinutes: sleepData.deep_sleep_duration ? Math.floor(sleepData.deep_sleep_duration / 60) : null,
          remSleepMinutes: sleepData.rem_sleep_duration ? Math.floor(sleepData.rem_sleep_duration / 60) : null,
          steps: activityData.steps || null,
          activeCalories: activityData.active_calories || null,
          temperatureDeviation: readinessData.temperature_deviation || null,
          sleepQuality: classifySleepQuality(ouraData.sleep_score),
          energyLevel: calculateEnergyLevel(ouraData.readiness_score, ouraData.sleep_score),
          hrvStatus: await classifyHRVStatus(ouraData.hrv, userId),
          recoveryStatus: classifyRecoveryStatus(ouraData.readiness_score),
          activityReadiness: classifyActivityReadiness(ouraData.readiness_score, activityData.met_min_high),
          hasData: true,
          dataSource: 'oura',
          lastUpdated: new Date(ouraData.created_at)
        };
        return context;
      }
    } catch (error) {
      console.log('Could not fetch from Supabase, falling back to localStorage:', error);
    }
  }

  // Fallback to localStorage
  const ouraLocalData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const appleWatchData = JSON.parse(localStorage.getItem('appleWatchData') || '{}');

  if (ouraLocalData.readiness || ouraLocalData.hrv) {
    context = {
      readinessScore: ouraLocalData.readiness || null,
      sleepScore: ouraLocalData.sleep || null,
      activityScore: ouraLocalData.activity || null,
      hrv: ouraLocalData.hrv || null,
      restingHeartRate: ouraLocalData.restingHR || null,
      totalSleepMinutes: ouraLocalData.totalSleepMinutes || null,
      deepSleepMinutes: ouraLocalData.deepSleepMinutes || null,
      remSleepMinutes: ouraLocalData.remSleepMinutes || null,
      steps: ouraLocalData.steps || null,
      activeCalories: ouraLocalData.activeCalories || null,
      temperatureDeviation: ouraLocalData.temperatureDeviation || null,
      sleepQuality: classifySleepQuality(ouraLocalData.sleep),
      energyLevel: calculateEnergyLevel(ouraLocalData.readiness, ouraLocalData.sleep),
      hrvStatus: await classifyHRVStatus(ouraLocalData.hrv, userId || ''),
      recoveryStatus: classifyRecoveryStatus(ouraLocalData.readiness),
      activityReadiness: classifyActivityReadiness(ouraLocalData.readiness, ouraLocalData.metMinHigh),
      hasData: true,
      dataSource: 'oura',
      lastUpdated: null
    };
  } else if (appleWatchData.hrv) {
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
 * Calculate user's 7-day rolling HRV baseline
 */
export async function getUserHRVBaseline(userId: string): Promise<number | null> {
  if (!userId) return null;
  
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data, error } = await supabase
      .from('oura_daily_data')
      .select('hrv')
      .eq('user_id', userId)
      .gte('summary_date', sevenDaysAgo.toISOString().split('T')[0])
      .not('hrv', 'is', null);
    
    if (error || !data || data.length === 0) return null;
    
    const sum = data.reduce((acc, d) => acc + (d.hrv || 0), 0);
    return Math.round(sum / data.length);
  } catch (error) {
    console.log('Could not calculate HRV baseline:', error);
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
      .from('oura_daily_data')
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
    
    const readinessAvg1 = average(firstHalf.map(d => d.readiness_score).filter(r => r !== null));
    const readinessAvg2 = average(secondHalf.map(d => d.readiness_score).filter(r => r !== null));
    
    const hrvAvg1 = average(firstHalf.map(d => d.hrv).filter(h => h !== null));
    const hrvAvg2 = average(secondHalf.map(d => d.hrv).filter(h => h !== null));
    
    const activityAvg1 = average(firstHalf.map(d => d.activity_score).filter(a => a !== null));
    const activityAvg2 = average(secondHalf.map(d => d.activity_score).filter(a => a !== null));
    
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
