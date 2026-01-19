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
  getEnergySubTier,
  getTimeOfDay,
  getRecommendation,
  type WearableFunction,
  type CalendarLoad,
  type CalendarPressure,
  type EnergyTier,
  type EnergySubTier,
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
  energyTier: EnergyTier;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
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

  // OPTION B: Separate Energy Score from Ritual Selection
  // Energy Score = Internal State Only (Check-in + Wearable + Circadian)
  const checkInScore = hasCheckIn ? getCheckInScore(checkInData.outcome) : 50; // Default to neutral
  const wearableScore = hasWearable ? getWearableScore(wearableData) : 0;
  const circadianAdjustment = getCircadianScore(); // Returns -5, 0, +5
  
  // Calculate dynamic weights based on available data
  const weights = hasWearable 
    ? { checkIn: 0.65, wearable: 0.30, circadian: 0.05 } // Super Pro
    : { checkIn: 0.90, wearable: 0, circadian: 0.10 };    // Pro

  // Energy score (no calendar influence)
  const energyScore = Math.round(
    (checkInScore * weights.checkIn) +
    (wearableScore * weights.wearable) +
    (circadianAdjustment * weights.circadian)
  );

  // Tier determined by energy score alone
  const energyTier = getEnergyTier(energyScore);
  const energySubTier = getEnergySubTier(energyScore);

  // Calendar metrics calculated separately for ritual selection
  const { load: calendarLoad, pressure: calendarPressure, density: calendarDensity } = 
    hasCalendar ? getCalendarMetrics(calendarData) : { load: 'low' as CalendarLoad, pressure: 'low' as CalendarPressure, density: 0 };

  // Recommendation uses BOTH energy tier AND calendar context
  const recommendation = getRecommendation(
    energyScore,
    energyTier,
    { load: calendarLoad, pressure: calendarPressure, density: calendarDensity, pressureScore: 0, loadScore: 0 },
    hasWearable ? getWearableFunction(wearableData) : 'medium',
    checkInData.outcome || null,
    getTimeOfDay(new Date().getHours()),
    hasCalendar,
    hasWearable
  );

  const timeOfDay = getTimeOfDay(new Date().getHours());

  return {
    overallBalance: energyScore,
    state: energyTier,
    contextTags: [],
    energyTags: [],
    stateTags: [],
    recommendationPriority: recommendation.primary,
    dataSources: [
      ...(hasCheckIn ? ['check-in'] : []),
      ...(hasWearable ? ['wearable'] : []),
      'circadian'
    ],
    confidence: hasCheckIn ? (hasWearable ? 'high' : 'medium') : 'low',
    calendarDensity,
    calendarLoad,
    calendarPressure,
    wearableFunction: hasWearable ? getWearableFunction(wearableData) : undefined,
    energyTier,
    timeOfDay,
    recommendation,
    checkInOutcome: hasCheckIn ? checkInData.outcome : undefined
  };
}

export function getEnergyStateInsight(energyState: CurrentEnergyState): string {
  return energyState.recommendation?.contextStatement || `Energy is at ${energyState.overallBalance}%.`;
}
