// Recommendation Engine - Generates personalized practice recommendations

import { mapCheckInToTags, getEnergyStateFromCheckIn } from './checkInToTags';
import { CONTEXT_TAGS, getTimeOfDayTags, ENERGY_TAGS } from './tagMappings';
import { getContentByTags } from '@/data/practicesAndSoundscapes';
import { CurrentEnergyState } from './energyStateEngine';

export interface Recommendation {
  id: string;
  title: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice';
  category: 'pause' | 'power-up' | 'presence';
  duration: number;
  thumbnail: string;
  tags: string[];
  whyNow: string;
  matchScore: number;
}

export async function generateRecommendations(energyState: CurrentEnergyState): Promise<{
  soundbath: Recommendation | null;
  guidedPractice: Recommendation | null;
  microPractice: Recommendation | null;
  reasoning: string;
}> {
  // Get current context
  const checkInData = JSON.parse(localStorage.getItem('dailyCheckIn') || '{}');
  const checkInOutcome = checkInData.outcome || 'pause';
  
  const calendarEvents = JSON.parse(localStorage.getItem('calendarEvents') || '[]');
  const upcomingEvent = calendarEvents[0];
  
  // Build recommendation tags based on energy state priority
  let recommendationTags: string[] = [];
  
  // Use energy state recommendation priority to drive tags
  switch (energyState.recommendationPriority) {
    case 'rest':
      recommendationTags = ['gentle', 'cooling', 'earth_up', 'grounding', 'release'];
      break;
    case 'restore':
      recommendationTags = ['grounding', 'centering', 'water_up', 'balancing', 'moderate'];
      break;
    case 'activate':
      recommendationTags = ['activation', 'fire_up', 'moderate', 'pre-performance', 'energizing'];
      break;
    case 'maintain':
      recommendationTags = ['centering', 'balancing', 'moderate', 'grounding'];
      break;
  }
  
  // Add energy tags from computed state
  recommendationTags.push(...energyState.energyTags);
  
  // Add context tags from computed state
  recommendationTags.push(...energyState.contextTags);
  
  // Adjust based on calendar
  if (upcomingEvent) {
    recommendationTags.push('pre-meeting', 'pre-performance', 'centering');
  }
  
  // Get matching content
  const allContent = getContentByTags(recommendationTags);
  
  // Split by content type
  const soundbaths = allContent.filter(c => c.contentType === 'soundbath');
  const guidedPractices = allContent.filter(c => c.contentType === 'guided-practice');
  const microPractices = allContent.filter(c => c.contentType === 'micro-practice');
  
  // Generate reasoning
  let reasoning = `Based on your energy state (${energyState.state}, ${Math.round(energyState.overallBalance)}/100 balance)`;
  if (energyState.recommendationPriority === 'rest') reasoning += `, your system needs rest`;
  if (energyState.recommendationPriority === 'activate') reasoning += `, you're ready to activate`;
  if (upcomingEvent) reasoning += `, and upcoming ${upcomingEvent.title}`;
  reasoning += ` — here's your personalized plan:`;
  
  return {
    soundbath: soundbaths[0] ? createRecommendation(soundbaths[0], checkInOutcome, 'Deep immersion to shift your energy state') : null,
    guidedPractice: guidedPractices[0] ? createRecommendation(guidedPractices[0], checkInOutcome, 'Structured practice to build resilience') : null,
    microPractice: microPractices[0] ? createRecommendation(microPractices[0], checkInOutcome, 'Quick reset before your next moment') : null,
    reasoning
  };
}

function createRecommendation(content: any, checkInOutcome: string, whyNow: string): Recommendation {
  return {
    id: content.id,
    title: content.title,
    contentType: content.contentType,
    category: content.category,
    duration: content.duration,
    thumbnail: content.thumbnail,
    tags: content.tags,
    whyNow,
    matchScore: 85 // Placeholder - would calculate based on tag overlap
  };
}

export function getRecommendationReasoning(content: any, checkInOutcome: string): string {
  const reasoningMap: Record<string, string> = {
    'pause': `Your system needs to downregulate. This ${content.contentType} uses ${content.origin} to restore calm.`,
    'power-up': `Your energy is low. This ${content.contentType} activates your nervous system for peak performance.`,
    'presence': `You're scattered. This ${content.contentType} centers your attention and sharpens focus.`,
    'calm': `Anxiety is high. This ${content.contentType} balances your nervous system.`,
    'ready': `You're primed. This ${content.contentType} optimizes your already strong state.`
  };
  
  return reasoningMap[checkInOutcome] || `This ${content.contentType} supports your current energy needs.`;
}
