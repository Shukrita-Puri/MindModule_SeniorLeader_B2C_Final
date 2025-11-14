/**
 * Energy State Scoring System
 * 
 * Core scoring functions for the new energy state calculation:
 * - Check-in scoring (6 statements → 0-100)
 * - Wearable scoring (Low/Medium/High → 0-100)
 * - Calendar scoring (Load + Pressure → 0-100)
 * - Circadian scoring (Time of day → 0-100)
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

interface CalendarMetrics {
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
  
  // Base: 50, then adjust
  const adjustmentMap: Record<TimeOfDay, number> = {
    'morning': 5,      // Peak alertness
    'afternoon': 0,    // Neutral
    'evening': -5      // Natural dip
  };
  
  return 50 + adjustmentMap[time];
}

// ==================== ENERGY TIER CALCULATION ====================

export type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';

export function getEnergyTier(balance: number): EnergyTier {
  if (balance <= 40) return 'depleted';
  if (balance <= 60) return 'managing';
  if (balance <= 75) return 'strong';
  return 'peak';
}

// ==================== RECOMMENDATION LOGIC ====================

export type MasteryType = 'pause' | 'flow' | 'renewal';
export type MasterySubtype = 'deep-calm' | 'grounding' | 'composure' | 'clarity' | 'focus' | 'executive-presence' | 'maintain-peak' | 'reset-energy' | 'restore-resilience';

interface Recommendation {
  primary: MasteryType;
  primarySubtype?: MasterySubtype;
  secondary?: MasteryType;
  secondarySubtype?: MasterySubtype;
  contextStatement: string;
}

export function getRecommendation(
  energyTier: EnergyTier,
  calendarMetrics: CalendarMetrics,
  wearableFunction: WearableFunction,
  checkInOutcome: string | null,
  timeOfDay: TimeOfDay
): Recommendation {
  
  const { load, pressure } = calendarMetrics;
  const timeLabel = { morning: 'this morning', afternoon: 'this afternoon', evening: 'this evening' }[timeOfDay];
  
  // Check-in acknowledgment map
  const checkInAck: Record<string, string> = {
    'pause': 'stressed/overwhelmed',
    'power-up': 'drained/tired',
    'presence': 'scattered/unfocused',
    'calm': 'anxious/tense',
    'ready': 'motivated/ready',
    'good': 'good'
  };
  
  const checkInText = checkInOutcome ? `You reported feeling ${checkInAck[checkInOutcome]}. ` : '';
  
  // Helper to determine if Load > Pressure
  const loadDominates = (load === 'high' && pressure !== 'high') || (load === 'medium' && pressure === 'low');
  const pressureDominates = (pressure === 'high' && load !== 'high') || (pressure === 'medium' && load === 'low');
  
  // ============= DEPLETED TIER (0-40) =============
  if (energyTier === 'depleted') {
    const isHighDemand = load === 'high' || pressure === 'high';
    const isLowFunction = wearableFunction === 'low';
    
    if (isHighDemand || isLowFunction) {
      return {
        primary: 'renewal',
        primarySubtype: 'restore-resilience',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: `${checkInText}Energy is depleted ${timeLabel}. High demands require restoration. Renew energy first; grounding can help maintain executive presence.`
      };
    }
    
    return {
      primary: 'renewal',
      primarySubtype: 'reset-energy',
      secondary: 'pause',
      secondarySubtype: 'deep-calm',
      contextStatement: `${checkInText}Energy is low ${timeLabel}. Focus on restoring resilience. Pause micro-practice can help maintain composure.`
    };
  }
  
  // ============= MANAGING TIER (41-60) =============
  if (energyTier === 'managing') {
    if (loadDominates) {
      return {
        primary: 'pause',
        primarySubtype: 'grounding',
        secondary: 'flow',
        secondarySubtype: 'focus',
        contextStatement: `${checkInText}Energy is steady (Managing range) ${timeLabel}. Cognitive load is ${load} today. Pause practices will help maintain clarity; optional Flow micro-practice sustains focus.`
      };
    }
    
    if (pressureDominates) {
      return {
        primary: 'flow',
        primarySubtype: 'executive-presence',
        secondary: 'pause',
        secondarySubtype: 'composure',
        contextStatement: `${checkInText}Energy is steady (Managing range) ${timeLabel}. High-pressure events require executive presence. Flow practices are primary; Pause can support calm composure.`
      };
    }
    
    // Balanced load and pressure
    return {
      primary: 'flow',
      primarySubtype: 'focus',
      secondary: 'pause',
      secondarySubtype: 'clarity',
      contextStatement: `${checkInText}Energy is steady (Managing range) ${timeLabel}. Balanced cognitive and decision load. Mix Flow and Pause practices; Renewal optional if energy dips.`
    };
  }
  
  // ============= STRONG TIER (61-75) =============
  if (energyTier === 'strong') {
    if (loadDominates) {
      return {
        primary: 'flow',
        primarySubtype: 'focus',
        secondary: 'pause',
        secondarySubtype: 'grounding',
        contextStatement: `${checkInText}Energy is strong ${timeLabel}. Maintain clarity with combined Flow and grounding micro-practices to handle high load.`
      };
    }
    
    if (pressureDominates) {
      return {
        primary: 'flow',
        primarySubtype: 'executive-presence',
        secondary: 'pause',
        secondarySubtype: 'composure',
        contextStatement: `${checkInText}Energy is strong ${timeLabel}. High pressure requires Flow practices to sustain executive performance.`
      };
    }
    
    return {
      primary: 'flow',
      primarySubtype: 'focus',
      secondary: 'pause',
      secondarySubtype: 'clarity',
      contextStatement: `${checkInText}Energy is strong ${timeLabel}. Balanced demands with sufficient energy. Use Flow and optional grounding micro-practices to sustain performance.`
    };
  }
  
  // ============= PEAK TIER (76-100) =============
  const isHighDemand = load === 'high' && pressure === 'high';
  
  if (isHighDemand) {
    return {
      primary: 'flow',
      primarySubtype: 'maintain-peak',
      secondary: 'renewal',
      secondarySubtype: 'reset-energy',
      contextStatement: `${checkInText}Energy is at peak ${timeLabel} but high load & pressure ahead. Focus on Flow for decision readiness; micro-Renewal can sustain energy for tomorrow.`
    };
  }
  
  return {
    primary: 'flow',
    primarySubtype: 'maintain-peak',
    secondary: 'pause',
    secondarySubtype: 'composure',
    contextStatement: `${checkInText}Energy is at peak ${timeLabel}. Flow practices maintain performance; optional micro-Pause or Renewal if upcoming load is high or end-of-day.`
  };
}
