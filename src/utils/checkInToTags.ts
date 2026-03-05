// Maps Daily Check-In outcomes to energy and recommendation tags

import { ENERGY_TAGS, STATE_TAGS, PRACTICE_TAGS } from './tagMappings';

export interface CheckInTagMapping {
  emotionTag: string;
  energyTag: string;
  stateTag: string;
  recommendationTags: string[];
}

export function mapCheckInToTags(checkInOutcome: string): CheckInTagMapping {
  const tagMap: Record<string, CheckInTagMapping> = {
    // Modern outcomes (from DailyCheckIn.tsx)
    'overwhelmed': {
      emotionTag: 'tense',
      energyTag: ENERGY_TAGS.EXCESS_FIRE,
      stateTag: STATE_TAGS.TENSE,
      recommendationTags: [
        PRACTICE_TAGS.FIRE_DOWN,
        PRACTICE_TAGS.GROUNDING,
        PRACTICE_TAGS.EARTH_UP,
        PRACTICE_TAGS.COOLING,
        PRACTICE_TAGS.NERVOUS_SYSTEM
      ]
    },
    'drained': {
      emotionTag: 'fatigued',
      energyTag: ENERGY_TAGS.LOW_FIRE,
      stateTag: STATE_TAGS.FATIGUED,
      recommendationTags: [
        PRACTICE_TAGS.FIRE_UP,
        PRACTICE_TAGS.ACTIVATION,
        PRACTICE_TAGS.EARTH_UP,
        PRACTICE_TAGS.PRE_PERFORMANCE
      ]
    },
    'scattered': {
      emotionTag: 'scattered',
      energyTag: ENERGY_TAGS.EXCESS_AIR,
      stateTag: STATE_TAGS.SCATTERED,
      recommendationTags: [
        PRACTICE_TAGS.AIR_DOWN,
        PRACTICE_TAGS.CENTERING,
        PRACTICE_TAGS.FOCUS,
        PRACTICE_TAGS.MENTAL_CLARITY,
        PRACTICE_TAGS.GROUNDING
      ]
    },
    'steady': {
      emotionTag: 'steady',
      energyTag: ENERGY_TAGS.BALANCED,
      stateTag: STATE_TAGS.BALANCED,
      recommendationTags: [
        PRACTICE_TAGS.GROUNDING,
        PRACTICE_TAGS.CENTERING,
        PRACTICE_TAGS.EMOTIONAL_BALANCE,
        PRACTICE_TAGS.MENTAL_CLARITY
      ]
    },
    'focused': {
      emotionTag: 'focused',
      energyTag: ENERGY_TAGS.BALANCED,
      stateTag: STATE_TAGS.BALANCED,
      recommendationTags: [
        PRACTICE_TAGS.GROUNDING,
        PRACTICE_TAGS.MENTAL_CLARITY,
        PRACTICE_TAGS.FOCUS,
        PRACTICE_TAGS.CENTERING
      ]
    },
    // Legacy outcome aliases (kept for backward compat with existing DB records)
    'pause': {
      emotionTag: 'tense',
      energyTag: ENERGY_TAGS.EXCESS_FIRE,
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
      stateTag: STATE_TAGS.BALANCED,
      recommendationTags: [
        PRACTICE_TAGS.GROUNDING,
        PRACTICE_TAGS.MENTAL_CLARITY,
        PRACTICE_TAGS.FOCUS,
        PRACTICE_TAGS.CENTERING
      ]
    }
  };
  
  return tagMap[checkInOutcome] || tagMap['overwhelmed'];
}

export function getEnergyStateFromCheckIn(checkInOutcome: string): {
  state: string;
  balance: number; // 0-100
} {
  const mapping = mapCheckInToTags(checkInOutcome);
  
  const balanceMap: Record<string, number> = {
    // Modern outcomes
    'overwhelmed': 40,
    'drained': 35,
    'scattered': 50,
    'steady': 70,
    'focused': 85,
    // Legacy aliases
    'pause': 40,
    'power-up': 35,
    'presence': 50,
    'calm': 45,
    'ready': 85
  };
  
  return {
    state: mapping.stateTag,
    balance: balanceMap[checkInOutcome] || 50
  };
}
