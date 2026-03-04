import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticateRequest } from "../_shared/auth.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ─── Executive Scenarios ────────────────────────────────────────────
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

// ─── Scoring Functions ──────────────────────────────────────────────

function calculateUrgencyScore(minutesUntilEvent: number): number {
  if (minutesUntilEvent <= 120) return 40;
  if (minutesUntilEvent <= 240) return 30;
  if (minutesUntilEvent <= 480) return 20;
  if (minutesUntilEvent <= 1440) return 10;
  if (minutesUntilEvent <= 2880) return 5;
  return 0;
}

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

function calculateContextScore(startTime: string, isRecurring: boolean): number {
  let score = 0;
  const eventHour = new Date(startTime).getHours();
  if ((eventHour >= 9 && eventHour < 12) || (eventHour >= 14 && eventHour < 16)) score += 5;
  if (!isRecurring) score += 5;
  return Math.min(score, 10);
}

const concernPatterns = [
  /anxious|nervous|worried|stressed|dread|afraid|scared|fear/i,
  /caught off guard|unprepared|not ready|wasn't expecting/i,
  /defensive|attacked|criticized|under fire/i,
  /overwhelm|drained|exhausted|burned out/i,
  /avoid|delay|put off|postpone/i
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
    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries
    const [eventsRes, skipRes, scenariosRes] = await Promise.all([
      supabase
        .from('calendar_events')
        .select('id, title, start_time, end_time, is_organizer, attendees_count, is_recurring')
        .eq('user_id', userId)
        .gte('start_time', now.toISOString())
        .lte('start_time', in48h.toISOString())
        .order('start_time', { ascending: true }),
      supabase
        .from('jit_preferences')
        .select('event_type, created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo),
      supabase
        .from('coach_scenarios_detected')
        .select('scenario, dimension, event_types')
        .eq('user_id', userId)
        .eq('resolved', false)
        .gte('detected_at', sevenDaysAgo),
    ]);

    const events = eventsRes.data || [];
    const skipHistory = skipRes.data || [];
    const activeScenarios = scenariosRes.data || [];

    if (events.length === 0) {
      console.log('[generate-jit-events] No upcoming events');
      return new Response(JSON.stringify({
        selectedEvents: [],
        timeOfDayPill: getTimeOfDayPill(timezoneOffset)
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Score each event
    const scoredEvents: any[] = [];

    for (const event of events) {
      const minutesUntil = Math.max(0, (new Date(event.start_time).getTime() - now.getTime()) / 60000);
      const durationMinutes = (new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 60000;

      // Factor 1: Urgency
      const urgencyScore = calculateUrgencyScore(minutesUntil);

      // Factor 2: Scenario match
      const scenarioMatch = matchScenario(event.title || '');
      const scenarioMatchScore = scenarioMatch ? 25 : 0;
      const eventType = scenarioMatch
        ? scenarioMatch.scenario.eventTypes[0] || 'general'
        : 'general';

      // Factor 3: Accountability
      const accountabilityScore = event.is_organizer ? 15 : 0;

      // Factor 4: Scale
      let scaleScore = 0;
      if ((event.attendees_count || 0) > 5) scaleScore += 5;
      if (durationMinutes > 60) scaleScore += 5;

      // Factor 5: Context
      const contextScore = calculateContextScore(event.start_time, event.is_recurring || false);

      // Coach context boost
      let coachBoost = 0;
      const coachContext: any = { hasScenario: false, hasMentions: false, expressedConcern: false, hasPendingTool: false, hasGoal: false };

      // Check active scenarios
      const matchingScenario = activeScenarios.find(s =>
        s.event_types && s.event_types.includes(eventType)
      );
      if (matchingScenario) {
        coachContext.hasScenario = true;
        coachContext.scenario = matchingScenario.scenario;
        coachContext.dimension = matchingScenario.dimension;
      }

      // Check coach mentions (only if we have an event type to search for)
      if (eventType !== 'general') {
        const searchTerm = eventType.replace(/_/g, ' ');
        const { data: mentions } = await supabase
          .from('dialogue_messages')
          .select('content')
          .eq('sender_type', 'user')
          .gte('timestamp', thirtyDaysAgo)
          .ilike('content', `%${searchTerm}%`)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (mentions) {
          coachContext.hasMentions = true;
          coachContext.mentionContent = mentions.content;
          coachContext.expressedConcern = detectEmotionalConcern(mentions.content);
        }
      }

      // Check goals
      const { data: goalMatch } = await supabase
        .from('user_coach_insights')
        .select('insight_content')
        .eq('user_id', userId)
        .eq('insight_type_v2', 'goal')
        .eq('is_active', true)
        .ilike('insight_content', `%${eventType.replace(/_/g, ' ')}%`)
        .limit(1)
        .maybeSingle();

      if (goalMatch) {
        coachContext.hasGoal = true;
      }

      // Calculate coach boost
      if (coachContext.hasMentions && coachContext.expressedConcern) coachBoost = 20;
      else if (coachContext.hasScenario) coachBoost = 15;
      else if (coachContext.hasPendingTool) coachBoost = 12;
      else if (coachContext.hasGoal) coachBoost = 8;

      // Skip penalty
      const eventTypeSkips = skipHistory.filter(s => s.event_type === eventType).length;
      let skipPenalty = 0;
      if (eventTypeSkips >= 3) skipPenalty = -999;
      else if (eventTypeSkips === 2) skipPenalty = -15;

      const baselineScore = urgencyScore + scenarioMatchScore + accountabilityScore + scaleScore + contextScore;
      const finalScore = baselineScore + coachBoost + skipPenalty;

      if (finalScore < 50) continue; // Filter below threshold

      const eventHour = new Date(event.start_time).getHours();
      const isDuringPrimeHours = (eventHour >= 9 && eventHour < 12) || (eventHour >= 14 && eventHour < 16);

      const contextStatement = generateContextStatement(
        coachContext.mentionContent || null,
        coachContext
      );

      scoredEvents.push({
        calendarEventId: event.id,
        eventTitle: event.title || 'Upcoming Event',
        eventType,
        eventStart: event.start_time,
        eventDurationMinutes: Math.round(durationMinutes),
        attendeeCount: event.attendees_count || 0,
        userIsOrganizer: event.is_organizer || false,
        isRecurring: event.is_recurring || false,
        isDuringPrimeHours,
        minutesUntil: Math.round(minutesUntil),
        urgencyScore,
        scenarioMatchScore,
        accountabilityScore,
        scaleScore,
        contextScore,
        coachBoostScore: coachBoost,
        skipPenalty,
        finalScore: Math.min(finalScore, 120),
        hasCoachContext: coachContext.hasScenario || coachContext.hasMentions || coachContext.hasGoal,
        coachScenario: coachContext.scenario || null,
        coachDimension: coachContext.dimension || null,
        hasPendingTool: coachContext.hasPendingTool,
        expressedConcern: coachContext.expressedConcern,
        contextStatement,
        pillLabel: generatePillLabel(event.title || 'Event', Math.round(minutesUntil)),
        pillType: 'calendar_context',
        scenarioId: scenarioMatch?.scenarioId || null,
        scenarioModules: scenarioMatch?.scenario.modules || null,
      });
    }

    // Sort by score, take top 2
    scoredEvents.sort((a, b) => b.finalScore - a.finalScore);
    const selectedEvents = scoredEvents.slice(0, 2);

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
      })),
      timeOfDayPill: getTimeOfDayPill(timezoneOffset),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[generate-jit-events] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
