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
  // Get check-in data (40% weight)
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const checkInOutcome = checkInData.outcome || 'pause';
  const checkInState = getEnergyStateFromCheckIn(checkInOutcome);
  
  // Get Oura data (30% weight)
  const ouraData = JSON.parse(localStorage.getItem('ouraData') || '{}');
  const ouraReadiness = ouraData.readiness || 70;
  
  // Get calendar context (20% weight)
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  const upcomingHighStakes = calendarEvents.filter((e: any) => e.isHighStakes).length;
  const backToBack = calendarEvents.filter((e: any) => e.isBackToBack).length;
  const calendarLoad = Math.min((upcomingHighStakes * 15 + backToBack * 10), 30);
  
  // Get time of day context (10% weight)
  const hour = new Date().getHours();
  const timeContextTags = getTimeOfDayTags(hour);
  
  // Natural circadian energy curve
  let circadianBonus = 0;
  if (hour >= 9 && hour < 12) circadianBonus = 15; // Peak morning
  else if (hour >= 14 && hour < 17) circadianBonus = -10; // Afternoon dip
  else if (hour >= 17 && hour < 20) circadianBonus = 10; // Evening recovery
  else if (hour >= 22 || hour < 6) circadianBonus = -15; // Late night fatigue
  
  // Calculate overall balance
  const checkInWeight = 0.4;
  const ouraWeight = 0.3;
  const calendarWeight = 0.2;
  const circadianWeight = 0.1;
  
  const overallBalance = Math.round(
    (checkInState.balance * checkInWeight) +
    (ouraReadiness * ouraWeight) +
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
  if (ouraReadiness < 60) contextTags.push('low_recovery');
  if (ouraReadiness > 80) contextTags.push('well_rested');
  
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
    return `Your energy is strong (${state.overallBalance}% balanced). You're primed for peak performance.`;
  } else if (state.overallBalance >= 60) {
    return `Your energy is good (${state.overallBalance}% balanced). Small adjustments will optimize your state.`;
  } else if (state.overallBalance >= 40) {
    return `Your energy needs support (${state.overallBalance}% balanced). Restoration practices recommended.`;
  } else {
    return `Your energy is depleted (${state.overallBalance}% balanced). Prioritize rest and recovery.`;
  }
}
