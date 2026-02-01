/**
 * Performance Plan Engine - Core logic for generating personalized daily rituals
 * 
 * This engine:
 * 1. Maps theme phrases to specific module requirements (Regulate, Align, Prepare, Integrate)
 * 2. Scores and selects content based on favorites, coach insights, and effectiveness history
 * 3. Enforces the Regulate → Align → Prepare → Integrate sequence
 * 4. Limits plans to 3-4 modules max
 */

import { type SanctuaryContent, sanctuaryContent } from '@/data/practicesAndSoundscapes';
import { 
  type EnergyTier, 
  type TimeOfDay, 
  type CalendarLoad, 
  type CalendarPressure,
  type ThemeDriver 
} from './energyStateScoring';

// ==================== TYPES ====================

export interface CoachInsight {
  id: string;
  type: 'preference' | 'goal' | 'feedback' | 'challenge';
  content: string;
  contentReference?: string;
  confidence: number;
  extractedAt: Date;
}

export interface HighStakesEvent {
  id: string;
  title: string;
  startTime: Date;
  minutesUntil: number;
}

export interface PatternInsight {
  count: number;
  state: string;
  message: string;
  recommendation: string;
}

export interface PlanContext {
  // State inputs
  energyTier: EnergyTier;
  checkInOutcome: string;
  timeOfDay: TimeOfDay;
  
  // Theme inputs
  themePhrase: string;
  themeDriver: ThemeDriver;
  
  // User preferences
  favorites: string[];
  coachInsights: CoachInsight[];
  archetype?: string;
  
  // History
  completedToday: string[];
  effectiveContent: string[];  // Content that led to positive outcomes
  
  // External context
  calendarPressure: CalendarPressure;
  calendarLoad: CalendarLoad;
  upcomingHighStakes?: HighStakesEvent;
  wearableStress?: 'normal' | 'elevated' | 'high';
  patternInsight?: PatternInsight;
  
  // Calendar event keywords for scenario detection
  calendarEventTitles?: string[];
}

// ==================== EXECUTIVE SCENARIO PLANS ====================

export interface ExecutiveScenario {
  id: string;
  name: string;
  contextLabel: string;
  triggers: {
    calendarKeywords?: string[];
    hoursAhead?: number;
    wearableCondition?: 'low_readiness' | 'elevated_stress';
    checkInPattern?: 'consecutive-low' | 'high-cognitive-day';
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
  };
  modules: ModuleSpec[];
}

// Executive scenarios for senior leaders - focusing on PROACTIVE self-mastery
export const EXECUTIVE_SCENARIOS: ExecutiveScenario[] = [
  // ============= PRE-EVENT SCENARIOS (Proactive) =============
  {
    id: 'pre-board-meeting',
    name: 'Pre-Board Meeting',
    contextLabel: 'Board Meeting Prep',
    triggers: { 
      calendarKeywords: ['board', 'board meeting', 'board of directors'], 
      hoursAhead: 24 
    },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ]
  },
  {
    id: 'pre-investor-meeting',
    name: 'Pre-Investor Meeting',
    contextLabel: 'High-Stakes Presentation',
    triggers: { 
      calendarKeywords: ['investor', 'vc', 'funding', 'pitch', 'keynote'], 
      hoursAhead: 24 
    },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-strategic-planning',
    name: 'Pre-Strategic Planning',
    contextLabel: 'Strategy Session Prep',
    triggers: { 
      calendarKeywords: ['strategy', 'strategic planning', 'offsite', 'vision', 'roadmap'], 
      hoursAhead: 24 
    },
    modules: [
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-negotiations',
    name: 'Pre-Negotiations',
    contextLabel: 'Negotiation Prep',
    triggers: { 
      calendarKeywords: ['negotiation', 'contract', 'deal', 'terms', 'partnership'], 
      hoursAhead: 12 
    },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ]
  },
  {
    id: 'pre-all-hands',
    name: 'Pre-All Hands',
    contextLabel: 'Company Meeting Prep',
    triggers: { 
      calendarKeywords: ['all hands', 'town hall', 'company meeting', 'team meeting'], 
      hoursAhead: 4 
    },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-media',
    name: 'Pre-Media/Interview',
    contextLabel: 'Media Appearance Prep',
    triggers: { 
      calendarKeywords: ['interview', 'podcast', 'media', 'press', 'journalist', 'pr'], 
      hoursAhead: 6 
    },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-crisis-response',
    name: 'Pre-Crisis Response',
    contextLabel: 'Crisis Preparation',
    triggers: { 
      calendarKeywords: ['crisis', 'urgent', 'emergency', 'incident', 'escalation'], 
      hoursAhead: 2 
    },
    modules: [
      { type: 'regulate', required: true, priority: 10, intensity: 'gentle', duration: 'micro', focus: 'composure' }
    ]
  },
  {
    id: 'pre-hiring-decision',
    name: 'Pre-Hiring Decision',
    contextLabel: 'Hiring Review Prep',
    triggers: { 
      calendarKeywords: ['final round', 'hiring committee', 'offer discussion', 'candidate review', 'executive hire'], 
      hoursAhead: 4 
    },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
    ]
  },
  {
    id: 'pre-client-presentation',
    name: 'Pre-Client Presentation',
    contextLabel: 'Client Meeting Prep',
    triggers: { 
      calendarKeywords: ['client', 'demo', 'proposal', 'customer', 'account review'], 
      hoursAhead: 8 
    },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-budget-review',
    name: 'Pre-Budget/Finance Review',
    contextLabel: 'Finance Review Prep',
    triggers: { 
      calendarKeywords: ['budget', 'finance review', 'forecast', 'financial planning', 'earnings'], 
      hoursAhead: 24 
    },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
    ]
  },
  {
    id: 'pre-performance-review',
    name: 'Pre-Performance Review',
    contextLabel: 'Review Preparation',
    triggers: { 
      calendarKeywords: ['performance review', 'annual review', 'mid-year review', '360 feedback'], 
      hoursAhead: 8 
    },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ]
  },
  {
    id: 'pre-difficult-conversation',
    name: 'Pre-Difficult Conversation',
    contextLabel: 'Conversation Prep',
    triggers: { 
      calendarKeywords: ['1:1', 'one on one', 'feedback', 'pip', 'termination', 'difficult', 'conflict'], 
      hoursAhead: 4 
    },
    modules: [
      { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ]
  },
  {
    id: 'pre-quarterly-review',
    name: 'Pre-Quarterly Review',
    contextLabel: 'Quarterly Prep',
    triggers: { 
      calendarKeywords: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4'], 
      hoursAhead: 48 
    },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-speaking-engagement',
    name: 'Pre-Speaking Engagement',
    contextLabel: 'Speaking Prep',
    triggers: { 
      calendarKeywords: ['conference', 'summit', 'panel', 'speaking', 'presentation', 'webinar'], 
      hoursAhead: 12 
    },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-leadership-meeting',
    name: 'Pre-Leadership Meeting',
    contextLabel: 'Leadership Prep',
    triggers: { 
      calendarKeywords: ['leadership team', 'exec team', 'c-suite', 'slt', 'management meeting'], 
      hoursAhead: 4 
    },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' }
    ]
  },
  // ============= CONDITION-BASED SCENARIOS =============
  {
    id: 'high-cognitive-load',
    name: 'High Cognitive Load Day',
    contextLabel: 'Dense Meeting Day',
    triggers: { 
      checkInPattern: 'high-cognitive-day'
    },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'micro', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
    ]
  },
  {
    id: 'recovery-day',
    name: 'Recovery Day',
    contextLabel: 'Low Energy Recovery',
    triggers: { 
      wearableCondition: 'low_readiness'
    },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' }
    ]
  },
  // ============= POST-EVENT SCENARIOS =============
  {
    id: 'post-tough-day',
    name: 'Post-Tough Day Recovery',
    contextLabel: 'Evening Recovery',
    triggers: { 
      timeOfDay: 'evening',
      checkInPattern: 'consecutive-low'
    },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'release' },
      { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
    ]
  }
];

/**
 * Detect if any executive scenario applies based on context
 */
export function detectExecutiveScenario(context: PlanContext): ExecutiveScenario | null {
  const eventTitles = context.calendarEventTitles || [];
  const allTitlesLower = eventTitles.map(t => t.toLowerCase()).join(' ');
  
  for (const scenario of EXECUTIVE_SCENARIOS) {
    const { triggers } = scenario;
    let matches = true;
    
    // Check calendar keywords
    if (triggers.calendarKeywords) {
      const hasKeyword = triggers.calendarKeywords.some(kw => 
        allTitlesLower.includes(kw.toLowerCase())
      );
      if (!hasKeyword) matches = false;
    }
    
    // Check time of day
    if (triggers.timeOfDay && context.timeOfDay !== triggers.timeOfDay) {
      matches = false;
    }
    
    // Check wearable condition
    if (triggers.wearableCondition === 'low_readiness' && context.wearableStress !== 'high') {
      // Only match if wearable shows stress
      matches = false;
    }
    if (triggers.wearableCondition === 'elevated_stress' && context.wearableStress !== 'elevated') {
      matches = false;
    }
    
    // Check pattern insight for consecutive-low
    if (triggers.checkInPattern === 'consecutive-low') {
      if (!context.patternInsight || context.patternInsight.count < 3) {
        matches = false;
      }
    }
    
    // Check high-cognitive-day (calendar load = high)
    if (triggers.checkInPattern === 'high-cognitive-day' && context.calendarLoad !== 'high') {
      matches = false;
    }
    
    if (matches) {
      console.log(`[PerformancePlan] Detected executive scenario: ${scenario.name}`);
      return scenario;
    }
  }
  
  return null;
}

export interface PlanContextResult {
  source: 'checkin' | 'jit-calendar' | 'jit-wearable' | 'jit-pattern' | 'routine-morning' | 'routine-evening' | 'executive-scenario';
  description?: string;
  scenarioName?: string;
}

export interface ModuleSpec {
  type: 'regulate' | 'align' | 'prepare' | 'integrate';
  required: boolean;
  priority: number;  // 1-10, higher = more urgent
  intensity: 'gentle' | 'moderate' | 'activating';
  duration: 'micro' | 'short' | 'standard';  // <2min, 2-5min, 5-15min
  focus: string;  // e.g., 'composure', 'grounding', 'focus', 'release'
}

export interface CoachCard {
  id: string;
  type: 'prepare' | 'integrate';
  label: string;
  protocolType: string;
  title: string;
  duration: number;
  sortOrder: number;
  isCoachCard: true;
  prompt: string;
  eventTitle?: string;
}

export interface ModuleRecommendation {
  type: 'regulate' | 'align' | 'prepare' | 'integrate';
  required: boolean;
  priority: number;
  intensity: 'gentle' | 'moderate' | 'activating';
  duration: 'micro' | 'short' | 'standard';
  focus: string;
  reasoning: string;
  content: SanctuaryContent | CoachCard;
  isFavorite?: boolean;
  isCoachRecommended?: boolean;
}

// ==================== THEME TO MODULE MAPPING ====================

interface ThemeModuleMapping {
  regulate?: ModuleSpec;
  align?: ModuleSpec;
  prepare?: ModuleSpec;
  integrate?: ModuleSpec;
}

// Complete mapping of all 45+ theme phrases to module requirements
const THEME_MODULE_MAP: Record<string, ThemeModuleMapping> = {
  // ============= OVERWHELMED THEMES =============
  "Survival mode activated.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Steady your ground.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Protect your boundaries today.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Simplify to survive.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Choose your battles wisely.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Pace your recovery.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'release' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Set the tone gently.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Decompress before you rest.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Regulate before you engage.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'composure' }
  },

  // ============= DRAINED THEMES =============
  "Conserve for what counts.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'micro', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'composure' }
  },
  "Strategic bursts only.": {
    regulate: { type: 'regulate', required: true, priority: 6, intensity: 'gentle', duration: 'micro', focus: 'restore' }
  },
  "Guard your reserves.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Endurance over excellence.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Navigate, don't sprint.": {
    regulate: { type: 'regulate', required: true, priority: 6, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Gentle momentum.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 3, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Ease into the day.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Rest is productive.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Restore before you push.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },

  // ============= SCATTERED THEMES =============
  // Note: Scattered users get Coach (prepare) as optional AFTER grounding (Regulate + Align)
  "Focus or fragment.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'focus' }
  },
  "Clarity before stakes.": {
    regulate: { type: 'regulate', required: true, priority: 6, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'clarity' }
  },
  "Find your center first.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Anchor and execute.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'focus' }
  },
  "One thread at a time.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'focus' }
  },
  "Reclaim your attention.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'focus' }
  },
  "Ground before you go.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Release the threads.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'release' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Find your anchor point.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },

  // ============= STEADY THEMES =============
  "Anchor in the storm.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' }
  },
  "Calm confidence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Rise to the moment.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'confidence' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Sustainable pace required.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Ride the rhythm.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Steady as she goes.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Build your reserves today.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Set the rhythm.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'grounding' }
  },
  "Maintain your balance.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 6, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Build on your balance.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'grounding' }
  },

  // ============= FOCUSED THEMES =============
  "Peak performance day.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'confidence' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Execute with precision.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Seize the high ground.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Channel the intensity.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 6, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Sprint through the density.": {
    align: { type: 'align', required: true, priority: 6, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Strategic deployment.": {
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Maximize your morning.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Channel wisely.": {
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' },
    integrate: { type: 'integrate', required: true, priority: 6, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Own your optimal state.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  }
};

// Default fallback mapping if theme phrase not found
const DEFAULT_MODULE_MAPPING: ThemeModuleMapping = {
  regulate: { type: 'regulate', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'grounding' },
  align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'grounding' }
};

// ==================== CONTENT SELECTION ====================

// Content IDs categorized by module type and focus
const REGULATE_CONTENT_FILTERS = {
  somatic: (c: SanctuaryContent) => 
    c.contentType === 'soundbath' || 
    (c.contentType === 'guided-practice' && c.tags?.some(t => 
      t.toLowerCase().includes('breathing') || 
      t.toLowerCase().includes('somatic')
    )) ||
    (c.contentType === 'micro-practice' && c.subType !== 'mindset' && c.tags?.some(t =>
      t.toLowerCase().includes('breathing') ||
      t.toLowerCase().includes('somatic') ||
      t.toLowerCase().includes('grounding')
    )),
    
  intensity: {
    gentle: (c: SanctuaryContent) => c.structuredTags?.intensityLevel === 'low' || c.tags?.includes('gentle'),
    moderate: (c: SanctuaryContent) => c.structuredTags?.intensityLevel === 'medium' || c.tags?.includes('moderate'),
    activating: (c: SanctuaryContent) => c.structuredTags?.intensityLevel === 'high' || c.tags?.includes('activation')
  },
  
  focus: {
    composure: (c: SanctuaryContent) => c.structuredTags?.goalTags?.includes('composure') || c.tags?.some(t => t.includes('composure') || t.includes('centering')),
    grounding: (c: SanctuaryContent) => c.structuredTags?.goalTags?.includes('grounding') || c.tags?.includes('grounding'),
    release: (c: SanctuaryContent) => c.structuredTags?.energyDirection === 'downshift' || c.tags?.some(t => t.includes('release') || t.includes('cooling')),
    restore: (c: SanctuaryContent) => c.structuredTags?.masterySubtypes?.includes('restore') || c.tags?.some(t => t.includes('restore') || t.includes('healing'))
  }
};

const ALIGN_CONTENT_FILTERS = {
  mindset: (c: SanctuaryContent) => c.contentType === 'micro-practice' && c.subType === 'mindset',
  
  focus: {
    composure: (c: SanctuaryContent) => c.tags?.some(t => t.includes('composure') || t.includes('calm')),
    grounding: (c: SanctuaryContent) => c.tags?.some(t => t.includes('grounding') || t.includes('presence')),
    focus: (c: SanctuaryContent) => c.tags?.some(t => t.includes('focus') || t.includes('clarity')),
    confidence: (c: SanctuaryContent) => c.tags?.some(t => t.includes('confidence') || t.includes('courage')),
    release: (c: SanctuaryContent) => c.tags?.some(t => t.includes('release') || t.includes('letting go'))
  }
};

// Duration filters
const DURATION_FILTERS = {
  micro: (c: SanctuaryContent) => c.duration <= 2,
  short: (c: SanctuaryContent) => c.duration > 2 && c.duration <= 5,
  standard: (c: SanctuaryContent) => c.duration > 5 && c.duration <= 15
};

// ==================== CONTENT SCORING ====================

export function calculateContentScore(
  content: SanctuaryContent,
  moduleSpec: ModuleSpec,
  context: PlanContext
): number {
  let score = 0;
  
  // 1. Favorite match (+30)
  if (context.favorites.includes(content.id)) {
    score += 30;
  }
  
  // 2. Coach insight preference match (+25)
  const preferenceMatch = context.coachInsights
    .filter(i => i.type === 'preference' && i.confidence >= 0.7)
    .some(i => matchesInsight(content, i));
  if (preferenceMatch) {
    score += 25;
  }
  
  // 3. Previously effective content (+20)
  if (context.effectiveContent.includes(content.id)) {
    score += 20;
  }
  
  // 4. Intensity match (+15)
  const intensityFilter = REGULATE_CONTENT_FILTERS.intensity[moduleSpec.intensity];
  if (intensityFilter && intensityFilter(content)) {
    score += 15;
  }
  
  // 5. Duration match (+10)
  const durationFilter = DURATION_FILTERS[moduleSpec.duration];
  if (durationFilter && durationFilter(content)) {
    score += 10;
  }
  
  // 6. Focus/goal tag match (+10)
  const focusFilters = moduleSpec.type === 'regulate' 
    ? REGULATE_CONTENT_FILTERS.focus 
    : ALIGN_CONTENT_FILTERS.focus;
  const focusFilter = focusFilters[moduleSpec.focus as keyof typeof focusFilters];
  if (focusFilter && focusFilter(content)) {
    score += 10;
  }
  
  // 7. Recency penalty (-10 if used in last 3 days - would need tracking)
  // Note: This would require additional tracking infrastructure
  
  return score;
}

function matchesInsight(content: SanctuaryContent, insight: CoachInsight): boolean {
  const insightLower = insight.content.toLowerCase();
  const titleLower = content.title.toLowerCase();
  
  // Check if insight mentions this content specifically
  if (insight.contentReference === content.id) return true;
  
  // Check for keyword matches
  const keywords = insightLower.split(/\s+/);
  return keywords.some(kw => 
    kw.length > 3 && (titleLower.includes(kw) || content.tags?.some(t => t.toLowerCase().includes(kw)))
  );
}

// ==================== MODULE CONTENT SELECTION ====================

function getContentPoolForModule(moduleType: 'regulate' | 'align'): SanctuaryContent[] {
  if (moduleType === 'regulate') {
    return sanctuaryContent.filter(REGULATE_CONTENT_FILTERS.somatic);
  }
  if (moduleType === 'align') {
    return sanctuaryContent.filter(ALIGN_CONTENT_FILTERS.mindset);
  }
  return [];
}

export function selectContentForModule(
  moduleSpec: ModuleSpec,
  context: PlanContext
): SanctuaryContent | null {
  // Get base content pool
  const pool = getContentPoolForModule(moduleSpec.type as 'regulate' | 'align');
  
  // Filter out already completed today
  const available = pool.filter(c => !context.completedToday.includes(c.id));
  
  if (available.length === 0) {
    // Fall back to any content if all completed
    return pool[0] || null;
  }
  
  // Score each candidate
  const scored = available.map(content => ({
    content,
    score: calculateContentScore(content, moduleSpec, context),
    isFavorite: context.favorites.includes(content.id),
    isCoachRecommended: context.coachInsights.some(i => matchesInsight(content, i))
  }));
  
  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  
  // Use date-seeded deterministic selection for variety while maintaining stability
  // The same content will be selected throughout the day, but different days get different content
  const topCandidates = scored.slice(0, Math.min(3, scored.length));
  if (topCandidates.length === 0) return null;
  
  // Create a daily seed based on today's date + module type for deterministic selection
  const today = new Date().toISOString().split('T')[0];
  const seedString = `${today}-${moduleSpec.type}-${moduleSpec.focus}`;
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    const char = seedString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const deterministicIndex = Math.abs(hash) % topCandidates.length;
  
  console.log(`[PerformancePlan] Deterministic selection for ${moduleSpec.type}:`, {
    candidates: topCandidates.length,
    selectedIndex: deterministicIndex,
    selectedContent: topCandidates[deterministicIndex]?.content.id
  });
  
  return topCandidates[deterministicIndex]?.content || null;
}

// ==================== COACH CARDS ====================

function createCoachCard(type: 'prepare' | 'integrate'): CoachCard {
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
    title: 'Evening Flow',
    duration: 2,
    sortOrder: 4,
    isCoachCard: true,
    prompt: "Let's close out today. First, take a deep breath and let your shoulders drop. Now, what's one thing you did right today? Share your small win."
  };
}

// ==================== MAIN ENGINE ====================

export function getModulesFromTheme(themePhrase: string): ThemeModuleMapping {
  // Exact match first
  if (THEME_MODULE_MAP[themePhrase]) {
    return THEME_MODULE_MAP[themePhrase];
  }
  
  // Fuzzy match - find closest theme by normalizing punctuation and case
  const normalizedInput = themePhrase.toLowerCase().replace(/[.!?]/g, '').trim();
  for (const [key, value] of Object.entries(THEME_MODULE_MAP)) {
    const normalizedKey = key.toLowerCase().replace(/[.!?]/g, '').trim();
    if (normalizedKey === normalizedInput) {
      console.log(`[PerformancePlan] Fuzzy matched theme: "${themePhrase}" → "${key}"`);
      return value;
    }
  }
  
  // Partial match - find themes containing key words from input
  const inputWords = normalizedInput.split(/\s+/).filter(w => w.length > 3);
  for (const [key, value] of Object.entries(THEME_MODULE_MAP)) {
    const keyLower = key.toLowerCase();
    const matchCount = inputWords.filter(w => keyLower.includes(w)).length;
    if (matchCount >= 2 || (inputWords.length === 1 && matchCount === 1)) {
      console.log(`[PerformancePlan] Partial matched theme: "${themePhrase}" → "${key}" (${matchCount} words)`);
      return value;
    }
  }
  
  console.warn(`[PerformancePlan] No theme match for: "${themePhrase}", using default`);
  return DEFAULT_MODULE_MAPPING;
}

export function generatePerformancePlan(context: PlanContext): ModuleRecommendation[] {
  const recommendations: ModuleRecommendation[] = [];
  
  // Get module specs from theme
  const moduleMapping = getModulesFromTheme(context.themePhrase);
  
  // Build modules in sequence: Regulate → Align → Prepare → Integrate
  const moduleOrder: ('regulate' | 'align' | 'prepare' | 'integrate')[] = ['regulate', 'align', 'prepare', 'integrate'];
  
  for (const moduleType of moduleOrder) {
    const spec = moduleMapping[moduleType];
    if (!spec) continue;
    
    // Skip optional modules if we already have 3+ required modules
    const requiredCount = recommendations.filter(r => r.required).length;
    if (!spec.required && requiredCount >= 3) continue;
    
    // For Prepare and Integrate, use Coach cards
    if (moduleType === 'prepare' || moduleType === 'integrate') {
      const coachCard = createCoachCard(moduleType);
      recommendations.push({
        type: moduleType,
        required: spec.required,
        priority: spec.priority,
        intensity: spec.intensity,
        duration: spec.duration,
        focus: spec.focus,
        reasoning: moduleType === 'prepare' 
          ? 'Mental rehearsal for upcoming high-stakes moments'
          : 'Evening reflection and tiny wins capture',
        content: coachCard
      });
      continue;
    }
    
    // For Regulate and Align, select from content library
    const content = selectContentForModule(spec, context);
    if (content) {
      recommendations.push({
        type: moduleType,
        required: spec.required,
        priority: spec.priority,
        intensity: spec.intensity,
        duration: spec.duration,
        focus: spec.focus,
        reasoning: getModuleReasoning(moduleType, spec.focus, context),
        content,
        isFavorite: context.favorites.includes(content.id),
        isCoachRecommended: context.coachInsights.some(i => matchesInsight(content, i))
      });
    }
  }
  
  // Limit to 4 modules max, prioritizing required ones
  if (recommendations.length > 4) {
    recommendations.sort((a, b) => {
      if (a.required !== b.required) return a.required ? -1 : 1;
      return b.priority - a.priority;
    });
    return recommendations.slice(0, 4);
  }
  
  return recommendations;
}

function getModuleReasoning(
  moduleType: 'regulate' | 'align',
  focus: string,
  context: PlanContext
): string {
  const focusReasons: Record<string, string> = {
    composure: 'Restore calm and emotional regulation',
    grounding: 'Anchor your attention and center yourself',
    focus: 'Sharpen concentration and clarity',
    confidence: 'Build presence and self-assurance',
    release: 'Let go of tension and mental clutter',
    restore: 'Replenish depleted energy reserves'
  };
  
  const base = focusReasons[focus] || 'Support your current state';
  
  // Add personalization note if applicable
  if (context.patternInsight && context.patternInsight.count >= 3) {
    return `${base}. Day ${context.patternInsight.count} of ${context.patternInsight.state} - your system needs extra support.`;
  }
  
  return base;
}

// ==================== EXPORTS FOR JIT ====================

export function getQuickModulesForJIT(
  missingModules: ('regulate' | 'align')[],
  context: PlanContext
): ModuleRecommendation[] {
  const recommendations: ModuleRecommendation[] = [];
  
  for (const moduleType of missingModules) {
    // Quick specs for JIT - always micro/short, moderate intensity
    const spec: ModuleSpec = {
      type: moduleType,
      required: true,
      priority: 9,
      intensity: 'moderate',
      duration: 'micro',
      focus: 'composure'
    };
    
    const content = selectContentForModule(spec, context);
    if (content) {
      recommendations.push({
        type: moduleType,
        required: true,
        priority: 9,
        intensity: 'moderate',
        duration: 'micro',
        focus: 'composure',
        reasoning: 'Quick reset before your high-stakes moment',
        content,
        isFavorite: context.favorites.includes(content.id),
        isCoachRecommended: context.coachInsights.some(i => matchesInsight(content, i))
      });
    }
  }
  
  // JIT only suggests 2 modules max
  return recommendations.slice(0, 2);
}
