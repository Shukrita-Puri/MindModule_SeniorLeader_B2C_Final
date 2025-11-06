// Energy State Engine - Computes current energy state from multiple inputs

import { getEnergyStateFromCheckIn } from './checkInToTags';
import { getTimeOfDayTags } from './tagMappings';

export interface CurrentEnergyState {
  overallBalance: number; // 0-100
  dominantElement: string;
  state: string;
  contextTags: string[];
  energyTags: string[];
  stateTags: string[];
  recommendationPriority: 'rest' | 'restore' | 'activate' | 'maintain';
}

export function computeEnergyState(): CurrentEnergyState {
  // Get check-in data
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const checkInOutcome = checkInData.outcome || 'pause';
  const checkInState = getEnergyStateFromCheckIn(checkInOutcome);
  
  // Get wearable data (Apple Watch OR Oura - never both)
  const appleWatchData = JSON.parse(localStorage.getItem('appleWatchData') || '{}');
  const ouraData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const appleWatchHrv = appleWatchData.hrv || 0;
  const ouraReadiness = ouraData.readiness || 0;
  
  // Get calendar context
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  const upcomingHighStakes = calendarEvents.filter((e: any) => e.isHighStakes).length;
  const backToBack = calendarEvents.filter((e: any) => e.isBackToBack).length;
  const calendarLoad = Math.min((upcomingHighStakes * 15 + backToBack * 10), 30);
  const hasCalendar = calendarEvents.length > 0;
  
  // Get time of day context
  const hour = new Date().getHours();
  const timeContextTags = getTimeOfDayTags(hour);
  
  // Natural circadian energy curve
  let circadianBonus = 0;
  if (hour >= 9 && hour < 12) circadianBonus = 15; // Peak morning
  else if (hour >= 14 && hour < 17) circadianBonus = -10; // Afternoon dip
  else if (hour >= 17 && hour < 20) circadianBonus = 10; // Evening recovery
  else if (hour >= 22 || hour < 6) circadianBonus = -15; // Late night fatigue
  
  // Dynamic weight calculation based on connected sources
  const hasWearable = appleWatchHrv > 0 || ouraReadiness > 0;
  
  let checkInWeight: number;
  let wearableWeight: number;
  let calendarWeight: number;
  let circadianWeight: number;
  
  if (hasWearable && hasCalendar) {
    // Both wearable and calendar connected
    checkInWeight = 0.35;
    wearableWeight = 0.30;
    calendarWeight = 0.20;
    circadianWeight = 0.15;
  } else if (hasWearable && !hasCalendar) {
    // Only wearable connected
    checkInWeight = 0.35;
    wearableWeight = 0.40;
    calendarWeight = 0.00;
    circadianWeight = 0.25;
  } else if (!hasWearable && hasCalendar) {
    // Only calendar connected
    checkInWeight = 0.40;
    wearableWeight = 0.00;
    calendarWeight = 0.30;
    circadianWeight = 0.30;
  } else {
    // No external sources connected
    checkInWeight = 0.50;
    wearableWeight = 0.00;
    calendarWeight = 0.00;
    circadianWeight = 0.50;
  }
  
  // Calculate wearable score (Apple Watch OR Oura)
  const wearableScore = appleWatchHrv > 0 
    ? Math.min(100, (appleWatchHrv / 50) * 100) // Apple Watch HRV normalized
    : ouraReadiness; // Oura readiness is already 0-100
  
  // Calculate overall balance
  const overallBalance = Math.round(
    (checkInState.balance * checkInWeight) +
    (wearableScore * wearableWeight) +
    (Math.max(0, 100 - calendarLoad * 2) * calendarWeight) +
    ((50 + circadianBonus) * circadianWeight)
  );
  
  // Determine recommendation priority
  let recommendationPriority: 'rest' | 'restore' | 'activate' | 'maintain' = 'maintain';
  if (overallBalance < 40) recommendationPriority = 'rest';
  else if (overallBalance < 60) recommendationPriority = 'restore';
  else if (overallBalance < 75) recommendationPriority = 'activate';
  else recommendationPriority = 'maintain';
  
  // Build context tags
  const contextTags = [...timeContextTags];
  if (backToBack > 0) contextTags.push('back_to_back_meetings');
  if (upcomingHighStakes > 0) contextTags.push('high_decision_density');
  if (wearableScore < 60) contextTags.push('low_recovery');
  if (wearableScore > 80) contextTags.push('well_rested');
  
  // Build energy tags
  const energyTags = [checkInState.dominantElement];
  if (overallBalance < 50) energyTags.push(`low_${checkInState.dominantElement}`);
  else if (overallBalance > 75) energyTags.push(`${checkInState.dominantElement}_up`);
  
  // Build state tags
  const stateTags = [checkInState.state];
  if (overallBalance < 40) stateTags.push('depleted');
  else if (overallBalance > 75) stateTags.push('energised');
  if (backToBack > 2) stateTags.push('tense');
  
  return {
    overallBalance,
    dominantElement: checkInState.dominantElement,
    state: checkInState.state,
    contextTags,
    energyTags,
    stateTags,
    recommendationPriority
  };
}

export function getEnergyStateInsight(state: CurrentEnergyState): string {
  if (state.overallBalance >= 75) {
    return `Your energy is strong (${state.overallBalance}/100). You're primed for peak performance.`;
  } else if (state.overallBalance >= 60) {
    return `Your energy is good (${state.overallBalance}/100). Small adjustments will optimize your state.`;
  } else if (state.overallBalance >= 40) {
    return `Your energy needs support (${state.overallBalance}/100). Restoration practices recommended.`;
  } else {
    return `Your energy is depleted (${state.overallBalance}/100). Prioritize rest and recovery.`;
  }
}
