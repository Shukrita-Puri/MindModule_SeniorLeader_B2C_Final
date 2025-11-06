// Historical HRV Tracking - Store and analyze HRV patterns from past events

export interface HistoricalHRVEvent {
  id: string;
  eventTitle: string;
  eventType: string; // 'board-meeting', 'presentation', 'client-call', etc.
  startTime: Date;
  endTime: Date;
  hrv: number; // HRV reading during or after the event
  source: 'oura' | 'apple-watch';
  stressLevel: 'low' | 'medium' | 'high';
  createdAt: Date;
}

const STORAGE_KEY = 'historicalHRVEvents';
const MAX_HISTORY_DAYS = 90; // Keep 3 months of history

export function storeHRVEvent(event: Omit<HistoricalHRVEvent, 'id' | 'createdAt'>): void {
  const history = getHRVHistory();
  
  const newEvent: HistoricalHRVEvent = {
    ...event,
    id: `hrv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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

export function getHRVHistory(): HistoricalHRVEvent[] {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];
  
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

export function analyzeEventHRVPattern(
  eventTitle: string,
  eventType: string
): {
  hasPattern: boolean;
  avgHRV: number;
  occurrences: number;
  elevated: boolean;
  trend: 'improving' | 'stable' | 'worsening' | 'insufficient-data';
} {
  const history = getHRVHistory();
  
  // Find similar events (same title or type)
  const similarEvents = history.filter(e =>
    e.eventTitle.toLowerCase().includes(eventTitle.toLowerCase()) ||
    e.eventType === eventType
  );
  
  if (similarEvents.length === 0) {
    return {
      hasPattern: false,
      avgHRV: 0,
      occurrences: 0,
      elevated: false,
      trend: 'insufficient-data'
    };
  }
  
  // Calculate average HRV
  const avgHRV = similarEvents.reduce((sum, e) => sum + e.hrv, 0) / similarEvents.length;
  
  // Determine trend (compare first half vs second half)
  if (similarEvents.length >= 4) {
    const midpoint = Math.floor(similarEvents.length / 2);
    const firstHalfAvg = similarEvents.slice(0, midpoint).reduce((sum, e) => sum + e.hrv, 0) / midpoint;
    const secondHalfAvg = similarEvents.slice(midpoint).reduce((sum, e) => sum + e.hrv, 0) / (similarEvents.length - midpoint);
    
    let trend: 'improving' | 'stable' | 'worsening' = 'stable';
    const diff = secondHalfAvg - firstHalfAvg;
    if (diff > 5) trend = 'worsening'; // HRV increasing = more stress
    else if (diff < -5) trend = 'improving'; // HRV decreasing = less stress
    
    return {
      hasPattern: true,
      avgHRV: Math.round(avgHRV),
      occurrences: similarEvents.length,
      elevated: avgHRV > 75,
      trend
    };
  }
  
  return {
    hasPattern: true,
    avgHRV: Math.round(avgHRV),
    occurrences: similarEvents.length,
    elevated: avgHRV > 75,
    trend: 'insufficient-data'
  };
}

export function autoRecordHRVForCalendarEvents(): void {
  // Get today's calendar events
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  
  // Get latest HRV data
  const ouraData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const appleWatchData = JSON.parse(localStorage.getItem('appleWatchData') || '{}');
  
  const currentHRV = ouraData.hrv || appleWatchData.hrv;
  const source = ouraData.hrv ? 'oura' : 'apple-watch';
  
  if (!currentHRV) return; // No HRV data available
  
  // Find events that recently ended (within last 2 hours)
  const now = new Date();
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  
  calendarEvents.forEach((event: any) => {
    const eventEnd = new Date(event.endTime);
    
    // Check if event ended in last 2 hours
    if (eventEnd > twoHoursAgo && eventEnd < now) {
      // Check if we already recorded this event
      const history = getHRVHistory();
      const alreadyRecorded = history.some(h => 
        h.eventTitle === event.title && 
        Math.abs(new Date(h.startTime).getTime() - new Date(event.startTime).getTime()) < 60000 // Within 1 min
      );
      
      if (!alreadyRecorded) {
        storeHRVEvent({
          eventTitle: event.title,
          eventType: event.eventType || 'meeting',
          startTime: new Date(event.startTime),
          endTime: new Date(event.endTime),
          hrv: currentHRV,
          source: source as 'oura' | 'apple-watch',
          stressLevel: currentHRV > 85 ? 'high' : currentHRV > 65 ? 'medium' : 'low'
        });
      }
    }
  });
}

// Initialize auto-recording on page load
if (typeof window !== 'undefined') {
  // Run every hour
  setInterval(autoRecordHRVForCalendarEvents, 60 * 60 * 1000);
  // Run once on load
  setTimeout(autoRecordHRVForCalendarEvents, 5000);
}
