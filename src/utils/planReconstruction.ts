/**
 * Plan Reconstruction Utilities
 * 
 * Helpers to reconstruct a Performance Plan from stored practice IDs
 * to ensure plan stability across page refreshes.
 */

import { sanctuaryContent, type SanctuaryContent } from '@/data/practicesAndSoundscapes';
import { type ModuleRecommendation, type CoachCard } from './performancePlanEngine';

// Background images for Coach cards
import coachPrepareBackground from '@/assets/vibrant-executive-preparation.png';
import coachIntegrateBackground from '@/assets/ink-reflection-illustration.png';

/**
 * Create a coach card object for prepare/integrate modules
 */
export function createCoachCard(type: 'prepare' | 'integrate'): CoachCard {
  if (type === 'prepare') {
    return {
      id: 'coach-prepare',
      type: 'prepare',
      label: 'Prepare',
      protocolType: 'Self Mastery Coach',
      title: 'Mental Rehearsal',
      duration: 2,
      sortOrder: 3,
      isCoachCard: true,
      prompt: "I have an important moment coming up. Help me mentally prepare and visualize success."
    };
  }
  return {
    id: 'coach-integrate',
    type: 'integrate',
    label: 'Integrate',
    protocolType: 'Self Mastery Coach',
    title: 'Tiny Win and Reflection',
    duration: 2,
    sortOrder: 4,
    isCoachCard: true,
    prompt: "Let's close out today. First, take a deep breath and let your shoulders drop. Now, what's one thing you did right today? Share your small win."
  };
}

/**
 * Determine the module type based on content characteristics
 */
function getModuleTypeFromContent(content: SanctuaryContent): 'regulate' | 'align' {
  // Soundbaths and breathing practices are typically 'regulate'
  if (content.contentType === 'soundbath') {
    return 'regulate';
  }
  
  // Check tags for breathing/somatic indicators
  if (content.tags?.some(t => 
    t.toLowerCase().includes('breathing') || 
    t.toLowerCase().includes('somatic') ||
    t.toLowerCase().includes('grounding')
  )) {
    return 'regulate';
  }
  
  // Mindset content goes to 'align'
  if (content.subType === 'mindset' || content.contentType === 'guided-practice') {
    return 'align';
  }
  
  // Default to regulate for micro-practices
  return 'regulate';
}

/**
 * Reconstruct a Performance Plan from stored practice IDs
 * 
 * This allows us to restore the same plan on page refresh without regenerating.
 */
export function reconstructPlanFromIds(ids: string[]): ModuleRecommendation[] {
  const plan: ModuleRecommendation[] = [];
  
  for (const id of ids) {
    // Handle coach cards
    if (id === 'coach-prepare') {
      plan.push({
        type: 'prepare',
        required: false,
        priority: 5,
        intensity: 'moderate',
        duration: 'short',
        focus: 'clarity',
        reasoning: 'Mental rehearsal for upcoming moments',
        content: createCoachCard('prepare')
      });
      continue;
    }
    
    if (id === 'coach-integrate') {
      plan.push({
        type: 'integrate',
        required: true,
        priority: 6,
        intensity: 'gentle',
        duration: 'short',
        focus: 'release',
        reasoning: 'Evening reflection and wins capture',
        content: createCoachCard('integrate')
      });
      continue;
    }
    
    // Find content by ID in sanctuary library
    const content = sanctuaryContent.find(c => c.id === id);
    if (content) {
      const moduleType = getModuleTypeFromContent(content);
      plan.push({
        type: moduleType,
        required: true,
        priority: 6,
        intensity: 'moderate',
        duration: 'short',
        focus: 'grounding',
        reasoning: 'Recommended for your current state',
        content
      });
    }
  }
  
  // Sort by module type sequence: regulate → align → prepare → integrate
  const typeOrder = { regulate: 0, align: 1, prepare: 2, integrate: 3 };
  plan.sort((a, b) => typeOrder[a.type] - typeOrder[b.type]);
  
  return plan;
}

/**
 * Simple hash function to create deterministic random seeds
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Get a deterministic "random" index for today's date
 * This ensures the same content is selected throughout the day
 */
export function getDeterministicIndex(date: string, maxIndex: number, salt: string = ''): number {
  if (maxIndex <= 0) return 0;
  const seed = hashCode(`${date}${salt}`);
  return seed % maxIndex;
}
