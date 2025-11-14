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

interface PracticeConfig {
  count: number;
  reasoning: string;
  types: ('soundbath' | 'guided-practice' | 'micro-practice')[];
}

function determineOptimalPracticeCount(energyState: CurrentEnergyState): PracticeConfig {
  const { energyTier, calendarPressure, calendarLoad } = energyState;
  
  if (energyTier === 'depleted') {
    if (calendarPressure === 'high') {
      return {
        count: 2,
        reasoning: 'You need quick intensive support before your demanding schedule.',
        types: ['guided-practice', 'micro-practice']
      };
    }
    return {
      count: 4,
      reasoning: 'Deep depletion needs comprehensive recovery.',
      types: ['soundbath', 'guided-practice', 'micro-practice', 'micro-practice']
    };
  }
  
  if (energyTier === 'managing') {
    if (calendarLoad === 'high') {
      return {
        count: 2,
        reasoning: 'Targeted support to sustain you through a busy day.',
        types: ['guided-practice', 'micro-practice']
      };
    }
    return {
      count: 3,
      reasoning: 'Balanced ritual to strengthen your foundation.',
      types: ['soundbath', 'guided-practice', 'micro-practice']
    };
  }
  
  if (energyTier === 'strong' || energyTier === 'peak') {
    if (calendarPressure === 'high') {
      return {
        count: 2,
        reasoning: 'Prime yourself for peak performance.',
        types: ['micro-practice', 'micro-practice']
      };
    }
    return {
      count: 1,
      reasoning: 'Light practice to maintain your optimal state.',
      types: ['micro-practice']
    };
  }
  
  return {
    count: 2,
    reasoning: 'Balanced support for your current state.',
    types: ['guided-practice', 'micro-practice']
  };
}

function getWhyNow(contentType: string, masteryType: MasteryType): string {
  const map: Record<string, Record<MasteryType, string>> = {
    'soundbath': {
      'pause': 'Deep immersion to restore calm and release tension',
      'flow': 'Soundscape to optimize mental clarity',
      'renewal': 'Restorative sound journey to recharge'
    },
    'guided-practice': {
      'pause': 'Structured practice to regulate your nervous system',
      'flow': 'Guided session to activate peak performance',
      'renewal': 'Restorative practice to rebuild energy'
    },
    'micro-practice': {
      'pause': 'Quick reset to downregulate before your next moment',
      'flow': 'Brief activation to prime your focus',
      'renewal': 'Fast recharge to sustain momentum'
    }
  };
  return map[contentType]?.[masteryType] || 'Practice aligned with your current needs';
}

export async function generateRecommendations(energyState: CurrentEnergyState): Promise<{
  practices: Recommendation[];
  recommendedCount: number;
  reasoning: string;
}> {
  if (!energyState.recommendation) {
    return { 
      practices: [],
      recommendedCount: 0,
      reasoning: 'Unable to generate recommendations - no energy state' 
    };
  }
  
  const practiceConfig = determineOptimalPracticeCount(energyState);
  const { primary, primarySubtype, secondary, secondarySubtype, contextStatement } = energyState.recommendation;
  
  const primaryTags = getMasteryTags(primary, primarySubtype);
  const secondaryTags = secondary ? getMasteryTags(secondary, secondarySubtype) : [];
  const recommendationTags = [...primaryTags, ...secondaryTags];
  
  const allContent = getContentByTags(recommendationTags);
  
  const scoredContent = allContent.map(content => ({
    content,
    score: matchesStructuredTags(content, primary, primarySubtype, recommendationTags)
  }));
  
  scoredContent.sort((a, b) => b.score - a.score);
  
  const practices: Recommendation[] = [];
  const usedIds = new Set<string>();
  
  for (const type of practiceConfig.types) {
    const matching = scoredContent.find(c => 
      c.content.contentType === type && !usedIds.has(c.content.id)
    );
    
    if (matching) {
      practices.push(createRecommendation(matching.content, primary, getWhyNow(type, primary)));
      usedIds.add(matching.content.id);
    }
  }
  
  return {
    practices,
    recommendedCount: practiceConfig.count,
    reasoning: `${contextStatement} ${practiceConfig.reasoning}`
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
