/**
 * Energy State Engine - NEW SYSTEM (Phase 1-3)
 * Calculates user's current energy state from multiple data sources
 */

import { getEnergyStateFromCheckIn } from './checkInToTags';
import { getUserEnergyProfile } from './memoryEngine';
import { 
  getCheckInScore, 
  getWearableScore, 
  getWearableFunction,
  getCalendarScore, 
  getCalendarMetrics,
  getCircadianScore,
  getEnergyTier,
  getTimeOfDay,
  getRecommendation,
  type WearableFunction,
  type CalendarLoad,
  type CalendarPressure,
  type EnergyTier,
  type MasteryType,
  type MasterySubtype
} from './energyStateScoring';

export interface CurrentEnergyState {
  overallBalance: number;
  state: string;
  contextTags: string[];
  energyTags: string[];
  stateTags: string[];
  recommendationPriority: string;
  dataSources: string[];
  confidence: 'low' | 'medium' | 'high';
  calendarDensity?: number;
  calendarLoad?: CalendarLoad;
  calendarPressure?: CalendarPressure;
  wearableFunction?: WearableFunction;
  energyTier?: EnergyTier;
  recommendation?: {
    primary: MasteryType;
    primarySubtype?: MasterySubtype;
    secondary?: MasteryType;
    secondarySubtype?: MasterySubtype;
    contextStatement: string;
  };
  checkInOutcome?: string;
}

export async function computeEnergyState(userId?: string): Promise<CurrentEnergyState> {
  // Try both possible localStorage keys for check-in
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || localStorage.getItem('todayCheckIn') || '{}');
  const checkInSkipped = JSON.parse(localStorage.getItem('checkInSkipped') || '{}');
  const wearableData = JSON.parse(localStorage.getItem('wearableData') || '{}');
  const calendarData = JSON.parse(localStorage.getItem('calendarEvents') || '[]');

  // Phase 1 Fix: Check if check-in is from TODAY
  const today = new Date().toDateString();
  const checkInToday = checkInData.timestamp && new Date(checkInData.timestamp).toDateString() === today;
  const hasCheckIn = checkInToday && checkInData.outcome && !checkInData.skipped && !checkInSkipped.skipped;

  const hasWearable = wearableData.readiness > 0 || wearableData.hrv > 0;
  const hasCalendar = calendarData.length > 0;

  const weights = calculateDynamicWeights(hasCheckIn, hasWearable, hasCalendar);
  
  const checkInScore = hasCheckIn ? getCheckInScore(checkInData.outcome) : 0;
  const wearableScore = hasWearable ? getWearableScore(wearableData) : 0;
  const calendarScore = hasCalendar ? getCalendarScore(calendarData) : 0;
  const circadianScore = getCircadianScore();

  const overallBalance = Math.round(
    (checkInScore * weights.checkIn) +
    (wearableScore * weights.wearable) +
    (calendarScore * weights.calendar) +
    (circadianScore * weights.circadian)
  );

  const { load: calendarLoad, pressure: calendarPressure, density: calendarDensity } = 
    hasCalendar ? getCalendarMetrics(calendarData) : { load: 'low' as CalendarLoad, pressure: 'low' as CalendarPressure, density: 0 };

  const energyTier = getEnergyTier(overallBalance);
  
  const recommendation = getRecommendation(
    energyTier,
    { load: calendarLoad, pressure: calendarPressure, density: calendarDensity, pressureScore: 0, loadScore: 0 },
    hasWearable ? getWearableFunction(wearableData) : 'medium',
    checkInData.outcome || null,
    getTimeOfDay(new Date().getHours())
  );

  return {
    overallBalance,
    state: energyTier,
    contextTags: [],
    energyTags: [],
    stateTags: [],
    recommendationPriority: recommendation.primary,
    dataSources: [
      ...(hasCheckIn ? ['check-in'] : []),
      ...(hasWearable ? ['wearable'] : []),
      ...(hasCalendar ? ['calendar'] : []),
      'circadian'
    ],
    confidence: hasCheckIn ? (hasWearable || hasCalendar ? 'high' : 'medium') : 'low',
    calendarDensity,
    calendarLoad,
    calendarPressure,
    wearableFunction: hasWearable ? getWearableFunction(wearableData) : undefined,
    energyTier,
    recommendation,
    checkInOutcome: hasCheckIn ? checkInData.outcome : undefined
  };
}

function calculateDynamicWeights(hasCheckIn: boolean, hasWearable: boolean, hasCalendar: boolean) {
  if (hasCheckIn && hasWearable && hasCalendar) return { checkIn: 0.60, wearable: 0.20, calendar: 0.10, circadian: 0.10 };
  if (hasCheckIn && hasWearable) return { checkIn: 0.60, wearable: 0.20, calendar: 0, circadian: 0.20 };
  if (hasCheckIn && hasCalendar) return { checkIn: 0.60, wearable: 0, calendar: 0.10, circadian: 0.30 };
  if (hasCheckIn) return { checkIn: 0.90, wearable: 0, calendar: 0, circadian: 0.10 };
  if (hasWearable && hasCalendar) return { checkIn: 0, wearable: 0.40, calendar: 0.30, circadian: 0.30 };
  if (hasWearable) return { checkIn: 0, wearable: 0.50, calendar: 0, circadian: 0.50 };
  if (hasCalendar) return { checkIn: 0, wearable: 0, calendar: 0.40, circadian: 0.60 };
  return { checkIn: 0, wearable: 0, calendar: 0, circadian: 1.0 };
}

export function getEnergyStateInsight(energyState: CurrentEnergyState): string {
  return energyState.recommendation?.contextStatement || `Energy is at ${energyState.overallBalance}%.`;
}
