// Recommendation Engine - Generates personalized practice recommendations

import { mapCheckInToTags, getEnergyStateFromCheckIn } from './checkInToTags';
import { CONTEXT_TAGS, getTimeOfDayTags, ENERGY_TAGS } from './tagMappings';
import { getContentByTags } from '@/data/practicesAndSoundscapes';
import { CurrentEnergyState } from './energyStateEngine';
import { type MasteryType, type MasterySubtype } from './energyStateScoring';

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
  // Use new recommendation system
  if (!energyState.recommendation) {
    return { 
      soundbath: null, 
      guidedPractice: null, 
      microPractice: null, 
      reasoning: 'Unable to generate recommendations - no energy state' 
    };
  }
  
  const { primary, primarySubtype, secondary, secondarySubtype, contextStatement } = energyState.recommendation;
  
  // Map mastery types to content tags
  const primaryTags = getMasteryTags(primary, primarySubtype);
  const secondaryTags = secondary ? getMasteryTags(secondary, secondarySubtype) : [];
  
  // Combine tags with priority to primary
  const recommendationTags = [...primaryTags, ...secondaryTags];
  
  // Get matching content with enhanced scoring
  const allContent = getContentByTags(recommendationTags);
  
  // Score and rank content based on structured tags
  const scoredContent = allContent.map(content => ({
    content,
    score: matchesStructuredTags(content, primary, primarySubtype, recommendationTags)
  }));
  
  // Sort by score (highest first), then by legacy tag match
  scoredContent.sort((a, b) => b.score - a.score);
  
  // Split by content type
  const soundbaths = scoredContent.filter(c => c.content.contentType === 'soundbath').map(c => c.content);
  const guidedPractices = scoredContent.filter(c => c.content.contentType === 'guided-practice').map(c => c.content);
  const microPractices = scoredContent.filter(c => c.content.contentType === 'micro-practice').map(c => c.content);
  
  return {
    soundbath: soundbaths[0] ? createRecommendation(soundbaths[0], primary, 'Deep immersion to shift your energy state') : null,
    guidedPractice: guidedPractices[0] ? createRecommendation(guidedPractices[0], primary, 'Structured practice to build resilience') : null,
    microPractice: microPractices[0] ? createRecommendation(microPractices[0], primary, 'Quick reset before your next moment') : null,
    reasoning: contextStatement
  };
}

// Helper function to map mastery types to content tags
function getMasteryTags(mastery: MasteryType, subtype?: MasterySubtype): string[] {
  if (mastery === 'pause') {
    if (subtype === 'deep-calm') return ['gentle', 'cooling', 'earth_up', 'grounding', 'release'];
    if (subtype === 'grounding') return ['grounding', 'centering', 'water_up', 'balancing', 'moderate'];
    if (subtype === 'composure') return ['centering', 'focus', 'moderate', 'grounding', 'cooling'];
    return ['grounding', 'centering', 'calming'];
  }
  
  if (mastery === 'renewal') {
    if (subtype === 'recharge') return ['activation', 'moderate', 'pre-performance', 'energizing'];
    if (subtype === 'restore') return ['grounding', 'centering', 'water_up', 'balancing', 'moderate'];
    if (subtype === 'refresh') return ['gentle', 'cooling', 'moderate'];
    return ['grounding', 'energizing', 'moderate'];
  }
  
  if (mastery === 'flow') {
    if (subtype === 'optimize') return ['centering', 'focus', 'mental_clarity', 'air_down'];
    if (subtype === 'activate') return ['activation', 'fire_up', 'pre-performance', 'energizing'];
    if (subtype === 'maintain-peak') return ['centering', 'balancing', 'moderate', 'focus'];
    return ['focus', 'centering', 'activation'];
  }
  
  return ['moderate', 'grounding'];
}

// Helper function to check if content matches structured tags
function matchesStructuredTags(content: any, masteryType: MasteryType, masterySubtype?: MasterySubtype, requiredTags?: string[]): number {
  // If no structured tags, fall back to legacy tag matching
  if (!content.structuredTags) {
    return 0;
  }
  
  let score = 0;
  const structured = content.structuredTags;
  
  // Pillar match (highest priority)
  const pillarMap: Record<MasteryType, string> = {
    'pause': 'pause',
    'flow': 'flow', 
    'renewal': 'renewal'
  };
  if (structured.pillar === pillarMap[masteryType]) {
    score += 50;
  }
  
  // Mastery subtype match (high priority)
  if (masterySubtype && structured.masterySubtypes?.includes(masterySubtype)) {
    score += 30;
  }
  
  // Goal tag overlap (medium priority)
  if (requiredTags && structured.goalTags) {
    const overlappingGoals = requiredTags.filter(tag => 
      structured.goalTags.some((goalTag: string) => 
        goalTag.toLowerCase().includes(tag.toLowerCase()) || 
        tag.toLowerCase().includes(goalTag.toLowerCase())
      )
    );
    score += overlappingGoals.length * 5;
  }
  
  return score;
}

function createRecommendation(
  content: any,
  category: string,
  whyNow: string
): Recommendation {
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
