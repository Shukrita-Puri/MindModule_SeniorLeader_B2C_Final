/**
 * Virtual roleplay content for pack builder
 * These are not real sanctuary content items - they link to Dialogue Room
 */

import type { SanctuaryContent } from '@/data/practicesAndSoundscapes';

// Scenario mapping for different event types
export interface RoleplayScenario {
  category: string;
  scenarioId: string;
  title: string;
  description: string;
}

export const EVENT_ROLEPLAY_MAPPING: Record<string, RoleplayScenario> = {
  interview: {
    category: 'academic-confidence',
    scenarioId: 'university-interview',
    title: 'Interview Practice',
    description: 'Practice answering tough questions with AI feedback'
  },
  presentation: {
    category: 'academic-confidence',
    scenarioId: 'class-presentation',
    title: 'Presentation Rehearsal',
    description: 'Rehearse your delivery and get real-time coaching'
  },
  exam: {
    category: 'academic-confidence',
    scenarioId: 'oral-exam',
    title: 'Oral Exam Practice',
    description: 'Practice explaining concepts under pressure'
  },
  competition: {
    category: 'growth-opportunity',
    scenarioId: 'sports-captain',
    title: 'Pre-Competition Visualization',
    description: 'Mental rehearsal for peak performance'
  },
  social: {
    category: 'social-mastery',
    scenarioId: 'alumni-networking',
    title: 'Networking Practice',
    description: 'Practice introductions and conversations'
  },
  leadership: {
    category: 'growth-opportunity',
    scenarioId: 'head-student-interview',
    title: 'Leadership Moment Practice',
    description: 'Practice your key messages with feedback'
  }
};

/**
 * Create a virtual roleplay content item for pack steps
 */
export function createRoleplayContent(eventType: string, goalTags: string[]): SanctuaryContent & { roleplayScenario: RoleplayScenario } {
  // Find the best matching scenario
  const scenario = EVENT_ROLEPLAY_MAPPING[eventType] || EVENT_ROLEPLAY_MAPPING['interview'];
  
  // Cast through unknown to satisfy TypeScript while adding custom property
  const content = {
    id: `roleplay-${eventType}`,
    title: scenario.title,
    contentType: 'micro-practice' as const,
    subType: 'roleplay',
    category: 'presence' as const,
    duration: 5,
    thumbnail: '/placeholder.svg',
    audioUrl: '',
    tags: ['roleplay', 'practice', ...goalTags],
    creator: 'Mind Module',
    storyHook: scenario.description,
    roleplayScenario: scenario
  } as unknown as SanctuaryContent & { roleplayScenario: RoleplayScenario };
  
  return content;
}

/**
 * Check if content is a roleplay item
 */
export function isRoleplayContent(content: SanctuaryContent): boolean {
  return content.id.startsWith('roleplay-') || (content as any).roleplayScenario !== undefined;
}

/**
 * Get roleplay navigation config for a content item
 */
export function getRoleplayNavConfig(content: SanctuaryContent): { path: string; state: any } | null {
  if (!isRoleplayContent(content)) return null;
  
  const roleplayContent = content as SanctuaryContent & { roleplayScenario?: RoleplayScenario };
  const scenario = roleplayContent.roleplayScenario || EVENT_ROLEPLAY_MAPPING['interview'];
  
  return {
    path: '/practice/configure',
    state: {
      preSelectedCategory: scenario.category,
      preSelectedScenario: scenario.scenarioId,
      fromPerformancePrep: true
    }
  };
}
