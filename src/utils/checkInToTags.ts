// Maps Daily Check-In outcomes to energy and recommendation tags

import { ENERGY_TAGS, STATE_TAGS, PRACTICE_TAGS } from './tagMappings';

export interface CheckInTagMapping {
  emotionTag: string;
  energyTag: string;
  element: string;
  stateTag: string;
  recommendationTags: string[];
}

export function mapCheckInToTags(checkInOutcome: string): CheckInTagMapping {
  const tagMap: Record<string, CheckInTagMapping> = {
    'pause': {
      emotionTag: 'tense',
      energyTag: ENERGY_TAGS.EXCESS_FIRE,
      element: 'fire',
      stateTag: STATE_TAGS.TENSE,
      recommendationTags: [
        PRACTICE_TAGS.FIRE_DOWN,
        PRACTICE_TAGS.GROUNDING,
        PRACTICE_TAGS.EARTH_UP,
        PRACTICE_TAGS.COOLING,
        PRACTICE_TAGS.NERVOUS_SYSTEM
      ]
    },
    'power-up': {
      emotionTag: 'fatigued',
      energyTag: ENERGY_TAGS.LOW_FIRE,
      element: 'earth',
      stateTag: STATE_TAGS.FATIGUED,
      recommendationTags: [
        PRACTICE_TAGS.FIRE_UP,
        PRACTICE_TAGS.ACTIVATION,
        PRACTICE_TAGS.EARTH_UP,
        PRACTICE_TAGS.PRE_PERFORMANCE
      ]
    },
    'presence': {
      emotionTag: 'scattered',
      energyTag: ENERGY_TAGS.EXCESS_AIR,
      element: 'air',
      stateTag: STATE_TAGS.SCATTERED,
      recommendationTags: [
        PRACTICE_TAGS.AIR_DOWN,
        PRACTICE_TAGS.CENTERING,
        PRACTICE_TAGS.FOCUS,
        PRACTICE_TAGS.MENTAL_CLARITY,
        PRACTICE_TAGS.GROUNDING
      ]
    },
    'calm': {
      emotionTag: 'anxious',
      energyTag: ENERGY_TAGS.EXCESS_AIR,
      element: 'air',
      stateTag: STATE_TAGS.ANXIOUS,
      recommendationTags: [
        PRACTICE_TAGS.FIRE_DOWN,
        PRACTICE_TAGS.GROUNDING,
        PRACTICE_TAGS.EARTH_UP,
        PRACTICE_TAGS.NERVOUS_SYSTEM,
        PRACTICE_TAGS.EMOTIONAL_BALANCE
      ]
    },
    'ready': {
      emotionTag: 'focused',
      energyTag: ENERGY_TAGS.BALANCED,
      element: 'balanced',
      stateTag: STATE_TAGS.BALANCED,
      recommendationTags: [
        PRACTICE_TAGS.FOCUS,
        PRACTICE_TAGS.MENTAL_CLARITY,
        PRACTICE_TAGS.PRE_PERFORMANCE,
        PRACTICE_TAGS.CENTERING
      ]
    }
  };
  
  return tagMap[checkInOutcome] || tagMap['pause'];
}

export function getEnergyStateFromCheckIn(checkInOutcome: string): {
  dominantElement: string;
  state: string;
  balance: number; // 0-100
} {
  const mapping = mapCheckInToTags(checkInOutcome);
  
  const balanceMap: Record<string, number> = {
    'pause': 40,      // stressed/overwhelmed = 40% balanced
    'power-up': 35,   // drained/tired = 35% balanced
    'presence': 50,   // scattered = 50% balanced
    'calm': 45,       // anxious = 45% balanced
    'ready': 85       // motivated/ready = 85% balanced
  };
  
  return {
    dominantElement: mapping.element,
    state: mapping.stateTag,
    balance: balanceMap[checkInOutcome] || 50
  };
}
