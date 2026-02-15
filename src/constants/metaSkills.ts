// Canonical Meta-Skill naming and definitions
// Use this across all pages for consistency
// Final 8 Meta Skills used across Coach, Dialogue, and all features

export const META_SKILLS = {
  self_regulation: {
    key: 'self_regulation',
    displayName: "Self-Regulation",
    icon: "Target",
    shortLabel: "Regulation",
    description: "Pause before reacting, manage energy, sustain composure",
    emoji: "🎯",
    cluster: "self_mastery"
  },
  resilience: {
    key: 'resilience',
    displayName: "Resilience",
    icon: "Shield",
    shortLabel: "Resilience",
    description: "Recover from setbacks, maintain resolve under sustained pressure",
    emoji: "🛡️",
    cluster: "self_mastery"
  },
  emotional_intelligence: {
    key: 'emotional_intelligence',
    displayName: "Emotional Intelligence",
    icon: "Heart",
    shortLabel: "EQ",
    description: "Recognise and regulate emotions in yourself and others",
    emoji: "❤️",
    cluster: "self_mastery"
  },
  confidence: {
    key: 'confidence',
    displayName: "Confidence",
    icon: "Crown",
    shortLabel: "Confidence",
    description: "Trust your judgment, act decisively, own the room",
    emoji: "👑",
    cluster: "self_mastery"
  },
  thinking_clarity: {
    key: 'thinking_clarity',
    displayName: "Thinking Clarity",
    icon: "Brain",
    shortLabel: "Clarity",
    description: "See context, spot blind spots, think clearly under pressure",
    emoji: "🧠",
    cluster: "self_mastery"
  },
  adaptive_capacity: {
    key: 'adaptive_capacity',
    displayName: "Adaptive Capacity",
    icon: "Zap",
    shortLabel: "Agility",
    description: "Pivot fast, embrace ambiguity, thrive in change",
    emoji: "⚡",
    cluster: "social_mastery"
  },
  influence: {
    key: 'influence',
    displayName: "Influence",
    icon: "Megaphone",
    shortLabel: "Influence",
    description: "Shape outcomes, persuade stakeholders, drive alignment",
    emoji: "📢",
    cluster: "social_mastery"
  },
  presence: {
    key: 'presence',
    displayName: "Presence",
    icon: "Eye",
    shortLabel: "Presence",
    description: "Command attention, project authority, stay grounded in the moment",
    emoji: "👁️",
    cluster: "social_mastery"
  }
} as const;

// Helper to get display name from key
export function getMetaSkillDisplayName(key: string): string {
  const skill = META_SKILLS[key as MetaSkillKey];
  if (skill) return skill.displayName;

  // Legacy key mappings for backward compatibility
  const legacyMap: Record<string, string> = {
    'adaptability_learning': META_SKILLS.adaptive_capacity.displayName,
    'communication_social': META_SKILLS.influence.displayName,
    'social_intelligence': META_SKILLS.influence.displayName,
    'learning_agility': META_SKILLS.adaptive_capacity.displayName,
    'emotional_resilience': META_SKILLS.resilience.displayName,
    'communication_excellence': META_SKILLS.influence.displayName,
    'adaptive_social_navigation': META_SKILLS.presence.displayName,
  };

  return legacyMap[key] || key;
}

export type MetaSkillKey = keyof typeof META_SKILLS;

// Get all skills for a given cluster
export function getSkillsByCluster(cluster: 'self_mastery' | 'social_mastery') {
  return Object.values(META_SKILLS).filter(s => s.cluster === cluster);
}
