// Historical Physiological Tracking - Store and analyze comprehensive physiological patterns from past events

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

const STORAGE_KEY = 'historicalPhysiologicalEvents';
const MAX_HISTORY_DAYS = 90; // Keep 3 months of history

export function storePhysiologicalEvent(event: Omit<HistoricalPhysiologicalEvent, 'id' | 'createdAt'>): void {
  const history = getPhysiologicalHistory();
  
  const newEvent: HistoricalPhysiologicalEvent = {
    ...event,
    id: `phys-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date()
  };
  
  history.push(newEvent);
  
  // Clean up old events
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - MAX_HISTORY_DAYS);
  
  const filteredHistory = history.filter(e => 
    new Date(e.createdAt) > cutoffDate
  );
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredHistory));
}

export function getPhysiologicalHistory(): HistoricalPhysiologicalEvent[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    // Migrate old HRV data if exists
    return migrateOldHRVData();
  }
  
  try {
    const history = JSON.parse(stored);
    // Convert date strings back to Date objects
    return history.map((e: any) => ({
      ...e,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
      createdAt: new Date(e.createdAt)
    }));
  } catch {
    return [];
  }
}

/**
 * Migrate old HRV-only data to comprehensive physiological format
 */
function migrateOldHRVData(): HistoricalPhysiologicalEvent[] {
  const oldData = localStorage.getItem('historicalHRVEvents');
  if (!oldData) return [];
  
  try {
    const oldEvents = JSON.parse(oldData);
    const migrated = oldEvents.map((e: any) => ({
      id: e.id,
      eventTitle: e.eventTitle,
      eventType: e.eventType,
      startTime: new Date(e.startTime),
      endTime: new Date(e.endTime),
      hrv: e.hrv,
      restingHeartRate: null,
      sleepScore: null,
      readinessScore: null,
      activityLevel: null,
      source: e.source,
      stressLevel: e.stressLevel,
      recoveryStatus: e.stressLevel === 'high' ? 'low' : e.stressLevel === 'medium' ? 'moderate' : 'optimal',
      createdAt: new Date(e.createdAt)
    }));
    
    // Save migrated data
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

export function analyzeEventPhysiologicalPattern(
  eventTitle: string,
  eventType: string
): {
  hasPattern: boolean;
  avgHRV: number;
  avgReadiness: number;
  avgSleep: number;
  occurrences: number;
  elevated: boolean;
  trend: 'improving' | 'stable' | 'worsening' | 'insufficient-data';
  dominantRecoveryStatus: 'critical' | 'low' | 'moderate' | 'optimal' | 'unknown';
} {
  const history = getPhysiologicalHistory();
  
  // Find similar events (same title or type)
  const similarEvents = history.filter(e =>
    e.eventTitle.toLowerCase().includes(eventTitle.toLowerCase()) ||
    e.eventType === eventType
  );
  
  if (similarEvents.length === 0) {
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
  
  // Calculate averages
  const hrvValues = similarEvents.map(e => e.hrv).filter(h => h !== null) as number[];
  const readinessValues = similarEvents.map(e => e.readinessScore).filter(r => r !== null) as number[];
  const sleepValues = similarEvents.map(e => e.sleepScore).filter(s => s !== null) as number[];
  
  const avgHRV = hrvValues.length > 0 ? hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length : 0;
  const avgReadiness = readinessValues.length > 0 ? readinessValues.reduce((sum, v) => sum + v, 0) / readinessValues.length : 0;
  const avgSleep = sleepValues.length > 0 ? sleepValues.reduce((sum, v) => sum + v, 0) / sleepValues.length : 0;
  
  // Determine trend (compare first half vs second half)
  let trend: 'improving' | 'stable' | 'worsening' | 'insufficient-data' = 'insufficient-data';
  
  if (similarEvents.length >= 4) {
    const midpoint = Math.floor(similarEvents.length / 2);
    const firstHalf = similarEvents.slice(0, midpoint);
    const secondHalf = similarEvents.slice(midpoint);
    
    const firstHalfReadiness = firstHalf.map(e => e.readinessScore).filter(r => r !== null) as number[];
    const secondHalfReadiness = secondHalf.map(e => e.readinessScore).filter(r => r !== null) as number[];
    
    if (firstHalfReadiness.length > 0 && secondHalfReadiness.length > 0) {
      const firstAvg = firstHalfReadiness.reduce((sum, v) => sum + v, 0) / firstHalfReadiness.length;
      const secondAvg = secondHalfReadiness.reduce((sum, v) => sum + v, 0) / secondHalfReadiness.length;
      
      const diff = secondAvg - firstAvg;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'worsening';
      else trend = 'stable';
    }
  }
  
  // Find dominant recovery status
  const recoveryStatuses = similarEvents.map(e => e.recoveryStatus);
  const statusCounts = recoveryStatuses.reduce((acc, status) => {
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const dominantRecoveryStatus = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] as 'critical' | 'low' | 'moderate' | 'optimal' || 'unknown';
  
  return {
    hasPattern: true,
    avgHRV: Math.round(avgHRV),
    avgReadiness: Math.round(avgReadiness),
    avgSleep: Math.round(avgSleep),
    occurrences: similarEvents.length,
    elevated: avgHRV > 75,
    trend,
    dominantRecoveryStatus
  };
}

export function autoRecordPhysiologyForCalendarEvents(): void {
  // Get today's calendar events
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  
  // Get latest physiological data
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
  
  calendarEvents.forEach((event: any) => {
    const eventEnd = new Date(event.endTime);
    
    // Check if event ended in last 2 hours
    if (eventEnd > twoHoursAgo && eventEnd < now) {
      // Check if we already recorded this event
      const history = getPhysiologicalHistory();
      const alreadyRecorded = history.some(h => 
        h.eventTitle === event.title && 
        Math.abs(new Date(h.startTime).getTime() - new Date(event.startTime).getTime()) < 60000 // Within 1 min
      );
      
      if (!alreadyRecorded) {
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
        
        storePhysiologicalEvent({
          eventTitle: event.title,
          eventType: event.eventType || 'meeting',
          startTime: new Date(event.startTime),
          endTime: new Date(event.endTime),
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
  });
}

/**
 * Identify event types that consistently trigger stress responses
 */
export function identifyStressTriggers(): {
  eventType: string;
  avgReadiness: number;
  avgHRV: number;
  avgSleep: number;
  occurrences: number;
  stressLevel: 'low' | 'medium' | 'high';
}[] {
  const history = getPhysiologicalHistory();
  
  // Group by event type
  const grouped: Record<string, HistoricalPhysiologicalEvent[]> = {};
  history.forEach(event => {
    if (!grouped[event.eventType]) {
      grouped[event.eventType] = [];
    }
    grouped[event.eventType].push(event);
  });
  
  // Calculate averages for each type
  return Object.entries(grouped).map(([type, events]) => {
    const readinessValues = events.map(e => e.readinessScore).filter(r => r !== null) as number[];
    const hrvValues = events.map(e => e.hrv).filter(h => h !== null) as number[];
    const sleepValues = events.map(e => e.sleepScore).filter(s => s !== null) as number[];
    
    const avgReadiness = readinessValues.length > 0 
      ? readinessValues.reduce((sum, v) => sum + v, 0) / readinessValues.length 
      : 0;
    const avgHRV = hrvValues.length > 0 
      ? hrvValues.reduce((sum, v) => sum + v, 0) / hrvValues.length 
      : 0;
    const avgSleep = sleepValues.length > 0 
      ? sleepValues.reduce((sum, v) => sum + v, 0) / sleepValues.length 
      : 0;
    
    // Calculate stress level
    let stressLevel: 'low' | 'medium' | 'high' = 'medium';
    if (avgReadiness > 0) {
      if (avgReadiness < 50) stressLevel = 'high';
      else if (avgReadiness < 70) stressLevel = 'medium';
      else stressLevel = 'low';
    } else if (avgHRV > 0) {
      if (avgHRV > 85) stressLevel = 'high';
      else if (avgHRV > 65) stressLevel = 'medium';
      else stressLevel = 'low';
    }
    
    return {
      eventType: type,
      avgReadiness: Math.round(avgReadiness),
      avgHRV: Math.round(avgHRV),
      avgSleep: Math.round(avgSleep),
      occurrences: events.length,
      stressLevel
    };
  }).sort((a, b) => b.occurrences - a.occurrences);
}

// Initialize auto-recording on page load
if (typeof window !== 'undefined') {
  // Run every hour
  setInterval(autoRecordPhysiologyForCalendarEvents, 60 * 60 * 1000);
  // Run once on load
  setTimeout(autoRecordPhysiologyForCalendarEvents, 5000);
}
