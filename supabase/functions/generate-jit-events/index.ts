import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const IS_DEV = (Deno.env.get('ENVIRONMENT') || '') !== 'production';

// ─── Stage 0: Noise Filter ─────────────────────────────────────────
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

// ─── Stage 2: Dimension Scoring ─────────────────────────────────────

// Dim A: Interpersonal Stakes (0-35)
const PRESSURE_KEYWORDS = [
  'board', 'investor', 'performance', 'review', 'feedback', 'fire', 'difficult',
  'press', 'media', 'interview', 'pitch', 'crisis', 'negotiation', 'termination',
  'layoff', 'conflict', 'confrontation', 'dispute',
];

function scoreDimensionA(title: string, attendeeCount: number): number {
  let score = 0;
  if (attendeeCount === 0) return 0;
  if (attendeeCount <= 2) score = 12;
  else score = 20;

  const lower = (title || '').toLowerCase();
  if (PRESSURE_KEYWORDS.some(kw => lower.includes(kw))) {
    score = Math.min(35, score + 15);
  }
  return score;
}

// Dim B: Inner State Relevance (0-35) + bucket assignment
interface DimBResult {
  score: number;
  primaryBucket: string | null;
  secondaryBucket: string | null;
  cluster: string | null;
}

const CLUSTER_KEYWORDS: Record<string, { keywords: string[]; scoreRange: [number, number]; bucket: string }> = {
  pressure: {
    keywords: ['board', 'pitch', 'media', 'press', 'interview', 'speak', 'present', 'conference', 'investor', 'keynote', 'crisis', 'emergency', 'urgent'],
    scoreRange: [30, 35],
    bucket: 'recalibrate',
  },
  relationship: {
    keywords: ['feedback', 'performance', 'difficult', 'fire', 'demotion', 'conflict', 'dispute', 'tension', 'confrontation', 'termination', 'pip', 'layoff'],
    scoreRange: [22, 28],
    bucket: 'clarity',
  },
  decision: {
    keywords: ['strategy', 'planning', 'prioritise', 'prioritize', 'trade-off', 'decision', 'q&a', 'grilling', 'stakeholder', 'budget', 'forecast', 'earnings'],
    scoreRange: [18, 24],
    bucket: 'clarity',
  },
  transition: {
    keywords: ['first', 'last', 'new role', 'launch', 'announcement', 'offsite', 'retreat', 'end of quarter', 'annual', 'chapter', 'restructuring'],
    scoreRange: [15, 22],
    bucket: 'renewal',
  },
};

function scoreDimensionB(title: string, coachSignalScore: number, coachSignalBucket: string | null): DimBResult {
  const lower = (title || '').toLowerCase();
  const matches: { cluster: string; score: number; bucket: string }[] = [];

  for (const [clusterName, config] of Object.entries(CLUSTER_KEYWORDS)) {
    const hasMatch = config.keywords.some(kw => lower.includes(kw));
    if (hasMatch) {
      // Use midpoint of range
      const score = Math.round((config.scoreRange[0] + config.scoreRange[1]) / 2);
      matches.push({ cluster: clusterName, score, bucket: config.bucket });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  // Coach signal as a separate cluster
  if (coachSignalScore > 0) {
    matches.push({ cluster: 'coach_signal', score: coachSignalScore, bucket: coachSignalBucket || 'clarity' });
    matches.sort((a, b) => b.score - a.score);
  }

  if (matches.length === 0) {
    return { score: 0, primaryBucket: null, secondaryBucket: null, cluster: null };
  }

  const primary = matches[0];
  const secondary = matches.length > 1 ? matches[1] : null;

  return {
    score: Math.min(35, primary.score),
    primaryBucket: primary.bucket,
    secondaryBucket: secondary?.bucket || null,
    cluster: primary.cluster,
  };
}

// Dim C: Urgency Window (0-20)
function scoreDimensionC(minutesUntil: number): number {
  if (minutesUntil <= 360) return 20;       // 0-6 hours
  if (minutesUntil <= 1440) return 14;      // same day (6-24h)
  if (minutesUntil <= 2880) return 8;       // tomorrow
  if (minutesUntil <= 10080) return 4;      // 2-7 days
  return 0;                                  // 8+ days
}

// Dim D: Context Signals (0-10)
function scoreDimensionD(isRecurring: boolean, isOrganizer: boolean, title: string, description: string | null): number {
  let score = 0;
  if (!isRecurring) score += 4;
  if (isOrganizer) score += 3;
  // High-stakes in description
  if (description) {
    const lower = description.toLowerCase();
    if (PRESSURE_KEYWORDS.some(kw => lower.includes(kw))) score += 3;
  }
  return Math.min(10, score);
}

// ─── Stage 2b: Composite Readiness Amplifier ────────────────────────
interface ReadinessAmplifierResult {
  multiplier: number;
  baselineLocked: boolean;
  hrvDeviation: number | null;
}

async function computeReadinessAmplifier(
  supabase: any, userId: string
): Promise<ReadinessAmplifierResult> {
  const defaultResult: ReadinessAmplifierResult = { multiplier: 1.0, baselineLocked: false, hrvDeviation: null };

  // Get baseline
  const { data: baseline } = await supabase
    .from('readiness_baselines')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!baseline || !baseline.baseline_established_at) {
    // Check if wearable is connected but baseline not yet established
    if (baseline?.wearable_connected_at) {
      const connectedAt = new Date(baseline.wearable_connected_at);
      const daysSinceConnect = (Date.now() - connectedAt.getTime()) / (86400000);
      if (daysSinceConnect < 14) {
        return { multiplier: 1.0, baselineLocked: true, hrvDeviation: null };
      }
    }
    return defaultResult;
  }

  // Get recent wearable data
  const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0];
  const { data: recentWearable } = await supabase
    .from('wearable_data')
    .select('hrv, resting_heart_rate, sleep_duration, summary_date')
    .eq('user_id', userId)
    .gte('summary_date', threeDaysAgo)
    .not('hrv', 'is', null)
    .order('summary_date', { ascending: false })
    .limit(3);

  if (!recentWearable || recentWearable.length === 0) return defaultResult;

  const baselineHRV = Number(baseline.baseline_hrv) || 0;
  const baselineRHR = Number(baseline.baseline_rhr) || 0;

  if (baselineHRV === 0) return defaultResult;

  // Composite signal: HRV (40%), HR (35%), Sleep (15%), RHR trend (10%)
  let compositeDeviation = 0;

  // Signal 1: HRV vs baseline (40%)
  const latestHRV = recentWearable[0]?.hrv || baselineHRV;
  const hrvDevPct = ((latestHRV - baselineHRV) / baselineHRV) * 100;
  compositeDeviation += hrvDevPct * 0.4;

  // Signal 2: Current HR vs resting norm (35%)
  const latestRHR = recentWearable[0]?.resting_heart_rate;
  if (latestRHR && baselineRHR > 0) {
    const rhrDevPct = ((baselineRHR - latestRHR) / baselineRHR) * 100; // inverted: lower RHR = better
    compositeDeviation += rhrDevPct * 0.35;
  }

  // Signal 3: Sleep duration (15%) — assume 7.5h as good baseline
  const latestSleep = recentWearable[0]?.sleep_duration;
  if (latestSleep) {
    const sleepDevPct = ((latestSleep - 7.5) / 7.5) * 100;
    compositeDeviation += sleepDevPct * 0.15;
  }

  // Signal 4: 3-day RHR trend (10%)
  if (recentWearable.length >= 2 && baselineRHR > 0) {
    const rhrs = recentWearable.map((w: any) => w.resting_heart_rate).filter(Boolean);
    if (rhrs.length >= 2) {
      const avgRHR = rhrs.reduce((a: number, b: number) => a + b, 0) / rhrs.length;
      const trendDevPct = ((baselineRHR - avgRHR) / baselineRHR) * 100;
      compositeDeviation += trendDevPct * 0.1;
    }
  }

  // Map composite deviation to multiplier
  let multiplier = 1.0;
  if (compositeDeviation <= -20) multiplier = 1.4;
  else if (compositeDeviation <= -10) multiplier = 1.2;
  else if (compositeDeviation >= 10) multiplier = 0.9;
  // else stays 1.0

  return { multiplier, baselineLocked: false, hrvDeviation: hrvDevPct };
}

// ─── Stage 3: Confidence Scoring ────────────────────────────────────
interface ConfidenceResult {
  score: number;
  band: 'high' | 'medium' | 'low' | 'none';
}

function computeConfidence(
  titleKeywordHit: boolean,
  coachSessionMatch: boolean,
  hrvConfirmed: boolean,
  hasStructuralSignals: boolean,
  pastPlanCompleted: boolean,
): ConfidenceResult {
  let score = 0;
  if (titleKeywordHit) score += 40;
  if (coachSessionMatch) score += 30;
  if (hrvConfirmed) score += 15;
  if (hasStructuralSignals) score += 10;
  if (pastPlanCompleted) score += 5;

  let band: ConfidenceResult['band'] = 'none';
  if (score >= 70) band = 'high';
  else if (score >= 40) band = 'medium';
  else if (score >= 20) band = 'low';

  return { score: Math.min(100, score), band };
}

// ─── Stage 5: Urgency Horizon ───────────────────────────────────────
function determineUrgencyHorizon(minutesUntil: number): 'immediate' | 'tactical' | 'strategic' {
  if (minutesUntil <= 360) return 'immediate';       // 0-6h
  if (minutesUntil <= 10080) return 'tactical';       // 1-7 days
  return 'strategic';                                  // 1-4 weeks
}

// ─── Helpers ────────────────────────────────────────────────────────
function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function generatePillLabel(title: string, minutesUntil: number): string {
  const labelBase = title || 'Event';
  if (minutesUntil <= 60) return `${labelBase} — Soon`;
  if (minutesUntil <= 1440) return `${labelBase} — ${Math.floor(minutesUntil / 60)}h`;
  return `${labelBase} — ${Math.floor(minutesUntil / 1440)}d`;
}

function getTimeOfDayPill(timezoneOffset: number): { pillLabel: string; pillType: string; sessionPeriod: string } {
  const now = new Date();
  const localHour = (now.getUTCHours() - Math.floor(timezoneOffset / 60) + 24) % 24;
  if (localHour >= 5 && localHour < 12) return { pillLabel: 'Morning Practice', pillType: 'time_of_day', sessionPeriod: 'morning' };
  if (localHour >= 12 && localHour < 17) return { pillLabel: 'Afternoon Reset', pillType: 'time_of_day', sessionPeriod: 'afternoon' };
  return { pillLabel: 'Evening Close', pillType: 'time_of_day', sessionPeriod: 'evening' };
}

// ─── Executive Scenarios (kept for scenario module matching) ────────
const executiveScenarios: Record<string, { keywords: string[]; modules: string[]; eventTypes: string[]; leadTimeMinutes: number }> = {
  'pre-board-meeting': { keywords: ['board', 'board meeting', 'board of directors'], modules: ['regulate', 'align', 'prepare'], eventTypes: ['board_meeting'], leadTimeMinutes: 1440 },
  'pre-investor-meeting': { keywords: ['investor', 'vc', 'funding', 'pitch', 'keynote'], modules: ['regulate', 'prepare'], eventTypes: ['investor_call', 'investor_pitch'], leadTimeMinutes: 1440 },
  'pre-strategic-planning': { keywords: ['strategy', 'strategic planning', 'offsite', 'vision', 'roadmap'], modules: ['align', 'prepare'], eventTypes: ['strategic_planning', 'offsite'], leadTimeMinutes: 1440 },
  'pre-negotiations': { keywords: ['negotiation', 'contract', 'deal', 'terms', 'partnership'], modules: ['regulate', 'prepare'], eventTypes: ['negotiation', 'contract_discussion'], leadTimeMinutes: 720 },
  'pre-all-hands': { keywords: ['all hands', 'town hall', 'company meeting', 'team meeting'], modules: ['regulate', 'align'], eventTypes: ['all_hands', 'town_hall'], leadTimeMinutes: 240 },
  'pre-media': { keywords: ['interview', 'podcast', 'media', 'press', 'journalist', 'pr'], modules: ['regulate', 'align', 'prepare'], eventTypes: ['media_interview', 'podcast', 'press_conference'], leadTimeMinutes: 360 },
  'pre-crisis-response': { keywords: ['crisis', 'urgent', 'emergency', 'incident', 'escalation'], modules: ['regulate'], eventTypes: ['crisis_meeting', 'emergency'], leadTimeMinutes: 120 },
  'pre-hiring-decision': { keywords: ['final round', 'hiring committee', 'offer discussion', 'candidate review', 'executive hire'], modules: ['align', 'prepare'], eventTypes: ['hiring_committee', 'candidate_review'], leadTimeMinutes: 240 },
  'pre-client-presentation': { keywords: ['client', 'demo', 'proposal', 'customer', 'account review'], modules: ['align', 'prepare'], eventTypes: ['client_meeting', 'customer_presentation'], leadTimeMinutes: 480 },
  'pre-budget-review': { keywords: ['budget', 'finance review', 'forecast', 'financial planning', 'earnings'], modules: ['align', 'prepare'], eventTypes: ['budget_review', 'finance_meeting'], leadTimeMinutes: 1440 },
  'pre-performance-review': { keywords: ['performance review', 'annual review', 'mid-year review', '360 feedback'], modules: ['regulate', 'align', 'prepare'], eventTypes: ['performance_review', '360_review'], leadTimeMinutes: 480 },
  'pre-difficult-conversation': { keywords: ['1:1', 'one on one', 'feedback', 'pip', 'termination', 'difficult', 'conflict'], modules: ['regulate', 'prepare'], eventTypes: ['one_on_one', 'difficult_conversation', 'termination'], leadTimeMinutes: 240 },
  'pre-quarterly-review': { keywords: ['quarterly', 'qbr', 'q1', 'q2', 'q3', 'q4'], modules: ['align', 'prepare'], eventTypes: ['quarterly_review', 'qbr'], leadTimeMinutes: 2880 },
  'pre-speaking-engagement': { keywords: ['conference', 'summit', 'panel', 'speaking', 'presentation', 'webinar'], modules: ['regulate', 'align', 'prepare'], eventTypes: ['speaking_engagement', 'conference', 'panel'], leadTimeMinutes: 720 },
  'pre-leadership-meeting': { keywords: ['leadership team', 'exec team', 'c-suite', 'slt', 'management meeting'], modules: ['regulate', 'align'], eventTypes: ['leadership_meeting', 'exec_team'], leadTimeMinutes: 240 },
  'pre-ma-discussion': { keywords: ['m&a', 'merger', 'acquisition', 'due diligence', 'acqui-hire'], modules: ['regulate', 'align', 'prepare'], eventTypes: ['ma_discussion', 'acquisition'], leadTimeMinutes: 2880 },
  'pre-layoff-announcement': { keywords: ['layoff', 'restructuring', 'reduction', 'rif', 'downsizing'], modules: ['regulate', 'prepare'], eventTypes: ['layoff_announcement', 'restructuring'], leadTimeMinutes: 1440 },
  'pre-board-presentation': { keywords: ['board deck', 'board presentation', 'board materials'], modules: ['align', 'prepare'], eventTypes: ['board_presentation'], leadTimeMinutes: 2880 },
  'pre-competitive-intel': { keywords: ['competitor', 'competitive analysis', 'competitive intel', 'market analysis'], modules: ['align', 'prepare'], eventTypes: ['competitive_intel', 'market_analysis'], leadTimeMinutes: 720 },
  'pre-product-launch': { keywords: ['launch', 'go live', 'release', 'ship', 'product launch'], modules: ['regulate', 'align', 'prepare'], eventTypes: ['product_launch', 'go_live'], leadTimeMinutes: 1440 },
};

function matchScenario(title: string): { scenarioId: string; scenario: typeof executiveScenarios[string] } | null {
  const lower = (title || '').toLowerCase();
  for (const [id, scenario] of Object.entries(executiveScenarios)) {
    for (const kw of scenario.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return { scenarioId: id, scenario };
      }
    }
  }
  return null;
}

// Emotional concern detection for coach context
const concernPatterns = [
  /anxious|nervous|worried|stressed|dread|afraid|scared|fear/i,
  /caught off guard|unprepared|not ready|wasn't expecting/i,
  /defensive|attacked|criticized|under fire/i,
  /overwhelm|drained|exhausted|burned out/i,
  /avoid|delay|put off|postpone/i,
];

function detectEmotionalConcern(content: string): boolean {
  return concernPatterns.some(p => p.test(content));
}

function generateContextStatement(content: string | null, coachContext: any): string | null {
  if (coachContext.hasMentions && coachContext.expressedConcern && content) {
    if (/caught off guard|surprised|unprepared/i.test(content)) return "Last time: You felt caught off guard";
    if (/anxious|nervous|stressed/i.test(content)) return "Last time: You felt anxious going in";
    if (/defensive|attacked/i.test(content)) return "Last time: You felt defensive";
    if (/drained|exhausted/i.test(content)) return "Last time: You felt drained after";
    if (/avoid|delay/i.test(content)) return "Pattern: You've been avoiding this";
    return "You mentioned this in coaching recently";
  }
  if (coachContext.hasScenario) return `Working on: ${(coachContext.scenario || '').replace(/_/g, ' ')}`;
  if (coachContext.hasPendingTool) return `Tool from coach: ${coachContext.toolName}`;
  return null;
}

// ─── Main Handler ───────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticateRequest(req, corsHeaders);
    if (auth.errorResponse) return auth.errorResponse;
    const userId = auth.userId;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { timezoneOffset = 0 } = await req.json();
    console.log(`[generate-jit-events] User: ${userId}, TZ offset: ${timezoneOffset}`);

    const now = new Date();
    // Expand window to 4 weeks for strategic horizon
    const in4Weeks = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // Check calendar connection status first
    const { data: calConn } = await supabase
      .from('calendar_connections')
      .select('is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    // Parallel queries
    const [eventsRes, cancellationRes, scenariosRes, pendingToolsRes, completedPlansRes, readinessAmpResult] = await Promise.all([
      calConn
        ? supabase
            .from('calendar_events')
            .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring, event_metadata')
            .eq('user_id', userId)
            .gte('start_time', now.toISOString())
            .lte('start_time', in4Weeks.toISOString())
            .order('start_time', { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('jit_cancellation_memory')
        .select('event_type, cluster, cancelled_at, penalty_level')
        .eq('user_id', userId)
        .gte('cancelled_at', sixtyDaysAgo),
      supabase
        .from('coach_scenarios_detected')
        .select('scenario, dimension, event_types')
        .eq('user_id', userId)
        .eq('resolved', false)
        .gte('detected_at', thirtyDaysAgo),
      supabase
        .from('coach_tools_offered')
        .select('tool_name, tool_type, event_types, scenario')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('offered_at', { ascending: false })
        .limit(10),
      // Past completed plans for confidence scoring
      supabase
        .from('jit_event_context')
        .select('event_type')
        .eq('user_id', userId)
        .eq('completed', true)
        .gte('created_at', thirtyDaysAgo),
      computeReadinessAmplifier(supabase, userId),
    ]);

    const events = eventsRes.data || [];
    const cancellationHistory = cancellationRes.data || [];
    const activeScenarios = scenariosRes.data || [];
    const pendingTools = pendingToolsRes.data || [];
    const completedPlanTypes = new Set((completedPlansRes.data || []).map((p: any) => p.event_type));

    if (events.length === 0) {
      console.log('[generate-jit-events] No upcoming events');
      return new Response(JSON.stringify({
        selectedEvents: [],
        timeOfDayPill: getTimeOfDayPill(timezoneOffset),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── Calendar Inference Layer 2: Coach session memory ────────
    // Pre-load coach memories for attendee cross-referencing
    const { data: coachMemories } = await supabase
      .from('coach_memory_index')
      .select('memory_content, key_themes, pattern_area')
      .eq('user_id', userId)
      .order('importance_score', { ascending: false })
      .limit(50);

    const coachMemoryTexts = (coachMemories || []).map((m: any) => ({
      content: (m.memory_content || '').toLowerCase(),
      themes: m.key_themes || [],
      area: m.pattern_area || '',
    }));

    // Score each event through the six-stage pipeline
    const scoredEvents: any[] = [];

    for (const event of events) {
      const title = event.title || 'Untitled Event';
      const minutesUntil = Math.max(0, (new Date(event.start_time).getTime() - now.getTime()) / 60000);
      const durationMinutes = (new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 60000;
      const metadata = event.event_metadata || {};

      // ════════ STAGE 0: Noise Filter ════════
      if (isNoiseEvent(title)) {
        if (IS_DEV) console.log(`[JIT:Stage0] BLOCKED title="${title}" reason=noise_filter`);
        continue;
      }

      // ════════ STAGE 1: Cancellation Memory ════════
      const scenarioMatch = matchScenario(title);
      const eventType = scenarioMatch
        ? scenarioMatch.scenario.eventTypes[0] || 'general'
        : 'general';

      let cancellationPenalty = 0;
      const relevantCancellations = cancellationHistory.filter(c => {
        const matchesType = c.event_type === eventType;
        const matchesCluster = c.cluster && c.cluster === (scoreDimensionB(title, 0, null).cluster);
        return matchesType || matchesCluster;
      });

      if (relevantCancellations.length >= 2) {
        // Check 60-day decay for 2+ cancellations
        const recentEnough = relevantCancellations.some(c =>
          (now.getTime() - new Date(c.cancelled_at).getTime()) < 60 * 86400000
        );
        if (recentEnough) cancellationPenalty = 40;
      } else if (relevantCancellations.length === 1) {
        // Check 30-day decay for single cancellation
        const withinDecay = (now.getTime() - new Date(relevantCancellations[0].cancelled_at).getTime()) < 30 * 86400000;
        if (withinDecay) cancellationPenalty = 25;
      }

      if (IS_DEV && cancellationPenalty > 0) {
        console.log(`[JIT:Stage1] PENALTY title="${title}" penalty=${cancellationPenalty} cancellations=${relevantCancellations.length}`);
      }

      // ════════ STAGE 2: Five-Signal Scoring ════════

      // Dim A: Interpersonal Stakes
      const dimA = scoreDimensionA(title, event.attendees_count || 0);

      // Coach signal check for Dim B (calendar inference layer 2)
      let coachSignalScore = 0;
      let coachSignalBucket: string | null = null;
      const coachContext: any = { hasScenario: false, hasMentions: false, expressedConcern: false, hasPendingTool: false, hasGoal: false };

      // Check active scenarios
      const matchingScenario = activeScenarios.find((s: any) =>
        s.event_types && s.event_types.includes(eventType)
      );
      if (matchingScenario) {
        coachContext.hasScenario = true;
        coachContext.scenario = matchingScenario.scenario;
        coachContext.dimension = matchingScenario.dimension;
      }

      // Coach memory cross-reference (calendar inference layer 2)
      const titleLower = title.toLowerCase();
      const titleWords = titleLower.split(/\s+/).filter(w => w.length > 2);
      const coachMemoryMatch = coachMemoryTexts.some((m: any) =>
        titleWords.some(w => m.content.includes(w)) ||
        m.themes.some((t: string) => titleLower.includes(t.toLowerCase()))
      );

      if (coachMemoryMatch) {
        coachSignalScore = 15;
        coachSignalBucket = 'clarity'; // Default; refined by dimension
        coachContext.hasMentions = true;
      }

      // Check pending tools
      const matchingTool = pendingTools.find((t: any) =>
        t.event_types && t.event_types.includes(eventType)
      );
      if (matchingTool) {
        coachContext.hasPendingTool = true;
        coachContext.toolName = matchingTool.tool_name;
        if (!coachSignalScore) {
          coachSignalScore = 10;
          coachSignalBucket = 'clarity';
        }
      }

      // Dim B: Inner State Relevance
      const dimBResult = scoreDimensionB(title, coachSignalScore, coachSignalBucket);
      const dimB = dimBResult.score;

      // Dim C: Urgency
      const dimC = scoreDimensionC(minutesUntil);

      // Dim D: Context
      const description = metadata?.description || null;
      const dimD = scoreDimensionD(
        event.is_recurring || false,
        event.is_organizer || false,
        title,
        description,
      );

      // Readiness amplifier
      const { multiplier: readinessMultiplier, baselineLocked, hrvDeviation } = readinessAmpResult;

      // Final score
      const rawScore = dimA + dimB + dimC + dimD;
      const amplifiedScore = Math.round(rawScore * readinessMultiplier);
      const finalScore = Math.max(0, amplifiedScore - cancellationPenalty);

      if (IS_DEV) {
        console.log(`[JIT:Stage2] SCORED title="${title}" A=${dimA} B=${dimB} C=${dimC} D=${dimD} amp=${readinessMultiplier} penalty=${cancellationPenalty} final=${finalScore}`);
      }

      // ════════ STAGE 3: Confidence Scoring ════════
      const titleKeywordHit = dimBResult.cluster !== null && dimBResult.cluster !== 'coach_signal';
      const hrvConfirmed = (hrvDeviation !== null && hrvDeviation <= -15);
      const hasStructural = (event.attendees_count || 0) > 0 && !event.is_recurring;
      const pastCompleted = completedPlanTypes.has(eventType);

      const confidence = computeConfidence(
        titleKeywordHit,
        coachMemoryMatch || coachContext.hasScenario,
        hrvConfirmed,
        hasStructural,
        pastCompleted,
      );

      if (IS_DEV) {
        console.log(`[JIT:Stage3] CONFIDENCE title="${title}" score=${confidence.score} band=${confidence.band}`);
      }

      // ════════ STAGE 4: Threshold Gate ════════
      const gatePass = finalScore >= 55 && dimA >= 10 && dimB >= 8;

      if (IS_DEV) {
        const reason = !gatePass
          ? `FAIL (${finalScore < 55 ? `score=${finalScore}<55` : ''}${dimA < 10 ? ` A=${dimA}<10` : ''}${dimB < 8 ? ` B=${dimB}<8` : ''})`
          : `PASS (${finalScore}≥55, A=${dimA}≥10, B=${dimB}≥8)`;
        console.log(`[JIT:Stage4] GATE title="${title}" ${reason}`);
      }

      if (!gatePass) continue;

      // Confidence band check: below 20 = do not surface
      if (confidence.band === 'none') {
        if (IS_DEV) console.log(`[JIT:Stage4] BLOCKED title="${title}" reason=confidence_below_20 (${confidence.score})`);
        continue;
      }

      // ════════ STAGE 5: Urgency Horizon ════════
      const urgencyHorizon = determineUrgencyHorizon(minutesUntil);

      if (IS_DEV) {
        console.log(`[JIT:Stage5] HORIZON title="${title}" horizon=${urgencyHorizon}`);
      }

      // Generate context statement
      const contextStatement = generateContextStatement(
        coachContext.mentionContent || null,
        coachContext,
      );

      scoredEvents.push({
        calendarEventId: event.id,
        eventTitle: title,
        eventType,
        eventStart: event.start_time,
        eventDurationMinutes: Math.round(durationMinutes),
        attendeeCount: event.attendees_count || 0,
        userIsOrganizer: event.is_organizer || false,
        isRecurring: event.is_recurring || false,
        isDuringPrimeHours: (() => {
          const h = new Date(event.start_time).getHours();
          return (h >= 9 && h < 12) || (h >= 14 && h < 16);
        })(),
        minutesUntil: Math.round(minutesUntil),
        // Legacy score fields (backward compat)
        urgencyScore: dimC,
        scenarioMatchScore: titleKeywordHit ? 25 : 0,
        accountabilityScore: event.is_organizer ? 15 : 0,
        scaleScore: Math.min(10, ((event.attendees_count || 0) > 5 ? 5 : 0) + (durationMinutes > 60 ? 5 : 0)),
        contextScore: dimD,
        coachBoostScore: coachSignalScore,
        skipPenalty: -cancellationPenalty,
        finalScore: Math.min(finalScore, 120),
        // New dimension scores
        dimensionA: dimA,
        dimensionB: dimB,
        dimensionC: dimC,
        dimensionD: dimD,
        readinessMultiplier,
        // Bucket classification
        jitBucketPrimary: dimBResult.primaryBucket,
        jitBucketSecondary: dimBResult.secondaryBucket,
        // Confidence
        jitConfidenceScore: confidence.score,
        confidenceBand: confidence.band,
        // Urgency horizon
        jitUrgencyHorizon: urgencyHorizon,
        // Coach context
        hasCoachContext: coachContext.hasScenario || coachContext.hasMentions || coachContext.hasGoal,
        coachScenario: coachContext.scenario || null,
        coachDimension: coachContext.dimension || null,
        hasPendingTool: coachContext.hasPendingTool,
        expressedConcern: coachContext.expressedConcern,
        contextStatement,
        pillLabel: generatePillLabel(title, Math.round(minutesUntil)),
        pillType: 'calendar_context',
        scenarioId: scenarioMatch?.scenarioId || null,
        scenarioModules: scenarioMatch?.scenario.modules || null,
      });
    }

    // Sort by score, take top 3 (up from 2 to accommodate multi-horizon)
    scoredEvents.sort((a, b) => b.finalScore - a.finalScore);
    const selectedEvents = scoredEvents.slice(0, 3);

    // Store in jit_event_context
    for (const evt of selectedEvents) {
      await supabase.from('jit_event_context').upsert({
        user_id: userId,
        calendar_event_id: evt.calendarEventId,
        event_title: evt.eventTitle,
        event_type: evt.eventType,
        event_start: evt.eventStart,
        event_duration_minutes: evt.eventDurationMinutes,
        attendee_count: evt.attendeeCount,
        user_is_organizer: evt.userIsOrganizer,
        is_recurring: evt.isRecurring,
        is_during_prime_hours: evt.isDuringPrimeHours,
        urgency_score: evt.urgencyScore,
        scenario_match_score: evt.scenarioMatchScore,
        accountability_score: evt.accountabilityScore,
        scale_score: evt.scaleScore,
        context_score: evt.contextScore,
        coach_boost_score: evt.coachBoostScore,
        skip_penalty: evt.skipPenalty,
        final_score: evt.finalScore,
        has_coach_context: evt.hasCoachContext,
        coach_scenario: evt.coachScenario,
        coach_dimension: evt.coachDimension,
        has_pending_tool: evt.hasPendingTool,
        expressed_concern: evt.expressedConcern,
        context_statement: evt.contextStatement,
        shown_in_jit: true,
        updated_at: new Date().toISOString(),
        // New fields
        jit_bucket_primary: evt.jitBucketPrimary,
        jit_bucket_secondary: evt.jitBucketSecondary,
        jit_confidence_score: evt.jitConfidenceScore,
        jit_dimension_scores: {
          a: evt.dimensionA,
          b: evt.dimensionB,
          c: evt.dimensionC,
          d: evt.dimensionD,
          readiness_multiplier: evt.readinessMultiplier,
          final: evt.finalScore,
        },
        jit_urgency_horizon: evt.jitUrgencyHorizon,
        jit_horizons_surfaced: [evt.jitUrgencyHorizon],
      }, { onConflict: 'id' });
    }

    console.log(`[generate-jit-events] Scored ${events.length} events, selected ${selectedEvents.length}`);

    return new Response(JSON.stringify({
      selectedEvents: selectedEvents.map(e => ({
        eventId: e.calendarEventId,
        eventTitle: e.eventTitle,
        eventType: e.eventType,
        eventStart: e.eventStart,
        minutesUntil: e.minutesUntil,
        finalScore: e.finalScore,
        hasCoachContext: e.hasCoachContext,
        coachScenario: e.coachScenario,
        coachDimension: e.coachDimension,
        hasPendingTool: e.hasPendingTool,
        expressedConcern: e.expressedConcern,
        contextStatement: e.contextStatement,
        pillLabel: e.pillLabel,
        pillType: e.pillType,
        scenarioModules: e.scenarioModules,
        // New fields for client
        jitBucketPrimary: e.jitBucketPrimary,
        jitConfidenceBand: e.confidenceBand,
        jitUrgencyHorizon: e.jitUrgencyHorizon,
      })),
      timeOfDayPill: getTimeOfDayPill(timezoneOffset),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-jit-events] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
