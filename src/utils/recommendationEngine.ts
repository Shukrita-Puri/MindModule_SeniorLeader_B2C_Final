// Recommendation Engine - Generates personalized practice recommendations using database tagging

import { supabase } from "@/integrations/supabase/client";
import { CurrentEnergyState } from './energyStateEngine';
import { type MasteryType, type MasterySubtype } from './energyStateScoring';
import { 
  CHECKIN_TAGS, 
  META_SKILLS,
  type MetaSkillKey,
  type CheckinTagKey,
  type ContentMetaSkills,
  type ContentSubSkills,
  type ContentCheckinTags,
  type ContentMasteryCategory
} from "@/constants/contentTags";

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
  metaSkills?: ContentMetaSkills;
  checkinTags?: ContentCheckinTags;
  usageOccasions?: string[];
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
  
  // Determine check-in tags based on energy state
  const checkinOutcome = (energyState as any).checkInOutcome; // e.g., 'stressed_overwhelmed'
  const usageOccasion = (energyState as any).usageOccasion; // e.g., 'pre_meeting' (can be extended later)
  const userGrowthPriorities = (energyState as any).userGrowthPriorities || []; // Meta skills from onboarding (can be extended later)
  
  console.log(`🎯 Fetching recommendations for ${primary} (check-in: ${checkinOutcome}, occasion: ${usageOccasion})`);
  
  // Get all active content with metadata from database
  const { data: allContent, error } = await supabase
    .from('sanctuary_content')
    .select(`
      *,
      sanctuary_content_metadata (*)
    `)
    .eq('is_active', true);
    
  if (error) {
    console.error('Error fetching content:', error);
    return { 
      practices: [],
      recommendedCount: 0,
      reasoning: 'Unable to fetch content from database' 
    };
  }
  
  if (!allContent || allContent.length === 0) {
    console.warn('⚠️ No content found in database');
    return { 
      practices: [],
      recommendedCount: 0,
      reasoning: 'No content available' 
    };
  }
  
  // Score and filter content based on new tagging system
  const scoredContent = allContent
    .map(content => {
      const metadata = Array.isArray(content.sanctuary_content_metadata) 
        ? content.sanctuary_content_metadata[0] 
        : content.sanctuary_content_metadata;
      
      let score = 0;
      
      // 1. Check-in tag matching (highest priority)
      if (checkinOutcome && metadata?.checkin_tags) {
        const checkinTags = metadata.checkin_tags as ContentCheckinTags;
        if (checkinTags.primary?.includes(checkinOutcome as CheckinTagKey)) {
          score += 50; // Strong match
        } else if (checkinTags.secondary?.includes(checkinOutcome as CheckinTagKey)) {
          score += 25; // Secondary match
        }
      }
      
      // 2. Usage occasion matching
      if (usageOccasion && metadata?.usage_occasions) {
        const occasions = metadata.usage_occasions as string[];
        if (occasions.includes(usageOccasion)) {
          score += 40;
        }
      }
      
      // 3. Meta skill alignment (based on user's growth priorities)
      if (userGrowthPriorities.length > 0 && metadata?.meta_skills) {
        const metaSkills = metadata.meta_skills as ContentMetaSkills;
        const primaryMatches = metaSkills.primary?.filter((skill: MetaSkillKey) => 
          userGrowthPriorities.includes(skill)
        ).length || 0;
        const secondaryMatches = metaSkills.secondary?.filter((skill: MetaSkillKey) => 
          userGrowthPriorities.includes(skill)
        ).length || 0;
        
        score += primaryMatches * 30;
        score += secondaryMatches * 15;
      }
      
      // 4. Mastery category matching
      if (metadata?.mastery_category) {
        const masteryCategory = metadata.mastery_category as ContentMasteryCategory;
        if (masteryCategory.primary === primary) {
          score += 35;
        } else if (masteryCategory.secondary?.includes(primary as any)) {
          score += 20;
        }
      }
      
      // 5. Legacy structured tags matching (fallback for old content)
      const primaryTags = getMasteryTags(primary, primarySubtype);
      score += matchesStructuredTags(content, primary, primarySubtype, primaryTags);
      
      // 6. Category match
      if (content.category === primary) {
        score += 15;
      }
      
      return {
        content,
        metadata,
        score
      };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score);
    
  console.log(`🎯 ${scoredContent.length} relevant items after filtering`);
  
  const practices: Recommendation[] = [];
  const usedIds = new Set<string>();
  
  // First pass: try to match exact content types
  for (const type of practiceConfig.types) {
    const matching = scoredContent.find(c => 
      c.content.content_type === type && !usedIds.has(c.content.id)
    );
    
    if (matching) {
      practices.push(createRecommendation(matching.content, primary, getWhyNow(type, primary), matching.metadata));
      usedIds.add(matching.content.id);
    }
  }
  
  // Second pass: fill remaining slots with best alternatives
  while (practices.length < practiceConfig.count) {
    const nextBest = scoredContent.find(c => !usedIds.has(c.content.id));
    
    if (!nextBest) {
      console.warn(`⚠️ Only ${practices.length} practices available, requested ${practiceConfig.count}`);
      break;
    }
    
    practices.push(createRecommendation(
      nextBest.content, 
      primary, 
      getWhyNow(nextBest.content.content_type, primary),
      nextBest.metadata
    ));
    usedIds.add(nextBest.content.id);
  }
  
  console.log('✅ Recommendations:', {
    requested: practiceConfig.count,
    returned: practices.length,
    types: practices.map(p => p.contentType)
  });
  
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
  whyNow: string,
  metadata: any
): Recommendation {
  return {
    id: content.id,
    title: content.title,
    contentType: content.content_type,
    category: content.category || category,
    duration: content.duration,
    thumbnail: content.thumbnail_url || content.thumbnail,
    tags: content.tags || [],
    whyNow,
    matchScore: 85,
    metaSkills: metadata?.meta_skills,
    checkinTags: metadata?.checkin_tags,
    usageOccasions: metadata?.usage_occasions
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
