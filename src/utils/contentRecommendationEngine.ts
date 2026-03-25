/**
 * Content Recommendation Engine
 * 
 * Backend content tagging system for /recalibrate section:
 * - Tags all soundscapes, guided practices, micro-practices
 * - Maps content to Pause / Flow / Recharge mastery types
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
  title: string;
  route: string;
  duration: number;
  intensity: 'gentle' | 'moderate' | 'intense';
  masteryType: MasteryType;
  contentType: 'soundscape' | 'guided-practice' | 'micro-practice';
  relevanceScore: number;
}

// Helper function to get content title
function getContentTitle(contentId: string): string {
  const titleMap: Record<string, string> = {
    'tibetan-singing-bowls': 'Tibetan Singing Bowls',
    'himalayan-monastery-resonance': 'Himalayan Monastery',
    'earth-resonance-grounding': 'Earth Resonance',
    'harmonic-calm-foundation': 'Harmonic Calm',
    'forest-bathing-restoration': 'Forest Bathing',
    'cathedral-choir-flow': 'Cathedral Choir',
    'monastic-resonance-stillness': 'Monastic Resonance',
    'energised-focus-didgeridoo-bowls': 'Energized Focus',
    'ina-night-fields': 'Night Fields',
    'tactical-grounding-practice': 'Tactical Grounding',
    'power-breathing-protocol': 'Power Breathing',
    'recovery-breathing-practice': 'Recovery Breathing',
    'physiological-sigh-reset': 'Physiological Sigh',
    'box-breathing-flow-protocol': 'Box Breathing',
    'micro-composure': 'Micro Composure',
    'micro-clarity': 'Micro Clarity',
    'micro-grounding': 'Micro Grounding',
    'micro-focus': 'Micro Focus',
    'micro-reset': 'Micro Reset'
  };
  return titleMap[contentId] || contentId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Helper function to get content route
function getContentRoute(contentId: string): string {
  // Determine route based on content ID pattern
  if (contentId.includes('tibetan') || contentId.includes('monastery') || contentId.includes('cathedral') || 
      contentId.includes('earth') || contentId.includes('harmonic') || contentId.includes('forest') || 
      contentId.includes('monastic') || contentId.includes('ina') || contentId.includes('didgeridoo')) {
    return `/soundscapes`;
  }
  if (contentId.includes('breathing') || contentId.includes('grounding-practice')) {
    return `/guided-practices`;
  }
  return `/micro-practices`;
}

export function getRecommendedContent(
  primaryMastery: MasteryType,
  primarySubtype?: MasterySubtype,
  maxResults: number = 3
): ContentRecommendation[] {
  
  const allContent = Object.entries(CONTENT_TAG_MAP);
  
  const scoredContent = allContent.map(([contentId, tags]) => {
    let score = 0;
    
    // Exact mastery type match: +10
    if (tags.masteryTypes.includes(primaryMastery)) {
      score += 10;
      
      // If it's the FIRST mastery type (primary): +5 bonus
      if (tags.masteryTypes[0] === primaryMastery) {
        score += 5;
      }
    }
    
    // Exact subtype match: +15 (higher priority)
    if (primarySubtype && tags.masterySubtypes.includes(primarySubtype)) {
      score += 15;
      
      // If it's the FIRST subtype (primary): +5 bonus
      if (tags.masterySubtypes[0] === primarySubtype) {
        score += 5;
      }
    }
    
    // No match: exclude
    if (score === 0) return null;
    
    // Determine content type
    let contentType: 'soundscape' | 'guided-practice' | 'micro-practice' = 'soundscape';
    if (contentId.includes('breathing') || contentId.includes('grounding-practice')) {
      contentType = 'guided-practice';
    } else if (contentId.includes('micro-')) {
      contentType = 'micro-practice';
    }
    
    return {
      contentId,
      title: getContentTitle(contentId),
      route: getContentRoute(contentId),
      duration: tags.duration,
      intensity: tags.intensity,
      masteryType: tags.masteryTypes[0],
      contentType,
      relevanceScore: score
    };
  })
  .filter((item): item is ContentRecommendation => item !== null)
  .sort((a, b) => b.relevanceScore - a.relevanceScore);
  
  return scoredContent.slice(0, maxResults);
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
