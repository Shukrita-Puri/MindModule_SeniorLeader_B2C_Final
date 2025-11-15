import { sanctuaryContent, type SanctuaryContent } from '@/data/practicesAndSoundscapes';
import { CONTEXT_TAGS, ENERGY_TAGS, STATE_TAGS, PRACTICE_TAGS } from './tagMappings';

interface StructuredTagQuery {
  pillar?: 'pause' | 'flow' | 'renewal';
  masterySubtypes?: string[];
  goalTags?: string[];
  physioTarget?: string[];
  contextTags?: string[];
  intensityLevel?: 'low' | 'medium' | 'high';
  energyDirection?: string;
  durationRange?: { min: number; max: number };
  equipmentRequired?: string[];
}

interface ContentScore {
  content: SanctuaryContent;
  score: number;
  matchReasons: string[];
}

/**
 * Match content using structured tagging system
 * Returns scored and ranked content based on tag alignment
 */
export function getContentByStructuredTags(query: StructuredTagQuery): SanctuaryContent[] {
  const scoredContent: ContentScore[] = [];

  sanctuaryContent.forEach((content) => {
    let score = 0;
    const matchReasons: string[] = [];

    // Filter by duration (hard constraint)
    if (query.durationRange) {
      if (content.duration < query.durationRange.min || content.duration > query.durationRange.max) {
        return; // Skip content outside duration range
      }
    }

    // Pillar match (highest priority)
    if (query.pillar && content.structuredTags?.pillar === query.pillar) {
      score += 30;
      matchReasons.push('pillar_match');
    }

    // Mastery subtype alignment
    if (query.masterySubtypes && content.structuredTags?.masterySubtypes) {
      const subtypeOverlap = query.masterySubtypes.filter(s =>
        content.structuredTags?.masterySubtypes.includes(s)
      ).length;
      score += subtypeOverlap * 15;
      if (subtypeOverlap > 0) matchReasons.push('subtype_match');
    }

    // Goal tags alignment
    if (query.goalTags && content.structuredTags?.goalTags) {
      const goalOverlap = query.goalTags.filter(g =>
        content.structuredTags?.goalTags.includes(g)
      ).length;
      score += goalOverlap * 10;
      if (goalOverlap > 0) matchReasons.push('goal_match');
    }

    // Physiological target alignment
    if (query.physioTarget && content.structuredTags?.physioTarget) {
      const physioOverlap = query.physioTarget.filter(p =>
        content.structuredTags?.physioTarget.includes(p)
      ).length;
      score += physioOverlap * 8;
      if (physioOverlap > 0) matchReasons.push('physio_match');
    }

    // Context tags alignment
    if (query.contextTags && content.structuredTags?.contextTags) {
      const contextOverlap = query.contextTags.filter(c =>
        content.structuredTags?.contextTags.includes(c)
      ).length;
      score += contextOverlap * 12;
      if (contextOverlap > 0) matchReasons.push('context_match');
    }

    // Intensity level match
    if (query.intensityLevel && content.structuredTags?.intensityLevel === query.intensityLevel) {
      score += 8;
      matchReasons.push('intensity_match');
    }

    // Energy direction alignment
    if (query.energyDirection && content.structuredTags?.energyDirection === query.energyDirection) {
      score += 10;
      matchReasons.push('energy_direction_match');
    }

    // Equipment requirement check (prefer no equipment)
    if (query.equipmentRequired && content.structuredTags?.equipment) {
      const hasRequiredEquipment = query.equipmentRequired.every(eq =>
        content.structuredTags?.equipment.includes(eq)
      );
      if (hasRequiredEquipment) {
        score += 5;
      } else if (content.structuredTags.equipment.includes('none')) {
        score += 10; // Bonus for no equipment needed
        matchReasons.push('no_equipment_needed');
      }
    }

    // Only include content with some match
    if (score > 0) {
      scoredContent.push({ content, score, matchReasons });
    }
  });

  // Sort by score descending and return top matches
  return scoredContent
    .sort((a, b) => b.score - a.score)
    .slice(0, 5) // Return top 5 matches
    .map(sc => sc.content);
}

/**
 * Map intervention contexts to structured tag queries
 */
export function interventionToStructuredQuery(
  interventionType: string,
  contextData?: { urgencyLevel?: string; timeWindow?: string }
): StructuredTagQuery {
  const queries: Record<string, StructuredTagQuery> = {
    'meeting-gap': {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'composure', 'deep-calm'],
      goalTags: ['grounding', 'breathing_regulation', 'mental_clarity', 'reset'],
      physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce'],
      contextTags: ['between_meetings', 'quick_reset'],
      intensityLevel: 'low',
      energyDirection: 'stabilize',
      durationRange: { min: 1, max: 5 },
      equipmentRequired: ['none'],
    },

    'pre-performance': {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize', 'maintain-peak'],
      goalTags: ['focus', 'confidence', 'decision_readiness', 'mental_clarity'],
      physioTarget: ['alertness_increase', 'sympathetic_modulation', 'cortisol_optimize'],
      contextTags: ['pre_meeting', 'pre_performance'],
      intensityLevel: 'medium',
      energyDirection: 'uplift',
      durationRange: { min: 2, max: 7 },
    },

    'recovery': {
      pillar: 'renewal',
      masterySubtypes: ['recharge', 'restore', 'refresh'],
      goalTags: ['recovery', 'restoration', 'energy_renewal', 'nervous_system_calm'],
      physioTarget: ['parasympathetic_activation', 'hrv_recovery', 'cortisol_reduce'],
      contextTags: ['post_meeting', 'recovery_window'],
      intensityLevel: 'low',
      energyDirection: 'downshift',
      durationRange: { min: 3, max: 10 },
    },

    'sleep-recovery': {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'deep-rest'],
      goalTags: ['recovery', 'restoration', 'sleep_preparation', 'nervous_system_calm'],
      physioTarget: ['parasympathetic_activation', 'hrv_recovery', 'cortisol_reduce', 'sleep_readiness'],
      contextTags: ['evening_winddown'],
      intensityLevel: 'low',
      energyDirection: 'downshift',
      durationRange: { min: 5, max: 15 },
    },

    'readiness-boost': {
      pillar: 'flow',
      masterySubtypes: ['activate', 'optimize'],
      goalTags: ['energize', 'alertness', 'activation', 'mental_clarity'],
      physioTarget: ['alertness_increase', 'sympathetic_modulation'],
      contextTags: ['morning_ritual', 'afternoon_slump'],
      intensityLevel: 'medium',
      energyDirection: 'uplift',
      durationRange: { min: 3, max: 8 },
    },

    'stress-regulation': {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'composure', 'emotional-reset'],
      goalTags: ['breathing_regulation', 'emotional_balance', 'nervous_system_calm', 'composure'],
      physioTarget: ['hrv_increase', 'hr_decrease', 'cortisol_reduce', 'parasympathetic_activation'],
      contextTags: ['stress_response', 'quick_reset'],
      intensityLevel: 'low',
      energyDirection: 'stabilize',
      durationRange: { min: 2, max: 7 },
    },

    'energy-protection': {
      pillar: 'pause',
      masterySubtypes: ['grounding', 'maintain-calm', 'composure'],
      goalTags: ['grounding', 'boundaries', 'nervous_system_calm', 'emotional_balance'],
      physioTarget: ['hrv_maintain', 'cortisol_reduce'],
      contextTags: ['between_meetings', 'pre_meeting'],
      intensityLevel: 'low',
      energyDirection: 'stabilize',
      durationRange: { min: 2, max: 5 },
    },

    'protective-recovery': {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'recharge'],
      goalTags: ['recovery', 'restoration', 'nervous_system_calm'],
      physioTarget: ['parasympathetic_activation', 'hrv_recovery', 'cortisol_reduce'],
      contextTags: ['recovery_window', 'between_meetings'],
      intensityLevel: 'low',
      energyDirection: 'downshift',
      durationRange: { min: 3, max: 8 },
    },

    'energy-conservation': {
      pillar: 'pause',
      masterySubtypes: ['maintain-calm', 'grounding'],
      goalTags: ['conservation', 'breathing_regulation', 'pacing'],
      physioTarget: ['hrv_maintain', 'hr_decrease'],
      contextTags: ['quick_reset', 'pacing_strategy'],
      intensityLevel: 'low',
      energyDirection: 'stabilize',
      durationRange: { min: 2, max: 5 },
    },

    'cumulative-recovery': {
      pillar: 'renewal',
      masterySubtypes: ['restore', 'deep-rest', 'recharge'],
      goalTags: ['recovery', 'restoration', 'nervous_system_calm', 'energy_renewal'],
      physioTarget: ['parasympathetic_activation', 'hrv_recovery', 'cortisol_reduce', 'sleep_readiness'],
      contextTags: ['evening_winddown', 'recovery_window'],
      intensityLevel: 'low',
      energyDirection: 'downshift',
      durationRange: { min: 5, max: 15 },
    },
  };

  // Adjust for urgency if critical
  const baseQuery = queries[interventionType] || queries['meeting-gap'];
  
  if (contextData?.urgencyLevel === 'critical') {
    // For critical situations, prioritize quicker, more impactful practices
    if (baseQuery.durationRange) {
      baseQuery.durationRange.max = Math.min(baseQuery.durationRange.max, 5);
    }
    // Bump up intensity slightly
    if (baseQuery.intensityLevel === 'low') {
      baseQuery.intensityLevel = 'medium';
    }
  }

  return baseQuery;
}

/**
 * Get fallback content using legacy tag system
 * Used when structured tags aren't available
 */
export function getFallbackContent(tags: string[]): SanctuaryContent[] {
  return sanctuaryContent
    .filter(content => {
      // Check legacy tags
      const tagOverlap = tags.filter(tag => content.tags.includes(tag)).length;
      return tagOverlap > 0;
    })
    .slice(0, 5);
}
