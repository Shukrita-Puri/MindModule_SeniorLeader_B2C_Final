/**
 * Content Recommendation Engine
 * 
 * Backend content tagging system for /recalibrate section:
 * - Tags all soundscapes, guided practices, micro-practices
 * - Maps content to Pause / Flow / Renewal mastery types
 * - Provides intelligent recommendations based on energy state
 */

import { MasteryType, MasterySubtype } from './energyStateScoring';

// ==================== CONTENT TAG DEFINITIONS ====================

export interface ContentTags {
  masteryTypes: MasteryType[];              // Which mastery this serves (pause/flow/renewal)
  masterySubtypes: MasterySubtype[];        // Specific subtypes (grounding/focus/etc)
  intensity: 'gentle' | 'moderate' | 'intense';
  duration: number;                         // Minutes
  bestFor: string[];                        // Use cases
}

export const CONTENT_TAG_MAP: Record<string, ContentTags> = {
  // ==================== SOUNDSCAPES ====================
  
  'tibetan-singing-bowls': {
    masteryTypes: ['pause', 'renewal'],
    masterySubtypes: ['deep-calm', 'restore-resilience'],
    intensity: 'gentle',
    duration: 10,
    bestFor: ['depleted', 'evening', 'deep-rest']
  },
  
  'himalayan-monastery-resonance': {
    masteryTypes: ['pause', 'flow'],
    masterySubtypes: ['grounding', 'focus'],
    intensity: 'gentle',
    duration: 15,
    bestFor: ['managing', 'strong', 'morning', 'clarity']
  },
  
  'earth-resonance-grounding': {
    masteryTypes: ['pause', 'renewal'],
    masterySubtypes: ['grounding', 'restore-resilience'],
    intensity: 'moderate',
    duration: 12,
    bestFor: ['depleted', 'managing', 'grounding']
  },
  
  'harmonic-calm-foundation': {
    masteryTypes: ['pause'],
    masterySubtypes: ['deep-calm', 'composure'],
    intensity: 'gentle',
    duration: 10,
    bestFor: ['pause', 'calm', 'stress-reduction']
  },
  
  'forest-bathing-restoration': {
    masteryTypes: ['renewal', 'pause'],
    masterySubtypes: ['restore-resilience', 'deep-calm'],
    intensity: 'gentle',
    duration: 15,
    bestFor: ['depleted', 'renewal', 'restoration']
  },
  
  'cathedral-choir-flow': {
    masteryTypes: ['flow'],
    masterySubtypes: ['focus', 'executive-presence'],
    intensity: 'moderate',
    duration: 20,
    bestFor: ['strong', 'peak', 'flow-state']
  },
  
  'monastic-resonance-stillness': {
    masteryTypes: ['flow', 'pause'],
    masterySubtypes: ['focus', 'clarity', 'grounding'],
    intensity: 'moderate',
    duration: 15,
    bestFor: ['managing', 'strong', 'clarity']
  },
  
  'energised-focus-didgeridoo-bowls': {
    masteryTypes: ['flow', 'renewal'],
    masterySubtypes: ['focus', 'reset-energy'],
    intensity: 'moderate',
    duration: 15,
    bestFor: ['power-up', 'activate', 'morning']
  },
  
  'ina-night-fields': {
    masteryTypes: ['pause', 'renewal'],
    masterySubtypes: ['deep-calm', 'restore-resilience'],
    intensity: 'gentle',
    duration: 10,
    bestFor: ['evening', 'wind-down', 'sleep-prep']
  },
  
  // ==================== GUIDED PRACTICES ====================
  
  'tactical-grounding-practice': {
    masteryTypes: ['pause'],
    masterySubtypes: ['grounding', 'composure'],
    intensity: 'moderate',
    duration: 5,
    bestFor: ['pause', 'grounding', 'calm']
  },
  
  'power-breathing-protocol': {
    masteryTypes: ['flow', 'renewal'],
    masterySubtypes: ['reset-energy', 'focus'],
    intensity: 'intense',
    duration: 5,
    bestFor: ['power-up', 'activate', 'energize']
  },
  
  'recovery-breathing-practice': {
    masteryTypes: ['renewal', 'pause'],
    masterySubtypes: ['restore-resilience', 'deep-calm'],
    intensity: 'gentle',
    duration: 7,
    bestFor: ['depleted', 'rest', 'recovery']
  },
  
  'physiological-sigh-reset': {
    masteryTypes: ['pause'],
    masterySubtypes: ['composure', 'clarity'],
    intensity: 'gentle',
    duration: 3,
    bestFor: ['pause', 'calm', 'stress-relief']
  },
  
  'box-breathing-foundation': {
    masteryTypes: ['pause', 'flow'],
    masterySubtypes: ['grounding', 'focus'],
    intensity: 'gentle',
    duration: 5,
    bestFor: ['managing', 'grounding', 'foundation']
  },
  
  'clarity-breath-protocol': {
    masteryTypes: ['flow', 'pause'],
    masterySubtypes: ['focus', 'clarity'],
    intensity: 'moderate',
    duration: 5,
    bestFor: ['presence', 'clarity', 'focus']
  },
  
  'evening-wind-down-breathwork': {
    masteryTypes: ['pause', 'renewal'],
    masterySubtypes: ['deep-calm', 'restore-resilience'],
    intensity: 'gentle',
    duration: 7,
    bestFor: ['evening', 'wind-down', 'rest']
  },
  
  'warrior-breath-activation': {
    masteryTypes: ['flow', 'renewal'],
    masterySubtypes: ['reset-energy', 'executive-presence'],
    intensity: 'intense',
    duration: 5,
    bestFor: ['power-up', 'activate', 'performance']
  },
  
  // ==================== MICRO PRACTICES - MINDSET ====================
  
  'mindset-good-enough-perfection': {
    masteryTypes: ['pause'],
    masterySubtypes: ['composure', 'clarity'],
    intensity: 'gentle',
    duration: 2,
    bestFor: ['pause', 'perfectionism', 'pressure']
  },
  
  'mindset-energy-budget': {
    masteryTypes: ['pause', 'renewal'],
    masterySubtypes: ['grounding', 'restore-resilience'],
    intensity: 'gentle',
    duration: 2,
    bestFor: ['depleted', 'managing', 'energy-management']
  },
  
  'mindset-meeting-physics': {
    masteryTypes: ['pause', 'flow'],
    masterySubtypes: ['clarity', 'focus'],
    intensity: 'gentle',
    duration: 2,
    bestFor: ['high-load', 'calendar-pressure', 'meetings']
  },
  
  'mindset-transition-ritual': {
    masteryTypes: ['pause'],
    masterySubtypes: ['grounding', 'clarity'],
    intensity: 'gentle',
    duration: 2,
    bestFor: ['context-switching', 'transitions', 'clarity']
  },
  
  'mindset-cognitive-load': {
    masteryTypes: ['pause'],
    masterySubtypes: ['clarity', 'composure'],
    intensity: 'gentle',
    duration: 2,
    bestFor: ['high-load', 'scattered', 'overwhelm']
  },
  
  // ==================== MICRO PRACTICES - TOOLS ====================
  
  'tool-5-min-tactical-nap': {
    masteryTypes: ['renewal'],
    masterySubtypes: ['reset-energy', 'restore-resilience'],
    intensity: 'gentle',
    duration: 5,
    bestFor: ['depleted', 'power-up', 'afternoon']
  },
  
  'tool-walk-between-contexts': {
    masteryTypes: ['pause', 'flow'],
    masterySubtypes: ['grounding', 'clarity'],
    intensity: 'moderate',
    duration: 5,
    bestFor: ['transitions', 'grounding', 'context-switching']
  },
  
  'tool-1-min-reset-protocol': {
    masteryTypes: ['pause'],
    masterySubtypes: ['composure', 'grounding'],
    intensity: 'moderate',
    duration: 1,
    bestFor: ['pause', 'quick-reset', 'stress']
  },
  
  'tool-breathing-between-meetings': {
    masteryTypes: ['pause'],
    masterySubtypes: ['composure', 'clarity'],
    intensity: 'gentle',
    duration: 2,
    bestFor: ['calendar-pressure', 'back-to-back', 'pause']
  },
  
  'tool-power-posing': {
    masteryTypes: ['flow'],
    masterySubtypes: ['executive-presence', 'focus'],
    intensity: 'moderate',
    duration: 2,
    bestFor: ['presence', 'confidence', 'performance']
  },
  
  'tool-micro-meditation': {
    masteryTypes: ['pause'],
    masterySubtypes: ['grounding', 'clarity'],
    intensity: 'gentle',
    duration: 3,
    bestFor: ['pause', 'grounding', 'clarity']
  },
  
  'tool-energy-audit': {
    masteryTypes: ['pause', 'renewal'],
    masterySubtypes: ['clarity', 'restore-resilience'],
    intensity: 'gentle',
    duration: 5,
    bestFor: ['managing', 'depleted', 'awareness']
  },
};

// ==================== RECOMMENDATION ENGINE ====================

export interface ContentRecommendation {
  contentId: string;
  masteryType: MasteryType;
  masterySubtype?: MasterySubtype;
  relevanceScore: number;
  reason: string;
}

export function getRecommendedContent(
  primaryMastery: MasteryType,
  primarySubtype?: MasterySubtype,
  secondaryMastery?: MasteryType,
  contentType?: 'soundscape' | 'guided-practice' | 'micro-practice',
  maxResults: number = 3
): ContentRecommendation[] {
  
  const recommendations: ContentRecommendation[] = [];
  
  // Score all content
  Object.entries(CONTENT_TAG_MAP).forEach(([contentId, tags]) => {
    // Filter by content type if specified
    if (contentType) {
      const isMatch = 
        (contentType === 'soundscape' && contentId.includes('tibetan') || contentId.includes('himalayan') || contentId.includes('earth') || contentId.includes('harmonic') || contentId.includes('forest') || contentId.includes('cathedral') || contentId.includes('monastic') || contentId.includes('energised') || contentId.includes('ina')) ||
        (contentType === 'guided-practice' && contentId.includes('breathing') || contentId.includes('breath')) ||
        (contentType === 'micro-practice' && (contentId.includes('mindset') || contentId.includes('tool')));
      
      if (!isMatch) return;
    }
    
    let relevanceScore = 0;
    let reason = '';
    
    // Primary mastery match (high weight)
    if (tags.masteryTypes.includes(primaryMastery)) {
      relevanceScore += 50;
      
      // Primary subtype match (bonus)
      if (primarySubtype && tags.masterySubtypes.includes(primarySubtype)) {
        relevanceScore += 30;
        reason = `Perfect match for ${primaryMastery} (${primarySubtype})`;
      } else {
        reason = `Excellent for ${primaryMastery}`;
      }
    }
    
    // Secondary mastery match (medium weight)
    if (secondaryMastery && tags.masteryTypes.includes(secondaryMastery)) {
      relevanceScore += 20;
      if (!reason) reason = `Good for ${secondaryMastery}`;
    }
    
    // Add recommendation if relevant
    if (relevanceScore > 0) {
      recommendations.push({
        contentId,
        masteryType: primaryMastery,
        masterySubtype: primarySubtype,
        relevanceScore,
        reason
      });
    }
  });
  
  // Sort by relevance and return top N
  return recommendations
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxResults);
}

// ==================== CONTENT METADATA HELPERS ====================

export function getContentDuration(contentId: string): number {
  return CONTENT_TAG_MAP[contentId]?.duration || 10;
}

export function getContentIntensity(contentId: string): 'gentle' | 'moderate' | 'intense' {
  return CONTENT_TAG_MAP[contentId]?.intensity || 'moderate';
}

export function getContentMasteryTypes(contentId: string): MasteryType[] {
  return CONTENT_TAG_MAP[contentId]?.masteryTypes || [];
}

export function filterContentByMastery(masteryType: MasteryType): string[] {
  return Object.entries(CONTENT_TAG_MAP)
    .filter(([_, tags]) => tags.masteryTypes.includes(masteryType))
    .map(([contentId, _]) => contentId);
}
