// Historical Pattern Engine - Detects HRV patterns from past events for proactive recommendations

export interface HistoricalEvent {
  id: string;
  title: string;
  eventType: string;
  startTime: Date;
  endTime: Date;
  hrv: number; // HRV during event
  source: 'oura' | 'apple-watch';
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: Date;
  endTime: Date;
  isHighStakes?: boolean;
  isBackToBack?: boolean;
  eventType?: string;
}

export interface HRVPattern {
  hasPattern: boolean;
  avgHRV: number;
  elevated: boolean;
  recommendation: string;
  reasoning: string;
}

export function detectHRVPattern(
  upcomingEvent: CalendarEvent,
  historicalEvents: HistoricalEvent[]
): HRVPattern {
  // Find similar past events (same title or type)
  const similarEvents = historicalEvents.filter(past =>
    past.title.toLowerCase().includes(upcomingEvent.title.toLowerCase()) ||
    past.eventType === upcomingEvent.eventType
  );
  
  if (similarEvents.length === 0) {
    return {
      hasPattern: false,
      avgHRV: 0,
      elevated: false,
      recommendation: '',
      reasoning: ''
    };
  }
  
  // Calculate average HRV
  const avgHRV = similarEvents.reduce((sum, e) => sum + e.hrv, 0) / similarEvents.length;
  
  // Elevated HRV = stress response (>75)
  const elevated = avgHRV > 75;
  
  return {
    hasPattern: true,
    avgHRV: Math.round(avgHRV),
    elevated,
    recommendation: elevated ? 'pre-emptive-regulation' : 'maintain-state',
    reasoning: elevated
      ? `Your HRV averaged ${Math.round(avgHRV)} during past ${upcomingEvent.title} meetings, indicating stress response.`
      : `Your HRV was stable (${Math.round(avgHRV)}) during past similar meetings.`
  };
}

export interface MeetingGap {
  gapDuration: number; // minutes
  afterMeeting: CalendarEvent;
  beforeMeeting: CalendarEvent;
  timing: string;
}

export function detectMeetingGaps(calendarEvents: CalendarEvent[]): MeetingGap[] {
  const gaps: MeetingGap[] = [];
  
  for (let i = 0; i < calendarEvents.length - 1; i++) {
    const current = calendarEvents[i];
    const next = calendarEvents[i + 1];
    
    const gapMs = new Date(next.startTime).getTime() - new Date(current.endTime).getTime();
    const gapMinutes = Math.floor(gapMs / (1000 * 60));
    
    // Look for 30-60 minute gaps
    if (gapMinutes >= 30 && gapMinutes <= 60) {
      const endTime = new Date(current.endTime);
      const startTime = new Date(next.startTime);
      
      gaps.push({
        gapDuration: gapMinutes,
        afterMeeting: current,
        beforeMeeting: next,
        timing: `${formatTime(endTime)} - ${formatTime(startTime)}`
      });
    }
  }
  
  return gaps;
}

export function detectBackToBackOverload(calendarEvents: CalendarEvent[]): number {
  let maxConsecutive = 0;
  let currentConsecutive = 1;
  
  for (let i = 0; i < calendarEvents.length - 1; i++) {
    const current = calendarEvents[i];
    const next = calendarEvents[i + 1];
    
    const gapMs = new Date(next.startTime).getTime() - new Date(current.endTime).getTime();
    const gapMinutes = Math.floor(gapMs / (1000 * 60));
    
    if (gapMinutes < 15) {
      currentConsecutive++;
      maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
    } else {
      currentConsecutive = 1;
    }
  }
  
  return maxConsecutive;
}

export function detectHighStakesEvents(
  calendarEvents: CalendarEvent[],
  minutesAhead: number = 60
): CalendarEvent[] {
  const now = new Date();
  
  return calendarEvents.filter(event => {
    const eventStart = new Date(event.startTime);
    const minutesUntil = (eventStart.getTime() - now.getTime()) / (1000 * 60);
    
    return event.isHighStakes && minutesUntil > 0 && minutesUntil <= minutesAhead;
  });
}

export function calculateTotalMeetingMinutes(calendarEvents: CalendarEvent[]): number {
  return calendarEvents.reduce((total, event) => {
    const durationMs = new Date(event.endTime).getTime() - new Date(event.startTime).getTime();
    return total + Math.floor(durationMs / (1000 * 60));
  }, 0);
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}
