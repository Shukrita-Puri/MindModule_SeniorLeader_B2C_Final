import { CurrentEnergyState } from './energyStateEngine';
import { getEnergyTier, getTimeOfDay } from './energyStateScoring';

export function getEnergyStateInsight(energyState: CurrentEnergyState): string {
  if (energyState.recommendation?.contextStatement) {
    return energyState.recommendation.contextStatement;
  }
  
  const hour = new Date().getHours();
  const timeOfDay = getTimeOfDay(hour);
  const energyTier = getEnergyTier(energyState.overallBalance);
  
  let insight = '';
  
  if (energyState.checkInOutcome) {
    const ack: Record<string, string> = {
      'pause': 'You reported feeling stressed/overwhelmed.',
      'power-up': 'You reported feeling drained/tired.',
      'presence': 'You reported feeling scattered/unfocused.',
      'calm': 'You reported feeling anxious/tense.',
      'ready': 'You reported feeling motivated/ready.',
      'good': 'You reported feeling good.'
    };
    insight += ack[energyState.checkInOutcome] || '';
  }
  
  const timeLabel = { morning: 'this morning', afternoon: 'this afternoon', evening: 'this evening' }[timeOfDay];
  insight += ` Energy is ${energyTier} at ${energyState.overallBalance}% ${timeLabel}.`;
  
  return insight;
}
