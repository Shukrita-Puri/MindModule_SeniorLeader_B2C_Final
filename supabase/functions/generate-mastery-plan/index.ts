import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ==================== RATE LIMITING ====================
const rateLimitMap = new Map<string, { lastCall: number; cachedResponse: any }>();
const RATE_LIMIT_COOLDOWN_MS = 30_000; // 30s per user

// ==================== TYPES ====================

interface ModuleSpec {
  type: 'regulate' | 'align' | 'prepare' | 'integrate';
  required: boolean;
  priority: number;
  intensity: 'gentle' | 'moderate' | 'activating';
  duration: 'micro' | 'short' | 'standard';
  focus: string;
}

interface ThemeModuleMapping {
  regulate?: ModuleSpec;
  align?: ModuleSpec;
  prepare?: ModuleSpec;
  integrate?: ModuleSpec;
}

interface ExecutiveScenario {
  id: string;
  name: string;
  contextLabel: string;
  triggers: {
    calendarKeywords?: string[];
    hoursAhead?: number;
    wearableCondition?: string;
    checkInPattern?: string;
    timeOfDay?: string;
  };
  modules: ModuleSpec[];
  rolePlayEligible?: boolean;
  mentalModelTag?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  isOrganizer?: boolean;
  attendeesCount?: number;
  isRecurring?: boolean;
}

interface WearableContext {
  sleepScore: number | null;
  hrvMs: number | null;
  restingHR: number | null;
  hrvDeviation: number | null;
  sleepQuality: string | null;
  hasData: boolean;
}

interface PlanRequest {
  // Verified server-side – NOT from client
  userId: string;
  // Only client-supplied field
  timezoneOffset: number;
  // ALL below are server-fetched – populated inside generateMasteryPlan
  innerReadinessTier: string;
  innerReadinessScore: number;
  outerReadinessPhrase: string;
  outerReadinessDriver: string;
  outerReadinessContext: string;
  outerReadinessLeanOn: string;
  outerReadinessWatchFor: string;
  calendarLoad: string;
  calendarPressure: string;
  favorites: string[];
  completedToday: string[];
  clarityLevel: number;
  confidenceLevel: number;
  checkInOutcome: string;
  calendarEvents: CalendarEvent[];
  coachInsights?: any[];
  effectiveContent?: string[];
  patternInsight?: { count: number; state: string };
  archetype: string;
  practicePriorityTag?: string;
  pressureContextTag?: string;
  wearableContext: WearableContext;
  latestCheckinTimestamp?: string;
}

// ==================== EXECUTIVE SCENARIOS ====================

const EXECUTIVE_SCENARIOS: ExecutiveScenario[] = [
  {
    id: 'pre-board-meeting', name: 'Pre-Board Meeting', contextLabel: 'Board Meeting Prep',
    triggers: { calendarKeywords: ['board', 'board meeting', 'board of directors'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: false, mentalModelTag: 'strategic-framing'
  },
  {
    id: 'pre-investor-meeting', name: 'Pre-Investor Meeting', contextLabel: 'High-Stakes Presentation',
    triggers: { calendarKeywords: ['investor', 'vc', 'funding', 'pitch', 'keynote'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'trojan-horse-influence'
  },
  {
    id: 'pre-strategic-planning', name: 'Pre-Strategic Planning', contextLabel: 'Strategy Session Prep',
    triggers: { calendarKeywords: ['strategy', 'strategic planning', 'offsite', 'vision', 'roadmap'], hoursAhead: 24 },
    modules: [
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'second-order-thinking'
  },
  {
    id: 'pre-negotiations', name: 'Pre-Negotiations', contextLabel: 'Negotiation Prep',
    triggers: { calendarKeywords: ['negotiation', 'contract', 'deal', 'terms', 'partnership'], hoursAhead: 12 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-all-hands', name: 'Pre-All Hands', contextLabel: 'Company Meeting Prep',
    triggers: { calendarKeywords: ['all hands', 'town hall', 'company meeting', 'team meeting'], hoursAhead: 4 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-media', name: 'Pre-Media/Interview', contextLabel: 'Media Appearance Prep',
    triggers: { calendarKeywords: ['interview', 'podcast', 'media', 'press', 'journalist', 'pr'], hoursAhead: 6 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-crisis-response', name: 'Pre-Crisis Response', contextLabel: 'Crisis Preparation',
    triggers: { calendarKeywords: ['crisis', 'urgent', 'emergency', 'incident', 'escalation'], hoursAhead: 2 },
    modules: [
      { type: 'regulate', required: true, priority: 10, intensity: 'gentle', duration: 'micro', focus: 'composure' }
    ]
  },
  {
    id: 'pre-hiring-decision', name: 'Pre-Hiring Decision', contextLabel: 'Hiring Review Prep',
    triggers: { calendarKeywords: ['final round', 'hiring committee', 'offer discussion', 'candidate review', 'executive hire'], hoursAhead: 4 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-client-presentation', name: 'Pre-Client Presentation', contextLabel: 'Client Meeting Prep',
    triggers: { calendarKeywords: ['client', 'demo', 'proposal', 'customer', 'account review'], hoursAhead: 8 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ]
  },
  {
    id: 'pre-budget-review', name: 'Pre-Budget/Finance Review', contextLabel: 'Finance Review Prep',
    triggers: { calendarKeywords: ['budget', 'finance review', 'forecast', 'financial planning', 'earnings'], hoursAhead: 24 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'clarity' }
    ],
    mentalModelTag: 'signal-vs-noise'
  },
  {
    id: 'pre-performance-review', name: 'Pre-Performance Review', contextLabel: 'Review Preparation',
    triggers: { calendarKeywords: ['performance review', 'annual review', 'mid-year review', '360 feedback'], hoursAhead: 8 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-difficult-conversation', name: 'Pre-Difficult Conversation', contextLabel: 'Conversation Prep',
    triggers: { calendarKeywords: ['feedback', 'pip', 'termination', 'difficult', 'conflict'], hoursAhead: 4 },
    modules: [
      { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-quarterly-review', name: 'Pre-Quarterly Review', contextLabel: 'Quarterly Prep',
    triggers: { calendarKeywords: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4'], hoursAhead: 48 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'strategic-framing'
  },
  {
    id: 'pre-speaking-engagement', name: 'Pre-Speaking Engagement', contextLabel: 'Speaking Prep',
    triggers: { calendarKeywords: ['conference', 'summit', 'panel', 'speaking', 'presentation', 'webinar'], hoursAhead: 12 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'presence-authority'
  },
  {
    id: 'pre-leadership-meeting', name: 'Pre-Leadership Meeting', contextLabel: 'Leadership Prep',
    triggers: { calendarKeywords: ['leadership team', 'exec team', 'c-suite', 'slt', 'management meeting'], hoursAhead: 4 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-ma-discussion', name: 'Pre-M&A Discussion', contextLabel: 'M&A Preparation',
    triggers: { calendarKeywords: ['m&a', 'merger', 'acquisition', 'due diligence', 'acqui-hire'], hoursAhead: 48 },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    mentalModelTag: 'second-order-thinking'
  },
  {
    id: 'pre-layoff-announcement', name: 'Pre-Layoff Announcement', contextLabel: 'Difficult Announcement Prep',
    triggers: { calendarKeywords: ['layoff', 'restructuring', 'reduction', 'rif', 'downsizing'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'composure' },
      { type: 'prepare', required: true, priority: 9, intensity: 'moderate', duration: 'short', focus: 'composure' }
    ],
    rolePlayEligible: true
  },
  {
    id: 'pre-board-presentation', name: 'Pre-Board Presentation Prep', contextLabel: 'Board Deck Prep',
    triggers: { calendarKeywords: ['board deck', 'board presentation', 'board materials'], hoursAhead: 48 },
    modules: [
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'strategic-framing'
  },
  {
    id: 'pre-competitive-intel', name: 'Pre-Competitive Intel', contextLabel: 'Competitive Review Prep',
    triggers: { calendarKeywords: ['competitor', 'competitive analysis', 'competitive intel', 'market analysis'], hoursAhead: 12 },
    modules: [
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'clarity' },
      { type: 'prepare', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'focus' }
    ],
    mentalModelTag: 'art-of-war-positioning'
  },
  {
    id: 'pre-product-launch', name: 'Pre-Product Launch', contextLabel: 'Launch Preparation',
    triggers: { calendarKeywords: ['launch', 'go live', 'release', 'ship', 'product launch'], hoursAhead: 24 },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
      { type: 'align', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' },
      { type: 'prepare', required: true, priority: 8, intensity: 'moderate', duration: 'short', focus: 'confidence' }
    ],
    mentalModelTag: 'strategic-framing'
  },
  // Condition-based scenarios
  {
    id: 'high-cognitive-load', name: 'High Cognitive Load Day', contextLabel: 'Dense Meeting Day',
    triggers: { checkInPattern: 'high-cognitive-day' },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'micro', focus: 'grounding' },
      { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
    ]
  },
  {
    id: 'recovery-day', name: 'Recovery Day', contextLabel: 'Low Energy Recovery',
    triggers: { wearableCondition: 'low_readiness' },
    modules: [
      { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' }
    ]
  },
  {
    id: 'post-tough-day', name: 'Post-Tough Day Recovery', contextLabel: 'Evening Recovery',
    triggers: { timeOfDay: 'evening', checkInPattern: 'consecutive-low' },
    modules: [
      { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'release' },
      { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
    ]
  }
];

// ==================== THEME TO MODULE MAPPING ====================

const THEME_MODULE_MAP: Record<string, ThemeModuleMapping> = {
  // ==================== DEPLETED TIER (Score 0–39) ====================
  "One thing at a time.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Protect what matters.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'micro', focus: 'composure' }
  },
  "Reserve for the moment.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Navigate, don't absorb.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'micro', focus: 'restore' }
  },
  "Move through gently.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Pace and protect.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Rest is the work.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Begin with intention.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'micro', focus: 'restore' }
  },
  "Close before tomorrow.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Protect your reserves.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'grounding' }
  },
  // ==================== MANAGING TIER (Score 40–59) ====================
  "Hold your ground.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'focus' }
  },
  "Steady into the stakes.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Depth over breadth.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Rhythm over intensity.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Ride the rhythm.": {
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Steady execution.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Build your reserves.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Set a sustainable pace.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'focus' }
  },
  "Close with care.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Maintain your rhythm.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  // ==================== STRONG TIER (Score 60–74) ====================
  "Lead from strength.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Execute with presence.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Bring your full weight.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Sustain the quality.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Move with confidence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Invest the advantage.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Protect and build.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Protect the window.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Close strong.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'release' },
    align: { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Leverage your position.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  // ==================== PEAK TIER (Score 75–100) ====================
  "Peak performance day.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Execute with precision.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'activating', duration: 'micro', focus: 'confidence' }
  },
  "Seize the high ground.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Channel the capacity.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Move with full confidence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Depth and precision.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 6, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Deep work window.": {
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'standard', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Protect the peak.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Close with intention.": {
    regulate: { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Own your optimal state.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  // NO-CALENDAR FALLBACKS
  "Begin with stillness.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' }
  },
  "Operate with care.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Steady and selective.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Lead with confidence.": {
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'confidence' }
  },
  "Invest your advantage.": {
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Bring your full presence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Own your peak.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
};

const DEFAULT_MODULE_MAPPING: ThemeModuleMapping = {
  regulate: { type: 'regulate', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'grounding' },
  align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'grounding' }
};

// ==================== HELPERS ====================

function getTimeOfDay(timezoneOffset: number): 'morning' | 'afternoon' | 'evening' {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const localHour = (utcHours - (timezoneOffset / 60) + 24) % 24;
  if (localHour >= 5 && localHour < 12) return 'morning';
  if (localHour >= 12 && localHour < 18) return 'afternoon';
  return 'evening';
}

function getModulesFromTheme(themePhrase: string): ThemeModuleMapping {
  if (THEME_MODULE_MAP[themePhrase]) return THEME_MODULE_MAP[themePhrase];
  const normalizedInput = themePhrase.toLowerCase().replace(/[.!?]/g, '').trim();
  for (const [key, value] of Object.entries(THEME_MODULE_MAP)) {
    if (key.toLowerCase().replace(/[.!?]/g, '').trim() === normalizedInput) return value;
  }
  const inputWords = normalizedInput.split(/\s+/).filter(w => w.length > 3);
  for (const [key, value] of Object.entries(THEME_MODULE_MAP)) {
    const keyLower = key.toLowerCase();
    const matchCount = inputWords.filter(w => keyLower.includes(w)).length;
    if (matchCount >= 2 || (inputWords.length === 1 && matchCount === 1)) return value;
  }
  return DEFAULT_MODULE_MAPPING;
}

// ==================== CALENDAR CONTEXT (DENSITY-AWARE) ====================

interface CalendarContext {
  todayLoad: 'light' | 'moderate' | 'heavy' | 'extreme';
  todayMeetingCount: number;
  todayMeetingHours: number;
  upcomingLoad: 'light' | 'moderate' | 'heavy' | 'extreme';
  upcomingMeetingCount: number;
  upcomingMeetingHours: number;
  remainingMeetingCount: number;
}

function classifyLoad(count: number, hours: number): 'light' | 'moderate' | 'heavy' | 'extreme' {
  if (count >= 8 || hours >= 6) return 'extreme';
  if (count >= 6 || hours >= 4) return 'heavy';
  if (count >= 3 || hours >= 2) return 'moderate';
  return 'light';
}

function calculateCalendarContext(
  allDayEvents: any[],
  timeOfDay: 'morning' | 'afternoon' | 'evening'
): CalendarContext {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // All events today (full day)
  const todayEvents = allDayEvents.filter((e: any) => {
    const start = new Date(e.start_time || e.startTime);
    return start.toISOString().split('T')[0] === todayStr;
  });

  const todayMeetingCount = todayEvents.length;
  const todayMeetingHours = todayEvents.reduce((sum: number, e: any) => {
    const start = new Date(e.start_time || e.startTime).getTime();
    const end = new Date(e.end_time || e.endTime).getTime();
    return sum + Math.max(0, (end - start) / 3_600_000);
  }, 0);

  // Upcoming = rest of today (events starting after now)
  const upcomingEvents = todayEvents.filter((e: any) => {
    const start = new Date(e.start_time || e.startTime);
    return start > now;
  });
  const upcomingMeetingCount = upcomingEvents.length;
  const upcomingMeetingHours = upcomingEvents.reduce((sum: number, e: any) => {
    const start = new Date(e.start_time || e.startTime).getTime();
    const end = new Date(e.end_time || e.endTime).getTime();
    return sum + Math.max(0, (end - start) / 3_600_000);
  }, 0);

  return {
    todayLoad: classifyLoad(todayMeetingCount, todayMeetingHours),
    todayMeetingCount,
    todayMeetingHours: Math.round(todayMeetingHours * 10) / 10,
    upcomingLoad: classifyLoad(upcomingMeetingCount, upcomingMeetingHours),
    upcomingMeetingCount,
    upcomingMeetingHours: Math.round(upcomingMeetingHours * 10) / 10,
    remainingMeetingCount: upcomingMeetingCount,
  };
}

function applyCalendarOverrides(
  mapping: ThemeModuleMapping,
  ctx: CalendarContext,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  tier: string
): ThemeModuleMapping {
  // Deep clone to avoid mutating the original theme map entry
  const m: ThemeModuleMapping = JSON.parse(JSON.stringify(mapping));
  const load = timeOfDay === 'morning' ? ctx.upcomingLoad : ctx.todayLoad;

  // ── MORNING: forward-looking ──
  if (timeOfDay === 'morning') {
    if (load === 'heavy' || load === 'extreme') {
      // Force grounding regulate
      if (!m.regulate) {
        m.regulate = { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'grounding' };
      } else {
        m.regulate.required = true;
        m.regulate.priority = Math.max(m.regulate.priority, 9);
        m.regulate.intensity = 'gentle';
        m.regulate.focus = 'grounding';
      }
      // Shift align away from activation toward composure
      if (m.align) {
        m.align.focus = 'composure';
        m.align.intensity = 'gentle';
      }
      // Remove prepare (no space for strategic thinking on dense days)
      if (load === 'extreme') delete m.prepare;
    } else if (load === 'light') {
      // Maximize focus + strategic thinking
      if (m.align) {
        m.align.focus = 'focus';
        m.align.intensity = 'activating';
      }
      if (!m.prepare && !m.integrate) {
        m.prepare = { type: 'prepare', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' };
      }
    }
    // moderate: theme mapping is fine as-is
  }

  // ── AFTERNOON: context-dependent ──
  else if (timeOfDay === 'afternoon') {
    if ((load === 'heavy' || load === 'extreme') && (tier === 'depleted' || tier === 'managing')) {
      // Force restoration regulate
      if (!m.regulate) {
        m.regulate = { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'short', focus: 'restore' };
      } else {
        m.regulate.required = true;
        m.regulate.priority = Math.max(m.regulate.priority, 9);
        m.regulate.intensity = 'gentle';
        m.regulate.focus = 'restore';
      }
      // Suppress activating align to prevent further depletion
      if (m.align && m.align.intensity === 'activating') {
        m.align.intensity = 'gentle';
        m.align.focus = 'grounding';
      }
    } else if ((load === 'heavy' || load === 'extreme') && (tier === 'strong' || tier === 'peak')) {
      // Sustained capacity – keep align but ensure regulate present
      if (!m.regulate) {
        m.regulate = { type: 'regulate', required: false, priority: 5, intensity: 'moderate', duration: 'micro', focus: 'composure' };
      }
    }
  }

  // ── EVENING: backward-looking ──
  else if (timeOfDay === 'evening') {
    if (load === 'extreme' || load === 'heavy') {
      // Deep recovery / strong wind-down
      if (m.regulate) {
        m.regulate.required = true;
        m.regulate.focus = 'release';
        m.regulate.intensity = 'gentle';
        if (load === 'extreme') m.regulate.duration = 'standard';
      }
      if (m.align) {
        m.align.focus = 'release';
        m.align.intensity = 'gentle';
      }
    } else if (load === 'light') {
      // Light day → brief wind-down sufficient, strategic reflection OK
      if (m.regulate) {
        m.regulate.priority = Math.max(m.regulate.priority - 2, 3);
        m.regulate.duration = 'micro';
      }
      if (m.align) {
        m.align.focus = m.align.focus === 'release' ? 'grounding' : m.align.focus;
      }
    }
  }

  return m;
}

// ==================== MODULE-DERIVED RATIONALE ====================

function deriveRationaleFromModules(modules: Array<{ type: string; focus: string }>): string {
  const types = new Set(modules.map(m => m.type));
  const focuses = new Set(modules.map(m => m.focus));

  // Module composition mapping
  if (types.has('regulate') && focuses.has('restore')) {
    return 'Nervous system recovery before the load lands – settle the physiology first, everything else follows.';
  }
  if (types.has('regulate') && focuses.has('composure') && !types.has('align')) {
    return 'Interrupt the stress pattern before it compounds – your body is already signalling load.';
  }
  if (types.has('align') && focuses.has('confidence') && !types.has('regulate')) {
    return 'Anchor your presence before you walk in – the thinking is there, this closes the belief gap.';
  }
  if (types.has('align') && focuses.has('focus') && !types.has('regulate')) {
    return 'Sharpen the clarity gap between where you are and where the day needs you to be.';
  }
  if (types.has('regulate') && types.has('align')) {
    return 'Settle the body first, then sharpen the mind – in that order, because the sequence matters.';
  }
  if (types.has('integrate') && types.has('regulate')) {
    return 'Discharge what you carried today before it follows you into tomorrow.';
  }
  if (types.has('integrate')) {
    return 'Close the loop on what happened – named experiences don\'t compound overnight.';
  }
  if (types.has('regulate') && focuses.has('release')) {
    return 'Release what you carried – this prevents rumination and protects your rest.';
  }
  if (types.has('regulate') && focuses.has('grounding')) {
    return 'Ground before you move – stability under load starts with the body.';
  }
  if (types.has('align')) {
    return 'Sharpen your mental edge for what lies ahead.';
  }
  if (types.has('regulate')) {
    return 'Settle your nervous system – this is the foundation for everything else.';
  }
  return 'This sequence addresses what your system needs right now.';
}

function buildUrgencyFrame(
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  nextEventTitle: string | null,
  nextEventMinutes: number | null,
  calendarGapMinutes: number | null,
  calendarLoad: string,
): string {
  // JIT event urgency
  if (nextEventTitle && nextEventMinutes !== null) {
    if (nextEventMinutes <= 45) {
      return `*${nextEventTitle}* in ${nextEventMinutes} minutes. Start now.`;
    }
    if (nextEventMinutes <= 120) {
      const hours = Math.floor(nextEventMinutes / 60);
      const mins = nextEventMinutes % 60;
      const timeStr = hours > 0 ? `${hours}h ${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
      return `*${nextEventTitle}* is ${timeStr} away. This is your window.`;
    }
  }

  // Calendar gap
  if (calendarGapMinutes !== null && calendarGapMinutes > 0 && calendarGapMinutes <= 60) {
    return `You have ${calendarGapMinutes} minutes before your next block. That's enough – use it.`;
  }

  // Time of day based
  if (timeOfDay === 'evening') {
    return 'The day is done. This closes it properly.';
  }

  const isDense = calendarLoad === 'extreme' || calendarLoad === 'heavy';
  if (isDense) {
    return 'There is no better window than this one.';
  }

  return 'The open space is the asset. Use it deliberately.';
}

function generatePlanBrief(
  ctx: CalendarContext,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  innerReadinessTier: string,
  innerReadinessScore: number,
  checkInOutcome: string,
  calendarLoad: string,
  wearable: WearableContext,
  outerReadinessPhrase: string,
  outerReadinessContext: string,
  outerReadinessLeanOn: string,
  coachInsights?: any[],
  resolvedModules?: Array<{ type: string; focus: string }>,
  alreadyUsed?: string[],
  nextEventTitle?: string | null,
  nextEventMinutes?: number | null,
  pendingCommitments?: any[],
  calendarGaps?: number[],
): string {
  // Derive rationale from resolved modules (new approach)
  if (resolvedModules && resolvedModules.length > 0) {
    const rationale = deriveRationaleFromModules(resolvedModules);
    
    // Coach memory integration
    let coachFragment = '';
    if (pendingCommitments && pendingCommitments.length > 0 && nextEventTitle) {
      const relevantCommitment = pendingCommitments.find((c: any) => {
        const text = (c.commitment_text || '').toLowerCase();
        const eventWords = (nextEventTitle || '').toLowerCase().split(' ').filter((w: string) => w.length > 3);
        return eventWords.some(w => text.includes(w));
      });
      if (relevantCommitment) {
        coachFragment = ` You committed to working on this – *${nextEventTitle}* is that moment.`;
      }
    }
    if (!coachFragment && coachInsights && coachInsights.length > 0) {
      const growthInsight = coachInsights.find((i: any) => i.type === 'growth_area');
      if (growthInsight?.content && growthInsight.content.length < 80) {
        const pattern = growthInsight.content.toLowerCase().replace(/\.$/, '');
        if (!alreadyUsed?.includes('coach_memory_match')) {
          coachFragment = ` Your coach noted ${pattern} – today's signals are consistent with it.`;
        }
      }
    }

    // Urgency frame
    // Calendar gap: find the smallest upcoming gap for urgency framing
    const nextGap = calendarGaps && calendarGaps.length > 0 ? calendarGaps.find(g => g > 0 && g <= 60) ?? null : null;
    const urgency = buildUrgencyFrame(timeOfDay, nextEventTitle || null, nextEventMinutes || null, nextGap, calendarLoad);

    return `${rationale}${coachFragment} ${urgency}`;
  }

  // ═══ FALLBACK: Legacy brief generation (when resolvedModules not available) ═══
  const count = timeOfDay === 'morning' ? ctx.upcomingMeetingCount : ctx.todayMeetingCount;
  const remainingCount = ctx.remainingMeetingCount ?? count;

  const tierLabel: Record<string, string> = {
    depleted: 'low', managing: 'steady', strong: 'above baseline', peak: 'at peak'
  };
  const readinessWord = tierLabel[innerReadinessTier] || 'steady';

  const poorSleep = wearable.hasData && wearable.sleepScore !== null && wearable.sleepScore < 70;
  const lowHRV = wearable.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation < -10;
  const goodHRV = wearable.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation > 5;
  const goodSleep = wearable.hasData && wearable.sleepScore !== null && wearable.sleepScore >= 80;

  let wearableFragment = '';
  if (poorSleep && lowHRV) wearableFragment = ', and your sleep and HRV are both below baseline';
  else if (poorSleep) wearableFragment = ', and your sleep score is below baseline';
  else if (lowHRV) wearableFragment = ', and your HRV is below baseline';
  else if (goodHRV && goodSleep) wearableFragment = ' with recovered HRV and solid sleep';
  else if (goodHRV) wearableFragment = ' with recovered HRV';

  let stateSentence = `Your decision readiness is ${readinessWord} (${innerReadinessScore}/100)${wearableFragment}.`;
  let purposeSentence = 'This sequence addresses what your system needs right now.';

  if (timeOfDay === 'evening') {
    purposeSentence = innerReadinessTier === 'depleted'
      ? 'This sequence helps you release what you carried and protect tomorrow\'s capacity.'
      : 'This sequence helps you close cleanly so you arrive restored tomorrow.';
  } else if (timeOfDay === 'morning') {
    purposeSentence = poorSleep
      ? 'These practices compensate for what rest didn\'t fully restore.'
      : 'These practices set your mental edge for the day ahead.';
  } else {
    purposeSentence = 'This sequence restores your edge for the stretch that remains.';
  }

  return `${stateSentence} ${purposeSentence}`;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ==================== HRV × CALENDAR CORRELATION ====================

interface EventTypeCorrelation {
  eventType: string;
  count: number;
  avgHRVDeviation: number;
  examples: string[];
}

type HRVCorrelationMap = Record<string, EventTypeCorrelation>;

function extractEventType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('board')) return 'board';
  if (lower.includes('investor') || lower.includes('vc') || lower.includes('funding')) return 'investor';
  if (lower.includes('fundrais')) return 'fundraising';
  if (lower.includes('all-hands') || lower.includes('all hands') || lower.includes('town hall')) return 'all-hands';
  // Interview disambiguation: media vs hiring vs ambiguous
  if (lower.includes('media') || lower.includes('press') || lower.includes('journalist') || lower.includes('pr interview')) return 'media-interview';
  if (lower.includes('final round') || lower.includes('hiring committee') || lower.includes('candidate review') || lower.includes('executive hire')) return 'hiring-interview';
  if (lower.includes('interview') || lower.includes('podcast')) return 'interview-ambiguous';
  if (lower.includes('pitch') || lower.includes('demo') || lower.includes('keynote')) return 'pitch';
  if (lower.includes('client') || lower.includes('customer') || lower.includes('account review') || lower.includes('proposal')) return 'client';
  // Strategy before generic team/planning
  if (lower.includes('strategy') || lower.includes('strategic') || lower.includes('offsite') || lower.includes('vision') || lower.includes('roadmap')) return 'strategy';
  // Leadership before generic team
  if (lower.includes('leadership team') || lower.includes('exec team') || lower.includes('c-suite') || lower.includes('slt') || lower.includes('management meeting')) return 'leadership';
  if (lower.includes('conference') || lower.includes('summit') || lower.includes('panel') || lower.includes('speaking') || lower.includes('presentation') || lower.includes('webinar')) return 'speaking';
  if (lower.includes('m&a') || lower.includes('merger') || lower.includes('acquisition') || lower.includes('due diligence')) return 'ma';
  if (lower.includes('launch') || lower.includes('go live') || lower.includes('release') || lower.includes('ship')) return 'launch';
  if (lower.includes('layoff') || lower.includes('restructuring') || lower.includes('reduction') || lower.includes('rif') || lower.includes('downsizing')) return 'layoff';
  if (lower.includes('negotiation') || lower.includes('contract') || lower.includes('deal') || lower.includes('terms') || lower.includes('partnership')) return 'negotiation';
  if (lower.includes('crisis') || lower.includes('urgent') || lower.includes('emergency') || lower.includes('escalation')) return 'crisis';
  if (lower.includes('competitor') || lower.includes('competitive')) return 'competitive';
  if (lower.includes('budget') || lower.includes('finance review') || lower.includes('forecast') || lower.includes('earnings') || lower.includes('financial planning')) return 'finance';
  if (lower.includes('quarterly') || lower.includes('qbr') || lower.match(/\bq[1-4]\b/)) return 'quarterly-review';
  if (lower.includes('performance review') || lower.includes('annual review') || lower.includes('mid-year review') || lower.includes('360 feedback')) return 'performance-review';
  if (lower.includes('1:1') || lower.includes('one-on-one') || lower.includes('1-on-1') || lower.includes('one on one') || lower.includes('check-in')) return '1:1';
  if (lower.includes('team')) return 'team';
  if (lower.includes('standup') || lower.includes('stand-up') || lower.includes('daily')) return 'standup';
  if (lower.includes('retro') || lower.includes('retrospective')) return 'retrospective';
  if (lower.includes('planning')) return 'planning';
  if (lower.includes('review')) return 'quarterly-review';
  return 'other';
}

const CANONICAL_TAGS: Record<string, string> = {
  'board': 'Pre Board Meeting',
  'investor': 'Pre Investor Meeting',
  'fundraising': 'Pre Fundraising Meeting',
  'pitch': 'Pre Pitch',
  'all-hands': 'Pre All-Hands',
  'leadership': 'Pre Leadership Meeting',
  '1:1': '1:1 Prep',
  'team': 'Team Meeting Prep',
  'client': 'Pre Client Meeting',
  'speaking': 'Pre Speaking Engagement',
  'strategy': 'Strategic Planning Prep',
  'quarterly-review': 'Pre Quarterly Review',
  'performance-review': 'Pre Performance Review',
  'ma': 'Pre M&A Discussion',
  'launch': 'Pre Launch',
  'layoff': 'Pre Difficult Conversation',
  'negotiation': 'Pre Negotiation',
  'crisis': 'Crisis Response Prep',
  'media-interview': 'Pre Media Interview',
  'hiring-interview': 'Pre Hiring Interview',
  'interview-ambiguous': 'Interview Prep',
  'standup': 'Standup Prep',
  'retrospective': 'Retro Prep',
  'planning': 'Planning Prep',
  'finance': 'Pre Finance Review',
  'competitive': 'Competitive Review Prep',
  'other': 'Meeting Prep',
};

async function getHRVEventCorrelations(
  userId: string,
  supabaseClient: any
): Promise<HRVCorrelationMap | null> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [eventsRes, hrvRes] = await Promise.all([
      supabaseClient
        .from('calendar_events')
        .select('start_time, title')
        .eq('user_id', userId)
        .gte('start_time', thirtyDaysAgo.toISOString())
        .order('start_time', { ascending: true }),
      supabaseClient
        .from('wearable_data')
        .select('summary_date, hrv')
        .eq('user_id', userId)
        .gte('summary_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('summary_date', { ascending: true }),
    ]);

    const pastEvents = eventsRes.data;
    const hrvData = hrvRes.data;

    if (!pastEvents || !hrvData || hrvData.length < 7) return null;

    const baselineHRV = hrvData.reduce((sum: number, d: any) => sum + (d.hrv || 0), 0) / hrvData.length;
    if (baselineHRV <= 0) return null;

    const correlations: Record<string, { count: number; totalDeviation: number; examples: string[] }> = {};

    for (const event of pastEvents) {
      const eventDate = (event.start_time || '').split('T')[0];
      const hrvOnDate = hrvData.find((h: any) => h.summary_date === eventDate);
      if (!hrvOnDate || !hrvOnDate.hrv) continue;

      const deviation = ((hrvOnDate.hrv - baselineHRV) / baselineHRV) * 100;
      const eventType = extractEventType(event.title || '');

      if (!correlations[eventType]) {
        correlations[eventType] = { count: 0, totalDeviation: 0, examples: [] };
      }
      correlations[eventType].count++;
      correlations[eventType].totalDeviation += deviation;
      if (correlations[eventType].examples.length < 3) {
        correlations[eventType].examples.push(event.title || '');
      }
    }

    const result: HRVCorrelationMap = {};
    for (const [type, data] of Object.entries(correlations)) {
      if (data.count >= 2) {
        result[type] = {
          eventType: type,
          count: data.count,
          avgHRVDeviation: Math.round(data.totalDeviation / data.count),
          examples: data.examples,
        };
      }
    }

    console.log(`[generate-mastery-plan] HRV correlations: ${Object.keys(result).length} event types with 2+ occurrences`);
    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.error('[generate-mastery-plan] HRV correlation error:', err);
    return null;
  }
}

// ==================== UNIFIED THRESHOLD ====================
const JIT_THRESHOLD_UNIFIED = 55;

// ==================== TWO-TOUCH ACTION WINDOWS ====================
// Touch 2 (0-6h): body + state prep. Touch 1 (6-48h): coach + think prep.
// Selection-only (>48h): scored but not surfaced.
// Suppression is per-event via dismissed_horizons and skippedTypes3Plus – no blanket silent window.
function getActionWindow(minutesUntil: number): 'touch1' | 'touch2' | 'selection_only' {
  if (minutesUntil <= 360) return 'touch2';           // 0-6h: body prep
  if (minutesUntil <= 2880) return 'touch1';          // 6-48h: coach + think prep
  return 'selection_only';                              // >48h: scored but not surfaced
}

// ==================== NOISE FILTER (mirrors generate-jit-events Stage 0) ====================

const NOISE_KEYWORDS = [
  'station', 'bus', 'train', 'flight', 'airport', 'departure', 'arrival',
  'boarding', 'layover', 'transit', 'coach station', 'platform', 'taxi', 'uber', 'cab',
  'delivery', 'pick up', 'dry cleaning', 'groceries', 'pharmacy', 'haircut',
  'car service', 'mot', 'oil change', 'dentist', 'optician',
  'reminder', 'auto-pay', 'subscription', 'booking confirmation', 'ticket',
  'reservation', 'out of office', 'blocked', 'hold', 'placeholder', 'tentative',
];
const NOISE_PATTERN = /\[\d{6,}\]/;

function isNoiseEvent(title: string): boolean {
  const lower = (title || '').toLowerCase();
  if (NOISE_PATTERN.test(title || '')) return true;
  return NOISE_KEYWORDS.some(kw => lower.includes(kw));
}

// ==================== LEGACY DIM A/B FLOOR GUARDS ====================
// Mirrors generate-jit-events dimension scoring for legacy fallback gate

const LEGACY_PRESSURE_KEYWORDS = [
  'board', 'investor', 'performance', 'review', 'feedback', 'fire', 'difficult',
  'press', 'media', 'interview', 'pitch', 'crisis', 'negotiation', 'termination',
  'layoff', 'conflict', 'confrontation', 'dispute',
];

const LEGACY_CLUSTER_KEYWORDS: Record<string, string[]> = {
  pressure: ['board', 'pitch', 'media', 'press', 'interview', 'speak', 'present', 'conference', 'investor', 'keynote', 'crisis', 'emergency', 'urgent'],
  relationship: ['feedback', 'performance', 'difficult', 'fire', 'demotion', 'conflict', 'dispute', 'tension', 'confrontation', 'termination', 'pip', 'layoff'],
  decision: ['strategy', 'planning', 'prioritise', 'prioritize', 'trade-off', 'decision', 'stakeholder', 'budget', 'forecast', 'earnings'],
  transition: ['first', 'last', 'new role', 'launch', 'announcement', 'offsite', 'retreat', 'end of quarter', 'annual', 'restructuring'],
};

function computeLegacyDimA(title: string, attendeeCount: number): number {
  let score = 0;
  if (attendeeCount === 0) return 0;
  if (attendeeCount <= 2) score = 12;
  else score = 20;
  const lower = (title || '').toLowerCase();
  if (LEGACY_PRESSURE_KEYWORDS.some(kw => lower.includes(kw))) {
    score = Math.min(35, score + 15);
  }
  return score;
}

function computeLegacyDimB(title: string): number {
  const lower = (title || '').toLowerCase();
  for (const keywords of Object.values(LEGACY_CLUSTER_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return 15; // Minimum passing value for B if any cluster matches
    }
  }
  return 0;
}

// ==================== CALENDAR EVENT PRIORITISATION ====================

interface ScoredEvent {
  event: CalendarEvent;
  score: number;
  minutesUntil: number;
  scenario: ExecutiveScenario | null;
  timePill: string;
  contextDescription: string;
  hrvCorrelation?: {
    eventType: string;
    avgDeviation: number;
    historicalCount: number;
  };
  // New pipeline fields (populated from jit_event_context bridge)
  jitBucketPrimary?: string | null;
  jitBucketSecondary?: string | null;
  jitConfidenceScore?: number | null;
  jitConfidenceBand?: string | null;
  jitUrgencyHorizon?: string | null;
  jitDimensionScores?: any | null;
}

/**
 * Bridge: Try to use pre-scored events from jit_event_context (new pipeline).
 * Falls back to legacy scoring if no pre-scored events are available.
 */
async function getPreScoredEvents(
  userId: string,
  calendarEvents: CalendarEvent[],
  supabaseClient: any,
  hrvCorrelations: HRVCorrelationMap | null,
): Promise<ScoredEvent[]> {
  const now = new Date();

  // Query jit_event_context for recent pre-scored events (within last 60 min)
  try {
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString();
    const { data: jitContextRows } = await supabaseClient
      .from('jit_event_context')
      .select('calendar_event_id, event_title, event_type, event_start, final_score, context_statement, jit_bucket_primary, jit_bucket_secondary, jit_confidence_score, jit_urgency_horizon, jit_dimension_scores, has_coach_context, coach_scenario, expressed_concern, has_pending_tool, dismissed_by_user, dismissed_horizons')
      .eq('user_id', userId)
      .eq('shown_in_jit', true)
      .gte('updated_at', twelveHoursAgo)
      .gte('event_start', now.toISOString())
      .order('final_score', { ascending: false })
      .limit(5);

    if (jitContextRows && jitContextRows.length > 0) {
      console.log(`[generate-mastery-plan] Bridge: found ${jitContextRows.length} pre-scored events from jit_event_context`);
      
      const bridgedEvents: ScoredEvent[] = [];
      for (const row of jitContextRows) {
        // Find matching calendar event for full metadata
        const matchingEvent = calendarEvents.find(e => e.id === row.calendar_event_id);
        const eventStart = new Date(row.event_start);
        const minutesUntil = Math.floor((eventStart.getTime() - now.getTime()) / (1000 * 60));
        if (minutesUntil < 0) continue;

        // Educational non-organizer hard gate – completely block, no override
        const EDUCATIONAL_PATTERNS = /\b(the power of|how to|masterclass|workshop:?|webinar:?|course:?|learn to|introduction to|build momentum|close your round|lessons from|secrets of|art of|guide to|tips for|strategies for|fundamentals of)\b/i;
        const isEducational = EDUCATIONAL_PATTERNS.test((row.event_title || ''));
        const isOrganizer = matchingEvent?.isOrganizer ?? false;
        if (isEducational && !isOrganizer) {
          console.log(`[generate-mastery-plan] Bridge: BLOCKED educational non-organizer "${row.event_title}"`);
          continue;
        }

        // ═══ TWO-TOUCH ACTION WINDOW FILTER ═══
        // Only include events in valid action windows (touch1 or touch2)
        const actionWindow = getActionWindow(minutesUntil);
        if (actionWindow === 'selection_only') {
          console.log(`[generate-mastery-plan] Bridge: EXCLUDED "${row.event_title}" – window=${actionWindow} minutesUntil=${minutesUntil} score=${row.final_score}`);
          continue;
        }

        // ═══ PER-TOUCH DISMISSAL CHECK ═══
        // Check if this specific touch has been dismissed (not the whole event)
        const touchLabel = actionWindow === 'touch1' ? 'touch_1' : 'touch_2';
        const dismissedHorizons: string[] = row.dismissed_horizons || [];
        if (dismissedHorizons.includes(touchLabel)) {
          console.log(`[generate-mastery-plan] Bridge: skipping "${row.event_title}" – ${touchLabel} dismissed`);
          continue;
        }

        // Generate time pill
        let timePill: string;
        if (minutesUntil < 60) timePill = `In ${minutesUntil} min`;
        else if (minutesUntil < 1440) {
          const hours = Math.floor(minutesUntil / 60);
          timePill = `In ${hours} hr${hours > 1 ? 's' : ''}`;
        } else {
          const days = Math.ceil(minutesUntil / 1440);
          timePill = `In ${days} day${days > 1 ? 's' : ''}`;
        }

        // Build enriched context description from pipeline signals
        const contextDescription = buildEnrichedContextDescription(row, minutesUntil, matchingEvent, hrvCorrelations);

        // Find matching scenario for module selection
        const titleLower = (row.event_title || '').toLowerCase();
        let matchedScenario: ExecutiveScenario | null = null;
        for (const scenario of EXECUTIVE_SCENARIOS) {
          if (scenario.triggers.calendarKeywords?.some(kw => titleLower.includes(kw.toLowerCase()))) {
            matchedScenario = scenario;
            break;
          }
        }

        // Build HRV correlation from existing correlations
        let hrvCorrelation: ScoredEvent['hrvCorrelation'] = undefined;
        if (hrvCorrelations) {
          const evtType = extractEventType(row.event_title || '');
          const corr = hrvCorrelations[evtType];
          if (corr && corr.count >= 2) {
            hrvCorrelation = {
              eventType: evtType,
              avgDeviation: corr.avgHRVDeviation,
              historicalCount: corr.count,
            };
          }
        }

        bridgedEvents.push({
          event: matchingEvent || {
            id: row.calendar_event_id,
            title: row.event_title,
            startTime: row.event_start,
          } as CalendarEvent,
          score: row.final_score || 0,
          minutesUntil,
          scenario: matchedScenario,
          timePill,
          contextDescription,
          hrvCorrelation,
          jitBucketPrimary: row.jit_bucket_primary,
          jitBucketSecondary: row.jit_bucket_secondary,
          jitConfidenceScore: row.jit_confidence_score,
          jitConfidenceBand: row.jit_confidence_score != null
            ? (row.jit_confidence_score >= 70 ? 'high' : row.jit_confidence_score >= 40 ? 'medium' : row.jit_confidence_score >= 20 ? 'low' : 'none')
            : null,
          jitUrgencyHorizon: row.jit_urgency_horizon,
          jitDimensionScores: row.jit_dimension_scores,
        });
      }

      if (bridgedEvents.length > 0) {
        return bridgedEvents;
      }
    }
  } catch (err) {
    console.error('[generate-mastery-plan] jit_event_context bridge error:', err);
  }

  // Fallback: legacy scoring (with noise filter added)
  console.log('[generate-mastery-plan] Bridge: no pre-scored events, falling back to legacy scoring');
  return scoreCalendarEventsLegacy(calendarEvents, [], hrvCorrelations);
}

/**
 * Build enriched context description from pipeline signals.
 * Incorporates bucket classification, coach memory, HRV context, and confidence framing.
 */
function buildEnrichedContextDescription(
  row: any,
  minutesUntil: number,
  matchingEvent: CalendarEvent | undefined,
  hrvCorrelations: HRVCorrelationMap | null,
): string {
  const parts: string[] = [];
  const bucket = row.jit_bucket_primary;

  // Bucket-driven reasoning (module-composition style)
  if (bucket === 'recalibrate') {
    parts.push('Interrupt the stress pattern before it compounds');
  } else if (bucket === 'clarity') {
    parts.push('Sharpen your approach before the stakes arrive');
  } else if (bucket === 'renewal') {
    parts.push('Sustain energy through this transition');
  }

  // Coach memory signal – specific, not generic
  if (row.has_coach_context) {
    if (row.expressed_concern) {
      parts.push('you\'ve explored this concern in coaching – this is that moment');
    } else if (row.coach_scenario) {
      parts.push('your coach has noted a pattern here');
    } else if (row.has_pending_tool) {
      parts.push('a coach-recommended approach applies');
    }
  }

  // HRV historical correlation – pattern reference, not raw number
  if (hrvCorrelations) {
    const evtType = extractEventType(row.event_title || '');
    const corr = hrvCorrelations[evtType];
    if (corr && corr.count >= 2 && Math.abs(corr.avgHRVDeviation) > 10) {
      const canonicalLabel = CANONICAL_TAGS[evtType] || evtType;
      parts.push(`your body shows a familiar pre-${canonicalLabel.toLowerCase().replace(/^pre /, '')} response`);
    }
  }

  // Urgency frame
  if (minutesUntil <= 30) {
    parts.push('starting very soon – start now');
  } else if (minutesUntil <= 60) {
    parts.push(`in ${minutesUntil} minutes – this is your window`);
  } else if (minutesUntil < 1440) {
    const hrs = Math.floor(minutesUntil / 60);
    parts.push(`in ${hrs} hour${hrs > 1 ? 's' : ''}`);
  } else {
    parts.push(`in ${Math.ceil(minutesUntil / 1440)} days`);
  }

  // Build final string with event title in italics
  const eventTitle = row.event_title || 'Upcoming event';
  const prefix = `*${eventTitle}*`;

  if (parts.length === 0) {
    return `${prefix}. Prepare with targeted practice.`;
  }

  // Confidence-framed closing
  const confidenceScore = row.jit_confidence_score || 0;
  if (confidenceScore >= 70) {
    return `${prefix} – ${parts.join('. ')}.`;
  } else if (confidenceScore >= 40) {
    return `${prefix} – ${parts.join('. ')}.`;
  }

  return `${prefix} – ${parts.join('. ')}.`;
}

/**
 * Legacy scoring – kept as fallback when jit_event_context has no recent data.
 * Enforces: noise filter, two-touch action windows, unified ≥55 threshold,
 * and Dim A≥10 + Dim B≥8 floor guards.
 */
function scoreCalendarEventsLegacy(events: CalendarEvent[], skippedTypes: string[], hrvCorrelations?: HRVCorrelationMap | null): ScoredEvent[] {
  const now = new Date();
  const scored: ScoredEvent[] = [];

  const sortedEvents = [...events].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  for (let ei = 0; ei < sortedEvents.length; ei++) {
    const event = sortedEvents[ei];
    const startTime = new Date(event.startTime);
    const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));
    if (minutesUntil < 0) continue;

    // ═══ NOISE FILTER ═══
    if (isNoiseEvent(event.title || '')) continue;

    // Educational non-organizer guard in legacy fallback path
    const EDUCATIONAL_PATTERNS = /\b(the power of|how to|masterclass|workshop:?|webinar:?|course:?|learn to|introduction to|build momentum|close your round|lessons from|secrets of|art of|guide to|tips for|strategies for|fundamentals of)\b/i;
    const isEducational = EDUCATIONAL_PATTERNS.test((event.title || '').toLowerCase());
    if (isEducational && !event.isOrganizer) continue;

    // ═══ TWO-TOUCH ACTION WINDOW ═══
    const actionWindow = getActionWindow(minutesUntil);
    if (actionWindow === 'selection_only') continue;

    let score = 0;
    const titleLower = (event.title || '').toLowerCase();

    // Immediacy scoring (touch2 0-6h and touch1 6-48h windows)
    if (minutesUntil <= 120) score += 40;
    else if (minutesUntil <= 240) score += 30;
    else if (minutesUntil <= 360) score += 20;
    else if (minutesUntil <= 2880) score += 10;

    if (event.isOrganizer) score += 15;
    if ((event.attendeesCount || 0) > 5) score += 10;
    if (event.endTime) {
      const durationMin = (new Date(event.endTime).getTime() - startTime.getTime()) / 60000;
      if (durationMin > 60) score += 8;
    }
    if (!event.isRecurring) score += 10;

    let matchedScenario: ExecutiveScenario | null = null;
    for (const scenario of EXECUTIVE_SCENARIOS) {
      if (!scenario.triggers.calendarKeywords) continue;
      if (scenario.triggers.calendarKeywords.some(kw => titleLower.includes(kw.toLowerCase()))) {
        score += 25;
        matchedScenario = scenario;
        break;
      }
    }

    const eventHour = startTime.getHours();
    if ((eventHour >= 9 && eventHour <= 12) || (eventHour >= 14 && eventHour <= 16)) score += 5;

    if (ei > 0) {
      const prevEvent = sortedEvents[ei - 1];
      if (prevEvent.endTime) {
        const prevEnd = new Date(prevEvent.endTime);
        const gapMinutes = (startTime.getTime() - prevEnd.getTime()) / 60000;
        if (gapMinutes >= 0 && gapMinutes < 15) score += 5;
      }
    }

    const eventType = matchedScenario?.id || 'general';
    if (skippedTypes.includes(eventType)) score -= 15;

    // ═══ DIM A/B FLOOR GUARDS ═══
    const dimA = computeLegacyDimA(event.title || '', event.attendeesCount || 0);
    const dimB = computeLegacyDimB(event.title || '');
    if (score < JIT_THRESHOLD_UNIFIED || dimA < 10 || dimB < 8) {
      console.log(`[generate-mastery-plan] Legacy GATE FAIL: "${event.title}" score=${score} dimA=${dimA} dimB=${dimB}`);
      continue;
    }

    // HRV correlation boost
    let hrvCorrelation: ScoredEvent['hrvCorrelation'] = undefined;
    let hrvContextPart = '';
    if (hrvCorrelations) {
      const evtType = extractEventType(event.title || '');
      const correlation = hrvCorrelations[evtType];
      if (correlation && correlation.count >= 2) {
        const avgDev = correlation.avgHRVDeviation;
        hrvCorrelation = { eventType: evtType, avgDeviation: avgDev, historicalCount: correlation.count };
        const canonicalLabel = CANONICAL_TAGS[evtType] || evtType;
        if (avgDev > 20) { score += 25; hrvContextPart = `Your HRV typically elevates ${Math.abs(avgDev)}% during ${canonicalLabel.toLowerCase()} events – your system responds strongly to these.`; }
        else if (avgDev > 15) { score += 20; hrvContextPart = `Your HRV typically elevates ${Math.abs(avgDev)}% during ${canonicalLabel.toLowerCase()} events.`; }
        else if (avgDev > 10) { score += 12; hrvContextPart = `Your HRV tends to elevate during ${canonicalLabel.toLowerCase()} events (${Math.abs(avgDev)}% above baseline).`; }
        else if (avgDev < -10) { score -= 5; }
      }
    }

    let timePill: string;
    if (minutesUntil < 60) timePill = `In ${minutesUntil} min`;
    else if (minutesUntil < 1440) { const hours = Math.floor(minutesUntil / 60); timePill = `In ${hours} hr${hours > 1 ? 's' : ''}`; }
    else { const days = Math.ceil(minutesUntil / 1440); timePill = `In ${days} day${days > 1 ? 's' : ''}`; }

    // ═══ CONTEXT DESCRIPTION – HIDE IF LOW CONFIDENCE ═══
    // Only show context if dimA + dimB signals are strong enough
    let contextDescription = '';
    if (dimA + dimB >= 22) {
      const contextParts: string[] = [];
      if (matchedScenario) {
        const evtTypeForContext = extractEventType(event.title || '');
        const canonicalTagForContext = CANONICAL_TAGS[evtTypeForContext] || matchedScenario.contextLabel || 'meeting';
        contextParts.push(`Upcoming ${canonicalTagForContext.toLowerCase()} detected`);
      } else if ((event.attendeesCount || 0) > 5) {
        contextParts.push(`Large meeting with ${event.attendeesCount} attendees`);
      }
      // Removed: generic "You're organizing this event" – not a justifiable context reason
      if (minutesUntil <= 30) contextParts.push(`starting very soon – prepare now`);
      else if (minutesUntil <= 60) contextParts.push(`in ${minutesUntil} minutes`);
      else if (minutesUntil < 1440) contextParts.push(`in ${Math.floor(minutesUntil / 60)} hours`);
      else contextParts.push(`in ${Math.ceil(minutesUntil / 1440)} days`);
      if (!event.isRecurring && (event.attendeesCount || 0) > 3) contextParts.push(`non-recurring high-visibility event`);
      if (hrvContextPart) contextParts.push(hrvContextPart);
      contextDescription = contextParts.length > 0
        ? contextParts.join(' – ') + '. Prepare with targeted practice.'
        : '';
    }

    scored.push({
      event, score, minutesUntil, scenario: matchedScenario, timePill, contextDescription, hrvCorrelation,
      // Store action window as horizon for plan composition
      jitUrgencyHorizon: actionWindow === 'touch1' ? 'tactical' : 'immediate',
    });
  }

  scored.sort((a, b) => b.score - a.score || a.minutesUntil - b.minutesUntil);
  return scored;
}

// ==================== DURATION CEILING ====================

function getDurationCeiling(calendarLoad: string): { maxDuration: number; maxModules: number } {
  switch (calendarLoad) {
    case 'low': return { maxDuration: 15, maxModules: 4 };
    case 'medium': return { maxDuration: 10, maxModules: 3 };
    case 'high': return { maxDuration: 5, maxModules: 2 };
    default: return { maxDuration: 10, maxModules: 3 }; // no calendar
  }
}

// ==================== CONTENT SCORING ====================

// Mapping from practice_priority_tag to focus tags for content matching
const PRIORITY_TAG_FOCUS_MAP: Record<string, string[]> = {
  regulation_composure: ['composure', 'grounding', 'calm'],
  regulation_early: ['composure', 'restore', 'breathing'],
  recovery_resilience: ['restore', 'release', 'recovery'],
  energy_endurance: ['restore', 'grounding', 'energy'],
  focus_clarity: ['focus', 'grounding', 'clarity'],
  mindset_reframe: ['confidence', 'focus', 'reframe'],
};

// Mapping from pressure_context_tag to focus tags for content matching
const PRESSURE_TAG_FOCUS_MAP: Record<string, string[]> = {
  high_stakes_decisions: ['composure', 'clarity', 'focus'],
  influence_stakeholders: ['confidence', 'composure', 'presence'],
  conflict_navigation: ['composure', 'grounding', 'calm'],
  self_regulation: ['grounding', 'restore', 'breathing'],
  cognitive_load: ['focus', 'grounding', 'clarity'],
};

function calculateContentScore(
  content: any,
  moduleSpec: ModuleSpec,
  favorites: string[],
  coachInsights: any[],
  effectiveContent: string[],
  completedToday: string[],
  practicePriorityTag?: string,
  pressureContextTag?: string,
  pendingCommitments?: any[]
): number {
  let score = 0;
  const hasFavorites = favorites.length > 0;
  const hasCoachInsights = coachInsights?.length > 0;

  if (favorites.includes(content.id)) score += 30;
  if (coachInsights?.some((i: any) => i.contentReference === content.id || (i.content && content.title && content.title.toLowerCase().includes(i.content.toLowerCase().split(' ').find((w: string) => w.length > 3) || '')))) score += 25;
  if (effectiveContent?.includes(content.id)) score += 20;

  // Intensity match
  const intensityMap: Record<string, string> = { gentle: 'low', moderate: 'medium', activating: 'high' };
  if (content.structured_tags?.intensityLevel === intensityMap[moduleSpec.intensity]) score += 15;

  // Duration match
  const dur = content.duration || 0;
  if (moduleSpec.duration === 'micro' && dur <= 2) score += 10;
  else if (moduleSpec.duration === 'short' && dur > 2 && dur <= 5) score += 10;
  else if (moduleSpec.duration === 'standard' && dur > 5 && dur <= 15) score += 10;

  // Focus match (general)
  if (content.structured_tags?.goalTags?.some((t: string) => t.toLowerCase().includes(moduleSpec.focus))) score += 10;
  else if (content.tags?.some((t: string) => t.toLowerCase().includes(moduleSpec.focus))) score += 10;

  // Onboarding signal boosts – full weight when no dynamic signals exist, decayed otherwise
  // Priority boost kept moderate (+20/+7) — onboarding goal is a system recommendation,
  // not explicit user behaviour. Actual behaviour (favorites +30, coach +25) always outweighs.
  const onboardingFullWeight = !hasFavorites && !hasCoachInsights;
  const priorityBoost = onboardingFullWeight ? 20 : 7;
  const pressureBoost = onboardingFullWeight ? 8 : 3;

  // Practice priority tag match (+20 full / +7 decayed)
  if (practicePriorityTag) {
    const focusTags = PRIORITY_TAG_FOCUS_MAP[practicePriorityTag] || [];
    const contentTags = [
      ...(content.structured_tags?.goalTags || []),
      ...(content.tags || [])
    ].map((t: string) => t.toLowerCase());
    if (focusTags.some(ft => contentTags.some((ct: string) => ct.includes(ft)))) {
      score += priorityBoost;
    }
  }

  // Pressure context tag match (+8 full / +3 decayed)
  if (pressureContextTag) {
    const focusTags = PRESSURE_TAG_FOCUS_MAP[pressureContextTag] || [];
    const contentTags = [
      ...(content.structured_tags?.goalTags || []),
      ...(content.tags || [])
    ].map((t: string) => t.toLowerCase());
    if (focusTags.some(ft => contentTags.some((ct: string) => ct.includes(ft)))) {
      score += pressureBoost;
    }
  }

  // Recency - not completed in last 3 days (simplified: not completed today)
  if (!completedToday.includes(content.id)) score += 5;

  // Coach commitment boost: if user committed to a practice, boost matching content
  if (pendingCommitments && pendingCommitments.length > 0) {
    for (const commitment of pendingCommitments) {
      if (commitment.target_practice_id && commitment.target_practice_id === content.id) {
        score += 15;
        break;
      }
      // Also check if commitment text mentions content tags
      if (commitment.commitment_text) {
        const commitLower = (commitment.commitment_text as string).toLowerCase();
        const contentTags = [...(content.tags || []), content.title || ''].map((t: string) => t.toLowerCase());
        if (contentTags.some((t: string) => t.length > 3 && commitLower.includes(t))) {
          score += 10;
          break;
        }
      }
    }
  }

  return score;
}

// ==================== COACH CARD GENERATION ====================

function generateCoachCard(
  type: 'prepare' | 'integrate',
  timeOfDay: string,
  tier: string,
  patternInsight: any,
  eventTitle?: string,
  minutesUntil?: number,
  stateHash?: string,
): any | null {
  // State-versioned ID: ensures completions from a prior state don't suppress new coach work
  const stateSegment = stateHash ? `:${stateHash.substring(0, 8)}` : '';

  // COACH INCLUSION RULES
  if (type === 'prepare') {
    // Pre-event: always include
    if (eventTitle) {
      return {
        id: `coach-prepare${stateSegment}`,
        type: 'prepare',
        label: 'Prepare',
        protocolType: 'Self Mastery Coach',
        title: 'Mental Rehearsal',
        duration: 2,
        sortOrder: 3,
        isCoachCard: true,
        prompt: `You have "${eventTitle}" in ${minutesUntil || '?'} minutes. What outcome would make this a success for you?`
      };
    }
    // Afternoon: only with executive scenario (caller handles this)
    return {
      id: `coach-prepare${stateSegment}`,
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

  // Integrate (evening coach)
  if (type === 'integrate') {
    // Evening: ALWAYS included with Tiny Wins
    return {
      id: `coach-integrate${stateSegment}`,
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

  return null;
}

function getCoachPromptForContext(
  timeOfDay: string,
  tier: string,
  patternInsight: any,
  innerReadinessScore?: number,
  calendarPressure?: string,
  hasCoachFavorite?: boolean,
  hasPreEventWithin4h?: boolean
): { prompt: string; title: string } | null {
  // Evening: ALWAYS include
  if (timeOfDay === 'evening') {
    return {
      prompt: "A managed close. What's one thing you did right today? Share your small win – and what's one thing worth carrying into tomorrow, and one thing worth leaving here?",
      title: 'Tiny Win and Reflection'
    };
  }

  // Morning coach decision tree
  if (timeOfDay === 'morning') {
    // Depleted or managing: always include
    if (tier === 'depleted' || tier === 'managing') {
      if (patternInsight && patternInsight.count >= 3) {
        return {
          prompt: `You've been feeling ${patternInsight.state} for ${patternInsight.count} days. This pattern often signals something deeper – what's been weighing on you?`,
          title: 'Pattern Check-in'
        };
      }
      if (tier === 'depleted') {
        return {
          prompt: "You're running low coming into the day. What's one thing you can genuinely let go of before you move into it?",
          title: 'Morning Reset'
        };
      }
      return {
        prompt: "You're operational. What's the most important thing you want to carry well today?",
        title: 'Morning Focus'
      };
    }
    // Strong/peak: include only if consecutive low pattern, high pressure, or coach favourite
    if (patternInsight && patternInsight.count >= 3) {
      return {
        prompt: `You've been feeling ${patternInsight.state} for ${patternInsight.count} days. This pattern often signals something deeper – what's been weighing on you?`,
        title: 'Pattern Check-in'
      };
    }
    if (calendarPressure === 'high') {
      if (tier === 'strong') {
        return {
          prompt: "You're well-resourced. Where do you most want to direct that today?",
          title: 'Morning Direction'
        };
      }
      return {
        prompt: "You're at your best. What does making the most of today actually look like – specifically?",
        title: 'Morning Precision'
      };
    }
    if (hasCoachFavorite) {
      if (tier === 'strong') {
        return {
          prompt: "You're well-resourced. Where do you most want to direct that today?",
          title: 'Morning Direction'
        };
      }
      return {
        prompt: "You're at your best. What does making the most of today actually look like – specifically?",
        title: 'Morning Precision'
      };
    }
    // Strong/peak with low/medium pressure and no favourite: EXCLUDE coach
    return null;
  }

  // Afternoon coach decision tree
  if (timeOfDay === 'afternoon') {
    if (tier === 'depleted') {
      return {
        prompt: "You're running low. What's one thing you can let go of to make it through the afternoon?",
        title: 'Afternoon Reset'
      };
    }
    if (calendarPressure === 'high' && hasPreEventWithin4h) {
      return {
        prompt: "You have a high-stakes moment coming up this afternoon. What outcome would make this a success for you?",
        title: 'Afternoon Prep'
      };
    }
    // All other cases: EXCLUDE coach
    return null;
  }

  return null;
}

// ==================== PHASE 2: WEARABLE RECOVERY DAY (flagged OFF) ====================
const ENABLE_WEARABLE_RECOVERY_TRIGGER = false;

async function checkMasteryPlanRecoveryTrigger(
  userId: string,
  supabaseClient: any
): Promise<{ triggered: boolean; reason: string; hrvDeviation: number; consecutiveDays: number } | null> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentHRV } = await supabaseClient
      .from('wearable_data')
      .select('summary_date, hrv')
      .eq('user_id', userId)
      .gte('summary_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('summary_date', { ascending: false })
      .limit(7);

    if (!recentHRV || recentHRV.length < 3) return null;

    const baseline = recentHRV.reduce((sum: number, d: any) => sum + (d.hrv || 0), 0) / recentHRV.length;
    if (baseline <= 0) return null;

    let consecutiveDays = 0;
    for (const sample of recentHRV) {
      const deviation = ((sample.hrv - baseline) / baseline) * 100;
      if (deviation < -20) consecutiveDays++;
      else break;
    }

    if (consecutiveDays >= 2) {
      const todayDeviation = Math.round(((recentHRV[0].hrv - baseline) / baseline) * 100);
      return { triggered: true, reason: `Sustained HRV deficit (${consecutiveDays} days <-20%)`, hrvDeviation: todayDeviation, consecutiveDays };
    }

    const todayDeviation = ((recentHRV[0].hrv - baseline) / baseline) * 100;
    if (todayDeviation < -30) {
      return { triggered: true, reason: 'Severe HRV drop (<-30%)', hrvDeviation: Math.round(todayDeviation), consecutiveDays: 1 };
    }

    return null;
  } catch { return null; }
}

// ==================== SHARED CONTEXT ====================

interface SharedContext {
  rawCalendarEvents: any[];
  calendarGaps: number[];
  innerReadinessPattern: { trend: 'improving' | 'declining' | 'stable'; values: number[] };
  causeEffect: {
    practiceImpact: { practiceId: string; avgOutcomeShift: number; count: number }[];
    stateCarryover: { eveningTier: string; morningTier: string; count: number }[];
  };
  pendingCommitments: any[];
  combinedAlreadyUsed: string[];
}

async function buildSharedContext(req: PlanRequest, supabaseClient: any): Promise<SharedContext> {
  const timeOfDay = getTimeOfDay(req.timezoneOffset);
  const today = new Date().toISOString().split('T')[0];
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const ctx: SharedContext = {
    rawCalendarEvents: [],
    calendarGaps: [],
    innerReadinessPattern: { trend: 'stable', values: [] },
    causeEffect: { practiceImpact: [], stateCarryover: [] },
    pendingCommitments: [],
    combinedAlreadyUsed: [],
  };

  // ═══ PARALLEL BATCH: All server-side data fetching consolidated ═══
  const [
    calConnRes, checkinsRes, wearableRes, profileRes,
    favsRes, ritualRes, feedbackRes, insightsRes, commitmentsRes,
    practiceSessionsRes,
  ] = await Promise.all([
    supabaseClient.from('calendar_connections').select('is_active').eq('user_id', req.userId).eq('is_active', true).maybeSingle(),
    supabaseClient.from('daily_checkins').select('outcome, clarity_level, confidence_level, energy_balance, checkin_date, time_window').eq('user_id', req.userId).order('checkin_date', { ascending: false }).limit(10),
    supabaseClient.from('wearable_data').select('sleep_score, hrv, resting_heart_rate, sleep_quality, summary_date').eq('user_id', req.userId).gte('summary_date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]).order('summary_date', { ascending: false }).limit(1).maybeSingle(),
    supabaseClient.from('profiles').select('practice_priority_tag, pressure_context_tag, archetype, component_scores').eq('id', req.userId).maybeSingle(),
    supabaseClient.from('user_favorites').select('content_id').eq('user_id', req.userId),
    supabaseClient.from('daily_ritual_completions').select('completed_practice_ids').eq('user_id', req.userId).eq('ritual_date', today).eq('session_period', timeOfDay).maybeSingle(),
    supabaseClient.from('content_relevance_feedback').select('content_id').eq('user_id', req.userId).gte('star_rating', 4),
    supabaseClient.from('user_coach_insights').select('id, insight_type, insight_content, content_reference, confidence_score').eq('user_id', req.userId).eq('is_active', true).gte('confidence_score', 0.6).order('extracted_at', { ascending: false }).limit(50),
    supabaseClient.from('coach_accountability_tracker').select('commitment_text, target_practice_id, pattern_area, status').eq('user_id', req.userId).eq('status', 'pending'),
    supabaseClient.from('practice_sessions').select('practice_id, completed_at').eq('user_id', req.userId).gte('completed_at', new Date(Date.now() - 14 * 86400000).toISOString()).order('completed_at', { ascending: false }).limit(100),
  ]);

  // ── Calendar events ──
  if (calConnRes.data) {
    const { data: events } = await supabaseClient
      .from('calendar_events')
      .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring')
      .eq('user_id', req.userId)
      .gte('start_time', now.toISOString())
      .lte('start_time', in48h.toISOString());
    ctx.rawCalendarEvents = events || [];
    req.calendarEvents = ctx.rawCalendarEvents.map((e: any) => ({
      id: e.id, title: e.title, startTime: e.start_time, endTime: e.end_time,
      isOrganizer: e.is_organizer, attendeesCount: e.attendees_count, isRecurring: e.is_recurring,
    }));
    console.log(`[buildSharedContext] calendar_events: ${ctx.rawCalendarEvents.length} events in next 48h`);
  } else {
    req.calendarEvents = [];
  }

  // ── Calendar load/pressure + gaps ──
  {
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const upcoming = ctx.rawCalendarEvents.filter((e: any) => new Date(e.start_time) >= now && new Date(e.start_time) <= fourHoursLater);
    req.calendarLoad = upcoming.length >= 5 ? 'high' : upcoming.length >= 3 ? 'medium' : 'low';
    let totalPressure = 0;
    upcoming.forEach((e: any) => {
      let ep = 0;
      if (e.is_organizer) ep += 2;
      const att = e.attendees_count || 0;
      if (att > 5) ep += 2; else if (att > 2) ep += 1;
      const dur = (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 60000;
      if (dur > 60) ep += 2; else if (dur >= 30) ep += 1;
      if (!e.is_recurring) ep += 1;
      const hour = new Date(e.start_time).getHours();
      if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) ep += 1;
      totalPressure += ep;
    });
    const sorted = [...upcoming].sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = (new Date(sorted[i + 1].start_time).getTime() - new Date(sorted[i].end_time).getTime()) / 60000;
      if (gap < 15) totalPressure += 1;
    }
    req.calendarPressure = totalPressure >= 6 ? 'high' : totalPressure >= 3 ? 'medium' : 'low';

    // Calendar gaps between consecutive future events
    const futureEvents = ctx.rawCalendarEvents
      .filter((e: any) => new Date(e.start_time) >= now)
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    for (let i = 0; i < futureEvents.length - 1; i++) {
      ctx.calendarGaps.push(Math.round((new Date(futureEvents[i + 1].start_time).getTime() - new Date(futureEvents[i].end_time).getTime()) / 60000));
    }
  }

  // ── Check-in data ──
  const checkins = checkinsRes.data || [];
  if (checkins.length > 0) {
    const windowCheckin = checkins.find((c: any) => c.checkin_date === today && c.time_window === timeOfDay);
    const latest = windowCheckin || checkins[0];
    req.clarityLevel = latest.clarity_level ?? 0;
    req.confidenceLevel = latest.confidence_level ?? 0;
    req.checkInOutcome = latest.outcome || 'steady';
    const eb = latest.energy_balance ?? 50;
    req.innerReadinessScore = eb;
    if (eb < 40) req.innerReadinessTier = 'depleted';
    else if (eb < 60) req.innerReadinessTier = 'managing';
    else if (eb < 75) req.innerReadinessTier = 'strong';
    else req.innerReadinessTier = 'peak';

    // Consecutive-low pattern
    const first = checkins[0].outcome;
    const lowStates = ['overwhelmed', 'drained', 'scattered'];
    if (lowStates.includes(first)) {
      let count = 1;
      for (let i = 1; i < checkins.length; i++) { if (checkins[i].outcome === first) count++; else break; }
      if (count >= 3) req.patternInsight = { count, state: first };
    }

    // innerReadinessPattern.trend (last 5 energy_balance direction)
    const last5 = checkins.slice(0, 5).map((c: any) => c.energy_balance ?? 50);
    ctx.innerReadinessPattern.values = last5;
    if (last5.length >= 3) {
      const older = last5.slice(Math.floor(last5.length / 2));
      const recent = last5.slice(0, Math.floor(last5.length / 2));
      const avgOlder = older.reduce((s: number, v: number) => s + v, 0) / older.length;
      const avgRecent = recent.reduce((s: number, v: number) => s + v, 0) / recent.length;
      const diff = avgRecent - avgOlder;
      ctx.innerReadinessPattern.trend = diff > 5 ? 'improving' : diff < -5 ? 'declining' : 'stable';
    }

    // causeEffect.stateCarryover (evening→morning)
    try {
      const byDate: Record<string, any[]> = {};
      for (const c of checkins) { if (!byDate[c.checkin_date]) byDate[c.checkin_date] = []; byDate[c.checkin_date].push(c); }
      const dates = Object.keys(byDate).sort().reverse();
      const getTier = (eb: number) => eb < 40 ? 'depleted' : eb < 60 ? 'managing' : eb < 75 ? 'strong' : 'peak';
      const pairMap: Record<string, { eveningTier: string; morningTier: string; count: number }> = {};
      for (let i = 0; i < dates.length - 1; i++) {
        const prevEvenings = byDate[dates[i + 1]]?.filter((c: any) => c.time_window === 'evening') || [];
        const mornings = byDate[dates[i]]?.filter((c: any) => c.time_window === 'morning') || [];
        if (prevEvenings.length > 0 && mornings.length > 0) {
          const evT = getTier(prevEvenings[0].energy_balance ?? 50);
          const moT = getTier(mornings[0].energy_balance ?? 50);
          const key = `${evT}→${moT}`;
          if (!pairMap[key]) pairMap[key] = { eveningTier: evT, morningTier: moT, count: 0 };
          pairMap[key].count++;
        }
      }
      ctx.causeEffect.stateCarryover = Object.values(pairMap).filter(c => c.count >= 2);
    } catch { /* ignore */ }
  }

  // ── Wearable data ──
  if (wearableRes.data) {
    const w = wearableRes.data;
    let hrvDeviation: number | null = null;
    if (w.hrv != null) {
      const { data: baselineRows } = await supabaseClient.from('wearable_data').select('hrv').eq('user_id', req.userId).not('hrv', 'is', null).order('summary_date', { ascending: false }).limit(30);
      if (baselineRows && baselineRows.length >= 5) {
        const avgHRV = baselineRows.reduce((sum: number, r: any) => sum + Number(r.hrv), 0) / baselineRows.length;
        if (avgHRV > 0) hrvDeviation = ((Number(w.hrv) - avgHRV) / avgHRV) * 100;
      }
    }
    req.wearableContext = { sleepScore: w.sleep_score ?? null, hrvMs: w.hrv != null ? Number(w.hrv) : null, restingHR: w.resting_heart_rate ?? null, hrvDeviation, sleepQuality: w.sleep_quality ?? null, hasData: true };
    console.log(`[buildSharedContext] wearable: sleep=${w.sleep_score}, hrv=${w.hrv}, hrvDev=${hrvDeviation?.toFixed(1)}%`);
  }

  // ── Profile tags + component scores ──
  if (profileRes.data) {
    req.practicePriorityTag = profileRes.data.practice_priority_tag || '';
    req.pressureContextTag = profileRes.data.pressure_context_tag || '';
    req.archetype = profileRes.data.archetype || '';
    req.componentScores = profileRes.data.component_scores || null;
  }

  // ── Engagement signals ──
  req.effectiveContent = (feedbackRes.data || []).map((f: any) => f.content_id);
  req.coachInsights = (insightsRes.data || []).map((r: any) => ({ id: r.id, type: r.insight_type, content: r.insight_content, contentReference: r.content_reference || undefined, confidence: r.confidence_score || 0.5 }));
  req.completedToday = ritualRes.data?.completed_practice_ids || [];
  req.favorites = (favsRes.data || []).map((f: any) => f.content_id);
  ctx.pendingCommitments = commitmentsRes.data || [];

  // causeEffect.practiceImpact (practice_sessions × daily_checkins)
  try {
    const sessions = practiceSessionsRes.data || [];
    if (sessions.length > 0 && checkins.length > 0) {
      const impactMap: Record<string, { totalShift: number; count: number }> = {};
      for (const session of sessions) {
        const sessionDate = (session.completed_at || '').split('T')[0];
        const sameDay = checkins.filter((c: any) => c.checkin_date === sessionDate);
        if (sameDay.length >= 2) {
          const pre = sameDay[sameDay.length - 1].energy_balance ?? 50;
          const post = sameDay[0].energy_balance ?? 50;
          const pid = session.practice_id;
          if (!impactMap[pid]) impactMap[pid] = { totalShift: 0, count: 0 };
          impactMap[pid].totalShift += (post - pre);
          impactMap[pid].count++;
        }
      }
      ctx.causeEffect.practiceImpact = Object.entries(impactMap)
        .filter(([_, v]) => v.count >= 2)
        .map(([pid, v]) => ({ practiceId: pid, avgOutcomeShift: Math.round(v.totalShift / v.count), count: v.count }));
    }
  } catch { /* ignore */ }

  // ── Outer Readiness (server-to-server) ──
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const outerRes = await fetch(`${supabaseUrl}/functions/v1/compute-outer-readiness`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
      body: JSON.stringify({
        userId: req.userId, timezoneOffset: req.timezoneOffset,
        innerReadinessTier: req.innerReadinessTier, innerReadinessScore: req.innerReadinessScore,
        clarityLevel: req.clarityLevel, confidenceLevel: req.confidenceLevel, checkInOutcome: req.checkInOutcome,
        componentScores: req.componentScores || null,
        practicePriorityTag: req.practicePriorityTag || null,
      }),
    });
    if (outerRes.ok) {
      const outerData = await outerRes.json();
      req.outerReadinessPhrase = outerData.phrase || 'Steady execution.';
      req.outerReadinessDriver = outerData.driver || 'state';
      req.outerReadinessContext = outerData.context || '';
      req.outerReadinessLeanOn = outerData.leanOn || '';
      req.outerReadinessWatchFor = outerData.watchFor || '';
      ctx.combinedAlreadyUsed = [...(outerData.stateAlreadyUsed || []), ...(outerData.compassAlreadyUsed || [])];
    }
  } catch {
    req.outerReadinessPhrase = 'Steady execution.';
    req.outerReadinessDriver = 'state';
    req.outerReadinessContext = '';
    req.outerReadinessLeanOn = '';
    req.outerReadinessWatchFor = '';
  }

  console.log(`[buildSharedContext] Complete: tier=${req.innerReadinessTier} score=${req.innerReadinessScore} trend=${ctx.innerReadinessPattern.trend} calLoad=${req.calendarLoad} gaps=${ctx.calendarGaps.length} practiceImpact=${ctx.causeEffect.practiceImpact.length} stateCarryover=${ctx.causeEffect.stateCarryover.length}`);
  return ctx;
}

// ==================== MAIN PLAN GENERATION ====================

async function generateMasteryPlan(req: PlanRequest, supabaseClient: any) {
  const timeOfDay = getTimeOfDay(req.timezoneOffset);

  // Phase 2: Recovery day override (feature-flagged OFF)
  if (ENABLE_WEARABLE_RECOVERY_TRIGGER) {
    const recoveryTrigger = await checkMasteryPlanRecoveryTrigger(req.userId, supabaseClient);
    if (recoveryTrigger?.triggered) {
      console.log(`[generate-mastery-plan] RECOVERY DAY TRIGGERED: ${recoveryTrigger.reason}`);
    }
  }

  // ═══ BUILD SHARED CONTEXT – single consolidated function ═══
  const shared = await buildSharedContext(req, supabaseClient);
  const rawCalendarEvents = shared.rawCalendarEvents;
  const combinedAlreadyUsed = shared.combinedAlreadyUsed;
  const pendingCommitments = shared.pendingCommitments;

  // 2. Fetch content library from DB
  const { data: contentLibrary } = await supabaseClient
    .from('sanctuary_content')
    .select('id, title, content_type, category, tags, duration, sub_type, difficulty, protocol_type, thumbnail_url')
    .eq('is_active', true);

  // Also fetch structured tags from metadata
  const { data: contentMetadata } = await supabaseClient
    .from('sanctuary_content_metadata')
    .select('content_id, structured_tags, mastery_category, horizon, meta_skill, is_foundational, moment, state_signal, duration_band');

  // Merge metadata into content
  const metadataMap = new Map((contentMetadata || []).map((m: any) => [m.content_id, m]));
  const enrichedContent = (contentLibrary || []).map((c: any) => {
    const meta = metadataMap.get(c.id);
    return {
      ...c,
      structured_tags: (meta as any)?.structured_tags,
      mastery_category: (meta as any)?.mastery_category,
      horizonTags: (meta as any)?.horizon || [],
      metaSkillTags: (meta as any)?.meta_skill || [],
      isFoundational: (meta as any)?.is_foundational ?? false,
      momentTags: (meta as any)?.moment || [],
      stateSignalTags: (meta as any)?.state_signal || [],
      durationBand: (meta as any)?.duration_band || 'short',
    };
  });

  // 3. Fetch HRV × Calendar correlations
  const hrvCorrelations = await getHRVEventCorrelations(req.userId, supabaseClient);

  // 4. Score calendar events – bridge to new pipeline (jit_event_context) with legacy fallback
  const scoredEvents = await getPreScoredEvents(req.userId, req.calendarEvents || [], supabaseClient, hrvCorrelations);

  // Suppresses event types skipped 3+ times in last 30 days.
  // TODO: Replace with query to jit_cancellation_memory:
  //   SELECT DISTINCT event_type FROM jit_cancellation_memory
  //   WHERE user_id = userId AND penalty_level >= 3
  //   AND cancelled_at > NOW() - INTERVAL '30d'
  const skippedTypes3Plus: string[] = [];

  // Filter out 3+ skipped types (defensive – degrades to unfiltered on error)
  let filteredEvents = scoredEvents;
  try {
    filteredEvents = scoredEvents.filter(e => !skippedTypes3Plus.includes(e.scenario?.id || 'general'));
  } catch (filterError: any) {
    console.error('[generate-mastery-plan] Event filter failed, using unfiltered events:', filterError?.message);
  }

  // Observability: log calendar scoring summary
  console.log(`[generate-mastery-plan] Calendar: ${req.calendarEvents?.length || 0} events fetched, ${scoredEvents.length} scored, ${filteredEvents.length} after suppression. Top event: ${filteredEvents[0]?.event.title || 'none'} (score: ${filteredEvents[0]?.score || 0})`);

  // State hash for coach card versioning – ensures refreshed state gets new coach cards
  const coachStateHash = String(hashCode(`${req.innerReadinessTier}:${req.checkInOutcome}:${req.innerReadinessScore}:${req.outerReadinessPhrase}:${timeOfDay}`));

  // 4. Build calendar pills (max 2)
  const calendarPills = filteredEvents.slice(0, 2).map(e => ({
    label: e.scenario ? `${e.scenario.contextLabel}` : e.event.title || 'Upcoming Event',
    eventId: e.event.id,
    priorityScore: e.score,
    timePill: e.timePill
  }));

  // 5. Build pre-event plan using TWO-TOUCH ACTION MODEL
  // Touch 1 (6-48h): coach primary CTA + framework + optional focus practice (5-8 min thinking prep)
  // Touch 2 (0-6h): somatic primary + focus exercise + coach secondary (3-5 min body prep)
  // Selection-only (>48h): nothing surfaces. Per-event suppression via dismissed_horizons.
  let preEventPlan: any = null;

  // Find first event in a valid action window
  let topEvent: ScoredEvent | null = null;
  for (const evt of filteredEvents) {
    if (evt.score < JIT_THRESHOLD_UNIFIED) {
      console.log(`[generate-mastery-plan] JIT candidate EXCLUDED: "${evt.event.title}" – score=${evt.score} < threshold=${JIT_THRESHOLD_UNIFIED}`);
      continue;
    }
    const window = getActionWindow(evt.minutesUntil);
    if (window === 'touch1' || window === 'touch2') {
      topEvent = evt;
      break;
    }
    console.log(`[generate-mastery-plan] JIT candidate EXCLUDED: "${evt.event.title}" – window=${window} minutesUntil=${evt.minutesUntil} score=${evt.score}`);
  }

  if (topEvent) {
    const scenario = topEvent.scenario;
    const actionWindow = getActionWindow(topEvent.minutesUntil);
    const horizon = actionWindow === 'touch1' ? 'touch_1' : 'touch_2';
    const preEventModules: any[] = [];

    console.log(`[generate-mastery-plan] Two-touch: "${topEvent.event.title}" window=${actionWindow} horizon=${horizon} score=${topEvent.score} minutesUntil=${topEvent.minutesUntil}`);

    if (actionWindow === 'touch2') {
      // ═══ TOUCH 2 (0-6h): BODY PREP – somatic-first, 3-5 min max ═══
      // Primary: somatic/breathing regulation practice (gentle, micro/short)
      const somaticSpec: ModuleSpec = { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'micro', focus: 'composure' };
      const somaticContent = selectContent(enrichedContent, somaticSpec, req, pendingCommitments);
      if (somaticContent) {
        preEventModules.push({
          type: 'regulate',
          contentId: somaticContent.id,
          title: somaticContent.title,
          contentType: somaticContent.content_type,
          duration: somaticContent.duration,
          focus: 'composure',
          intensity: 'gentle',
          isFavorite: req.favorites.includes(somaticContent.id),
          reasoning: `Settle your body before ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
        });
      }
      // Secondary: one short focus/grounding exercise
      const focusSpec: ModuleSpec = { type: 'align', required: false, priority: 6, intensity: 'gentle', duration: 'micro', focus: 'grounding' };
      const focusContent = selectContent(enrichedContent, focusSpec, req, pendingCommitments);
      if (focusContent) {
        preEventModules.push({
          type: 'align',
          contentId: focusContent.id,
          title: focusContent.title,
          contentType: focusContent.content_type,
          duration: focusContent.duration,
          focus: 'grounding',
          intensity: 'gentle',
          isFavorite: req.favorites.includes(focusContent.id),
          reasoning: `Get focused and grounded before ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
        });
      }
      // Coach card as secondary CTA only
      preEventModules.push({
        type: 'prepare',
        contentId: 'coach-prepare',
        title: 'Quick Coach Check-in',
        contentType: 'coach',
        duration: 2,
        focus: 'composure',
        intensity: 'gentle',
        isFavorite: false,
        isCoachCard: true,
        reasoning: 'Quick check-in if you need it'
      });
    } else {
      // ═══ TOUCH 1 (24-48h): THINK PREP – coach primary, framework, 5-8 min ═══
      // Primary: coach card (prepare type) as main CTA
      preEventModules.push({
        type: 'prepare',
        contentId: 'coach-prepare',
        title: 'Prepare with Your Coach',
        contentType: 'coach',
        duration: 3,
        focus: 'composure',
        intensity: 'moderate',
        isFavorite: false,
        isCoachCard: true,
        reasoning: scenario ? `Discuss your ${scenario.contextLabel.toLowerCase()} approach with your coach` : `Discuss your approach with your coach before ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
      });
      // Secondary: one mental framework / reframe / align practice
      const frameworkSpec: ModuleSpec = { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'confidence' };
      const frameworkContent = selectContent(enrichedContent, frameworkSpec, req, pendingCommitments);
      if (frameworkContent) {
        preEventModules.push({
          type: 'align',
          contentId: frameworkContent.id,
          title: frameworkContent.title,
          contentType: frameworkContent.content_type,
          duration: frameworkContent.duration,
          focus: 'confidence',
          intensity: 'moderate',
          isFavorite: req.favorites.includes(frameworkContent.id),
          reasoning: `Mental framework to sharpen your approach for ${topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event'}`
        });
      }
      // Optional: one focus practice if scenario matched
      if (scenario) {
        const focusSpec: ModuleSpec = { type: 'regulate', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'focus' };
        const focusContent = selectContent(enrichedContent, focusSpec, req, pendingCommitments);
        if (focusContent) {
          preEventModules.push({
            type: 'regulate',
            contentId: focusContent.id,
            title: focusContent.title,
            contentType: focusContent.content_type,
            duration: focusContent.duration,
            focus: 'focus',
            intensity: 'gentle',
            isFavorite: req.favorites.includes(focusContent.id),
            reasoning: `Optional focus practice for deeper ${scenario?.contextLabel?.toLowerCase() || 'event'} preparation`
          });
        }
      }
    }

    // ═══ ENRICH CONTEXT – Coach Memory + HRV as Lead Context ═══
    let enrichedContextDescription = topEvent.contextDescription || '';
    const eventTitleLower = (topEvent.event.title || '').toLowerCase();
    const eventTitleShort = topEvent.event.title?.split(' ').slice(0, 4).join(' ') || 'this event';
    
    // Check if any pending coach commitment mentions this event
    const relevantCommitment = pendingCommitments.find((c: any) => {
      const commitText = (c.commitment_text || '').toLowerCase();
      return eventTitleLower.split(' ').some((word: string) => word.length > 3 && commitText.includes(word));
    });

    // Check for pattern observations related to this event type
    let patternMatched = false;
    if (scenario && req.patternInsight) {
      const patternState = (req.patternInsight.state || '').toLowerCase();
      const scenarioKeywords = (scenario.triggers.calendarKeywords || []).map((k: string) => k.toLowerCase());
      patternMatched = scenarioKeywords.some(kw => patternState.includes(kw));
    }

    // Aggressively replace context – coach memory and HRV take priority over generic text
    if (relevantCommitment && patternMatched) {
      enrichedContextDescription = `You discussed this with your coach and a pattern has been noted – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    } else if (relevantCommitment) {
      enrichedContextDescription = `You discussed this with your coach – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    } else if (patternMatched) {
      enrichedContextDescription = `Your coach has noted a pattern here – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    } else if (topEvent.hrvCorrelation && Math.abs(topEvent.hrvCorrelation.avgDeviation) > 10 && !enrichedContextDescription) {
      // HRV as lead context when no coach signals and context is empty
      const canonicalLabel = CANONICAL_TAGS[topEvent.hrvCorrelation.eventType] || topEvent.hrvCorrelation.eventType;
      enrichedContextDescription = `Your HRV typically shifts ${Math.abs(topEvent.hrvCorrelation.avgDeviation)}% during ${canonicalLabel.toLowerCase()} events – ${topEvent.timePill?.toLowerCase() || 'upcoming'}. Prepare with targeted practice.`;
    }

    if (preEventModules.length > 0) {
      preEventPlan = {
        eventTitle: topEvent.event.title,
        eventType: CANONICAL_TAGS[extractEventType(topEvent.event.title || '')] || scenario?.contextLabel || 'Meeting Prep',
        minutesUntil: topEvent.minutesUntil,
        timePill: topEvent.timePill,
        contextDescription: enrichedContextDescription,
        modules: preEventModules,
        coachCard: generateCoachCard('prepare', timeOfDay, req.innerReadinessTier, req.patternInsight, topEvent.event.title, topEvent.minutesUntil, coachStateHash),
        progressTracked: false,
        hrvCorrelation: topEvent.hrvCorrelation || null,
        actionWindow: actionWindow,
        horizon: horizon,
        eventId: topEvent.event.id,
      };
      console.log(`[generate-mastery-plan] preEventPlan built: "${topEvent.event.title}" window=${actionWindow} horizon=${horizon} with ${preEventModules.length} modules (scenario: ${scenario?.id || 'fallback'})`);
    } else {
      console.log(`[generate-mastery-plan] preEventPlan skipped: no modules resolved for "${topEvent.event.title}"`);
    }
  } else {
    const reason = filteredEvents.length === 0 ? 'no calendar events' : `no events in action window (top: "${filteredEvents[0]?.event.title}" score=${filteredEvents[0]?.score || 0} minutesUntil=${filteredEvents[0]?.minutesUntil || 0})`;
    console.log(`[generate-mastery-plan] preEventPlan=null: ${reason}`);
  }

  // Collect JIT content IDs to exclude from ToD plan (prevent duplicate practices)
  const jitContentIds = new Set<string>();
  if (preEventPlan?.modules) {
    for (const m of preEventPlan.modules) {
      if (m.contentId && !m.isCoachCard) {
        jitContentIds.add(m.contentId);
      }
    }
  }
  if (jitContentIds.size > 0) {
    console.log(`[generate-mastery-plan] Excluding ${jitContentIds.size} JIT content IDs from ToD selection: ${[...jitContentIds].join(', ')}`);
  }

  // 6. Build time-of-day plan
  const { maxModules } = getDurationCeiling(req.calendarLoad);
  const baseMapping = getModulesFromTheme(req.outerReadinessPhrase);

  // Calendar-context density overrides – adjust module focus/intensity based on actual calendar load
  const calendarContext = calculateCalendarContext(rawCalendarEvents, timeOfDay);
  const moduleMapping = applyCalendarOverrides(baseMapping, calendarContext, timeOfDay, req.innerReadinessTier);
  // Build resolved modules list for module-derived rationale
  const resolvedModuleTypes = Object.entries(moduleMapping)
    .filter(([_, spec]) => spec)
    .map(([type, spec]) => ({ type, focus: (spec as any).focus }));

  // Determine JIT priority: if preEventPlan exists and is in touch_2 window
  const jitPriority = !!(preEventPlan && topEvent && getActionWindow(topEvent.minutesUntil) === 'touch2');

  // Next event info for urgency frame
  const nextEvtTitle = topEvent?.event.title || null;
  const nextEvtMins = topEvent?.minutesUntil || null;

  const planBrief = generatePlanBrief(calendarContext, timeOfDay, req.innerReadinessTier, req.innerReadinessScore, req.checkInOutcome, req.calendarLoad, req.wearableContext, req.outerReadinessPhrase, req.outerReadinessContext, req.outerReadinessLeanOn, req.coachInsights, resolvedModuleTypes, combinedAlreadyUsed, nextEvtTitle, nextEvtMins, pendingCommitments, shared.calendarGaps);
  console.log(`[generate-mastery-plan] calendarContext: todayLoad=${calendarContext.todayLoad} (${calendarContext.todayMeetingCount} mtgs, ${calendarContext.todayMeetingHours}h), upcomingLoad=${calendarContext.upcomingLoad} (${calendarContext.upcomingMeetingCount} mtgs), planBrief=${planBrief}`);

  // Evening: always ensure Regulate + Align (grounding) + Integrate modules are present (even without check-in)
  if (timeOfDay === 'evening') {
    if (!moduleMapping.regulate) {
      moduleMapping.regulate = { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' };
    }
    if (!moduleMapping.align) {
      moduleMapping.align = { type: 'align', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' };
    }
    if (!moduleMapping.integrate) {
      moduleMapping.integrate = { type: 'integrate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' };
    }
  }

  // Afternoon: suppress Prepare unless scenario detected
  if (timeOfDay === 'afternoon' && moduleMapping.prepare && filteredEvents.length === 0) {
    delete moduleMapping.prepare;
  }

  // Evening: suppress Prepare unless high-priority event within 18 hours
  if (timeOfDay === 'evening' && moduleMapping.prepare) {
    const hasNearEvent = filteredEvents.some(e => e.minutesUntil <= 18 * 60);
    if (!hasNearEvent) delete moduleMapping.prepare;
  }

  const todModules: any[] = [];
  const moduleOrder: ('regulate' | 'align' | 'prepare' | 'integrate')[] = ['regulate', 'align', 'prepare', 'integrate'];

  // Filter out content already used in JIT plan – computed once, used by all modules
  const todCandidates = jitContentIds.size > 0
    ? enrichedContent.filter((c: any) => !jitContentIds.has(c.id))
    : enrichedContent;

  for (const moduleType of moduleOrder) {
    if (todModules.length >= maxModules) break;
    const spec = moduleMapping[moduleType];
    if (!spec) continue;

    // Skip optional modules if 3+ required already
    const requiredCount = todModules.filter(m => m.required).length;
    if (!spec.required && requiredCount >= 3) continue;

    if (moduleType === 'prepare' || moduleType === 'integrate') {
      // Coach cards
      const coachCard = generateCoachCard(moduleType, timeOfDay, req.innerReadinessTier, req.patternInsight, undefined, undefined, coachStateHash);
      if (coachCard) {
        todModules.push({
          type: moduleType,
          contentId: coachCard.id,
          title: coachCard.title,
          contentType: 'coach',
          duration: coachCard.duration,
          focus: spec.focus,
          intensity: spec.intensity,
          isFavorite: false,
          isCoachCard: true,
          reasoning: moduleType === 'prepare' ? 'Prepare your mindset for what\'s coming – arrive ready, not reactive' : 'Capture what went well today and close with intention – this prevents rumination overnight',
          required: spec.required
        });
      }
    } else {
      const selected = selectContent(todCandidates, spec, req, pendingCommitments);
      if (selected) {
        todModules.push({
          type: moduleType,
          contentId: selected.id,
          title: selected.title,
          contentType: selected.content_type,
          duration: selected.duration,
          focus: spec.focus,
          intensity: spec.intensity,
          isFavorite: req.favorites.includes(selected.id),
           reasoning: getContextualReasoning(moduleType, spec.focus, req.innerReadinessTier, req.checkInOutcome, req.calendarLoad, timeOfDay, req.wearableContext, req.outerReadinessPhrase),
          required: spec.required,
          thumbnailUrl: selected.thumbnail_url
        });
      } else if (timeOfDay === 'evening') {
        // Fallback: try to find unfinished content from DB for this module type
        const fallbackCategory = moduleType === 'regulate' ? 'somatic' : 'mindset';
        const fallbackItem = todCandidates.find((c: any) => c.category === fallbackCategory && !req.completedToday.includes(c.id));
        if (fallbackItem) {
          todModules.push({
            type: moduleType,
            contentId: fallbackItem.id,
            title: fallbackItem.title,
            contentType: fallbackItem.content_type,
            duration: fallbackItem.duration,
            focus: spec.focus,
            intensity: spec.intensity,
            isFavorite: req.favorites.includes(fallbackItem.id),
            reasoning: getContextualReasoning(moduleType, spec.focus, req.innerReadinessTier, req.checkInOutcome, req.calendarLoad, timeOfDay, req.wearableContext, req.outerReadinessPhrase),
            required: spec.required,
            thumbnailUrl: fallbackItem.thumbnail_url
          });
        }
        // If no unfinished content exists, skip the module entirely – never resurface completed
      }
    }
  }

  // 7. Coach card for time-of-day plan (separate from module coach cards)
  let todCoachCard: any = null;
  const hasCoachFavorite = req.favorites.some(fav => fav.startsWith('coach-') || fav === 'coach');
  const hasPreEventWithin4h = filteredEvents.some(e => e.minutesUntil <= 240);
  const coachContext = getCoachPromptForContext(timeOfDay, req.innerReadinessTier, req.patternInsight, req.innerReadinessScore, req.calendarPressure, hasCoachFavorite, hasPreEventWithin4h);
  if (coachContext) {
    // Only add coach card to modules if not already there as prepare/integrate
    const hasCoachModule = todModules.some(m => m.isCoachCard);
    if (!hasCoachModule && todModules.length < maxModules) {
      const coachType = timeOfDay === 'evening' ? 'integrate' : 'prepare';
      todCoachCard = {
        id: `coach-${coachType}:${coachStateHash.substring(0, 8)}`,
        type: coachType,
        label: coachType === 'integrate' ? 'Integrate' : 'Prepare',
        protocolType: 'Self Mastery Coach',
        title: coachContext.title,
        duration: 2,
        sortOrder: coachType === 'integrate' ? 4 : 3,
        isCoachCard: true,
        prompt: coachContext.prompt
      };
      todModules.push({
        type: coachType,
        contentId: todCoachCard.id,
        title: todCoachCard.title,
        contentType: 'coach',
        duration: 2,
        focus: 'release',
        intensity: 'gentle',
        isFavorite: false,
        isCoachCard: true,
        reasoning: timeOfDay === 'evening' ? 'Evening reflection and tiny wins capture' : 'Brief coaching check-in',
        required: timeOfDay === 'evening'
      });
    }
  }

  // Calculate total duration
  const totalDuration = todModules.reduce((sum, m) => sum + (m.duration || 0), 0);

  // Time-of-day label
  const periodLabels: Record<string, string> = {
    morning: 'Morning Practice',
    afternoon: 'Afternoon Reset',
    evening: 'Evening Close'
  };

  const { maxDuration } = getDurationCeiling(req.calendarLoad);

  // ════════════════════════════════════════════
  // BUILD HORIZON MODULES (Today's 3 Performance Priorities)
  // ════════════════════════════════════════════

  const horizonModules = buildHorizonModules(
    todModules, preEventPlan, topEvent, req, shared, hrvCorrelations,
    timeOfDay, todCoachCard, enrichedContent, pendingCommitments
  );

  return {
    timeOfDayPlan: {
      label: periodLabels[timeOfDay],
      period: timeOfDay,
      modules: todModules,
      coachCard: todCoachCard,
      totalDuration,
      progressTracked: true,
      planBrief: planBrief || undefined
    },
    calendarPills,
    preEventPlan,
    jitPriority,
    horizonModules,
    meta: {
      generatedAt: new Date().toISOString(),
      scenarioId: filteredEvents[0]?.scenario?.id || null,
      durationCeiling: maxDuration,
      maxModules,
      calendarContext: calendarContext.todayMeetingCount > 0 || calendarContext.upcomingMeetingCount > 0
        ? { todayLoad: calendarContext.todayLoad, upcomingLoad: calendarContext.upcomingLoad, todayMeetingCount: calendarContext.todayMeetingCount, todayMeetingHours: calendarContext.todayMeetingHours }
        : undefined
    }
  };
}

// ==================== CONTENT SELECTION ====================

function selectContent(contentLibrary: any[], spec: ModuleSpec, req: PlanRequest, pendingCommitments?: any[]): any | null {
  // Filter by module type
  let pool: any[];
  if (spec.type === 'regulate') {
    pool = contentLibrary.filter(c =>
      c.content_type === 'soundbath' ||
      (c.content_type === 'guided-practice' && (
        c.tags?.some((t: string) =>
          t.toLowerCase().includes('breathing') || t.toLowerCase().includes('somatic') || t.toLowerCase().includes('grounding') || t.toLowerCase().includes('calm')
        ) || c.category === 'pause'
      )) ||
      (c.content_type === 'micro-practice' && c.sub_type !== 'mindset' && c.tags?.some((t: string) =>
        t.toLowerCase().includes('breathing') || t.toLowerCase().includes('somatic') || t.toLowerCase().includes('grounding')
      ))
    );
  } else if (spec.type === 'align') {
    pool = contentLibrary.filter(c => c.content_type === 'micro-practice' && c.sub_type === 'mindset');
  } else {
    return null; // prepare/integrate are coach cards
  }

  // Filter out completed today – return null if no unfinished candidates
  const available = pool.filter(c => !req.completedToday.includes(c.id));
  if (available.length === 0) return null; // HARD exclude – never resurface completed content

  // Score
  const scored = available.map(c => ({
    content: c,
    score: calculateContentScore(c, spec, req.favorites, req.coachInsights || [], req.effectiveContent || [], req.completedToday, req.practicePriorityTag, req.pressureContextTag, pendingCommitments)
  }));
  scored.sort((a, b) => b.score - a.score);

  // Deterministic selection from top 3
  const topCandidates = scored.slice(0, Math.min(3, scored.length));
  const today = new Date().toISOString().split('T')[0];
  const seedStr = `${today}-${spec.type}-${spec.focus}`;
  const idx = hashCode(seedStr) % topCandidates.length;

  return topCandidates[idx]?.content || null;
}

function getContextualReasoning(
  moduleType: string,
  focus: string,
  innerReadinessTier: string,
  checkInOutcome: string,
  calendarLoad: string,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  wearable?: WearableContext,
  outerReadinessPhrase?: string
): string {
  const isDense = calendarLoad === 'extreme' || calendarLoad === 'heavy';
  const isDepleted = innerReadinessTier === 'depleted' || checkInOutcome === 'drained' || checkInOutcome === 'struggling';
  const isEvening = timeOfDay === 'evening';
  const isStrong = innerReadinessTier === 'strong' || innerReadinessTier === 'peak';

  // Wearable notable signals
  const poorSleep = wearable?.hasData && wearable.sleepScore !== null && wearable.sleepScore < 70;
  const lowHRV = wearable?.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation < -10;

  // Context-aware reasoning per focus area – wearable > readiness > calendar hierarchy
  if (focus === 'composure') {
    if (lowHRV) return 'Your HRV is below baseline – this settles your nervous system before what\'s ahead';
    if (isDepleted && isDense) return 'Your check-in and calendar both flag strain – this settles your nervous system to protect what remains';
    if (isDepleted) return 'Your check-in flagged tension – this settles your nervous system before what\'s ahead';
    if (isDense) return 'A dense calendar demands composure – this practice steadies you for high-stakes moments';
    return 'This practice anchors your composure so you show up grounded, not reactive';
  }
  if (focus === 'release') {
    if (poorSleep && isEvening) return 'Your sleep was disrupted last night – this practice helps discharge residual tension before rest';
    if (isEvening && isDepleted) return 'Your decision readiness is low – this helps discharge accumulated stress so it doesn\'t carry into tomorrow';
    if (isEvening && isDense) return 'After a heavy day, this helps discharge accumulated stress so it doesn\'t carry into tomorrow';
    if (isEvening) return 'Release the day\'s weight – this prevents rumination and protects your rest';
    if (isDepleted) return 'Your system is carrying tension – this practice creates space to let it go';
    return 'Clear mental clutter so your next decision comes from clarity, not residue';
  }
  if (focus === 'grounding') {
    if (isEvening && isDepleted) return 'Your readiness is low – grounding closes the mental loops and protects tonight\'s recovery';
    if (isEvening) return 'Ground yourself before rest – this closes the mental loops still running';
    if (lowHRV && isDepleted) return 'Your HRV and check-in both flag low reserves – grounding reconnects you to a stable centre';
    if (isDepleted) return 'When energy is low, grounding reconnects you to a stable centre';
    return 'This practice anchors your attention so you\'re fully present for what\'s next';
  }
  if (focus === 'focus') {
    if (poorSleep) return 'Your sleep was below baseline – this practice compensates by sharpening cognitive focus';
    if (isDense) return 'With a dense calendar, this narrows your attention to what genuinely matters next';
    if (isDepleted) return 'When depleted, targeted focus prevents you from spreading thin';
    return 'Sharpen your cognitive edge – this practice cuts through noise to priority';
  }
  if (focus === 'confidence') {
    if (isStrong && isDense) return 'Your readiness is high despite a dense day – this channels that into confident presence for what remains';
    if (isStrong) return 'Your readiness is high – this practice channels that into visible, confident presence';
    if (isDepleted) return 'Even when drained, this practice reconnects you to your leadership presence';
    return 'This practice anchors self-assurance so you lead from conviction, not anxiety';
  }
  if (focus === 'restore') {
    if (poorSleep && isDepleted) return 'Your sleep score and check-in both flag low reserves – this practice replenishes at the deepest level';
    if (poorSleep) return 'Your sleep was disrupted – this practice is designed to replenish what rest didn\'t fully restore';
    if (isDepleted && isEvening) return 'Your decision readiness is low – this practice replenishes and prepares your system for deep recovery overnight';
    if (isDepleted) return 'Your energy reserves are low – this practice is designed to replenish, not just relax';
    if (isEvening) return 'Restore what the day took – this prepares your system for deep recovery overnight';
    return 'Top up your reserves now so you have capacity for what remains';
  }

  // Fallback by module type
  if (moduleType === 'integrate') {
    if (isEvening) return 'Capture what went well today and close with intention – this prevents rumination overnight';
    return 'Integrate what you\'ve practised into how you show up next';
  }
  if (moduleType === 'prepare') {
    return 'Prepare your mindset for what\'s coming – arrive ready, not reactive';
  }
  return 'This practice supports your current state and what lies ahead';
}

// ==================== ARCHETYPE WATCH-FOR MAPPING ====================

const ARCHETYPE_WATCH_FOR: Record<string, string> = {
  'The Visionary': 'overcommitting to new ideas before finishing existing ones',
  'The Strategist': 'analysis paralysis and delaying decisive action',
  'The Driver': 'pushing through exhaustion and ignoring recovery signals',
  'The Connector': 'absorbing others\' stress and neglecting your own state',
  'The Architect': 'perfectionism blocking progress on high-stakes deliverables',
  'The Catalyst': 'spreading energy too thin across too many initiatives',
};

// ==================== HORIZON MODULES (Today's 3 Performance Priorities) ====================

interface HorizonModule {
  horizon: 'immediate' | 'tactical' | 'strategic';
  timeLabel: string;
  typeLabel: string;
  whyLine: string;
  practice: any; // PlanModule
  isJit: boolean;
  jitEventTitle: string | null;
  jitMinutesUntil: number | null;
  showNavyBorder: boolean;
  showPulse: boolean;
  showPriorityPill: boolean;
}

function determineAllocationPattern(
  tier: string,
  calendarLoad: string,
  hasJitEvent: boolean,
  jitMinutesUntil: number | null
): '2immediate-1tactical' | '1immediate-1tactical-1strategic' {
  if (tier === 'depleted') return '2immediate-1tactical';
  if (hasJitEvent && jitMinutesUntil !== null && jitMinutesUntil < 120) return '2immediate-1tactical';
  if (calendarLoad === 'high' || calendarLoad === 'extreme') return '2immediate-1tactical';
  return '1immediate-1tactical-1strategic';
}

function buildWhyLine(
  horizon: 'immediate' | 'tactical' | 'strategic',
  isJit: boolean,
  eventTitle: string | null,
  jitMinutesUntil: number | null,
  tier: string,
  divergenceMode: string | null,
  checkInOutcome: string | null,
  hrvEventCorrelation: { eventType: string; avgHrvDelta: number; occurrences: number } | null,
  patternInsight: { count: number; state: string } | null,
  frictionTrend: string | null,
  scoreTrend: string | null,
  pendingCommitment: string | null,
  coachGrowthArea: string | null,
  practicePriorityTag: string | null,
  archetypeWatchFor: string | null,
  checkInCountTotal: number = 0,
  wearableDaysConnected: number = 0,
  calendarLoad: string | null = null,
  meetingCount: number = 0,
  clarityLevel: number | null = null,
  confidenceLevel: number | null = null,
  timeOfDay: string | null = null,
  dayOfWeek: string | null = null
): string {
  const hasWeekData = checkInCountTotal >= 3;
  const hasWearablePattern = wearableDaysConnected >= 7;
  const hasCalendar = meetingCount > 0;

  // IMMEDIATE
  if (horizon === 'immediate') {
    if (isJit && jitMinutesUntil !== null && jitMinutesUntil < 30) {
      return `${eventTitle} is almost here — prepare now.`;
    }
    if (isJit && jitMinutesUntil !== null && jitMinutesUntil < 120) {
      return `${eventTitle} in ${Math.round(jitMinutesUntil)} mins — go in prepared.`;
    }
    if (divergenceMode === 'MASKED_HIGH') {
      return 'Your body is carrying load you haven\'t felt yet — address it now.';
    }
    if (tier === 'depleted') {
      if (hasCalendar && meetingCount > 0) {
        return `${meetingCount} meeting${meetingCount > 1 ? 's' : ''} ahead and reserves low — regulate before you start.`;
      }
      return 'Reserves low — regulate before the day demands more.';
    }
    if (tier === 'managing' && hasCalendar && meetingCount > 3) {
      return 'Heavy day ahead — settle your state before it starts.';
    }
    if (checkInOutcome && clarityLevel !== null && clarityLevel <= 2) {
      return 'Clarity low this morning — this addresses that before it compounds.';
    }
    if (checkInOutcome && confidenceLevel !== null && confidenceLevel <= 2) {
      return 'Low confidence today — ground yourself before your first commitment.';
    }
    if (hasWeekData && patternInsight && patternInsight.count >= 3) {
      return `${patternInsight.count}${patternInsight.count === 3 ? 'rd' : 'th'} ${patternInsight.state} day — start by addressing the state.`;
    }
    if (timeOfDay === 'morning') return 'Start with your state — everything follows from this.';
    if (timeOfDay === 'afternoon') return 'Mid-day reset — your second half starts here.';
    return 'Regulate now — the rest of the day is still ahead.';
  }

  // TACTICAL
  if (horizon === 'tactical') {
    if (isJit && hasWearablePattern && hrvEventCorrelation && Math.abs(hrvEventCorrelation.avgHrvDelta) > 10) {
      const direction = hrvEventCorrelation.avgHrvDelta > 0 ? 'elevates' : 'drops';
      return `Your HRV typically ${direction} before ${hrvEventCorrelation.eventType} — this addresses that pattern.`;
    }
    if (isJit && hasWeekData && patternInsight && patternInsight.count >= 3) {
      return `${eventTitle} approaching — you've been ${patternInsight.state} ${patternInsight.count} days running.`;
    }
    if (isJit) {
      return `${eventTitle} is ahead — this prepares your state for it.`;
    }
    if (hasWearablePattern && hrvEventCorrelation && Math.abs(hrvEventCorrelation.avgHrvDelta) > 10) {
      return 'Your data shows a pattern on days like this — this addresses it.';
    }
    if (hasWeekData && patternInsight && patternInsight.count >= 3) {
      return `${patternInsight.count} ${patternInsight.state} days in a row — this addresses the pattern.`;
    }
    if (hasWeekData && frictionTrend === 'declining') {
      return 'Focus has been declining this week — this interrupts it.';
    }
    if (hasWeekData && scoreTrend === 'declining') {
      return 'Your state has been trending down — this is the reset point.';
    }
    if (hasCalendar && meetingCount >= 4) {
      return `${meetingCount} meetings today — this keeps you sharp through them.`;
    }
    if (checkInOutcome && clarityLevel !== null && clarityLevel >= 4) {
      return 'Clarity strong today — this maintains it through the afternoon.';
    }
    if (dayOfWeek === 'Monday') return 'Monday demands more — this builds the week\'s foundation.';
    if (dayOfWeek === 'Friday') return 'End of week — this sustains your quality through the close.';
    return 'For your state and demands today.';
  }

  // STRATEGIC
  if (horizon === 'strategic') {
    if (pendingCommitment) {
      return 'You committed to working on this — this is that practice.';
    }
    if (coachGrowthArea) {
      return `Connected to what you're building: ${coachGrowthArea}.`;
    }
    if (practicePriorityTag) {
      const tagLabels: Record<string, string> = {
        regulation_composure: 'composure under pressure',
        regulation_early: 'early regulation',
        recovery_resilience: 'recovery and resilience',
        energy_endurance: 'energy and endurance',
        focus_clarity: 'focus and clarity',
        mindset_reframe: 'mindset reframing',
      };
      return `Matched to your ${tagLabels[practicePriorityTag] || 'development'} focus.`;
    }
    if (archetypeWatchFor) {
      return `Your pattern — ${archetypeWatchFor}. This addresses it.`;
    }
    if (timeOfDay === 'evening' && (tier === 'strong' || tier === 'peak')) {
      return 'Strong day — close it with intention.';
    }
    if (timeOfDay === 'evening' && tier === 'depleted') {
      return 'Depleted day — restore before tomorrow.';
    }
    return 'For who you\'re building toward — not just today.';
  }

  return 'Based on your state today.';
}

function buildHorizonModules(
  todModules: any[],
  preEventPlan: any,
  topEvent: any,
  req: PlanRequest,
  shared: SharedContext,
  hrvCorrelations: any,
  timeOfDay: string,
  todCoachCard: any,
  enrichedContent: any[],
  pendingCommitments: any[]
): HorizonModule[] {
  const hasJitEvent = !!preEventPlan;
  const jitMinutesUntil = preEventPlan?.minutesUntil ?? null;
  const jitEventTitle = preEventPlan?.eventTitle ?? null;

  const pattern = determineAllocationPattern(
    req.innerReadinessTier, req.calendarLoad, hasJitEvent, jitMinutesUntil
  );

  // Derive signals for whyLine
  const frictionTrend = shared.innerReadinessPattern.trend === 'declining' ? 'declining' : null;
  const scoreTrend = shared.innerReadinessPattern.trend === 'declining' ? 'declining' : null;
  const pendingCommitment = pendingCommitments.length > 0 ? pendingCommitments[0].commitment_text : null;
  const coachGrowthArea = (req.coachInsights || []).find((i: any) => i.type === 'growth_area')?.content || null;
  const archetypeWatchFor = ARCHETYPE_WATCH_FOR[req.archetype] || null;

  // Data sufficiency counts for honest why lines
  const checkInCountTotal = shared.innerReadinessPattern.values?.length || 0;
  const wearableDaysConnected = req.wearableContext?.hasData ? 7 : 0; // conservative: treat as 7 only if has data today
  const meetingCount = req.calendarEvents?.length || 0;
  const dayNames2 = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayOfWeekName = dayNames2[new Date().getDay()];

  // Build common extra args for all buildWhyLine calls
  const whyLineExtras = [checkInCountTotal, wearableDaysConnected, req.calendarLoad, meetingCount, req.clarityLevel, req.confidenceLevel, timeOfDay, dayOfWeekName] as const;

  // Divergence mode detection: wearable shows strain but check-in doesn't
  let divergenceMode: string | null = null;
  if (req.wearableContext?.hasData && req.wearableContext.hrvDeviation !== null) {
    if (req.wearableContext.hrvDeviation < -15 && req.innerReadinessTier !== 'depleted') {
      divergenceMode = 'MASKED_HIGH';
    }
  }

  // HRV correlation for today's first event type
  let hrvEventCorrelation: { eventType: string; avgHrvDelta: number; occurrences: number } | null = null;
  if (hrvCorrelations && topEvent) {
    const evtType = topEvent.hrvCorrelation?.eventType;
    if (evtType && hrvCorrelations[evtType]) {
      const c = hrvCorrelations[evtType];
      hrvEventCorrelation = { eventType: evtType, avgHrvDelta: c.avgHRVDeviation, occurrences: c.count };
    }
  }

  // Get first event for time label context
  const firstEventTitle = req.calendarEvents?.[0]?.title?.split(' ').slice(0, 4).join(' ') || null;
  const timeOfDayLabel = timeOfDay === 'morning' ? 'This morning' : timeOfDay === 'afternoon' ? 'Right now' : 'This evening';

  const modules: HorizonModule[] = [];

  // ─── SLOT 1 (Immediate) ───
  let slot1Practice: any = null;
  let slot1IsJit = false;
  let slot1TimeLabel = '';

  if (hasJitEvent && jitMinutesUntil !== null && jitMinutesUntil < 120) {
    // JIT takes slot 1
    slot1Practice = preEventPlan.modules?.[0] || todModules[0];
    slot1IsJit = true;
    slot1TimeLabel = jitMinutesUntil < 30
      ? `${jitEventTitle} · now`
      : `${jitEventTitle} · in ${Math.round(jitMinutesUntil)} mins`;
  } else if (req.innerReadinessTier === 'depleted') {
    // Depleted: first regulate module (never a coach card for REGULATE)
    slot1Practice = todModules.find((m: any) => m.type === 'regulate' && !m.isCoachCard) || todModules.find((m: any) => !m.isCoachCard) || todModules[0];
    slot1TimeLabel = 'Before you start';
  } else {
    slot1Practice = todModules[0];
    slot1TimeLabel = firstEventTitle ? `Before ${firstEventTitle}` : timeOfDayLabel;
  }

  if (slot1Practice) {
    const labels: Record<string, string> = { regulate: 'REGULATE', align: 'ALIGN', prepare: 'PREPARE', integrate: 'INTEGRATE' };
    const protocols: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Mind Performance Coach', integrate: 'Mind Performance Coach' };
    modules.push({
      horizon: 'immediate',
      timeLabel: slot1TimeLabel,
      typeLabel: `${labels[slot1Practice.type] || 'REGULATE'} · ${protocols[slot1Practice.type] || 'Protocol'}`,
      whyLine: buildWhyLine('immediate', slot1IsJit, jitEventTitle, jitMinutesUntil, req.innerReadinessTier, divergenceMode, req.checkInOutcome, hrvEventCorrelation, req.patternInsight || null, frictionTrend, scoreTrend, pendingCommitment, coachGrowthArea, req.practicePriorityTag || null, archetypeWatchFor, ...whyLineExtras),
      practice: slot1Practice,
      isJit: slot1IsJit,
      jitEventTitle: slot1IsJit ? jitEventTitle : null,
      jitMinutesUntil: slot1IsJit ? jitMinutesUntil : null,
      showNavyBorder: false,
      showPulse: slot1IsJit && jitMinutesUntil !== null && jitMinutesUntil < 120,
      showPriorityPill: slot1IsJit,
    });
  }

  // ─── SLOT 2 (Tactical) ───
  let slot2Practice: any = null;
  let slot2IsJit = false;
  let slot2TimeLabel = '';
  let slot2NavyBorder = false;

  if (hasJitEvent && jitMinutesUntil !== null && jitMinutesUntil >= 120 && jitMinutesUntil <= 360) {
    // JIT takes slot 2 with navy border
    slot2Practice = preEventPlan.modules?.[0] || todModules[1] || todModules[0];
    slot2IsJit = true;
    slot2NavyBorder = true;
    const hrs = Math.round(jitMinutesUntil / 60);
    slot2TimeLabel = `${jitEventTitle} · in ${hrs} hr${hrs > 1 ? 's' : ''}`;
  } else if (hasJitEvent && jitMinutesUntil !== null && jitMinutesUntil > 360) {
    // JIT early awareness in slot 2
    slot2Practice = preEventPlan.modules?.[0] || todModules[1] || todModules[0];
    slot2IsJit = true;
    slot2TimeLabel = `${jitEventTitle} · today`;
  } else {
    // Second ToD module
    const slot1Id = slot1Practice?.contentId;
    slot2Practice = todModules.find((m: any) => m.contentId !== slot1Id) || todModules[1] || todModules[0];
    slot2TimeLabel = timeOfDay === 'morning' ? 'Midday reset' : timeOfDay === 'afternoon' ? 'Later today' : 'Before bed';
  }

  if (slot2Practice) {
    const labels: Record<string, string> = { regulate: 'REGULATE', align: 'ALIGN', prepare: 'PREPARE', integrate: 'INTEGRATE' };
    const protocols: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Mind Performance Coach', integrate: 'Mind Performance Coach' };
    modules.push({
      horizon: 'tactical',
      timeLabel: slot2TimeLabel,
      typeLabel: `${labels[slot2Practice.type] || 'ALIGN'} · ${protocols[slot2Practice.type] || 'Protocol'}`,
      whyLine: buildWhyLine('tactical', slot2IsJit, jitEventTitle, jitMinutesUntil, req.innerReadinessTier, divergenceMode, req.checkInOutcome, hrvEventCorrelation, req.patternInsight || null, frictionTrend, scoreTrend, pendingCommitment, coachGrowthArea, req.practicePriorityTag || null, archetypeWatchFor, ...whyLineExtras),
      practice: slot2Practice,
      isJit: slot2IsJit,
      jitEventTitle: slot2IsJit ? jitEventTitle : null,
      jitMinutesUntil: slot2IsJit ? jitMinutesUntil : null,
      showNavyBorder: slot2NavyBorder,
      showPulse: false,
      showPriorityPill: slot2IsJit,
    });
  }

  // ─── SLOT 3 (Strategic or second Immediate) ───
  let slot3Practice: any = null;
  let slot3Horizon: 'immediate' | 'tactical' | 'strategic' = 'strategic';
  let slot3TimeLabel = '';

  const usedIds = new Set([slot1Practice?.contentId, slot2Practice?.contentId].filter(Boolean));

  if (pattern === '2immediate-1tactical') {
    // Third ToD module as immediate
    slot3Practice = todModules.find((m: any) => !usedIds.has(m.contentId)) || todModules[todModules.length - 1];
    slot3Horizon = 'immediate';
    slot3TimeLabel = 'Later today';
  } else {
    // Strategic content: pendingCommitment > coachGrowthArea > archetype > coach card > fallback
    // Try to find a practice aligned to strategic content
    const strategicModule = todModules.find((m: any) => !usedIds.has(m.contentId) && (m.isCoachCard || m.type === 'integrate'));
    if (strategicModule) {
      slot3Practice = strategicModule;
    } else {
      slot3Practice = todModules.find((m: any) => !usedIds.has(m.contentId)) || todModules[todModules.length - 1];
    }
    slot3TimeLabel = timeOfDay === 'morning' ? 'This evening' : timeOfDay === 'afternoon' ? 'When you have space' : 'For your development';
  }

  if (slot3Practice) {
    const labels: Record<string, string> = { regulate: 'REGULATE', align: 'ALIGN', prepare: 'PREPARE', integrate: 'INTEGRATE' };
    const protocols: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Mind Performance Coach', integrate: 'Mind Performance Coach' };
    modules.push({
      horizon: slot3Horizon,
      timeLabel: slot3TimeLabel,
      typeLabel: `${labels[slot3Practice.type] || 'INTEGRATE'} · ${protocols[slot3Practice.type] || 'Protocol'}`,
      whyLine: buildWhyLine(slot3Horizon, false, null, null, req.innerReadinessTier, divergenceMode, req.checkInOutcome, hrvEventCorrelation, req.patternInsight || null, frictionTrend, scoreTrend, pendingCommitment, coachGrowthArea, req.practicePriorityTag || null, archetypeWatchFor, ...whyLineExtras),
      practice: slot3Practice,
      isJit: false,
      jitEventTitle: null,
      jitMinutesUntil: null,
      showNavyBorder: false,
      showPulse: false,
      showPriorityPill: false,
    });
  }

  // Deduplicate: ensure no two slots share the same contentId
  const seenContentIds = new Set<string>();
  const deduped: HorizonModule[] = [];
  for (const m of modules) {
    if (!seenContentIds.has(m.practice.contentId)) {
      seenContentIds.add(m.practice.contentId);
      deduped.push(m);
    }
  }

  // If we have fewer than 3 unique modules, try to fill from enrichedContent pool using metadata tags
  if (deduped.length < 3 && enrichedContent.length > 0) {
    const remaining = enrichedContent.filter((c: any) => !seenContentIds.has(c.id) && !req.completedToday.includes(c.id));

    // Determine state signals for scoring
    const hasBodyUnderLoad = req.wearableContext?.hasData && req.wearableContext.hrvDeviation !== null && req.wearableContext.hrvDeviation < -15;
    const hasMaskedHigh = divergenceMode === 'MASKED_HIGH';
    const clarityLow = req.clarityLevel <= 2;
    const confidenceLow = req.confidenceLevel <= 2;
    const poorSleep = req.wearableContext?.hasData && req.wearableContext.sleepScore !== null && req.wearableContext.sleepScore < 70;
    const isNewUser = (shared.innerReadinessPattern.values?.length || 0) < 7;
    const isHeavyDay = req.calendarLoad === 'high' || req.calendarLoad === 'extreme';

    // Determine which horizon we need to fill
    const filledHorizons = deduped.map(m => m.horizon);
    const needsHorizons: ('immediate' | 'tactical' | 'strategic')[] = [];
    if (!filledHorizons.includes('immediate')) needsHorizons.push('immediate');
    if (!filledHorizons.includes('tactical')) needsHorizons.push('tactical');
    if (!filledHorizons.includes('strategic')) needsHorizons.push('strategic');
    // Fill remaining slots with whatever is needed
    while (needsHorizons.length < (3 - deduped.length)) needsHorizons.push('tactical');

    for (const targetHorizon of needsHorizons) {
      if (deduped.length >= 3) break;

      // Filter by horizon tag
      let pool = remaining.filter((c: any) => {
        const hTags: string[] = c.horizonTags || [];
        return hTags.includes(targetHorizon);
      });

      // Foundational filter for new users: at least 2 of 3 slots should be foundational
      const foundationalCount = deduped.filter(m => {
        const meta = enrichedContent.find((ec: any) => ec.id === m.practice.contentId);
        return meta?.isFoundational === true;
      }).length;
      if (isNewUser && foundationalCount < 2) {
        const foundPool = pool.filter((c: any) => c.isFoundational === true);
        if (foundPool.length > 0) pool = foundPool;
      }

      // Duration band filter on heavy days: slots 1 & 2 only micro/short
      const slotIndex = deduped.length;
      if (isHeavyDay && slotIndex < 2) {
        pool = pool.filter((c: any) => c.durationBand === 'micro' || c.durationBand === 'short');
      }

      // If no horizon-matched content, fall back to any remaining
      if (pool.length === 0) {
        pool = remaining.filter((c: any) => !seenContentIds.has(c.id));
      }

      if (pool.length === 0) break;

      // Score with state signal boosts
      const scored = pool.map((c: any) => {
        let score = 0;
        const ssTags: string[] = c.stateSignalTags || [];
        if (hasBodyUnderLoad && ssTags.includes('signal-body-under-load')) score += 15;
        if (hasMaskedHigh && ssTags.includes('signal-masked-high')) score += 20;
        if (clarityLow && ssTags.includes('signal-clarity-low')) score += 15;
        if (confidenceLow && ssTags.includes('signal-confidence-low')) score += 15;
        if (poorSleep && ssTags.includes('signal-poor-sleep')) score += 10;
        if (req.favorites.includes(c.id)) score += 30;
        if (!isNewUser && c.isFoundational) score -= 5; // Slightly deprioritize foundational for experienced users
        return { content: c, score };
      });
      scored.sort((a: any, b: any) => b.score - a.score);

      const selected = scored[0]?.content;
      if (!selected) break;

      seenContentIds.add(selected.id);
      const labels: Record<string, string> = { regulate: 'REGULATE', align: 'ALIGN', prepare: 'PREPARE', integrate: 'INTEGRATE' };
      const protocols: Record<string, string> = { regulate: 'Somatic Protocol', align: 'Mindset Protocol', prepare: 'Mind Performance Coach', integrate: 'Mind Performance Coach' };
      const contentType = selected.content_type || 'micro-practice';
      const moduleType = contentType === 'soundbath' ? 'regulate' : contentType === 'guided-practice' ? 'regulate' : 'align';
      deduped.push({
        horizon: targetHorizon,
        timeLabel: targetHorizon === 'immediate' ? 'Right now' : targetHorizon === 'tactical' ? 'Later today' : 'When ready',
        typeLabel: `${labels[moduleType] || 'REGULATE'} · ${protocols[moduleType] || 'Protocol'}`,
        whyLine: buildWhyLine(targetHorizon, false, null, null, req.innerReadinessTier, divergenceMode, req.checkInOutcome, hrvEventCorrelation, req.patternInsight || null, frictionTrend, scoreTrend, pendingCommitment, coachGrowthArea, req.practicePriorityTag || null, archetypeWatchFor),
        practice: {
          type: moduleType,
          contentId: selected.id,
          title: selected.title,
          contentType: selected.content_type,
          duration: selected.duration || 3,
          focus: moduleType === 'regulate' ? 'composure' : 'clarity',
          intensity: 'gentle',
          isFavorite: req.favorites.includes(selected.id),
          isCoachCard: false,
          reasoning: 'Based on your state and patterns today.',
          thumbnailUrl: selected.thumbnail_url,
        },
        isJit: false,
        jitEventTitle: null,
        jitMinutesUntil: null,
        showNavyBorder: false,
        showPulse: false,
        showPriorityPill: false,
      });
    }
  }

  return deduped.slice(0, 3);
}

// ==================== HANDLER ====================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication – verify JWT and extract userId
    let userId: string;
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) {
      // DEV_MODE bypass: allow fallback when not in production
      const env = Deno.env.get('ENVIRONMENT') || '';
      if (env !== 'production') {
        const devHeader = req.headers.get('x-dev-user-id');
        if (devHeader) {
          userId = devHeader;
          console.log(`[generate-mastery-plan] DEV bypass: userId=${userId}`);
        } else {
          return auth.errorResponse;
        }
      } else {
        return auth.errorResponse;
      }
    } else {
      userId = auth.userId;
    }

    // Rate limiting – 30s cooldown per user+state fingerprint (not just period)
    const now = Date.now();
    const body = await req.json();
    const clientTimezoneOffset = body.timezoneOffset ?? new Date().getTimezoneOffset();
    const forceRefresh = body.forceRefresh === true;
    const currentPeriod = getTimeOfDay(clientTimezoneOffset);

    // Build state fingerprint from latest check-in + completions for cache key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    let stateFingerprint = `${userId}:${currentPeriod}`;
    try {
      const today = new Date().toISOString().split('T')[0];
      const [checkinSnap, ritualSnap] = await Promise.all([
        supabaseClient.from('daily_checkins')
          .select('timestamp, outcome, energy_balance, clarity_level, confidence_level')
          .eq('user_id', userId)
          .eq('checkin_date', today)
          .eq('time_window', currentPeriod)
          .maybeSingle(),
        supabaseClient.from('daily_ritual_completions')
          .select('updated_at, completed_practice_ids')
          .eq('user_id', userId)
          .eq('ritual_date', today)
          .eq('session_period', currentPeriod)
          .maybeSingle(),
      ]);
      const ci = checkinSnap.data;
      const ri = ritualSnap.data;
      stateFingerprint = [
        userId, currentPeriod,
        ci?.timestamp || 'none',
        ci?.outcome || 'none',
        ci?.energy_balance ?? 'none',
        ci?.clarity_level ?? 'none',
        ci?.confidence_level ?? 'none',
        ri?.updated_at || 'none',
        (ri?.completed_practice_ids || []).join(',') || 'none',
      ].join(':');
    } catch { /* fallback to userId:period */ }

    const cached = rateLimitMap.get(stateFingerprint);
    if (!forceRefresh && cached && (now - cached.lastCall) < RATE_LIMIT_COOLDOWN_MS) {
      console.log(`[generate-mastery-plan] Rate limited: ${userId} fingerprint=${stateFingerprint.substring(0, 60)}... (${Math.round((now - cached.lastCall) / 1000)}s ago)`);
      return new Response(JSON.stringify(cached.cachedResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Only timezoneOffset comes from client – all other signals are server-derived
    const planReq: PlanRequest = {
      userId,
      timezoneOffset: clientTimezoneOffset,
      // All below are populated server-side inside generateMasteryPlan
      innerReadinessTier: 'managing',
      innerReadinessScore: 50,
      outerReadinessPhrase: 'Steady execution.',
      outerReadinessDriver: 'state',
      outerReadinessContext: '',
      outerReadinessLeanOn: '',
      outerReadinessWatchFor: '',
      calendarLoad: 'none',
      calendarPressure: 'none',
      favorites: [],
      completedToday: [],
      clarityLevel: 0,
      confidenceLevel: 0,
      checkInOutcome: 'steady',
      calendarEvents: [],
      coachInsights: [],
      effectiveContent: [],
      patternInsight: undefined,
      archetype: '',
      practicePriorityTag: '',
      pressureContextTag: '',
      wearableContext: { sleepScore: null, hrvMs: null, restingHR: null, hrvDeviation: null, sleepQuality: null, hasData: false },
    };

    // supabaseClient already created above for fingerprint

    const plan = await generateMasteryPlan(planReq, supabaseClient);

    // Cache response for rate limiting
    rateLimitMap.set(stateFingerprint, { lastCall: now, cachedResponse: plan });
    // Evict stale entries (prevent memory leak)
    if (rateLimitMap.size > 500) {
      for (const [key, val] of rateLimitMap) {
        if (now - val.lastCall > RATE_LIMIT_COOLDOWN_MS * 2) rateLimitMap.delete(key);
      }
    }

    return new Response(JSON.stringify(plan), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });
  } catch (error: any) {
    console.error('[generate-mastery-plan] Fatal error:', {
      message: error?.message,
      stack: error?.stack,
      name: error?.name,
      userId: userId ?? 'unknown',
    });
    return new Response(JSON.stringify({ error: 'Plan generation failed', reason: error?.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
