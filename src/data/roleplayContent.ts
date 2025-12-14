/**
 * Virtual roleplay content for pack builder
 * These are not real sanctuary content items - they link to Dialogue Room
 */

import type { SanctuaryContent } from '@/data/practicesAndSoundscapes';

// Import category thumbnails
import dialogueAcademicConfidence from '@/assets/dialogue-academic-confidence.jpg';
import dialogueSocialNavigation from '@/assets/dialogue-social-navigation.jpg';
import dialogueGrowthOpportunity from '@/assets/dialogue-growth-opportunity.jpg';

// Student event types from moment detection
type StudentEventType = 'exam' | 'interview' | 'presentation' | 'networking' | 'competition' | 
  'leadership' | 'performance' | 'social-event' | 'sports-match' | 'tutoring' | 'class' | 
  'meeting' | 'unknown';

// Scenario mapping for different event types
export interface RoleplayScenario {
  category: string;           // Configure page category value (pressure, difficult, leadership)
  scenarioId: string;         // Specific scenario ID for step 2 (or 'custom' for unmapped events)
  title: string;
  description: string;
  thumbnail: string;          // Category thumbnail image
  customScenarioText?: string; // Pre-populated text for custom scenarios
}

// Category thumbnails mapping
const CATEGORY_THUMBNAILS: Record<string, string> = {
  'pressure': dialogueAcademicConfidence,      // Academic Confidence
  'difficult': dialogueSocialNavigation,        // Social Navigation
  'leadership': dialogueGrowthOpportunity       // Growth & Opportunity
};

/**
 * Intelligently classify any event type into one of 3 categories
 */
export function getEventCategory(eventType: string): 'pressure' | 'difficult' | 'leadership' {
  // Academic Confidence (pressure) - performance/achievement situations
  const academicTypes = ['exam', 'presentation', 'interview', 'competition', 'performance', 'tutoring', 'class'];
  
  // Social Navigation (difficult) - interpersonal situations  
  const socialTypes = ['networking', 'social-event', 'meeting'];
  
  // Growth & Opportunity (leadership) - growth/leadership situations
  const leadershipTypes = ['leadership', 'sports-match'];
  
  if (socialTypes.includes(eventType)) return 'difficult';
  if (leadershipTypes.includes(eventType)) return 'leadership';
  return 'pressure'; // Default to Academic Confidence
}

// Pre-built scenarios with full configuration
export const EVENT_ROLEPLAY_MAPPING: Record<string, RoleplayScenario> = {
  interview: {
    category: 'pressure',
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
    category: 'leadership',
    scenarioId: 'sports-captain-address',
    title: 'Pre-Competition Visualization',
    description: 'Mental rehearsal for peak performance',
    thumbnail: dialogueGrowthOpportunity
  },
  social: {
    category: 'difficult',
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
  },
  networking: {
    category: 'difficult',
    scenarioId: 'alumni-networking',
    title: 'Networking Practice',
    description: 'Practice introductions and conversations',
    thumbnail: dialogueSocialNavigation
  }
};

/**
 * Create a virtual roleplay content item for pack steps
 * For mapped events: pre-selects specific scenario
 * For unmapped events: pre-selects category + custom scenario with event title
 */
export function createRoleplayContent(
  eventType: string, 
  goalTags: string[], 
  eventTitle?: string
): SanctuaryContent & { roleplayScenario: RoleplayScenario } {
  // Check if we have a pre-built scenario
  const hasPrebuiltScenario = eventType in EVENT_ROLEPLAY_MAPPING;
  
  let scenario: RoleplayScenario;
  
  if (hasPrebuiltScenario) {
    // Use existing mapping
    scenario = EVENT_ROLEPLAY_MAPPING[eventType];
  } else {
    // Create custom scenario entry for unmapped events
    const category = getEventCategory(eventType);
    const thumbnail = CATEGORY_THUMBNAILS[category];
    
    // Generate friendly title for custom scenario
    const customTitle = eventTitle || `Prepare for ${eventType.replace(/-/g, ' ')} event`;
    
    scenario = {
      category,
      scenarioId: 'custom',
      title: 'Practice Session',
      description: 'Practice for your upcoming event with AI feedback',
      thumbnail,
      customScenarioText: customTitle
    };
  }
  
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
 * For pre-built scenarios: pre-selects category + specific scenario
 * For custom scenarios: pre-selects category + custom mode with pre-populated text
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
      prePopulatedCustomScenario: scenario.customScenarioText, // For custom scenarios
      fromPerformancePrep: true
    }
  };
}
