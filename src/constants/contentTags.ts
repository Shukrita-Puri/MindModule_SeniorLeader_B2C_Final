// =====================================================
// COMPREHENSIVE CONTENT TAGGING SYSTEM
// Type definitions and constants matching the database schema
// =====================================================

// Meta Skills with full hierarchy (6 skills in 2 clusters)
export const META_SKILLS = {
  // SELF MASTERY Cluster
  emotional_intelligence: {
    key: 'emotional_intelligence',
    displayName: 'Emotional Intelligence',
    cluster: 'self_mastery',
    coreFunction: 'Managing the Inner World — cultivating awareness, resilience, and self-direction',
    subSkills: ['emotional_regulation', 'self_awareness', 'mindfulness', 'emotional_mastery', 'self_compassion'],
    softSkills: ['empathy', 'active_listening', 'compassion']
  },
  self_regulation: {
    key: 'self_regulation',
    displayName: 'Self-Regulation',
    cluster: 'self_mastery',
    coreFunction: 'Managing the Inner World — cultivating awareness, resilience, and self-direction',
    subSkills: ['goal_setting', 'purpose_alignment', 'identity_alignment', 'focus', 'discipline'],
    softSkills: ['self_motivation', 'integrity', 'growth_mindset']
  },
  learning_agility: {
    key: 'learning_agility',
    displayName: 'Learning Agility',
    cluster: 'self_mastery',
    coreFunction: 'Managing the Inner World — cultivating awareness, resilience, and self-direction',
    subSkills: ['self_directed_learning', 'reflective_thinking', 'unlearning', 'adaptability_to_feedback', 'continuous_improvement'],
    softSkills: ['curiosity', 'openness_to_change']
  },
  emotional_resilience: {
    key: 'emotional_resilience',
    displayName: 'Emotional Resilience',
    cluster: 'self_mastery',
    coreFunction: 'Managing the Inner World — cultivating awareness, resilience, and self-direction',
    subSkills: ['stress_management', 'perseverance', 'optimism'],
    softSkills: ['positivity', 'self_confidence', 'empathy', 'compassion']
  },
  // SOCIAL MASTERY Cluster
  social_intelligence: {
    key: 'social_intelligence',
    displayName: 'Social Intelligence',
    cluster: 'social_mastery',
    coreFunction: 'Navigating Relationships — understanding and influencing others',
    subSkills: ['perspective_taking', 'cultural_awareness', 'value_clarification', 'moral_reasoning', 'ethical_judgment'],
    softSkills: ['empathy', 'trust_building', 'intercultural_sensitivity', 'active_listening', 'communication']
  },
  performance_intelligence: {
    key: 'performance_intelligence',
    displayName: 'Performance Intelligence',
    cluster: 'social_mastery',
    coreFunction: 'Navigating Relationships — understanding and influencing others',
    subSkills: ['pre_performance_priming', 'mental_switching', 'focus_on_command', 'cognitive_sharpening', 'high_pressure_management'],
    softSkills: ['presence', 'assertiveness', 'composure', 'confidence']
  }
} as const;

// All Sub-Skills (mapped to parent meta-skills)
export const SUB_SKILLS = {
  // Emotional Intelligence
  emotional_regulation: { key: 'emotional_regulation', displayName: 'Emotional Regulation', parent: 'emotional_intelligence' },
  self_awareness: { key: 'self_awareness', displayName: 'Self-Awareness', parent: 'emotional_intelligence' },
  mindfulness: { key: 'mindfulness', displayName: 'Mindfulness', parent: 'emotional_intelligence' },
  emotional_mastery: { key: 'emotional_mastery', displayName: 'Emotional Mastery', parent: 'emotional_intelligence' },
  self_compassion: { key: 'self_compassion', displayName: 'Self-Compassion', parent: 'emotional_intelligence' },
  
  // Self-Regulation
  goal_setting: { key: 'goal_setting', displayName: 'Goal Setting', parent: 'self_regulation' },
  purpose_alignment: { key: 'purpose_alignment', displayName: 'Purpose Alignment', parent: 'self_regulation' },
  identity_alignment: { key: 'identity_alignment', displayName: 'Identity Alignment', parent: 'self_regulation' },
  focus: { key: 'focus', displayName: 'Focus', parent: 'self_regulation' },
  discipline: { key: 'discipline', displayName: 'Discipline', parent: 'self_regulation' },
  
  // Learning Agility
  self_directed_learning: { key: 'self_directed_learning', displayName: 'Self-Directed Learning', parent: 'learning_agility' },
  reflective_thinking: { key: 'reflective_thinking', displayName: 'Reflective Thinking', parent: 'learning_agility' },
  unlearning: { key: 'unlearning', displayName: 'Unlearning', parent: 'learning_agility' },
  adaptability_to_feedback: { key: 'adaptability_to_feedback', displayName: 'Adaptability to Feedback', parent: 'learning_agility' },
  continuous_improvement: { key: 'continuous_improvement', displayName: 'Continuous Improvement', parent: 'learning_agility' },
  
  // Emotional Resilience
  stress_management: { key: 'stress_management', displayName: 'Stress Management', parent: 'emotional_resilience' },
  perseverance: { key: 'perseverance', displayName: 'Perseverance', parent: 'emotional_resilience' },
  optimism: { key: 'optimism', displayName: 'Optimism', parent: 'emotional_resilience' },
  
  // Social Intelligence
  perspective_taking: { key: 'perspective_taking', displayName: 'Perspective-Taking', parent: 'social_intelligence' },
  cultural_awareness: { key: 'cultural_awareness', displayName: 'Cultural Awareness', parent: 'social_intelligence' },
  value_clarification: { key: 'value_clarification', displayName: 'Value Clarification', parent: 'social_intelligence' },
  moral_reasoning: { key: 'moral_reasoning', displayName: 'Moral Reasoning', parent: 'social_intelligence' },
  ethical_judgment: { key: 'ethical_judgment', displayName: 'Ethical Judgment', parent: 'social_intelligence' },
  
  // Performance Intelligence
  pre_performance_priming: { key: 'pre_performance_priming', displayName: 'Pre-Performance Priming', parent: 'performance_intelligence' },
  mental_switching: { key: 'mental_switching', displayName: 'Mental Switching', parent: 'performance_intelligence' },
  focus_on_command: { key: 'focus_on_command', displayName: 'Focus on Command', parent: 'performance_intelligence' },
  cognitive_sharpening: { key: 'cognitive_sharpening', displayName: 'Cognitive Sharpening', parent: 'performance_intelligence' },
  high_pressure_management: { key: 'high_pressure_management', displayName: 'High Pressure Arousal Management', parent: 'performance_intelligence' }
} as const;

// All Soft Skills
export const SOFT_SKILLS = [
  'empathy', 'active_listening', 'compassion', 'self_motivation', 'integrity',
  'growth_mindset', 'curiosity', 'openness_to_change', 'positivity', 'self_confidence',
  'trust_building', 'intercultural_sensitivity', 'communication', 'presence',
  'assertiveness', 'composure', 'boldness', 'determination', 'confidence', 'courage'
] as const;

// Usage Occasions (for building intervention packs)
export const USAGE_OCCASIONS = {
  // Timing-based
  morning_activation: { key: 'morning_activation', displayName: 'Morning Activation', category: 'timing' },
  afternoon_slump: { key: 'afternoon_slump', displayName: 'Afternoon Slump', category: 'timing' },
  evening_winddown: { key: 'evening_winddown', displayName: 'Evening Wind-Down', category: 'timing' },
  rapid_recharge: { key: 'rapid_recharge', displayName: 'Rapid Recharge', category: 'timing' },
  
  // Event-based
  pre_exam: { key: 'pre_exam', displayName: 'Pre-Exam', category: 'event' },
  pre_meeting: { key: 'pre_meeting', displayName: 'Pre-Meeting', category: 'event' },
  pre_presentation: { key: 'pre_presentation', displayName: 'Pre-Presentation', category: 'event' },
  pre_negotiation: { key: 'pre_negotiation', displayName: 'Pre-Negotiation', category: 'event' },
  pre_interview: { key: 'pre_interview', displayName: 'Pre-Interview', category: 'event' },
  pre_performance: { key: 'pre_performance', displayName: 'Pre-Performance', category: 'event' },
  pre_social_event: { key: 'pre_social_event', displayName: 'Pre-Social Event', category: 'event' },
  
  // Context-based
  high_pressure_event: { key: 'high_pressure_event', displayName: 'High Pressure Event', category: 'context' },
  decision_making: { key: 'decision_making', displayName: 'Decision Making', category: 'context' },
  creative_focus: { key: 'creative_focus', displayName: 'Creative Focus', category: 'context' },
  stress_release: { key: 'stress_release', displayName: 'Stress Release', category: 'context' },
  mind_body_alignment: { key: 'mind_body_alignment', displayName: 'Mind-Body Alignment', category: 'context' },
  overcoming_procrastination: { key: 'overcoming_procrastination', displayName: 'Overcoming Procrastination', category: 'context' },
  focus_and_readiness: { key: 'focus_and_readiness', displayName: 'Focus and Readiness', category: 'context' },
  recharging_energy: { key: 'recharging_energy', displayName: 'Recharging Energy', category: 'context' },
  energy_synchronisation: { key: 'energy_synchronisation', displayName: 'Energy Synchronisation', category: 'context' },
  overcoming_mental_lulls: { key: 'overcoming_mental_lulls', displayName: 'Overcoming Mental Lulls', category: 'context' },
  
  // Energy state
  performance_preparation: { key: 'performance_preparation', displayName: 'Performance Preparation', category: 'energy_state' },
  cognitive_clarity: { key: 'cognitive_clarity', displayName: 'Cognitive Clarity', category: 'energy_state' },
  emotional_regulation_state: { key: 'emotional_regulation', displayName: 'Emotional Regulation', category: 'energy_state' }
} as const;

// Check-in Response Tags (mapped to energy outcomes)
export const CHECKIN_TAGS = {
  stressed_overwhelmed: { 
    key: 'stressed_overwhelmed', 
    displayName: 'Stressed or Overwhelmed', 
    outcome: 'pause', 
    energyRange: [0, 40] as const 
  },
  drained_tired: { 
    key: 'drained_tired', 
    displayName: 'Drained or Tired', 
    outcome: 'power-up', 
    energyRange: [0, 40] as const 
  },
  scattered_unfocused: { 
    key: 'scattered_unfocused', 
    displayName: 'Scattered or Unfocused', 
    outcome: 'presence', 
    energyRange: [40, 60] as const 
  },
  steady_balanced: { 
    key: 'steady_balanced', 
    displayName: 'Steady and Balanced', 
    outcome: 'steady', 
    energyRange: [60, 80] as const 
  },
  focused_energised: { 
    key: 'focused_energised', 
    displayName: 'Focused and Energized', 
    outcome: 'focused', 
    energyRange: [70, 90] as const 
  },
  motivated_ready: { 
    key: 'motivated_ready', 
    displayName: 'Motivated and Ready', 
    outcome: 'ready', 
    energyRange: [80, 100] as const 
  },
  on_edge: { 
    key: 'on_edge', 
    displayName: 'On Edge', 
    outcome: 'pause', 
    energyRange: [20, 50] as const 
  },
  low_drive: { 
    key: 'low_drive', 
    displayName: 'Low Drive', 
    outcome: 'power-up', 
    energyRange: [10, 40] as const 
  }
} as const;

// Mastery Categories (primary/secondary support for content)
export const MASTERY_CATEGORIES = ['pause', 'flow', 'power-up', 'presence', 'renewal', 'steady', 'focused', 'ready'] as const;

// Type exports
export type MetaSkillKey = keyof typeof META_SKILLS;
export type SubSkillKey = keyof typeof SUB_SKILLS;
export type SoftSkill = typeof SOFT_SKILLS[number];
export type UsageOccasionKey = keyof typeof USAGE_OCCASIONS;
export type CheckinTagKey = keyof typeof CHECKIN_TAGS;
export type MasteryCategory = typeof MASTERY_CATEGORIES[number];

// Tag structure for content metadata (matches JSONB columns)
export interface ContentMetaSkills {
  primary: MetaSkillKey[];
  secondary: MetaSkillKey[];
}

export interface ContentSubSkills {
  primary: SubSkillKey[];
  secondary: SubSkillKey[];
}

export interface ContentCheckinTags {
  primary: CheckinTagKey[];
  secondary: CheckinTagKey[];
}

export interface ContentMasteryCategory {
  primary: MasteryCategory | null;
  secondary: MasteryCategory[];
}

// Helper to get meta skill by key
export function getMetaSkill(key: MetaSkillKey) {
  return META_SKILLS[key];
}

// Helper to get all sub-skills for a meta skill
export function getSubSkillsForMetaSkill(metaSkillKey: MetaSkillKey): SubSkillKey[] {
  return Object.entries(SUB_SKILLS)
    .filter(([_, subSkill]) => subSkill.parent === metaSkillKey)
    .map(([key]) => key as SubSkillKey);
}

// Helper to map check-in outcome to tags
export function getCheckinTagsForOutcome(outcome: string): CheckinTagKey[] {
  return Object.entries(CHECKIN_TAGS)
    .filter(([_, tag]) => tag.outcome === outcome)
    .map(([key]) => key as CheckinTagKey);
}
