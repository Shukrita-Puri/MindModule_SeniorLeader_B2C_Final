// Historical Physiological Tracking - Server-side storage via edge function
// Migrated from localStorage to DB for medium-sensitivity data protection

import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';

export interface HistoricalPhysiologicalEvent {
  id: string;
  eventTitle: string;
  eventType: string; // 'board-meeting', 'presentation', 'client-call', etc.
  startTime: Date;
  endTime: Date;
  
  // Expanded metrics
  hrv: number | null;
  restingHeartRate: number | null;
  sleepScore: number | null;
  readinessScore: number | null;
  activityLevel: 'low' | 'moderate' | 'high' | null;
  
  // Context
  source: 'oura' | 'apple-watch';
  stressLevel: 'low' | 'medium' | 'high';
  recoveryStatus: 'critical' | 'low' | 'moderate' | 'optimal';
  createdAt: Date;
}

export interface PatternAnalysis {
  hasPattern: boolean;
  avgHRV: number;
  avgReadiness: number;
  avgSleep: number;
  occurrences: number;
  elevated: boolean;
  trend: 'improving' | 'stable' | 'worsening' | 'insufficient-data';
  dominantRecoveryStatus: 'critical' | 'low' | 'moderate' | 'optimal' | 'unknown';
}

export interface StressTrigger {
  eventType: string;
  avgReadiness: number;
  avgHRV: number;
  avgSleep: number;
  occurrences: number;
  stressLevel: 'low' | 'medium' | 'high';
}

// Helper to invoke edge function
async function invokeUserEvents(action: string, payload: Record<string, any> = {}) {
  const token = await getAuthToken();
  const { data, error } = await supabase.functions.invoke('user-events', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: { action, ...payload }
  });
  
  if (error) {
    console.error(`[historicalPhysiologicalTracking] ${action} error:`, error);
    throw error;
  }
  
  return data;
}

export async function storePhysiologicalEvent(
  event: Omit<HistoricalPhysiologicalEvent, 'id' | 'createdAt'>
): Promise<void> {
  try {
    await invokeUserEvents('STORE_PHYSIOLOGICAL_EVENT', {
      eventTitle: event.eventTitle,
      eventType: event.eventType,
      startTime: event.startTime instanceof Date ? event.startTime.toISOString() : event.startTime,
      endTime: event.endTime instanceof Date ? event.endTime.toISOString() : event.endTime,
      hrv: event.hrv,
      restingHeartRate: event.restingHeartRate,
      sleepScore: event.sleepScore,
      readinessScore: event.readinessScore,
      activityLevel: event.activityLevel,
      source: event.source,
      stressLevel: event.stressLevel,
      recoveryStatus: event.recoveryStatus
    });
  } catch (err) {
    console.error('[historicalPhysiologicalTracking] Failed to store event:', err);
  }
}

export async function getPhysiologicalHistory(days = 90): Promise<HistoricalPhysiologicalEvent[]> {
  try {
    const result = await invokeUserEvents('GET_PHYSIOLOGICAL_HISTORY', { days });
    
    if (!result?.data) return [];
    
    // Convert DB rows to interface format
    return result.data.map((row: any) => ({
      id: row.id,
      eventTitle: row.event_title,
      eventType: row.event_type,
      startTime: new Date(row.start_time),
      endTime: new Date(row.end_time),
      hrv: row.hrv,
      restingHeartRate: row.resting_heart_rate,
      sleepScore: row.sleep_score,
      readinessScore: row.readiness_score,
      activityLevel: row.activity_level,
      source: row.source,
      stressLevel: row.stress_level,
      recoveryStatus: row.recovery_status,
      createdAt: new Date(row.created_at)
    }));
  } catch (err) {
    console.error('[historicalPhysiologicalTracking] Failed to get history:', err);
    return [];
  }
}

export async function analyzeEventPhysiologicalPattern(
  eventTitle: string,
  eventType: string
): Promise<PatternAnalysis> {
  try {
    const result = await invokeUserEvents('ANALYZE_PHYSIOLOGICAL_PATTERN', {
      eventTitle,
      eventType
    });
    
    return result?.data || {
      hasPattern: false,
      avgHRV: 0,
      avgReadiness: 0,
      avgSleep: 0,
      occurrences: 0,
      elevated: false,
      trend: 'insufficient-data',
      dominantRecoveryStatus: 'unknown'
    };
  } catch (err) {
    console.error('[historicalPhysiologicalTracking] Pattern analysis failed:', err);
    return {
      hasPattern: false,
      avgHRV: 0,
      avgReadiness: 0,
      avgSleep: 0,
      occurrences: 0,
      elevated: false,
      trend: 'insufficient-data',
      dominantRecoveryStatus: 'unknown'
    };
  }
}

export async function autoRecordPhysiologyForCalendarEvents(calendarEvents?: any[]): Promise<void> {
  const events = calendarEvents || [];
  
  // Get latest physiological data (ephemeral signal — acceptable in localStorage)
  const ouraData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const appleWatchData = JSON.parse(localStorage.getItem('appleWatchData') || '{}');
  
  const currentHRV = ouraData.hrv || appleWatchData.hrv;
  const currentRHR = ouraData.restingHR || appleWatchData.restingHR;
  const currentSleep = ouraData.sleep || appleWatchData.sleepScore;
  const currentReadiness = ouraData.readiness;
  const currentActivity = ouraData.activity;
  const source = ouraData.hrv ? 'oura' : 'apple-watch';
  
  if (!currentHRV && !currentReadiness) return; // No data available
  
  // Find events that recently ended (within last 2 hours)
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  
  for (const event of events) {
    const eventEnd = new Date(event.endTime || event.end_time);
    
    // Check if event ended in last 2 hours
    if (eventEnd > twoHoursAgo && eventEnd < now) {
      // Determine activity level
      let activityLevel: 'low' | 'moderate' | 'high' | null = null;
      if (currentActivity !== null && currentActivity !== undefined) {
        if (currentActivity < 50) activityLevel = 'low';
        else if (currentActivity < 75) activityLevel = 'moderate';
        else activityLevel = 'high';
      }
      
      // Determine recovery status
      let recoveryStatus: 'critical' | 'low' | 'moderate' | 'optimal' = 'moderate';
      if (currentReadiness) {
        if (currentReadiness < 40) recoveryStatus = 'critical';
        else if (currentReadiness < 60) recoveryStatus = 'low';
        else if (currentReadiness < 80) recoveryStatus = 'moderate';
        else recoveryStatus = 'optimal';
      }
      
      // Determine stress level (based on HRV or readiness)
      let stressLevel: 'low' | 'medium' | 'high' = 'medium';
      if (currentHRV) {
        if (currentHRV > 85) stressLevel = 'high';
        else if (currentHRV > 65) stressLevel = 'medium';
        else stressLevel = 'low';
      } else if (currentReadiness) {
        if (currentReadiness < 50) stressLevel = 'high';
        else if (currentReadiness < 70) stressLevel = 'medium';
        else stressLevel = 'low';
      }
      
      // Store event (duplicate check happens server-side)
      await storePhysiologicalEvent({
        eventTitle: event.title,
        eventType: event.eventType || 'meeting',
        startTime: new Date(event.startTime || event.start_time),
        endTime: new Date(event.endTime || event.end_time),
        hrv: currentHRV,
        restingHeartRate: currentRHR,
        sleepScore: currentSleep,
        readinessScore: currentReadiness,
        activityLevel,
        source: source as 'oura' | 'apple-watch',
        stressLevel,
        recoveryStatus
      });
    }
  }
}

/**
 * Identify event types that consistently trigger stress responses
 */
export async function identifyStressTriggers(): Promise<StressTrigger[]> {
  try {
    const result = await invokeUserEvents('IDENTIFY_STRESS_TRIGGERS');
    return result?.data || [];
  } catch (err) {
    console.error('[historicalPhysiologicalTracking] Failed to identify triggers:', err);
    return [];
  }
}