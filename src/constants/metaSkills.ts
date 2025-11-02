// Canonical Meta-Skill naming and definitions
// Use this across all pages for consistency

export const META_SKILLS = {
  thinking_clarity: {
    key: 'thinking_clarity',
    displayName: "Thinking Clarity",
    icon: "Brain",
    shortLabel: "Clarity",
    description: "See context, spot blind spots, think clearly under pressure",
    emoji: "🧠"
  },
  social_intelligence: {
    key: 'social_intelligence',
    displayName: "Social Intelligence",
    icon: "Users",
    shortLabel: "Social",
    description: "Read the room, communicate with impact, influence effectively",
    emoji: "🤝"
  },
  adaptive_capacity: {
    key: 'adaptive_capacity',
    displayName: "Adaptive Capacity",
    icon: "Zap",
    shortLabel: "Agility",
    description: "Pivot fast, embrace ambiguity, thrive in change",
    emoji: "⚡"
  },
  self_regulation: {
    key: 'self_regulation',
    displayName: "Self-Regulation",
    icon: "Target",
    shortLabel: "Regulation",
    description: "Pause before reacting, manage energy, sustain composure",
    emoji: "🎯"
  }
} as const;

// Helper to get display name from key
export function getMetaSkillDisplayName(key: string): string {
  const skillMap: Record<string, string> = {
    'thinking_clarity': META_SKILLS.thinking_clarity.displayName,
    'social_intelligence': META_SKILLS.social_intelligence.displayName,
    'adaptive_capacity': META_SKILLS.adaptive_capacity.displayName,
    'self_regulation': META_SKILLS.self_regulation.displayName,
    // Legacy key mappings for backward compatibility
    'adaptability_learning': META_SKILLS.adaptive_capacity.displayName,
    'communication_social': META_SKILLS.social_intelligence.displayName,
  };
  
  return skillMap[key] || key;
}

export type MetaSkillKey = keyof typeof META_SKILLS;
