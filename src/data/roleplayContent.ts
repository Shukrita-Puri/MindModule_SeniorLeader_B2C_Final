/**
 * Virtual roleplay content for pack builder
 * These are not real sanctuary content items - they link to Dialogue Room
 */

import type { SanctuaryContent } from '@/data/practicesAndSoundscapes';

// Import category thumbnails
import dialogueAcademicConfidence from '@/assets/dialogue-academic-confidence.jpg';
import dialogueSocialNavigation from '@/assets/dialogue-social-navigation.jpg';
import dialogueGrowthOpportunity from '@/assets/dialogue-growth-opportunity.jpg';

// Scenario mapping for different event types
export interface RoleplayScenario {
  category: string;           // Configure page category value (pressure, difficult, leadership)
  scenarioId: string;         // Specific scenario ID for step 2
  title: string;
  description: string;
  thumbnail: string;          // Category thumbnail image
}

// Category thumbnails mapping
const CATEGORY_THUMBNAILS: Record<string, string> = {
  'pressure': dialogueAcademicConfidence,      // Academic Confidence
  'difficult': dialogueSocialNavigation,        // Social Navigation
  'leadership': dialogueGrowthOpportunity       // Growth & Opportunity
};

export const EVENT_ROLEPLAY_MAPPING: Record<string, RoleplayScenario> = {
  interview: {
    category: 'pressure',                        // Maps to Academic Confidence
    scenarioId: 'oxbridge-interview',
    title: 'Interview Practice',
    description: 'Practice answering tough questions with AI feedback',
    thumbnail: dialogueAcademicConfidence
  },
  presentation: {
    category: 'pressure',
    scenarioId: 'model-un-speech',
    title: 'Presentation Rehearsal',
    description: 'Rehearse your delivery and get real-time coaching',
    thumbnail: dialogueAcademicConfidence
  },
  exam: {
    category: 'pressure',
    scenarioId: 'debate-tournament',
    title: 'Oral Exam Practice',
    description: 'Practice explaining concepts under pressure',
    thumbnail: dialogueAcademicConfidence
  },
  competition: {
    category: 'leadership',                      // Maps to Growth & Opportunity
    scenarioId: 'sports-captain-address',
    title: 'Pre-Competition Visualization',
    description: 'Mental rehearsal for peak performance',
    thumbnail: dialogueGrowthOpportunity
  },
  social: {
    category: 'difficult',                       // Maps to Social Navigation
    scenarioId: 'alumni-networking',
    title: 'Networking Practice',
    description: 'Practice introductions and conversations',
    thumbnail: dialogueSocialNavigation
  },
  leadership: {
    category: 'leadership',
    scenarioId: 'head-student-interview',
    title: 'Leadership Moment Practice',
    description: 'Practice your key messages with feedback',
    thumbnail: dialogueGrowthOpportunity
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
    thumbnail: scenario.thumbnail,
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
