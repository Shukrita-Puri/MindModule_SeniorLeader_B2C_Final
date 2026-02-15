import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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
  userId: string;
  innerReadinessTier: string;
  innerReadinessScore: number;
  outerReadinessPhrase: string;
  outerReadinessDriver: string;
  calendarLoad: string;
  calendarPressure: string;
  calendarEvents: CalendarEvent[];
  favorites: string[];
  completedToday: string[];
  timezoneOffset: number;
  clarityLevel: number;
  confidenceLevel: number;
  checkInOutcome: string;
  archetype: string;
  coachInsights?: any[];
  effectiveContent?: string[];
  patternInsight?: { count: number; state: string };
  wearableStress?: string;
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
  // DEPLETED TIER
  "One thing at a time.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'composure' },
    align: { type: 'align', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Protect what matters.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Reserve for the moment.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'restore' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  "Navigate, don't absorb.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Move through gently.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Pace and protect.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Rest is the work.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'standard', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Begin with intention.": {
    regulate: { type: 'regulate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 5, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Close before tomorrow.": {
    regulate: { type: 'regulate', required: true, priority: 9, intensity: 'gentle', duration: 'standard', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 8, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Protect your reserves.": {
    regulate: { type: 'regulate', required: true, priority: 7, intensity: 'gentle', duration: 'short', focus: 'restore' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'composure' }
  },
  // MANAGING TIER
  "Hold your ground.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' }
  },
  "Steady into the stakes.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'composure' },
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'composure' }
  },
  "Depth over breadth.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Rhythm over intensity.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Ride the rhythm.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Steady execution.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  "Build your reserves.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'restore' }
  },
  "Set a sustainable pace.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'grounding' },
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'grounding' }
  },
  "Close with care.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'release' },
    integrate: { type: 'integrate', required: true, priority: 6, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Maintain your rhythm.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'gentle', duration: 'short', focus: 'grounding' }
  },
  // STRONG TIER
  "Lead from strength.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'confidence' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 8, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Execute with presence.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Bring your full weight.": {
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Sustain the quality.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'moderate', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Move with confidence.": {
    align: { type: 'align', required: true, priority: 6, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Invest the advantage.": {
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Protect and build.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'grounding' }
  },
  "Protect the window.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Close strong.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'confidence' },
    integrate: { type: 'integrate', required: true, priority: 6, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Leverage your position.": {
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  // PEAK TIER
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
  "Channel the capacity.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 6, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Move with full confidence.": {
    align: { type: 'align', required: true, priority: 6, intensity: 'activating', duration: 'short', focus: 'confidence' }
  },
  "Depth and precision.": {
    align: { type: 'align', required: false, priority: 5, intensity: 'moderate', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 6, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Deep work window.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'focus' }
  },
  "Protect the peak.": {
    regulate: { type: 'regulate', required: false, priority: 4, intensity: 'activating', duration: 'micro', focus: 'focus' },
    align: { type: 'align', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' },
    prepare: { type: 'prepare', required: true, priority: 7, intensity: 'activating', duration: 'short', focus: 'focus' }
  },
  "Close with intention.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'confidence' },
    integrate: { type: 'integrate', required: true, priority: 6, intensity: 'gentle', duration: 'short', focus: 'release' }
  },
  "Own your optimal state.": {
    align: { type: 'align', required: false, priority: 4, intensity: 'moderate', duration: 'short', focus: 'confidence' },
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
  if (localHour >= 12 && localHour < 17) return 'afternoon';
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

  for (const event of events) {
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

    // Skip penalty
    const eventType = matchedScenario?.id || 'general';
    if (skippedTypes.includes(eventType)) {
      score -= 15;
      // 3+ skips = remove entirely (handled by caller checking skippedTypes3Plus)
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

    // Context description
    const contextDescription = minutesUntil <= 60
      ? `${event.title} in ${minutesUntil} minutes. Start preparing now with practice and mental rehearsal.`
      : minutesUntil < 1440
        ? `${event.title} in ${Math.floor(minutesUntil / 60)} hours. Prepare with targeted practice.`
        : `${event.title} in ${Math.ceil(minutesUntil / 1440)} days. Start preparing now with practice and mental rehearsal.`;

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

function calculateContentScore(
  content: any,
  moduleSpec: ModuleSpec,
  favorites: string[],
  coachInsights: any[],
  effectiveContent: string[],
  completedToday: string[]
): number {
  let score = 0;
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

  // Focus match
  if (content.structured_tags?.goalTags?.some((t: string) => t.toLowerCase().includes(moduleSpec.focus))) score += 10;
  else if (content.tags?.some((t: string) => t.toLowerCase().includes(moduleSpec.focus))) score += 10;

  // Recency - not completed in last 3 days (simplified: not completed today)
  if (!completedToday.includes(content.id)) score += 5;

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
      title: 'Evening Flow',
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
  innerReadinessScore?: number
): { prompt: string; title: string } | null {
  // Morning: NO coach for strong/peak (practice-heavy)
  if (timeOfDay === 'morning') {
    if (tier === 'strong' || tier === 'peak') return null;
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
    if (tier === 'managing') {
      return {
        prompt: "You're operational. What's the most important thing you want to carry well today?",
        title: 'Morning Focus'
      };
    }
    return null;
  }

  // Afternoon: only with Prepare module from scenario (handled by caller)
  if (timeOfDay === 'afternoon') return null;

  // Evening: ALWAYS
  if (timeOfDay === 'evening') {
    // Always include Tiny Wins in evening prompt
    return {
      prompt: "A managed close. What's one thing you did right today? Share your small win — and what's one thing worth carrying into tomorrow, and one thing worth leaving here?",
      title: 'Evening Flow'
    };
  }

  return null;
}

// ==================== MAIN PLAN GENERATION ====================

async function generateMasteryPlan(req: PlanRequest, supabaseClient: any) {
  const timeOfDay = getTimeOfDay(req.timezoneOffset);

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

  // 4. Build calendar pills (max 2)
  const calendarPills = filteredEvents.slice(0, 2).map(e => ({
    label: e.scenario ? `${e.scenario.contextLabel}` : e.event.title || 'Upcoming Event',
    eventId: e.event.id,
    priorityScore: e.score,
    timePill: e.timePill
  }));

  // 5. Build pre-event plan from highest-scoring event
  let preEventPlan: any = null;
  if (filteredEvents.length > 0) {
    const topEvent = filteredEvents[0];
    const scenario = topEvent.scenario;
    const preEventModules: any[] = [];

    if (scenario) {
      for (const spec of scenario.modules) {
        if (spec.type === 'prepare' || spec.type === 'integrate') {
          preEventModules.push({
            type: spec.type,
            contentId: `coach-${spec.type}`,
            title: spec.type === 'prepare' ? 'Mental Rehearsal' : 'Evening Flow',
            contentType: 'coach',
            duration: 2,
            focus: spec.focus,
            intensity: spec.intensity,
            isFavorite: false,
            isCoachCard: true,
            reasoning: spec.type === 'prepare' ? 'Mental rehearsal for upcoming high-stakes moments' : 'Reflection and closure'
          });
        } else {
          const selected = selectContent(enrichedContent, spec, req);
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
    }

    preEventPlan = {
      eventTitle: topEvent.event.title,
      eventType: scenario?.id || 'general',
      minutesUntil: topEvent.minutesUntil,
      timePill: topEvent.timePill,
      contextDescription: topEvent.contextDescription,
      modules: preEventModules,
      coachCard: generateCoachCard('prepare', timeOfDay, req.innerReadinessTier, req.patternInsight, topEvent.event.title, topEvent.minutesUntil),
      progressTracked: false
    };
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
      const selected = selectContent(enrichedContent, spec, req);
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
  const coachContext = getCoachPromptForContext(timeOfDay, req.innerReadinessTier, req.patternInsight, req.innerReadinessScore);
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
    morning: 'Morning Start',
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

function selectContent(contentLibrary: any[], spec: ModuleSpec, req: PlanRequest): any | null {
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
    score: calculateContentScore(c, spec, req.favorites, req.coachInsights || [], req.effectiveContent || [], req.completedToday)
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
    const body: PlanRequest = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey);

    const plan = await generateMasteryPlan(body, supabaseClient);

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
