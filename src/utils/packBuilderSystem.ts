/**
 * Pack Builder System v2
 * Builds contextual practice packs for student moments
 * Supports 1-3 step packs with mindset, somatic, and optional roleplay
 */

import { sanctuaryContent, type SanctuaryContent } from '@/data/practicesAndSoundscapes';
import { createRoleplayContent } from '@/data/roleplayContent';
import type { MomentCandidate, StudentEventType } from './momentDetectionEngine';

/**
 * Content pool sourced ONLY from Recalibrate section
 * - Mindset protocols: subType === 'mindset'
 * - Somatic protocols: subType === 'tool'
 * - Roleplay: via createRoleplayContent (Dialogue Room)
 */
const allContent: SanctuaryContent[] = sanctuaryContent;

export type PackStepType = 'mindset' | 'somatic' | 'roleplay';

export interface PackStepDefinition {
  step_type: PackStepType;
  required: boolean;
  duration_range: { min: number; max: number };
  intensity: 'low' | 'medium' | 'high';
  goal_tags: string[];
  fallback_tags?: string[];
  label: string;  // Display label like "Mindset Protocol", "Somatic Tool"
}

export interface PackTemplate {
  id: string;
  name: string;
  description: string;
  mastery_focus: 'self' | 'social' | 'both';
  steps: PackStepDefinition[];
  total_duration_range: { min: number; max: number };
}

export interface PackStep {
  step_type: PackStepType;
  content: SanctuaryContent;
  label: string;
  duration: number;
  is_optional: boolean;
}

export interface BuiltPack {
  template_id: string;
  template_name: string;
  steps: PackStep[];
  total_duration: number;
  why_now: string;
  mastery_focus: 'self' | 'social' | 'both';
}

// Pack templates for different moment types
export const PACK_TEMPLATES: Record<string, PackTemplate> = {
  // ============================================
  // SAME-DAY PACKS (Mindset + Somatic, flexible steps)
  // ============================================
  
  'pre-exam-pack': {
    id: 'pre-exam-pack',
    name: 'Exam Prep Pack',
    description: 'Mental clarity and focus before your exam',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'mindset',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'medium',
        goal_tags: ['focus', 'confidence', 'mental_clarity', 'composure'],
        label: 'Mindset Protocol'
      },
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 2, max: 5 },
        intensity: 'low',
        goal_tags: ['breathing_regulation', 'grounding', 'nervous_system_calm'],
        label: 'Somatic Tool'
      }
    ],
    total_duration_range: { min: 3, max: 8 }
  },
  
  'pre-interview-pack': {
    id: 'pre-interview-pack',
    name: 'Interview Prep Pack',
    description: 'Confidence and composure for your interview',
    mastery_focus: 'both',
    steps: [
      {
        step_type: 'mindset',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'medium',
        goal_tags: ['confidence', 'composure', 'decision_readiness'],
        label: 'Mindset Protocol'
      },
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 2, max: 4 },
        intensity: 'low',
        goal_tags: ['grounding', 'breathing_regulation', 'nervous_system_calm'],
        label: 'Somatic Tool'
      },
      {
        step_type: 'roleplay',
        required: false,
        duration_range: { min: 3, max: 7 },
        intensity: 'medium',
        goal_tags: ['interview', 'social', 'communication'],
        label: 'Quick Practice'
      }
    ],
    total_duration_range: { min: 3, max: 14 }
  },
  
  'pre-presentation-pack': {
    id: 'pre-presentation-pack',
    name: 'Presentation Prep Pack',
    description: 'Stage presence and confidence before presenting',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'mindset',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'medium',
        goal_tags: ['confidence', 'focus', 'presence'],
        label: 'Mindset Protocol'
      },
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 2, max: 5 },
        intensity: 'medium',
        goal_tags: ['activation', 'breathing_regulation', 'alertness'],
        label: 'Somatic Tool'
      }
    ],
    total_duration_range: { min: 3, max: 8 }
  },
  
  'pre-competition-pack': {
    id: 'pre-competition-pack',
    name: 'Competition Prep Pack',
    description: 'Peak performance mindset for competition',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 2, max: 5 },
        intensity: 'medium',
        goal_tags: ['activation', 'energize', 'pre-performance'],
        label: 'Activation Protocol'
      },
      {
        step_type: 'mindset',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'high',
        goal_tags: ['focus', 'confidence', 'decision_readiness'],
        label: 'Mindset Protocol'
      }
    ],
    total_duration_range: { min: 3, max: 8 }
  },
  
  'pre-leadership-pack': {
    id: 'pre-leadership-pack',
    name: 'Leadership Prep Pack',
    description: 'Presence and authority for leadership moments',
    mastery_focus: 'both',
    steps: [
      {
        step_type: 'mindset',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'medium',
        goal_tags: ['confidence', 'presence', 'composure'],
        label: 'Mindset Protocol'
      },
      {
        step_type: 'somatic',
        required: false,
        duration_range: { min: 2, max: 4 },
        intensity: 'low',
        goal_tags: ['grounding', 'breathing_regulation'],
        label: 'Grounding Tool'
      }
    ],
    total_duration_range: { min: 1, max: 7 }
  },
  
  'pre-social-pack': {
    id: 'pre-social-pack',
    name: 'Social Prep Pack',
    description: 'Social confidence for networking and events',
    mastery_focus: 'social',
    steps: [
      {
        step_type: 'mindset',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'low',
        goal_tags: ['confidence', 'presence', 'social'],
        label: 'Mindset Protocol'
      },
      {
        step_type: 'somatic',
        required: false,
        duration_range: { min: 2, max: 4 },
        intensity: 'low',
        goal_tags: ['grounding', 'breathing_regulation', 'nervous_system_calm'],
        label: 'Calming Tool'
      }
    ],
    total_duration_range: { min: 1, max: 7 }
  },
  
  // Energy & Recovery Packs
  'energy-protection-pack': {
    id: 'energy-protection-pack',
    name: 'Energy Protection Pack',
    description: 'Sustain energy through a demanding day',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 2, max: 5 },
        intensity: 'low',
        goal_tags: ['grounding', 'breathing_regulation', 'nervous_system_calm'],
        label: 'Somatic Tool'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 1, max: 2 },
        intensity: 'low',
        goal_tags: ['composure', 'boundaries', 'emotional_balance'],
        label: 'Mindset Protocol'
      }
    ],
    total_duration_range: { min: 2, max: 7 }
  },
  
  'overload-recovery-pack': {
    id: 'overload-recovery-pack',
    name: 'Overload Recovery Pack',
    description: 'Reset during a packed schedule',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'low',
        goal_tags: ['breathing_regulation', 'grounding', 'quick_reset'],
        label: 'Quick Reset Tool'
      }
    ],
    total_duration_range: { min: 1, max: 3 }
  },
  
  'gap-reset-pack': {
    id: 'gap-reset-pack',
    name: 'Between Classes Reset',
    description: 'Quick mental reset between events',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 2, max: 5 },
        intensity: 'low',
        goal_tags: ['breathing_regulation', 'grounding', 'mental_clarity', 'reset'],
        label: 'Reset Tool'
      }
    ],
    total_duration_range: { min: 2, max: 5 }
  },
  
  'downshift-pack': {
    id: 'downshift-pack',
    name: 'Evening Wind-Down',
    description: 'Transition to rest and recovery',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 5, max: 10 },
        intensity: 'low',
        goal_tags: ['recovery', 'restoration', 'nervous_system_calm', 'sleep_preparation'],
        label: 'Wind-Down Protocol'
      }
    ],
    total_duration_range: { min: 5, max: 10 }
  },
  
  'morning-activation-pack': {
    id: 'morning-activation-pack',
    name: 'Morning Activation',
    description: 'Start your day with clarity and energy',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 3, max: 7 },
        intensity: 'medium',
        goal_tags: ['activation', 'energize', 'alertness', 'morning_ritual'],
        label: 'Activation Protocol'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 1, max: 3 },
        intensity: 'medium',
        goal_tags: ['focus', 'intention', 'mental_clarity'],
        label: 'Focus Mindset'
      }
    ],
    total_duration_range: { min: 3, max: 10 }
  },
  
  'pre-performance-pack': {
    id: 'pre-performance-pack',
    name: 'Performance Prep Pack',
    description: 'General preparation for any high-stakes moment',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'mindset',
        required: true,
        duration_range: { min: 1, max: 3 },
        intensity: 'medium',
        goal_tags: ['confidence', 'focus', 'composure'],
        label: 'Mindset Protocol'
      },
      {
        step_type: 'somatic',
        required: true,
        duration_range: { min: 2, max: 5 },
        intensity: 'low',
        goal_tags: ['grounding', 'breathing_regulation'],
        label: 'Somatic Tool'
      }
    ],
    total_duration_range: { min: 3, max: 8 }
  },

  // ============================================
  // ADVANCE PREPARATION PACKS (2-7 days before)
  // Role-Play focused for practice and mental rehearsal
  // ============================================

  'advance-exam-pack': {
    id: 'advance-exam-pack',
    name: 'Exam Preparation',
    description: 'Build confidence and mental readiness for your exam',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'roleplay',
        required: true,
        duration_range: { min: 3, max: 10 },
        intensity: 'medium',
        goal_tags: ['exam', 'practice', 'mental_rehearsal', 'confidence'],
        label: 'Practice Session'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 2, max: 5 },
        intensity: 'low',
        goal_tags: ['confidence', 'composure', 'focus'],
        label: 'Confidence Builder'
      }
    ],
    total_duration_range: { min: 3, max: 15 }
  },

  'advance-interview-pack': {
    id: 'advance-interview-pack',
    name: 'Interview Preparation',
    description: 'Practice answering tough interview questions',
    mastery_focus: 'both',
    steps: [
      {
        step_type: 'roleplay',
        required: true,
        duration_range: { min: 5, max: 15 },
        intensity: 'medium',
        goal_tags: ['interview', 'communication', 'confidence', 'practice'],
        label: 'Interview Practice'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 2, max: 5 },
        intensity: 'medium',
        goal_tags: ['confidence', 'composure', 'presence'],
        label: 'Confidence Builder'
      }
    ],
    total_duration_range: { min: 5, max: 20 }
  },

  'advance-presentation-pack': {
    id: 'advance-presentation-pack',
    name: 'Presentation Practice',
    description: 'Rehearse your delivery and key points',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'roleplay',
        required: true,
        duration_range: { min: 5, max: 15 },
        intensity: 'medium',
        goal_tags: ['presentation', 'public_speaking', 'confidence', 'practice'],
        label: 'Presentation Rehearsal'
      },
      {
        step_type: 'somatic',
        required: false,
        duration_range: { min: 2, max: 4 },
        intensity: 'low',
        goal_tags: ['grounding', 'breathing_regulation'],
        label: 'Calm Nerves'
      }
    ],
    total_duration_range: { min: 5, max: 19 }
  },

  'advance-competition-pack': {
    id: 'advance-competition-pack',
    name: 'Competition Preparation',
    description: 'Mental rehearsal and visualization for peak performance',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'roleplay',
        required: true,
        duration_range: { min: 5, max: 10 },
        intensity: 'medium',
        goal_tags: ['competition', 'visualization', 'mental_rehearsal', 'performance'],
        label: 'Mental Rehearsal'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 2, max: 5 },
        intensity: 'high',
        goal_tags: ['confidence', 'focus', 'peak_performance'],
        label: 'Peak Mindset'
      }
    ],
    total_duration_range: { min: 5, max: 15 }
  },

  'advance-social-pack': {
    id: 'advance-social-pack',
    name: 'Social Event Preparation',
    description: 'Practice introductions and conversation starters',
    mastery_focus: 'social',
    steps: [
      {
        step_type: 'roleplay',
        required: true,
        duration_range: { min: 5, max: 10 },
        intensity: 'low',
        goal_tags: ['networking', 'social', 'communication', 'introduction'],
        label: 'Networking Practice'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 2, max: 4 },
        intensity: 'low',
        goal_tags: ['confidence', 'presence', 'social'],
        label: 'Social Confidence'
      }
    ],
    total_duration_range: { min: 5, max: 14 }
  },

  'advance-leadership-pack': {
    id: 'advance-leadership-pack',
    name: 'Leadership Preparation',
    description: 'Practice your key messages and team address',
    mastery_focus: 'both',
    steps: [
      {
        step_type: 'roleplay',
        required: true,
        duration_range: { min: 5, max: 12 },
        intensity: 'medium',
        goal_tags: ['leadership', 'communication', 'presence', 'authority'],
        label: 'Leadership Practice'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 2, max: 4 },
        intensity: 'medium',
        goal_tags: ['confidence', 'composure', 'presence'],
        label: 'Presence Builder'
      }
    ],
    total_duration_range: { min: 5, max: 16 }
  },

  'advance-performance-pack': {
    id: 'advance-performance-pack',
    name: 'Performance Preparation',
    description: 'Full run-through and mental rehearsal',
    mastery_focus: 'self',
    steps: [
      {
        step_type: 'roleplay',
        required: true,
        duration_range: { min: 5, max: 12 },
        intensity: 'medium',
        goal_tags: ['performance', 'rehearsal', 'visualization', 'practice'],
        label: 'Full Rehearsal'
      },
      {
        step_type: 'mindset',
        required: false,
        duration_range: { min: 2, max: 4 },
        intensity: 'medium',
        goal_tags: ['confidence', 'focus', 'presence'],
        label: 'Performance Mindset'
      }
    ],
    total_duration_range: { min: 5, max: 16 }
  }
};

// Content selection scoring
interface ContentScore {
  content: SanctuaryContent;
  score: number;
}

function scoreContentForStep(
  content: SanctuaryContent,
  stepDef: PackStepDefinition,
  excludeIds: Set<string>,
  favoriteIds: string[] = []
): number {
  // Skip if already used or outside duration range
  if (excludeIds.has(content.id)) return -1;
  if (content.duration < stepDef.duration_range.min || content.duration > stepDef.duration_range.max) return -1;
  
  let score = 0;
  
  /**
   * STRICT content type matching - only use Recalibrate content:
   * - Mindset protocols: MUST have subType === 'mindset'
   * - Somatic protocols: MUST have subType === 'tool' OR contentType === 'soundbath' OR 'guided-practice'
   */
  if (stepDef.step_type === 'mindset') {
    // Only match content explicitly marked as mindset
    if (content.subType !== 'mindset') return -1;
    score += 30;
  } else if (stepDef.step_type === 'somatic') {
    // Match somatic tools (breathing, grounding) or soundbaths/guided practices
    const isSomaticTool = content.subType === 'tool';
    const isSoundbath = content.contentType === 'soundbath';
    const isGuidedPractice = content.contentType === 'guided-practice';
    
    if (!isSomaticTool && !isSoundbath && !isGuidedPractice) return -1;
    score += 30;
  }
  
  // Goal tag matching
  if (content.structuredTags?.goalTags) {
    const matchingGoals = stepDef.goal_tags.filter(tag =>
      content.structuredTags?.goalTags.some((goalTag: string) =>
        goalTag.toLowerCase().includes(tag.toLowerCase()) ||
        tag.toLowerCase().includes(goalTag.toLowerCase())
      )
    );
    score += matchingGoals.length * 10;
  }
  
  // Legacy tag matching fallback
  const matchingTags = stepDef.goal_tags.filter(tag =>
    content.tags.some(contentTag =>
      contentTag.toLowerCase().includes(tag.toLowerCase()) ||
      tag.toLowerCase().includes(contentTag.toLowerCase())
    )
  );
  score += matchingTags.length * 5;
  
  // Intensity matching
  if (content.structuredTags?.intensityLevel === stepDef.intensity) {
    score += 10;
  }
  
  // Favorite bonus
  if (favoriteIds.includes(content.id)) {
    score += 15;
  }
  
  // Duration fit bonus (prefer content closer to middle of range)
  const midDuration = (stepDef.duration_range.min + stepDef.duration_range.max) / 2;
  const durationDiff = Math.abs(content.duration - midDuration);
  score += Math.max(0, 10 - durationDiff * 2);
  
  return score;
}

function selectContentForStep(
  stepDef: PackStepDefinition,
  excludeIds: Set<string>,
  favoriteIds: string[] = [],
  preferQuick: boolean = false,
  eventType?: string,
  eventTitle?: string
): SanctuaryContent | null {
  // Special handling for roleplay steps - create virtual content
  if (stepDef.step_type === 'roleplay' && eventType) {
    return createRoleplayContent(eventType, stepDef.goal_tags, eventTitle);
  }
  
  const scores: ContentScore[] = [];
  
  // Use combined content pool (includes quick interventions)
  const contentPool = preferQuick 
    ? allContent.filter(c => c.duration <= 1) // Only quick content for urgent situations
    : allContent;
  
  contentPool.forEach(content => {
    const score = scoreContentForStep(content, stepDef, excludeIds, favoriteIds);
    if (score > 0) {
      scores.push({ content, score });
    }
  });
  
  if (scores.length === 0) {
    // Try fallback tags if available
    if (stepDef.fallback_tags && stepDef.fallback_tags.length > 0) {
      const fallbackStep = { ...stepDef, goal_tags: stepDef.fallback_tags };
      contentPool.forEach(content => {
        const score = scoreContentForStep(content, fallbackStep, excludeIds, favoriteIds);
        if (score > 0) {
          scores.push({ content, score });
        }
      });
    }
  }
  
  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.content || null;
}

/**
 * Determine dynamic step count based on context
 */
function determineStepCount(moment: MomentCandidate, template: PackTemplate): number {
  const minutesUntil = moment.event_context?.minutes_until || 60;
  const isAdvancePrep = moment.moment_type === 'advance-preparation';
  
  // Advance preparation: Use full template (role-play focused)
  if (isAdvancePrep) {
    return template.steps.length;
  }
  
  // Same-day, very limited time (<10 min): 1 step only
  if (minutesUntil < 10) {
    return 1;
  }
  
  // Same-day, limited time (<20 min): max 2 steps
  if (minutesUntil < 20) {
    return Math.min(2, template.steps.length);
  }
  
  // Otherwise: Full template
  return template.steps.length;
}

/**
 * Build a pack for a detected moment
 * Flexible step count (1-3) based on time available and context
 * Prefers quick interventions when time is very limited
 */
export function buildPack(
  moment: MomentCandidate,
  excludeContentIds: Set<string> = new Set(),
  favoriteIds: string[] = []
): BuiltPack | null {
  const template = PACK_TEMPLATES[moment.pack_template];
  if (!template) {
    console.warn(`Pack template not found: ${moment.pack_template}`);
    return null;
  }
  
  const maxSteps = determineStepCount(moment, template);
  const minutesUntil = moment.event_context?.minutes_until || 60;
  
  // Prefer quick interventions when time is very limited (<15 min)
  const preferQuick = minutesUntil < 15 && moment.moment_type !== 'advance-preparation';
  
  const steps: PackStep[] = [];
  const usedIds = new Set(excludeContentIds);
  let stepsAdded = 0;
  
  // Derive event type and title from moment for roleplay content creation
  const eventType = moment.event_context?.event_type || 'interview';
  const eventTitle = moment.event_context?.event_title;
  
  // First pass: Add required steps (up to maxSteps)
  for (const stepDef of template.steps) {
    if (stepsAdded >= maxSteps) break;
    if (!stepDef.required) continue;
    
    // Adjust duration range for quick content preference
    const adjustedStepDef = preferQuick 
      ? { ...stepDef, duration_range: { min: 0.5, max: 1 } }
      : stepDef;
    
    const content = selectContentForStep(adjustedStepDef, usedIds, favoriteIds, preferQuick, eventType, eventTitle);
    
    if (content) {
      usedIds.add(content.id);
      steps.push({
        step_type: stepDef.step_type,
        content,
        label: stepDef.label,
        duration: content.duration,
        is_optional: false
      });
      stepsAdded++;
    } else {
      // Fallback to any content if quick content not found
      const fallbackContent = selectContentForStep(stepDef, usedIds, favoriteIds, false, eventType, eventTitle);
      if (fallbackContent) {
        usedIds.add(fallbackContent.id);
        steps.push({
          step_type: stepDef.step_type,
          content: fallbackContent,
          label: stepDef.label,
          duration: fallbackContent.duration,
          is_optional: false
        });
        stepsAdded++;
      } else {
        console.warn(`Could not find content for required step: ${stepDef.step_type}`);
      }
    }
  }
  
  // Second pass: Add optional steps if we have room (skip if preferring quick)
  if (!preferQuick) {
    for (const stepDef of template.steps) {
      if (stepsAdded >= maxSteps) break;
      if (stepDef.required) continue;
      
      const content = selectContentForStep(stepDef, usedIds, favoriteIds, false, eventType, eventTitle);
      
      if (content) {
        usedIds.add(content.id);
        steps.push({
          step_type: stepDef.step_type,
          content,
          label: stepDef.label,
          duration: content.duration,
          is_optional: true
        });
        stepsAdded++;
      }
    }
  }
  
  // Need at least one step
  if (steps.length === 0) {
    return null;
  }
  
  const totalDuration = steps.reduce((sum, step) => sum + step.duration, 0);
  
  return {
    template_id: template.id,
    template_name: template.name,
    steps,
    total_duration: totalDuration,
    why_now: generateWhyNow(moment, template),
    mastery_focus: template.mastery_focus
  };
}

function generateWhyNow(moment: MomentCandidate, template: PackTemplate): string {
  const { moment_type, event_context } = moment;
  const daysUntil = event_context?.days_until;
  
  switch (moment_type) {
    case 'advance-preparation':
      return `${event_context?.event_title || 'High-stakes event'} in ${daysUntil} days. Start preparing now with practice and mental rehearsal.`;
    case 'pre-performance':
      return `${event_context?.event_title || 'High-stakes event'} coming up. ${template.description}.`;
    case 'pre-social':
      return `${event_context?.event_title || 'Social event'} ahead. ${template.description}.`;
    case 'energy-protection':
      return `Low energy + packed schedule detected. ${template.description}.`;
    case 'schedule-overload':
      return `Heavy schedule ahead. ${template.description}.`;
    case 'between-events':
      return `Gap before next event. ${template.description}.`;
    case 'end-of-day':
      return `Evening wind-down time. ${template.description}.`;
    case 'morning-prep':
      return `Start your day strong. ${template.description}.`;
    default:
      return template.description;
  }
}

/**
 * Get roleplay prompt based on event type and timing
 */
export function getRoleplayPrompt(eventType: StudentEventType, eventTitle: string, daysUntil?: number): string | null {
  // Advance preparation prompts (2+ days before)
  if (daysUntil && daysUntil >= 2) {
    const advancePrompts: Partial<Record<StudentEventType, string>> = {
      'exam': `Prepare for "${eventTitle}": Practice explaining key concepts. What questions might you struggle with?`,
      'interview': `Prepare for "${eventTitle}": Practice answering 5-7 common interview questions. Record yourself.`,
      'presentation': `Prepare for "${eventTitle}": Practice your full presentation 2-3 times. Focus on opening and transitions.`,
      'networking': `Prepare for "${eventTitle}": Practice your introduction and 3-4 conversation starters.`,
      'competition': `Prepare for "${eventTitle}": Visualize yourself performing at your best. What does success look like?`,
      'sports-match': `Prepare for "${eventTitle}": Mental rehearsal of key plays and strategies.`,
      'leadership': `Prepare for "${eventTitle}": Practice your key messages and how you'll respond to questions.`,
      'performance': `Prepare for "${eventTitle}": Full run-through focusing on tricky sections.`
    };
    return advancePrompts[eventType] || null;
  }
  
  // Day-of prompts (same day)
  const dayOfPrompts: Partial<Record<StudentEventType, string>> = {
    'exam': `Before "${eventTitle}": Quick mental review of your key points. You've prepared for this.`,
    'interview': `Before "${eventTitle}": Practice your opening statement and 2-3 key answers.`,
    'presentation': `Before "${eventTitle}": Practice your opening 30 seconds with full energy.`,
    'networking': `Before "${eventTitle}": Practice your introduction one more time.`,
    'competition': `Before "${eventTitle}": Visualize your first few moves with confidence.`,
    'sports-match': `Before "${eventTitle}": Quick mental rehearsal of your game plan.`,
    'leadership': `Before "${eventTitle}": Center yourself and remember your key message.`,
    'performance': `Before "${eventTitle}": Run through your opening mentally. Trust your preparation.`
  };
  
  return dayOfPrompts[eventType] || null;
}
