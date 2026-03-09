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

interface PlanRequest {
  // Verified server-side — NOT from client
  userId: string;
  // Only client-supplied field
  timezoneOffset: number;
  // ALL below are server-fetched — populated inside generateMasteryPlan
  innerReadinessTier: string;
  innerReadinessScore: number;
  outerReadinessPhrase: string;
  outerReadinessDriver: string;
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
    triggers: { calendarKeywords: ['1:1', 'one on one', 'feedback', 'pip', 'termination', 'difficult', 'conflict'], hoursAhead: 4 },
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

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ==================== CALENDAR EVENT PRIORITISATION ====================

interface ScoredEvent {
  event: CalendarEvent;
  score: number;
  minutesUntil: number;
  scenario: ExecutiveScenario | null;
  timePill: string;
  contextDescription: string;
}

function scoreCalendarEvents(events: CalendarEvent[], skippedTypes: string[]): ScoredEvent[] {
  const now = new Date();
  const scored: ScoredEvent[] = [];

  // Sort events by start time first for back-to-back detection
  const sortedEvents = [...events].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

  for (let ei = 0; ei < sortedEvents.length; ei++) {
    const event = sortedEvents[ei];
    const startTime = new Date(event.startTime);
    const minutesUntil = Math.floor((startTime.getTime() - now.getTime()) / (1000 * 60));
    if (minutesUntil < 0) continue; // Skip past events

    let score = 0;
    const titleLower = (event.title || '').toLowerCase();

    // Immediacy scoring
    if (minutesUntil <= 120) score += 40;
    else if (minutesUntil <= 240) score += 30;
    else if (minutesUntil <= 1440) score += 20;
    else if (minutesUntil <= 2880) score += 10;
    else continue; // Skip events more than 48h away

    // Organiser
    if (event.isOrganizer) score += 15;
    // Attendees > 5
    if ((event.attendeesCount || 0) > 5) score += 10;
    // Duration > 60 min
    if (event.endTime) {
      const durationMin = (new Date(event.endTime).getTime() - startTime.getTime()) / 60000;
      if (durationMin > 60) score += 8;
    }
    // Non-recurring
    if (!event.isRecurring) score += 10;

    // Scenario keyword match
    let matchedScenario: ExecutiveScenario | null = null;
    for (const scenario of EXECUTIVE_SCENARIOS) {
      if (!scenario.triggers.calendarKeywords) continue;
      const matches = scenario.triggers.calendarKeywords.some(kw => titleLower.includes(kw.toLowerCase()));
      if (matches) {
        score += 25;
        matchedScenario = scenario;
        break;
      }
    }

    // Prime hours (9-12, 14-16)
    const eventHour = startTime.getHours();
    if ((eventHour >= 9 && eventHour <= 12) || (eventHour >= 14 && eventHour <= 16)) score += 5;

    // Back-to-back event detection (+5 if previous event ends within 15 min of this event's start)
    if (ei > 0) {
      const prevEvent = sortedEvents[ei - 1];
      if (prevEvent.endTime) {
        const prevEnd = new Date(prevEvent.endTime);
        const gapMinutes = (startTime.getTime() - prevEnd.getTime()) / 60000;
        if (gapMinutes >= 0 && gapMinutes < 15) score += 5;
      }
    }

    // Skip penalty
    const eventType = matchedScenario?.id || 'general';
    if (skippedTypes.includes(eventType)) {
      score -= 15;
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

    // Context description — AI-generated reasoning for why this event was selected
    const contextParts: string[] = [];

    // Scenario-based reasoning
    if (matchedScenario) {
      contextParts.push(`Upcoming ${matchedScenario.id.replace(/-/g, ' ')} detected`);
    } else if ((event.attendeesCount || 0) > 5) {
      contextParts.push(`Large meeting with ${event.attendeesCount} attendees`);
    } else if (event.isOrganizer) {
      contextParts.push(`You're organizing this event`);
    }

    // Urgency context
    if (minutesUntil <= 30) {
      contextParts.push(`starting very soon — prepare now`);
    } else if (minutesUntil <= 60) {
      contextParts.push(`in ${minutesUntil} minutes`);
    } else if (minutesUntil < 1440) {
      contextParts.push(`in ${Math.floor(minutesUntil / 60)} hours`);
    } else {
      contextParts.push(`in ${Math.ceil(minutesUntil / 1440)} days`);
    }

    // Stakes indicators
    if (!event.isRecurring && (event.attendeesCount || 0) > 3) {
      contextParts.push(`non-recurring high-visibility event`);
    }

    const contextDescription = contextParts.length > 0
      ? contextParts.join(' — ') + '. Prepare with targeted practice.'
      : `${event.title}. Prepare with targeted practice.`;

    scored.push({ event, score, minutesUntil, scenario: matchedScenario, timePill, contextDescription });
  }

  // Sort by score desc, tiebreaker: closer event wins
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

  // Onboarding signal boosts — full weight when no dynamic signals exist, decayed otherwise
  const onboardingFullWeight = !hasFavorites && !hasCoachInsights;
  const priorityBoost = onboardingFullWeight ? 15 : 5;
  const pressureBoost = onboardingFullWeight ? 8 : 3;

  // Practice priority tag match (+15 full / +5 decayed)
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
  minutesUntil?: number
): any | null {
  // COACH INCLUSION RULES
  if (type === 'prepare') {
    // Pre-event: always include
    if (eventTitle) {
      return {
        id: 'coach-prepare',
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

  // Integrate (evening coach)
  if (type === 'integrate') {
    // Evening: ALWAYS included with Tiny Wins
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
      prompt: "A managed close. What's one thing you did right today? Share your small win — and what's one thing worth carrying into tomorrow, and one thing worth leaving here?",
      title: 'Tiny Win and Reflection'
    };
  }

  // Morning coach decision tree
  if (timeOfDay === 'morning') {
    // Depleted or managing: always include
    if (tier === 'depleted' || tier === 'managing') {
      if (patternInsight && patternInsight.count >= 3) {
        return {
          prompt: `You've been feeling ${patternInsight.state} for ${patternInsight.count} days. This pattern often signals something deeper — what's been weighing on you?`,
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
        prompt: `You've been feeling ${patternInsight.state} for ${patternInsight.count} days. This pattern often signals something deeper — what's been weighing on you?`,
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
        prompt: "You're at your best. What does making the most of today actually look like — specifically?",
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
        prompt: "You're at your best. What does making the most of today actually look like — specifically?",
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

// ==================== MAIN PLAN GENERATION ====================

async function generateMasteryPlan(req: PlanRequest, supabaseClient: any) {
  const timeOfDay = getTimeOfDay(req.timezoneOffset);

  // 0. Server-side upstream queries — ALL signals derived here (trust gap closed)
  // Calendar events — next 48h
  let rawCalendarEvents: any[] = [];
  try {
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const { data: events } = await supabaseClient
      .from('calendar_events')
      .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring')
      .eq('user_id', req.userId)
      .gte('start_time', now.toISOString())
      .lte('start_time', in48h.toISOString());
    rawCalendarEvents = events || [];
    console.log(`[generate-mastery-plan] calendar_events query: ${rawCalendarEvents.length} events in next 48h for user ${req.userId}`);
    req.calendarEvents = rawCalendarEvents.map((e: any) => ({
      id: e.id, title: e.title, startTime: e.start_time, endTime: e.end_time,
      isOrganizer: e.is_organizer, attendeesCount: e.attendees_count, isRecurring: e.is_recurring
    }));
  } catch (calErr) {
    console.error('[generate-mastery-plan] calendar_events query failed:', calErr);
    req.calendarEvents = [];
  }

  // Compute calendarLoad and calendarPressure server-side from fetched events
  try {
    const now = new Date();
    const fourHoursLater = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const upcomingEvents = rawCalendarEvents.filter((event: any) => {
      const startTime = new Date(event.start_time);
      return startTime >= now && startTime <= fourHoursLater;
    });
    const meetingCount = upcomingEvents.length;
    req.calendarLoad = meetingCount >= 5 ? 'high' : meetingCount >= 3 ? 'medium' : 'low';

    let totalPressure = 0;
    upcomingEvents.forEach((event: any) => {
      let ep = 0;
      if (event.is_organizer) ep += 2;
      const attendees = event.attendees_count || 0;
      if (attendees > 5) ep += 2; else if (attendees > 2) ep += 1;
      const start = new Date(event.start_time);
      const end = new Date(event.end_time);
      const durationMin = (end.getTime() - start.getTime()) / 60000;
      if (durationMin > 60) ep += 2; else if (durationMin >= 30) ep += 1;
      if (!event.is_recurring) ep += 1;
      const hour = start.getHours();
      if ((hour >= 9 && hour < 12) || (hour >= 14 && hour < 16)) ep += 1;
      totalPressure += ep;
    });
    // Back-to-back detection
    const sorted = [...upcomingEvents].sort((a: any, b: any) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = (new Date(sorted[i + 1].start_time).getTime() - new Date(sorted[i].end_time).getTime()) / 60000;
      if (gap < 15) totalPressure += 1;
    }
    req.calendarPressure = totalPressure >= 6 ? 'high' : totalPressure >= 3 ? 'medium' : 'low';
  } catch {
    req.calendarLoad = 'none';
    req.calendarPressure = 'none';
  }

  // Check-in data — prioritize current time window, fall back to latest
  try {
    const timeOfDay = getTimeOfDay(req.timezoneOffset);
    const today = new Date().toISOString().split('T')[0];
    
    // First: try to get check-in for the CURRENT time window
    const { data: windowCheckin } = await supabaseClient
      .from('daily_checkins')
      .select('outcome, clarity_level, confidence_level, energy_balance, checkin_date, time_window')
      .eq('user_id', req.userId)
      .eq('checkin_date', today)
      .eq('time_window', timeOfDay)
      .maybeSingle();
    
    // Fall back to latest check-in across all windows
    const { data: checkins } = await supabaseClient
      .from('daily_checkins')
      .select('outcome, clarity_level, confidence_level, energy_balance, checkin_date, time_window')
      .eq('user_id', req.userId)
      .order('checkin_date', { ascending: false })
      .limit(7);
    
    // Use window-specific check-in if available, otherwise latest
    const latest = windowCheckin || (checkins?.length ? checkins[0] : null);
    
    if (latest) {
      req.clarityLevel = latest.clarity_level ?? 0;
      req.confidenceLevel = latest.confidence_level ?? 0;
      req.checkInOutcome = latest.outcome || 'steady';

      // Inner readiness from energy_balance
      const eb = latest.energy_balance ?? 50;
      req.innerReadinessScore = eb;
      if (eb < 40) req.innerReadinessTier = 'depleted';
      else if (eb < 60) req.innerReadinessTier = 'managing';
      else if (eb < 75) req.innerReadinessTier = 'strong';
      else req.innerReadinessTier = 'peak';
    }
    
    // Consecutive-low pattern detection (uses full history)
    if (checkins?.length) {
      const first = checkins[0].outcome;
      const lowStates = ['overwhelmed', 'drained', 'scattered'];
      if (lowStates.includes(first)) {
        let count = 1;
        for (let i = 1; i < checkins.length; i++) {
          if (checkins[i].outcome === first) count++; else break;
        }
        if (count >= 3) req.patternInsight = { count, state: first };
      }
    }
  } catch { /* ignore */ }

  // Profile tags
  try {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('practice_priority_tag, pressure_context_tag, archetype')
      .eq('id', req.userId)
      .maybeSingle();
    req.practicePriorityTag = profile?.practice_priority_tag || '';
    req.pressureContextTag = profile?.pressure_context_tag || '';
    req.archetype = profile?.archetype || '';
  } catch { /* ignore */ }

  // Effective content (4-5 star ratings)
  try {
    const { data: feedback } = await supabaseClient
      .from('content_relevance_feedback')
      .select('content_id')
      .eq('user_id', req.userId)
      .gte('star_rating', 4);
    req.effectiveContent = feedback?.map((f: any) => f.content_id) || [];
  } catch { req.effectiveContent = []; }

  // Coach insights (active, confidence >= 0.6)
  try {
    const { data: insights } = await supabaseClient
      .from('user_coach_insights')
      .select('id, insight_type, insight_content, content_reference, confidence_score')
      .eq('user_id', req.userId)
      .eq('is_active', true)
      .gte('confidence_score', 0.6)
      .order('extracted_at', { ascending: false })
      .limit(50);
    req.coachInsights = (insights || []).map((r: any) => ({
      id: r.id, type: r.insight_type, content: r.insight_content,
      contentReference: r.content_reference || undefined, confidence: r.confidence_score || 0.5
    }));
  } catch { req.coachInsights = []; }

  // Completed today — from daily_ritual_completions (current period only)
  try {
    const today = new Date().toISOString().split('T')[0];
    const currentPeriod = getTimeOfDay(req.timezoneOffset);
    const { data: ritual } = await supabaseClient
      .from('daily_ritual_completions')
      .select('completed_practice_ids')
      .eq('user_id', req.userId)
      .eq('ritual_date', today)
      .eq('session_period', currentPeriod)
      .maybeSingle();
    req.completedToday = ritual?.completed_practice_ids || [];
  } catch { req.completedToday = []; }

  // Favorites — from user_favorites
  try {
    const { data: favs } = await supabaseClient
      .from('user_favorites')
      .select('content_id')
      .eq('user_id', req.userId);
    req.favorites = (favs || []).map((f: any) => f.content_id);
  } catch { req.favorites = []; }

  // Outer readiness — call compute-outer-readiness server-to-server
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const outerRes = await fetch(`${supabaseUrl}/functions/v1/compute-outer-readiness`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ userId: req.userId, timezoneOffset: req.timezoneOffset }),
    });
    if (outerRes.ok) {
      const outerData = await outerRes.json();
      req.outerReadinessPhrase = outerData.phrase || 'Steady execution.';
      req.outerReadinessDriver = outerData.driver || 'state';
    }
  } catch {
    req.outerReadinessPhrase = 'Steady execution.';
    req.outerReadinessDriver = 'state';
  }

  // 1. Get skip preferences
  let skippedTypes: string[] = [];
  let skippedTypes3Plus: string[] = [];
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: skips } = await supabaseClient
      .from('jit_preferences')
      .select('event_type')
      .eq('user_id', req.userId)
      .in('action', ['skipped', 'dismissed'])
      .gte('created_at', thirtyDaysAgo);

    if (skips) {
      const counts: Record<string, number> = {};
      skips.forEach((s: any) => { counts[s.event_type || ''] = (counts[s.event_type || ''] || 0) + 1; });
      skippedTypes = Object.entries(counts).filter(([, c]) => c >= 2).map(([t]) => t);
      skippedTypes3Plus = Object.entries(counts).filter(([, c]) => c >= 3).map(([t]) => t);
    }
  } catch { /* ignore */ }

  // 1b. Fetch pending coach commitments for content boosting
  let pendingCommitments: any[] = [];
  try {
    const { data: commitments } = await supabaseClient
      .from('coach_accountability_tracker')
      .select('commitment_text, target_practice_id, pattern_area')
      .eq('user_id', req.userId)
      .eq('status', 'pending');
    pendingCommitments = commitments || [];
  } catch { /* ignore */ }

  // 2. Fetch content library from DB
  const { data: contentLibrary } = await supabaseClient
    .from('sanctuary_content')
    .select('id, title, content_type, category, tags, duration, sub_type, difficulty, protocol_type, thumbnail_url')
    .eq('is_active', true);

  // Also fetch structured tags from metadata
  const { data: contentMetadata } = await supabaseClient
    .from('sanctuary_content_metadata')
    .select('content_id, structured_tags, mastery_category');

  // Merge metadata into content
  const metadataMap = new Map((contentMetadata || []).map((m: any) => [m.content_id, m]));
  const enrichedContent = (contentLibrary || []).map((c: any) => {
    const meta = metadataMap.get(c.id);
    return { ...c, structured_tags: meta?.structured_tags, mastery_category: meta?.mastery_category };
  });

  // 3. Score calendar events
  const scoredEvents = scoreCalendarEvents(req.calendarEvents || [], skippedTypes);
  // Filter out 3+ skipped types
  const filteredEvents = scoredEvents.filter(e => !skippedTypes3Plus.includes(e.scenario?.id || 'general'));

  // Observability: log calendar scoring summary
  console.log(`[generate-mastery-plan] Calendar: ${req.calendarEvents?.length || 0} events fetched, ${scoredEvents.length} scored, ${filteredEvents.length} after suppression. Top event: ${filteredEvents[0]?.event.title || 'none'} (score: ${filteredEvents[0]?.score || 0})`);

  // 4. Build calendar pills (max 2)
  const calendarPills = filteredEvents.slice(0, 2).map(e => ({
    label: e.scenario ? `${e.scenario.contextLabel}` : e.event.title || 'Upcoming Event',
    eventId: e.event.id,
    priorityScore: e.score,
    timePill: e.timePill
  }));

  // 5. Build pre-event plan from highest-scoring event (threshold ≥ 50)
  let preEventPlan: any = null;
  const JIT_THRESHOLD = 50;
  if (filteredEvents.length > 0 && filteredEvents[0].score >= JIT_THRESHOLD) {
    const topEvent = filteredEvents[0];
    const scenario = topEvent.scenario;
    const preEventModules: any[] = [];

    if (scenario) {
      // Scenario-matched: use scenario modules
      for (const spec of scenario.modules) {
        if (spec.type === 'prepare' || spec.type === 'integrate') {
          preEventModules.push({
            type: spec.type,
            contentId: `coach-${spec.type}`,
            title: spec.type === 'prepare' ? 'Mental Rehearsal' : 'Tiny Win and Reflection',
            contentType: 'coach',
            duration: 2,
            focus: spec.focus,
            intensity: spec.intensity,
            isFavorite: false,
            isCoachCard: true,
            reasoning: spec.type === 'prepare' ? 'Mental rehearsal for upcoming high-stakes moments' : 'Reflection and closure'
          });
        } else {
          const selected = selectContent(enrichedContent, spec, req, pendingCommitments);
          if (selected) {
            preEventModules.push({
              type: spec.type,
              contentId: selected.id,
              title: selected.title,
              contentType: selected.content_type,
              duration: selected.duration,
              focus: spec.focus,
              intensity: spec.intensity,
              isFavorite: req.favorites.includes(selected.id),
              reasoning: getModuleReasoning(spec.type, spec.focus)
            });
          }
        }
      }
    } else {
      // No scenario match but high score: produce fallback pre-event pack
      // 1. Regulate (gentle short grounding)
      const regulateSpec: ModuleSpec = { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'composure' };
      const regulateContent = selectContent(enrichedContent, regulateSpec, req, pendingCommitments);
      if (regulateContent) {
        preEventModules.push({
          type: 'regulate',
          contentId: regulateContent.id,
          title: regulateContent.title,
          contentType: regulateContent.content_type,
          duration: regulateContent.duration,
          focus: 'composure',
          intensity: 'gentle',
          isFavorite: req.favorites.includes(regulateContent.id),
          reasoning: 'Center before your upcoming event'
        });
      }
      // 2. Prepare (coach card)
      preEventModules.push({
        type: 'prepare',
        contentId: 'coach-prepare',
        title: 'Mental Rehearsal',
        contentType: 'coach',
        duration: 2,
        focus: 'composure',
        intensity: 'moderate',
        isFavorite: false,
        isCoachCard: true,
        reasoning: 'Mental rehearsal for upcoming event'
      });
    }

    // Enrich contextDescription with coach/commitment context if available
    let enrichedContextDescription = topEvent.contextDescription;
    const eventTitleLower = (topEvent.event.title || '').toLowerCase();
    
    // Check if any pending coach commitment mentions this event
    const relevantCommitment = pendingCommitments.find((c: any) => {
      const commitText = (c.commitment_text || '').toLowerCase();
      return eventTitleLower.split(' ').some((word: string) => word.length > 3 && commitText.includes(word));
    });
    if (relevantCommitment) {
      enrichedContextDescription = enrichedContextDescription.replace(
        'Prepare with targeted practice.',
        `You discussed this with your coach. Prepare with targeted practice.`
      );
    }

    // Check for pattern observations related to this event type
    if (scenario && req.patternInsight) {
      const patternLower = (req.patternInsight || '').toLowerCase();
      const scenarioKeywords = (scenario.triggers.calendarKeywords || []).map((k: string) => k.toLowerCase());
      if (scenarioKeywords.some(kw => patternLower.includes(kw))) {
        enrichedContextDescription = enrichedContextDescription.replace(
          'Prepare with targeted practice.',
          `Your coach has noted a pattern here. Prepare with targeted practice.`
        );
      }
    }

    if (preEventModules.length > 0) {
      preEventPlan = {
        eventTitle: topEvent.event.title,
        eventType: scenario?.id || 'general',
        minutesUntil: topEvent.minutesUntil,
        timePill: topEvent.timePill,
        contextDescription: enrichedContextDescription,
        modules: preEventModules,
        coachCard: generateCoachCard('prepare', timeOfDay, req.innerReadinessTier, req.patternInsight, topEvent.event.title, topEvent.minutesUntil),
        progressTracked: false
      };
      console.log(`[generate-mastery-plan] preEventPlan built: "${topEvent.event.title}" with ${preEventModules.length} modules (scenario: ${scenario?.id || 'fallback'})`);
    } else {
      console.log(`[generate-mastery-plan] preEventPlan skipped: no modules resolved for "${topEvent.event.title}"`);
    }
  } else {
    const reason = filteredEvents.length === 0 ? 'no calendar events' : `top score ${filteredEvents[0]?.score || 0} < threshold ${JIT_THRESHOLD}`;
    console.log(`[generate-mastery-plan] preEventPlan=null: ${reason}`);
  }

  // 6. Build time-of-day plan
  const { maxModules } = getDurationCeiling(req.calendarLoad);
  const moduleMapping = getModulesFromTheme(req.outerReadinessPhrase);

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

  for (const moduleType of moduleOrder) {
    if (todModules.length >= maxModules) break;
    const spec = moduleMapping[moduleType];
    if (!spec) continue;

    // Skip optional modules if 3+ required already
    const requiredCount = todModules.filter(m => m.required).length;
    if (!spec.required && requiredCount >= 3) continue;

    if (moduleType === 'prepare' || moduleType === 'integrate') {
      // Coach cards
      const coachCard = generateCoachCard(moduleType, timeOfDay, req.innerReadinessTier, req.patternInsight);
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
          reasoning: moduleType === 'prepare' ? 'Mental rehearsal for upcoming moments' : 'Evening reflection and tiny wins capture',
          required: spec.required
        });
      }
    } else {
      const selected = selectContent(enrichedContent, spec, req, pendingCommitments);
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
          reasoning: getModuleReasoning(moduleType, spec.focus),
          required: spec.required,
          thumbnailUrl: selected.thumbnail_url
        });
      } else if (timeOfDay === 'evening') {
        // Fallback: try to find ANY real content from DB for this module type
        const fallbackCategory = moduleType === 'regulate' ? 'somatic' : 'mindset';
        const fallbackItem = enrichedContent.find((c: any) => c.category === fallbackCategory);
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
            reasoning: getModuleReasoning(moduleType, spec.focus),
            required: spec.required,
            thumbnailUrl: fallbackItem.thumbnail_url
          });
        }
        // If no real content exists at all, skip the module entirely
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
        id: `coach-${coachType}`,
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

  return {
    timeOfDayPlan: {
      label: periodLabels[timeOfDay],
      period: timeOfDay,
      modules: todModules,
      coachCard: todCoachCard,
      totalDuration,
      progressTracked: true
    },
    calendarPills,
    preEventPlan,
    meta: {
      generatedAt: new Date().toISOString(),
      scenarioId: filteredEvents[0]?.scenario?.id || null,
      durationCeiling: maxDuration,
      maxModules
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

  // Filter out completed today
  const available = pool.filter(c => !req.completedToday.includes(c.id));
  if (available.length === 0) return pool[0] || null;

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

function getModuleReasoning(moduleType: string, focus: string): string {
  const reasons: Record<string, string> = {
    composure: 'Restore calm and emotional regulation',
    grounding: 'Anchor your attention and center yourself',
    focus: 'Sharpen concentration and clarity',
    confidence: 'Build presence and self-assurance',
    release: 'Let go of tension and mental clutter',
    restore: 'Replenish depleted energy reserves'
  };
  return reasons[focus] || 'Support your current state';
}

// ==================== HANDLER ====================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication — verify JWT and extract userId
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

    // Rate limiting — 30s cooldown per user+period
    const now = Date.now();
    const body = await req.json();
    const clientTimezoneOffset = body.timezoneOffset ?? new Date().getTimezoneOffset();
    const currentPeriod = getTimeOfDay(clientTimezoneOffset);
    const cacheKey = `${userId}:${currentPeriod}`;
    const cached = rateLimitMap.get(cacheKey);
    if (cached && (now - cached.lastCall) < RATE_LIMIT_COOLDOWN_MS) {
      console.log(`[generate-mastery-plan] Rate limited: ${userId} period=${currentPeriod} (${Math.round((now - cached.lastCall) / 1000)}s ago)`);
      return new Response(JSON.stringify(cached.cachedResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Only timezoneOffset comes from client — all other signals are server-derived
    const planReq: PlanRequest = {
      userId,
      timezoneOffset: clientTimezoneOffset,
      // All below are populated server-side inside generateMasteryPlan
      innerReadinessTier: 'managing',
      innerReadinessScore: 50,
      outerReadinessPhrase: 'Steady execution.',
      outerReadinessDriver: 'state',
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
    };

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const plan = await generateMasteryPlan(planReq, supabaseClient);

    // Cache response for rate limiting
    rateLimitMap.set(cacheKey, { lastCall: now, cachedResponse: plan });
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
  } catch (error) {
    console.error('Error generating mastery plan:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate plan', details: String(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
