/**
 * Energy State Scoring System - FULL IMPLEMENTATION (All Phases)
 * 
 * Core scoring functions for the new energy state calculation:
 * - Check-in scoring (6 statements → 0-100)
 * - Wearable scoring (Low/Medium/High → 0-100)
 * - Calendar scoring (Load + Pressure → 0-100)
 * - Circadian scoring (Time of day → -5/0/+5 adjustment)
 * - Sub-tier logic for finer granularity
 */

// ==================== CHECK-IN SCORING ====================

export function getCheckInScore(outcome: string): number {
  const scoreMap: Record<string, number> = {
    'pause': 10,           // I'm stressed/overwhelmed
    'power-up': 20,        // I'm drained/tired
    'presence': 30,        // I'm scattered/unfocused
    'calm': 25,            // I'm anxious/tense
    'ready': 80,           // I'm motivated/ready
    'good': 90             // I'm good / take me to homepage
  };
  
  return scoreMap[outcome] || 50; // Default to 50 if unknown
}

// ==================== WEARABLE SCORING ====================

export type WearableFunction = 'low' | 'medium' | 'high';

export function getWearableFunction(wearableData: any): WearableFunction {
  const readiness = wearableData.readiness || wearableData.readinessScore;
  
  if (!readiness) return 'medium';
  
  // Map readiness score to function level
  if (readiness < 50) return 'low';
  if (readiness < 75) return 'medium';
  return 'high';
}

export function getWearableScore(wearableData: any): number {
  const func = getWearableFunction(wearableData);
  
  const scoreMap: Record<WearableFunction, number> = {
    'low': 20,
    'medium': 50,
    'high': 80
  };
  
  return scoreMap[func];
}

// ==================== CALENDAR SCORING ====================

export type CalendarLoad = 'low' | 'medium' | 'high';
export type CalendarPressure = 'low' | 'medium' | 'high';

export interface CalendarMetrics {
  load: CalendarLoad;
  pressure: CalendarPressure;
  density: number;
  pressureScore: number;
  loadScore: number;
}

export function getCalendarMetrics(calendarData: any[]): CalendarMetrics {
  const now = new Date();
  const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  
  // Filter upcoming events (next 4 hours)
  const upcomingEvents = calendarData.filter((event: any) => {
    const startTime = new Date(event.start_time || event.startTime);
    return startTime >= now && startTime <= fourHoursLater;
  });
  
  // Calculate Load (number of meetings)
  const meetingCount = upcomingEvents.length;
  let load: CalendarLoad = 'low';
  if (meetingCount >= 5) load = 'high';
  else if (meetingCount >= 3) load = 'medium';
  
  // Calculate Pressure (metadata scoring)
  let totalPressure = 0;
  
  upcomingEvents.forEach((event: any) => {
    let eventPressure = 0;
    
    // User is organizer
    if (event.is_organizer) eventPressure += 2;
    
    // Attendee count
    const attendees = event.attendees_count || 0;
    if (attendees > 5) eventPressure += 2;
    else if (attendees > 2) eventPressure += 1;
    
    // Duration
    const start = new Date(event.start_time || event.startTime);
    const end = new Date(event.end_time || event.endTime);
    const durationMin = (end.getTime() - start.getTime()) / 60000;
    if (durationMin > 60) eventPressure += 2;
    else if (durationMin >= 30) eventPressure += 1;
    
    // Recurring
    if (!event.is_recurring) eventPressure += 1;
    
    // Prime hours (9am-12pm, 2pm-4pm)
    const hour = start.getHours();
    if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) {
      eventPressure += 1;
    }
    
    totalPressure += eventPressure;
  });
  
  // Check for back-to-back meetings
  const sortedEvents = upcomingEvents.sort((a, b) => 
    new Date(a.start_time || a.startTime).getTime() - new Date(b.start_time || b.startTime).getTime()
  );
  
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentEnd = new Date(sortedEvents[i].end_time || sortedEvents[i].endTime);
    const nextStart = new Date(sortedEvents[i + 1].start_time || sortedEvents[i + 1].startTime);
    const gap = (nextStart.getTime() - currentEnd.getTime()) / 60000;
    if (gap < 15) totalPressure += 1; // Back-to-back
  }
  
  // Map pressure to category
  let pressure: CalendarPressure = 'low';
  if (totalPressure >= 6) pressure = 'high';
  else if (totalPressure >= 3) pressure = 'medium';
  
  // Calculate numeric scores
  const loadScoreMap: Record<CalendarLoad, number> = {
    'low': 5,
    'medium': 0,
    'high': -5
  };
  
  const pressureScoreMap: Record<CalendarPressure, number> = {
    'low': 5,
    'medium': 0,
    'high': -5
  };
  
  return {
    load,
    pressure,
    density: meetingCount,
    loadScore: loadScoreMap[load],
    pressureScore: pressureScoreMap[pressure]
  };
}

export function getCalendarScore(calendarData: any[]): number {
  const metrics = getCalendarMetrics(calendarData);
  
  // Base score: 50
  // Weighted combination: 40% Load + 60% Pressure
  const score = 50 + (metrics.loadScore * 0.4) + (metrics.pressureScore * 0.6);
  
  return Math.max(0, Math.min(100, score));
}

// ==================== CIRCADIAN SCORING ====================

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function getTimeOfDay(hour: number = new Date().getHours()): TimeOfDay {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

export function getCircadianScore(hour: number = new Date().getHours()): number {
  const time = getTimeOfDay(hour);
  
  const adjustmentMap: Record<TimeOfDay, number> = {
    'morning': 5,      // Peak alertness
    'afternoon': 0,    // Neutral
    'evening': -5      // Natural dip
  };
  
  return adjustmentMap[time]; // ✅ PHASE 1: Return adjustment directly (-5, 0, +5)
}

// ==================== ENERGY TIER CALCULATION ====================

export type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';

export function getEnergyTier(balance: number): EnergyTier {
  if (balance < 40) return 'depleted';
  if (balance < 60) return 'managing';
  if (balance < 75) return 'strong';
  return 'peak';
}

// ==================== SUB-TIER LOGIC (PHASE 5) ====================

export type EnergySubTier = 'very-low' | 'low' | 'low-mid' | 'mid' | 'mid-high' | 'high' | 'very-high';

export function getEnergySubTier(balance: number): EnergySubTier {
  if (balance <= 15) return 'very-low';      // 0-15: Stressed/Overwhelmed
  if (balance <= 25) return 'low';           // 16-25: Drained/Tired, Anxious/Tense
  if (balance <= 35) return 'low-mid';       // 26-35: Scattered/Unfocused
  if (balance <= 55) return 'mid';           // 36-55: Managing
  if (balance <= 65) return 'mid-high';      // 56-65: Managing-Strong
  if (balance <= 75) return 'high';          // 66-75: Strong
  return 'very-high';                        // 76-100: Peak
}

// ==================== RECOMMENDATION LOGIC ====================

export type MasteryType = 'pause' | 'flow' | 'renewal';
export type MasterySubtype = 
  | 'deep-calm' | 'grounding' | 'composure' 
  | 'activate' | 'optimize' | 'maintain-peak'
  | 'recharge' | 'restore' | 'refresh'
  | 'focus' | 'clarity' | 'executive-presence' | 'restore-resilience' | 'reset-energy'; // Legacy values for compatibility

export interface Recommendation {
  primary: MasteryType;
  primarySubtype?: MasterySubtype;
  secondary?: MasteryType;
  secondarySubtype?: MasterySubtype;
  contextStatement: string;
}

// Helper function to get check-in emotional state
function getCheckInEmotion(checkInOutcome: string | null): string {
  if (!checkInOutcome) return '';
  
  const emotionMap: Record<string, string> = {
    'pause': 'stressed and overwhelmed',
    'power-up': 'drained and tired',
    'presence': 'scattered and unfocused',
    'calm': 'anxious and tense',
    'ready': 'motivated and ready',
    'good': 'good'
  };
  
  return emotionMap[checkInOutcome] || '';
}

// Helper function to format context statement
function formatContextStatement(
  checkInOutcome: string | null,
  balance: number,
  timeOfDay: TimeOfDay,
  recommendation: string
): string {
  const emotion = getCheckInEmotion(checkInOutcome);
  const timeLabel = timeOfDay === 'morning' ? 'this morning' : timeOfDay === 'afternoon' ? 'this afternoon' : 'this evening';
  
  if (emotion) {
    return `You mentioned, you are feeling ${emotion}, and your energy is ${balance}/100. ${recommendation.charAt(0).toUpperCase() + recommendation.slice(1)} ${timeLabel}.`;
  }
  
  return `Your energy is at ${balance}/100 ${timeLabel}. ${recommendation.charAt(0).toUpperCase() + recommendation.slice(1)}.`;
}

export function getRecommendation(
  balance: number,
  energyTier: EnergyTier,
  calendarMetrics: CalendarMetrics,
  wearableFunction: WearableFunction,
  checkInOutcome: string | null,
  timeOfDay: TimeOfDay
): Recommendation {
  const subTier = getEnergySubTier(balance);
  
  // ==================== DEPLETED TIER ====================
  if (energyTier === 'depleted') {
    let secondarySubtype: MasterySubtype = 'grounding';
    let recommendation = '';
    
    if (subTier === 'very-low') {
      secondarySubtype = (calendarMetrics.pressure === 'high') ? 'grounding' : 'deep-calm';
      recommendation = secondarySubtype === 'deep-calm' 
        ? 'deep rest is your priority—focus on restoring your energy before anything else' 
        : 'high demands require maintaining composure under stress';
    } else if (subTier === 'low') {
      secondarySubtype = (calendarMetrics.pressure === 'low' && wearableFunction === 'low') ? 'deep-calm' : 'grounding';
      recommendation = secondarySubtype === 'deep-calm'
        ? 'your body needs deep rest right now—recovery is essential before you take on anything else'
        : 'ground yourself first before tackling demands';
    } else {
      secondarySubtype = (calendarMetrics.pressure === 'high' || calendarMetrics.load === 'high') ? 'composure' : 'grounding';
      recommendation = secondarySubtype === 'composure'
        ? 'cognitive clarity is compromised—maintain composure under pressure'
        : 'scattered energy calls for grounding to restore focus';
    }
    
    return {
      primary: 'renewal',
      primarySubtype: 'restore',
      secondary: 'pause',
      secondarySubtype,
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, recommendation)
    };
  }

  // ==================== MANAGING TIER ====================
  if (energyTier === 'managing') {
    if (calendarMetrics.load === 'high') {
      return {
        primary: 'pause',
        primarySubtype: 'composure',
        secondary: 'renewal',
        secondarySubtype: 'refresh',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'with high demands ahead, try steadying your pace with brief reset moments')
      };
    } else if (calendarMetrics.load === 'medium') {
      return {
        primary: 'pause',
        primarySubtype: 'grounding',
        secondary: 'flow',
        secondarySubtype: 'activate',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'moderate demands call for balancing grounding with activation')
      };
    } else {
      return {
        primary: 'flow',
        primarySubtype: 'activate',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'low demands mean you can build momentum with focus practices')
      };
    }
  }

  // ==================== STRONG TIER ====================
  if (energyTier === 'strong') {
    if (calendarMetrics.pressure === 'high') {
      return {
        primary: 'flow',
        primarySubtype: 'optimize',
        secondary: 'pause',
        secondarySubtype: 'composure',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'high-pressure moments ahead—lean into practices that support executive presence')
      };
    } else {
      return {
        primary: 'flow',
        primarySubtype: 'activate',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'strong energy means you can lean into flow states with grounding support')
      };
    }
  }

  // ==================== PEAK TIER ====================
  if (timeOfDay === 'morning') {
    return {
      primary: 'flow',
      primarySubtype: 'optimize',
      secondary: 'pause',
      secondarySubtype: 'composure',
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'peak morning energy—maximize high-value work with flow states')
    };
  } else if (timeOfDay === 'evening') {
    return {
      primary: 'flow',
      primarySubtype: 'maintain-peak',
      secondary: 'renewal',
      secondarySubtype: 'refresh',
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'peak energy sustained—maintain high performance and consider renewal for tomorrow')
    };
  } else {
    return {
      primary: 'flow',
      primarySubtype: 'optimize',
      secondary: 'pause',
      secondarySubtype: 'grounding',
      contextStatement: formatContextStatement(checkInOutcome, balance, timeOfDay, 'keep this momentum going with practices that maintain focus and performance')
    };
  }
}
