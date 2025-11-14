// Energy State Engine - Calculates user's current energy state from multiple data sources
// Removes elemental classification, integrates memory, supports skip logic

import { getUserEnergyProfile, type UserEnergyProfile } from './memoryEngine';
import { getEnergyStateFromCheckIn } from './checkInToTags';

export interface CurrentEnergyState {
  overallBalance: number;
  state: string;
  contextTags: string[];
  energyTags: string[];
  stateTags: string[];
  recommendationPriority: 'rest' | 'restore' | 'activate' | 'maintain' | 'ground' | 'center_focus' | 'calm_cool' | 'restore_energize';
  dataSources: string[];
  confidence: 'high' | 'medium' | 'low';
  calendarDensity?: number;
  checkInOutcome?: string;
}

export async function computeEnergyState(userId?: string): Promise<CurrentEnergyState> {
  // Get check-in data
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const checkInSkipped = JSON.parse(localStorage.getItem('dailyCheckInSkipped') || '{}');
  const hasCheckIn = checkInData.outcome && !checkInData.skipped && !checkInSkipped.skipped;
  const checkInOutcome = hasCheckIn ? checkInData.outcome : null;
  
  // Debug logging
  console.log('[Energy State] Reading localStorage:', {
    checkInData,
    checkInSkipped,
    hasCheckIn,
    checkInOutcome
  });
  
  // Get wearable data
  const appleWatchData = JSON.parse(localStorage.getItem('appleWatchData') || '{}');
  const ouraData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const hasWearable = (appleWatchData.hrv > 0 || ouraData.readiness > 0);
  
  // Get calendar data
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  const hasCalendar = calendarEvents.length > 0;
  const calendarDensity = calculateCalendarDensity(calendarEvents);
  
  // Get memory profile
  const memoryProfile = userId ? await getUserEnergyProfile() : null;
  const hasMemory = memoryProfile && memoryProfile.energyPatterns.length > 0;
  
  // Get circadian rhythm
  const hour = new Date().getHours();
  const circadianBonus = getCircadianBonus(hour);
  
  // Dynamic weight calculation
  const weights = calculateDynamicWeights(hasCheckIn, hasWearable, hasCalendar, hasMemory);
  
  // Calculate component scores
  const checkInScore = hasCheckIn ? getEnergyStateFromCheckIn(checkInData.outcome).balance : 0;
  const wearableScore = calculateWearableScore(appleWatchData, ouraData);
  const calendarScore = calculateCalendarScore(calendarEvents);
  const memoryScore = memoryProfile ? calculateMemoryScore(memoryProfile, hour) : 50;
  const circadianScore = 50 + circadianBonus;
  
  // Weighted overall balance
  const overallBalance = Math.round(
    (checkInScore * weights.checkIn) +
    (wearableScore * weights.wearable) +
    (calendarScore * weights.calendar) +
    (memoryScore * weights.memory) +
    (circadianScore * weights.circadian)
  );
  
  // Determine confidence based on data sources
  const confidence = hasCheckIn && (hasWearable || hasCalendar) ? 'high' 
    : hasCheckIn || hasWearable ? 'medium' 
    : 'low';
  
  // Build data sources array for transparency
  const dataSources: string[] = [];
  if (hasCheckIn) dataSources.push('check-in');
  if (hasWearable) dataSources.push('wearable');
  if (hasCalendar) dataSources.push('calendar');
  if (hasMemory) dataSources.push('memory');
  dataSources.push('circadian');
  
  // Infer state
  const state = hasCheckIn 
    ? getEnergyStateFromCheckIn(checkInData.outcome).state
    : inferStateFromBalance(overallBalance);
  
  return {
    overallBalance,
    state,
    contextTags: buildContextTags(hour, calendarEvents, wearableScore),
    energyTags: buildEnergyTags(overallBalance),
    stateTags: buildStateTags(overallBalance, calendarEvents),
    recommendationPriority: getRecommendationPriority(checkInOutcome, overallBalance, hour, calendarDensity),
    dataSources,
    confidence,
    calendarDensity,
    checkInOutcome: checkInOutcome || undefined
  };
}

function calculateDynamicWeights(
  hasCheckIn: boolean,
  hasWearable: boolean,
  hasCalendar: boolean,
  hasMemory: boolean
) {
  // Pro user with check-in - prioritize check-in at 60%
  if (hasCheckIn && !hasWearable && !hasCalendar) {
    return { checkIn: 0.60, wearable: 0, calendar: 0, memory: 0.25, circadian: 0.15 };
  }
  
  // Pro user skipped (memory + circadian only)
  if (!hasCheckIn && !hasWearable && !hasCalendar) {
    return { checkIn: 0, wearable: 0, calendar: 0, memory: 0.70, circadian: 0.30 };
  }
  
  // Super Pro with check-in + all data - prioritize check-in at 60%
  if (hasCheckIn && hasWearable && hasCalendar) {
    return { checkIn: 0.60, wearable: 0.15, calendar: 0.05, memory: 0.10, circadian: 0.10 };
  }
  
  // Super Pro skipped but has wearable + calendar
  if (!hasCheckIn && hasWearable && hasCalendar) {
    return { checkIn: 0, wearable: 0.50, calendar: 0.25, memory: 0.15, circadian: 0.10 };
  }
  
  // Super Pro skipped with wearable only
  if (!hasCheckIn && hasWearable && !hasCalendar) {
    return { checkIn: 0, wearable: 0.60, calendar: 0, memory: 0.25, circadian: 0.15 };
  }
  
  // Default fallback - prioritize check-in at 60%
  return { checkIn: 0.60, wearable: 0.15, calendar: 0.05, memory: 0.10, circadian: 0.10 };
}

function calculateMemoryScore(memoryProfile: UserEnergyProfile, currentHour: number): number {
  // Find typical energy for this time of day from memory
  const timeWindow = getTimeWindow(currentHour);
  const pattern = memoryProfile.energyPatterns.find(p => p.timeOfDay === timeWindow);
  
  return pattern?.avgBalance || 50;
}

function getTimeWindow(hour: number): string {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}

function calculateWearableScore(appleWatch: any, oura: any): number {
  if (oura.readiness) {
    return oura.readiness;
  }
  if (appleWatch.hrv) {
    return Math.min(100, Math.max(0, appleWatch.hrv * 1.5));
  }
  return 50;
}

function calculateCalendarScore(events: any[]): number {
  const upcomingEvents = events.filter((e: any) => {
    const eventTime = new Date(e.start).getTime();
    const now = Date.now();
    const twoHours = 2 * 60 * 60 * 1000;
    return eventTime > now && eventTime < now + twoHours;
  });

  if (upcomingEvents.length === 0) return 70;
  if (upcomingEvents.length === 1) return 55;
  if (upcomingEvents.length === 2) return 40;
  return 30;
}

function getCircadianBonus(hour: number): number {
  if (hour >= 9 && hour <= 11) return 10;   // Morning peak
  if (hour >= 14 && hour <= 16) return 5;   // Afternoon peak
  if (hour >= 18 && hour <= 22) return -5;  // Gentle evening transition
  if (hour >= 23 || hour <= 6) return -10;  // Deep night
  return 0;
}

function inferStateFromBalance(balance: number): string {
  if (balance < 40) return 'fatigued';
  if (balance < 55) return 'tense';
  if (balance < 70) return 'scattered';
  if (balance < 85) return 'balanced';
  return 'energized';
}

function buildContextTags(hour: number, events: any[], wearableScore: number): string[] {
  const tags: string[] = [];
  
  if (hour >= 6 && hour < 12) tags.push('morning');
  else if (hour >= 12 && hour < 18) tags.push('afternoon');
  else if (hour >= 18 && hour < 22) tags.push('evening');
  else tags.push('night');
  
  if (events.length > 2) tags.push('high_meeting_density');
  if (wearableScore < 40) tags.push('low_readiness');
  
  return tags;
}

function buildEnergyTags(balance: number): string[] {
  if (balance < 40) return ['low_activation', 'depleted'];
  if (balance < 55) return ['excess_activation', 'tense'];
  if (balance < 70) return ['scattered', 'excess_mental_chatter'];
  if (balance < 85) return ['balanced'];
  return ['energized', 'peak_state'];
}

function buildStateTags(balance: number, events: any[]): string[] {
  const tags: string[] = [];
  
  if (balance < 40) tags.push('fatigued', 'needs_restoration');
  else if (balance < 55) tags.push('tense', 'needs_calming');
  else if (balance < 70) tags.push('scattered', 'needs_focus');
  else if (balance < 85) tags.push('balanced');
  else tags.push('energized', 'peak_performance');
  
  if (events.length > 2) tags.push('high_cognitive_load');
  
  return tags;
}

function calculateCalendarDensity(calendarEvents: any[]): number {
  if (!calendarEvents || calendarEvents.length === 0) return 0;
  const now = Date.now();
  const threeHoursLater = now + (3 * 60 * 60 * 1000);
  
  const upcomingEvents = calendarEvents.filter((event: any) => {
    const start = new Date(event.start).getTime();
    return start >= now && start <= threeHoursLater;
  });
  
  return upcomingEvents.length;
}

function getRecommendationPriority(
  checkInOutcome: string | null,
  balance: number, 
  hour: number,
  calendarDensity: number
): 'rest' | 'restore' | 'activate' | 'maintain' | 'ground' | 'center_focus' | 'calm_cool' | 'restore_energize' {
  
  // PRIORITY 1: Check-in outcome type (specific dysregulation)
  if (checkInOutcome === 'scattered') return 'center_focus';
  if (checkInOutcome === 'overwhelmed') return 'calm_cool';
  
  // PRIORITY 2: Tired with contextual modifiers
  if (checkInOutcome === 'tired') {
    // Morning + busy calendar = hybrid restore_energize
    if (hour >= 6 && hour <= 11 && calendarDensity >= 3) return 'restore_energize';
    // Otherwise standard restore
    return balance < 40 ? 'rest' : 'restore';
  }
  
  // PRIORITY 3: Evening high-energy = ground/transition
  if (hour >= 18 && hour <= 22 && balance >= 70) return 'ground';
  
  // PRIORITY 4: Balance-driven logic for other states
  if (balance < 40) return 'rest';
  if (balance < 60) return 'restore';
  if (balance < 75) return 'activate';
  return 'maintain';
}

export function getEnergyStateInsight(energyState: CurrentEnergyState): string {
  const { overallBalance } = energyState;
  
  if (overallBalance < 40) {
    return 'Deep restoration needed—your system is depleted';
  }
  if (overallBalance < 55) {
    return 'High activation detected—time to downregulate';
  }
  if (overallBalance < 70) {
    return 'Mental scatter present—centering practices recommended';
  }
  if (overallBalance < 85) {
    return 'Balanced state—maintain with grounding practices';
  }
  return 'Peak energy state—sustain with focus practices';
}
