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

function generatePlanBrief(
  ctx: CalendarContext,
  timeOfDay: 'morning' | 'afternoon' | 'evening',
  innerReadinessTier: string,
  checkInOutcome: string,
  calendarLoad: string,
  wearable: WearableContext
): string {
  const count = timeOfDay === 'morning' ? ctx.upcomingMeetingCount : ctx.todayMeetingCount;
  const remainingCount = ctx.remainingMeetingCount ?? count;
  const hasCalendar = count > 0;

  // Map readiness tier to human language
  const tierLabel: Record<string, string> = {
    depleted: 'drained',
    managing: 'steady',
    strong: 'above baseline',
    peak: 'at peak readiness'
  };
  const readinessWord = tierLabel[innerReadinessTier] || 'steady';

  // Map check-in outcome to state descriptor
  const outcomeLabel: Record<string, string> = {
    thriving: 'energised',
    steady: 'steady',
    struggling: 'under pressure',
    drained: 'drained',
    scattered: 'scattered',
    anxious: 'tense',
    flat: 'flat'
  };
  const stateWord = outcomeLabel[checkInOutcome] || readinessWord;

  // Wearable signal fragments – only when notable
  const poorSleep = wearable.hasData && wearable.sleepScore !== null && wearable.sleepScore < 70;
  const lowHRV = wearable.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation < -10;
  const goodHRV = wearable.hasData && wearable.hrvDeviation !== null && wearable.hrvDeviation > 5;
  const goodSleep = wearable.hasData && wearable.sleepScore !== null && wearable.sleepScore >= 80;

  let wearableFragment = '';
  if (poorSleep && lowHRV) wearableFragment = ' and your sleep and HRV are both below baseline';
  else if (poorSleep) wearableFragment = ' and your sleep score is below baseline';
  else if (lowHRV) wearableFragment = ' and your HRV is below baseline';
  else if (goodHRV && goodSleep) wearableFragment = ' with recovered HRV and solid sleep';
  else if (goodHRV) wearableFragment = ' with recovered HRV';

  // ---- EVENING ----
  if (timeOfDay === 'evening') {
    if (!hasCalendar) {
      if (poorSleep || lowHRV) return `Your body signals show fatigue${wearableFragment.replace(' and ', ' – ')}. This evening sequence prioritises deep recovery to protect tomorrow's capacity.`;
      return 'This evening sequence helps you close the day with intention and prepare your mind for tomorrow.';
    }
    if (calendarLoad === 'extreme' || calendarLoad === 'heavy') {
      return `You checked in as ${stateWord} after ${count} meetings${wearableFragment}. This sequence is designed to release what you carried today and protect tomorrow's capacity.`;
    }
    if (calendarLoad === 'moderate') {
      return `After a moderate day of ${count} meetings${wearableFragment}, this sequence helps you close with clarity and set up tomorrow.`;
    }
    return `A lighter day behind you${wearableFragment}. This evening sequence helps you consolidate what went well and rest with intention.`;
  }

  // ---- MORNING ----
  if (timeOfDay === 'morning') {
    if (!hasCalendar) {
      if (poorSleep) return `Your sleep score is below baseline. These practices are calibrated to compensate – building the focus and composure your body didn't fully restore overnight.`;
      return `Your readiness is ${readinessWord}${wearableFragment}. These practices set your mental edge for the day ahead.`;
    }
    if (calendarLoad === 'extreme' || calendarLoad === 'heavy') {
      return `Your readiness is ${readinessWord}${wearableFragment} but ${count} meetings lie ahead. These practices build the composure and focus to sustain you through a dense day.`;
    }
    if (calendarLoad === 'moderate') {
      return `Your readiness is ${readinessWord}${wearableFragment} with ${count} meetings ahead. This sequence sharpens your focus for a moderate day.`;
    }
    return `You're ${readinessWord}${wearableFragment} with a light day ahead. These practices channel that clarity into deliberate intention.`;
  }

  // ---- AFTERNOON ----
  if (!hasCalendar || remainingCount === 0) {
    return `Your readiness is ${readinessWord}${wearableFragment}. This sequence resets your energy for the stretch that remains.`;
  }
  if (calendarLoad === 'extreme' || calendarLoad === 'heavy') {
    return `Your readiness is ${readinessWord}${wearableFragment} with ${remainingCount} meeting${remainingCount !== 1 ? 's' : ''} still ahead. This sequence restores your edge before the next demand.`;
  }
  return `Your readiness is ${readinessWord}${wearableFragment} with ${remainingCount} meeting${remainingCount !== 1 ? 's' : ''} still ahead. This sequence sharpens your edge for the stretch that remains.`;
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
// Touch 1 (24-48h): coach + think prep. Touch 2 (0-6h): body + state prep.
// Silent gap (6-24h) and selection-only (>48h): scored but not surfaced.
function getActionWindow(minutesUntil: number): 'touch1' | 'touch2' | 'silent' | 'selection_only' {
  if (minutesUntil <= 360) return 'touch2';           // 0-6h: body prep
  if (minutesUntil <= 1440) return 'silent';           // 6-24h: gap – do not surface
  if (minutesUntil <= 2880) return 'touch1';           // 24-48h: coach + think
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
        if (actionWindow === 'silent' || actionWindow === 'selection_only') continue;

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
  const dimScores = row.jit_dimension_scores;
  const bucket = row.jit_bucket_primary;
  const confidenceScore = row.jit_confidence_score || 0;

  // Bucket-driven reasoning
  if (bucket === 'recalibrate') {
    parts.push('High inner-state demand detected – regulate before this');
  } else if (bucket === 'clarity') {
    parts.push('Decision or relationship stakes ahead – sharpen your approach');
  } else if (bucket === 'renewal') {
    parts.push('Transition moment – sustain energy and identity');
  }

  // Coach memory signal
  if (row.has_coach_context) {
    if (row.expressed_concern) {
      parts.push('you\'ve discussed this concern with your coach');
    } else if (row.coach_scenario) {
      parts.push('your coach has flagged this pattern');
    } else if (row.has_pending_tool) {
      parts.push('a coach-recommended tool applies here');
    } else {
      parts.push('this connects to themes from your coaching');
    }
  }

  // HRV context from dimension scores
  if (dimScores?.readiness_multiplier && dimScores.readiness_multiplier > 1.1) {
    const deviation = Math.round((dimScores.readiness_multiplier - 1) * 100);
    parts.push(`your readiness is ${deviation}% below baseline today`);
  }

  // Urgency
  if (minutesUntil <= 30) {
    parts.push('starting very soon – prepare now');
  } else if (minutesUntil <= 60) {
    parts.push(`in ${minutesUntil} minutes`);
  } else if (minutesUntil < 1440) {
    parts.push(`in ${Math.floor(minutesUntil / 60)} hours`);
  } else {
    parts.push(`in ${Math.ceil(minutesUntil / 1440)} days`);
  }

  // HRV correlation from historical data
  if (hrvCorrelations) {
    const evtType = extractEventType(row.event_title || '');
    const corr = hrvCorrelations[evtType];
    if (corr && corr.count >= 2 && Math.abs(corr.avgHRVDeviation) > 10) {
      const canonicalLabel = CANONICAL_TAGS[evtType] || evtType;
      parts.push(`HRV typically shifts ${corr.avgHRVDeviation > 0 ? '+' : ''}${corr.avgHRVDeviation}% during ${canonicalLabel.toLowerCase()} events`);
    }
  }

  // Confidence-framed closing
  if (confidenceScore >= 70) {
    return parts.join(' – ') + '. Prepare with targeted practice.';
  } else if (confidenceScore >= 40) {
    return `Before your ${row.event_title || 'event'} – ` + parts.join(' – ') + '.';
  } else if (confidenceScore >= 20) {
    return `Worth preparing for this? ` + parts.join(' – ') + '.';
  }

  return parts.length > 0
    ? parts.join(' – ') + '. Prepare with targeted practice.'
    : `${row.event_title || 'Upcoming event'}. Prepare with targeted practice.`;
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
    if (actionWindow === 'silent' || actionWindow === 'selection_only') continue;

    let score = 0;
    const titleLower = (event.title || '').toLowerCase();

    // Immediacy scoring (only touch2 0-6h and touch1 24-48h windows)
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

// ==================== MAIN PLAN GENERATION ====================

async function generateMasteryPlan(req: PlanRequest, supabaseClient: any) {
  const timeOfDay = getTimeOfDay(req.timezoneOffset);

  // Phase 2: Recovery day override (feature-flagged OFF)
  if (ENABLE_WEARABLE_RECOVERY_TRIGGER) {
    const recoveryTrigger = await checkMasteryPlanRecoveryTrigger(req.userId, supabaseClient);
    if (recoveryTrigger?.triggered) {
      console.log(`[generate-mastery-plan] RECOVERY DAY TRIGGERED: ${recoveryTrigger.reason}`);
      // When enabled, this will force a recovery-only plan
      // For now, just log – full implementation activates in Phase 2
    }
  }

  // 0. Server-side upstream queries – ALL signals derived here (trust gap closed)
  // Calendar events – next 48h (only if connection is active)
  let rawCalendarEvents: any[] = [];
  try {
    // Gate on active connection – stale events must not power plan after disconnect
    const { data: calConn } = await supabaseClient
      .from('calendar_connections')
      .select('is_active')
      .eq('user_id', req.userId)
      .eq('is_active', true)
      .maybeSingle();

    if (calConn) {
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
    } else {
      console.log(`[generate-mastery-plan] calendar not connected, skipping calendar_events for user ${req.userId}`);
    }
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

  // Check-in data – prioritize current time window, fall back to latest
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

  // Completed today – from daily_ritual_completions (current period only)
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

  // Favorites – from user_favorites
  try {
    const { data: favs } = await supabaseClient
      .from('user_favorites')
      .select('content_id')
      .eq('user_id', req.userId);
    req.favorites = (favs || []).map((f: any) => f.content_id);
  } catch { req.favorites = []; }

  // Outer readiness – call compute-outer-readiness server-to-server
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
    return { ...c, structured_tags: (meta as any)?.structured_tags, mastery_category: (meta as any)?.mastery_category };
  });

  // 3. Fetch HRV × Calendar correlations
  const hrvCorrelations = await getHRVEventCorrelations(req.userId, supabaseClient);

  // 4. Score calendar events – bridge to new pipeline (jit_event_context) with legacy fallback
  const scoredEvents = await getPreScoredEvents(req.userId, req.calendarEvents || [], supabaseClient, hrvCorrelations);
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

  // 5. Build pre-event plan using TWO-TOUCH ACTION MODEL
  // Touch 1 (24-48h): coach primary CTA + framework + optional focus practice (5-8 min thinking prep)
  // Touch 2 (0-6h): somatic primary + focus exercise + coach secondary (3-5 min body prep)
  // Silent gap (6-24h): nothing surfaces. Selection-only (>48h): nothing surfaces.
  let preEventPlan: any = null;

  // Find first event in a valid action window
  let topEvent: ScoredEvent | null = null;
  for (const evt of filteredEvents) {
    if (evt.score < JIT_THRESHOLD_UNIFIED) continue;
    const window = getActionWindow(evt.minutesUntil);
    if (window === 'touch1' || window === 'touch2') {
      topEvent = evt;
      break;
    }
    // Events in silent gap or selection-only are skipped for plan building
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
        coachCard: generateCoachCard('prepare', timeOfDay, req.innerReadinessTier, req.patternInsight, topEvent.event.title, topEvent.minutesUntil),
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
  const planBrief = generatePlanBrief(calendarContext, timeOfDay, req.innerReadinessTier, req.checkInOutcome, req.calendarLoad);
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
           reasoning: getContextualReasoning(moduleType, spec.focus, req.innerReadinessTier, req.checkInOutcome, req.calendarLoad, timeOfDay),
          required: spec.required,
          thumbnailUrl: selected.thumbnail_url
        });
      } else if (timeOfDay === 'evening') {
        // Fallback: try to find ANY real content from DB for this module type
        const fallbackCategory = moduleType === 'regulate' ? 'somatic' : 'mindset';
        const fallbackItem = todCandidates.find((c: any) => c.category === fallbackCategory);
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
            reasoning: getContextualReasoning(moduleType, spec.focus, req.innerReadinessTier, req.checkInOutcome, req.calendarLoad, timeOfDay),
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
      progressTracked: true,
      planBrief: planBrief || undefined
    },
    calendarPills,
    preEventPlan,
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

function getContextualReasoning(
  moduleType: string,
  focus: string,
  innerReadinessTier: string,
  checkInOutcome: string,
  calendarLoad: string,
  timeOfDay: 'morning' | 'afternoon' | 'evening'
): string {
  const isDense = calendarLoad === 'extreme' || calendarLoad === 'heavy';
  const isDepleted = innerReadinessTier === 'depleted' || checkInOutcome === 'drained' || checkInOutcome === 'struggling';
  const isEvening = timeOfDay === 'evening';
  const isStrong = innerReadinessTier === 'strong' || innerReadinessTier === 'peak';

  // Context-aware reasoning per focus area
  if (focus === 'composure') {
    if (isDepleted) return 'Your check-in flagged tension – this settles your nervous system before what\'s ahead';
    if (isDense) return 'A dense calendar demands composure – this practice steadies you for high-stakes moments';
    return 'This practice anchors your composure so you show up grounded, not reactive';
  }
  if (focus === 'release') {
    if (isEvening && isDense) return 'After a heavy day, this helps discharge accumulated stress so it doesn\'t carry into tomorrow';
    if (isEvening) return 'Release the day\'s weight – this prevents rumination and protects your rest';
    if (isDepleted) return 'Your system is carrying tension – this practice creates space to let it go';
    return 'Clear mental clutter so your next decision comes from clarity, not residue';
  }
  if (focus === 'grounding') {
    if (isEvening) return 'Ground yourself before rest – this closes the mental loops still running';
    if (isDepleted) return 'When energy is low, grounding reconnects you to a stable centre';
    return 'This practice anchors your attention so you\'re fully present for what\'s next';
  }
  if (focus === 'focus') {
    if (isDense) return 'With a dense calendar, this narrows your attention to what genuinely matters next';
    if (isDepleted) return 'When depleted, targeted focus prevents you from spreading thin';
    return 'Sharpen your cognitive edge – this practice cuts through noise to priority';
  }
  if (focus === 'confidence') {
    if (isStrong) return 'Your readiness is high – this practice channels that into visible, confident presence';
    if (isDepleted) return 'Even when drained, this practice reconnects you to your leadership presence';
    return 'This practice anchors self-assurance so you lead from conviction, not anxiety';
  }
  if (focus === 'restore') {
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

    // Rate limiting – 30s cooldown per user+period
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

    // Only timezoneOffset comes from client – all other signals are server-derived
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
