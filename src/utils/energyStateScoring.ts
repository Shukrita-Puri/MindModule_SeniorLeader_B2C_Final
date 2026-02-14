/**
 * Energy State Scoring System — Cleaned (v4)
 * 
 * Inner Readiness scoring logic lives in the `compute-inner-readiness` edge function.
 * Outer Readiness (Strategic Theme) logic lives in the `compute-outer-readiness` edge function.
 * 
 * This file retains ONLY:
 * - Type exports used across the codebase
 * - Calendar metrics (used by energy state engine)
 * - Time-of-day utility
 * - Energy tier utility
 */

// ==================== TYPE EXPORTS ====================

export type CalendarLoad = 'low' | 'medium' | 'high';
export type CalendarPressure = 'low' | 'medium' | 'high';
export type EnergyTier = 'depleted' | 'managing' | 'strong' | 'peak';
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';
export type WearableFunction = 'low' | 'medium' | 'high';
export type MasteryType = 'pause' | 'flow' | 'renewal';
export type MasterySubtype = 
  | 'deep-calm' | 'grounding' | 'composure' 
  | 'activate' | 'optimize' | 'maintain-peak'
  | 'recharge' | 'restore' | 'refresh'
  | 'focus' | 'clarity' | 'executive-presence' | 'restore-resilience' | 'reset-energy';

export interface Recommendation {
  primary: MasteryType;
  primarySubtype?: MasterySubtype;
  secondary?: MasteryType;
  secondarySubtype?: MasterySubtype;
  contextStatement: string;
}

export interface CalendarMetrics {
  load: CalendarLoad;
  pressure: CalendarPressure;
  density: number;
  pressureScore: number;
  loadScore: number;
}

// ==================== TIME OF DAY ====================

export function getTimeOfDay(hour: number = new Date().getHours()): TimeOfDay {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

// ==================== ENERGY TIER (utility — thresholds match edge function) ====================

export function getEnergyTier(balance: number): EnergyTier {
  if (balance < 40) return 'depleted';
  if (balance < 60) return 'managing';
  if (balance < 75) return 'strong';
  return 'peak';
}

// ==================== CALENDAR METRICS ====================

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
    
    if (event.is_organizer) eventPressure += 2;
    
    const attendees = event.attendees_count || 0;
    if (attendees > 5) eventPressure += 2;
    else if (attendees > 2) eventPressure += 1;
    
    const start = new Date(event.start_time || event.startTime);
    const end = new Date(event.end_time || event.endTime);
    const durationMin = (end.getTime() - start.getTime()) / 60000;
    if (durationMin > 60) eventPressure += 2;
    else if (durationMin >= 30) eventPressure += 1;
    
    if (!event.is_recurring) eventPressure += 1;
    
    const hour = start.getHours();
    if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) {
      eventPressure += 1;
    }
    
    totalPressure += eventPressure;
  });
  
  // Check for back-to-back meetings
  const sortedEvents = upcomingEvents.sort((a: any, b: any) => 
    new Date(a.start_time || a.startTime).getTime() - new Date(b.start_time || b.startTime).getTime()
  );
  
  for (let i = 0; i < sortedEvents.length - 1; i++) {
    const currentEnd = new Date(sortedEvents[i].end_time || sortedEvents[i].endTime);
    const nextStart = new Date(sortedEvents[i + 1].start_time || sortedEvents[i + 1].startTime);
    const gap = (nextStart.getTime() - currentEnd.getTime()) / 60000;
    if (gap < 15) totalPressure += 1;
  }
  
  let pressure: CalendarPressure = 'low';
  if (totalPressure >= 6) pressure = 'high';
  else if (totalPressure >= 3) pressure = 'medium';
  
  const loadScoreMap: Record<CalendarLoad, number> = { 'low': 5, 'medium': 0, 'high': -5 };
  const pressureScoreMap: Record<CalendarPressure, number> = { 'low': 5, 'medium': 0, 'high': -5 };
  
  return {
    load,
    pressure,
    density: meetingCount,
    loadScore: loadScoreMap[load],
    pressureScore: pressureScoreMap[pressure]
  };
}

// ==================== STRATEGIC THEME (Outer Readiness) ====================
// All theme logic has been moved to the compute-outer-readiness edge function.
// Type exports kept for backward compatibility with PlanContext.

export type ThemeDriver = 'pressure+load' | 'pressure' | 'load' | 'morning' | 'evening' | 'state';

export interface StrategicTheme {
  phrase: string;
  context: string;
  driver: ThemeDriver;
}
