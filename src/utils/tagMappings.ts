// 4-Layer Tagging System for Energy Intelligence Operating System

// ===== LAYER 1: CONTEXT TAGS =====
// Tags automatically derived from check-in, calendar, Oura, and time data

export const CONTEXT_TAGS = {
  // Workload
  HIGH_DECISION_DENSITY: 'high_decision_density',
  BACK_TO_BACK_MEETINGS: 'back_to_back_meetings',
  LIGHT_SCHEDULE: 'light_schedule',
  
  // Meeting Role
  LEADER_MODE: 'leader_mode',
  OBSERVER_MODE: 'observer_mode',
  FACILITATOR_MODE: 'facilitator_mode',
  
  // Timing
  EARLY_MORNING: 'early_morning',
  MID_MORNING: 'mid_morning',
  AFTERNOON_DIP: 'afternoon_dip',
  EVENING_FOCUS: 'evening_focus',
  LATE_NIGHT: 'late_night',
  
  // Readiness (from Oura)
  LOW_RECOVERY: 'low_recovery',
  OPTIMAL_ENERGY: 'optimal_energy',
  FATIGUED: 'fatigued',
  WELL_RESTED: 'well_rested',
  
  // Meeting Type
  BOARD_MEETING: 'board_meeting',
  CLIENT_PITCH: 'client_pitch',
  TEAM_REVIEW: 'team_review',
  ONE_ON_ONE: 'one_on_one',
  STRATEGY_SESSION: 'strategy_session',
  NEGOTIATION: 'negotiation',
} as const;

// ===== LAYER 2: ENERGY TAGS (Ancient Wisdom Translation) =====
// Translates context into energetic qualities based on 5 Elements

export const ENERGY_TAGS = {
  // Fire - Drive, Decision, Clarity
  FIRE: 'fire',
  FIRE_UP: 'fire_up',
  FIRE_DOWN: 'fire_down',
  EXCESS_FIRE: 'excess_fire',
  LOW_FIRE: 'low_fire',
  
  // Earth - Stability, Grounding
  EARTH: 'earth',
  EARTH_UP: 'earth_up',
  EARTH_DOWN: 'earth_down',
  EXCESS_EARTH: 'excess_earth',
  LOW_EARTH: 'low_earth',
  
  // Water - Flow, Adaptability
  WATER: 'water',
  WATER_UP: 'water_up',
  WATER_DOWN: 'water_down',
  EXCESS_WATER: 'excess_water',
  LOW_WATER: 'low_water',
  
  // Air - Creativity, Ideation
  AIR: 'air',
  AIR_UP: 'air_up',
  AIR_DOWN: 'air_down',
  EXCESS_AIR: 'excess_air',
  LOW_AIR: 'low_air',
  
  // Ether - Presence, Spaciousness
  ETHER: 'ether',
  ETHER_UP: 'ether_up',
  ETHER_DOWN: 'ether_down',
  EXCESS_ETHER: 'excess_ether',
  LOW_ETHER: 'low_ether',
  
  // Balanced State
  BALANCED: 'balanced',
} as const;

// ===== LAYER 3: STATE TAGS (System-Generated) =====
// Current energy state computed from context + physiological data

export const STATE_TAGS = {
  // Physical
  ENERGISED: 'energised',
  FATIGUED: 'fatigued',
  OVEREXTENDED: 'overextended',
  RESTORED: 'restored',
  
  // Mental
  FOCUSED: 'focused',
  SCATTERED: 'scattered',
  DEPLETED: 'depleted',
  SHARP: 'sharp',
  CLEAR: 'clear',
  
  // Emotional
  CALM: 'calm',
  TENSE: 'tense',
  DRAINED: 'drained',
  OPEN: 'open',
  ANXIOUS: 'anxious',
  
  // Energetic Quality
  BALANCED: 'balanced',
  IMBALANCED: 'imbalanced',
} as const;

// ===== LAYER 4: PRACTICE TAGS =====
// Describes what a practice does energetically

export const PRACTICE_TAGS = {
  // Fire Modulation
  FIRE_UP: 'fire_up',
  FIRE_DOWN: 'fire_down',
  
  // Earth Modulation
  EARTH_UP: 'earth_up',
  EARTH_DOWN: 'earth_down',
  
  // Water Modulation
  WATER_UP: 'water_up',
  WATER_DOWN: 'water_down',
  
  // Air Modulation
  AIR_UP: 'air_up',
  AIR_DOWN: 'air_down',
  
  // Ether Modulation
  ETHER_UP: 'ether_up',
  ETHER_DOWN: 'ether_down',
  
  // Functional Effects
  COOLING: 'cooling',
  GROUNDING: 'grounding',
  ACTIVATION: 'activation',
  CENTERING: 'centering',
  MENTAL_CLARITY: 'mental_clarity',
  EMOTIONAL_BALANCE: 'emotional_balance',
  NERVOUS_SYSTEM: 'nervous_system',
  FOCUS: 'focus',
  RELEASE: 'release',
  CONNECTION: 'connection',
  
  // Intensity
  GENTLE: 'gentle',
  MODERATE: 'moderate',
  INTENSE: 'intense',
  
  // Pre-Performance
  PRE_MEETING: 'pre-meeting',
  PRE_PERFORMANCE: 'pre-performance',
  POST_STRESS: 'post-stress',
} as const;

// ===== CONTEXT TO ENERGY MAPPING =====
// Maps meeting types and contexts to energy elements

export const CONTEXT_TO_ENERGY_MAP: Record<string, string[]> = {
  [CONTEXT_TAGS.BOARD_MEETING]: [ENERGY_TAGS.FIRE, ENERGY_TAGS.EXCESS_FIRE],
  [CONTEXT_TAGS.CLIENT_PITCH]: [ENERGY_TAGS.FIRE, ENERGY_TAGS.AIR],
  [CONTEXT_TAGS.TEAM_REVIEW]: [ENERGY_TAGS.EARTH, ENERGY_TAGS.WATER],
  [CONTEXT_TAGS.ONE_ON_ONE]: [ENERGY_TAGS.WATER, ENERGY_TAGS.ETHER],
  [CONTEXT_TAGS.STRATEGY_SESSION]: [ENERGY_TAGS.AIR, ENERGY_TAGS.FIRE],
  [CONTEXT_TAGS.NEGOTIATION]: [ENERGY_TAGS.FIRE, ENERGY_TAGS.WATER],
  [CONTEXT_TAGS.HIGH_DECISION_DENSITY]: [ENERGY_TAGS.EXCESS_FIRE, ENERGY_TAGS.LOW_EARTH],
  [CONTEXT_TAGS.LIGHT_SCHEDULE]: [ENERGY_TAGS.BALANCED],
  [CONTEXT_TAGS.LOW_RECOVERY]: [ENERGY_TAGS.LOW_FIRE, ENERGY_TAGS.LOW_EARTH],
  [CONTEXT_TAGS.WELL_RESTED]: [ENERGY_TAGS.FIRE_UP, ENERGY_TAGS.BALANCED],
};

// ===== TIME OF DAY TO CONTEXT TAGS =====
export function getTimeOfDayTags(hour: number): string[] {
  if (hour >= 5 && hour < 9) return [CONTEXT_TAGS.EARLY_MORNING];
  if (hour >= 9 && hour < 12) return [CONTEXT_TAGS.MID_MORNING];
  if (hour >= 14 && hour < 17) return [CONTEXT_TAGS.AFTERNOON_DIP];
  if (hour >= 17 && hour < 21) return [CONTEXT_TAGS.EVENING_FOCUS];
  if (hour >= 21 || hour < 5) return [CONTEXT_TAGS.LATE_NIGHT];
  return [];
}

// ===== TAG UTILITIES =====
export function combineTagArrays(...tagArrays: string[][]): string[] {
  return Array.from(new Set(tagArrays.flat()));
}

export function findPracticesByTags(recommendationTags: string[], allPracticeTags: Record<string, string[]>): string[] {
  const matches: { id: string; matchCount: number }[] = [];
  
  Object.entries(allPracticeTags).forEach(([id, tags]) => {
    const matchCount = tags.filter(tag => recommendationTags.includes(tag)).length;
    if (matchCount > 0) {
      matches.push({ id, matchCount });
    }
  });
  
  return matches
    .sort((a, b) => b.matchCount - a.matchCount)
    .map(m => m.id);
}

export type ContextTag = typeof CONTEXT_TAGS[keyof typeof CONTEXT_TAGS];
export type EnergyTag = typeof ENERGY_TAGS[keyof typeof ENERGY_TAGS];
export type StateTag = typeof STATE_TAGS[keyof typeof STATE_TAGS];
export type PracticeTag = typeof PRACTICE_TAGS[keyof typeof PRACTICE_TAGS];
