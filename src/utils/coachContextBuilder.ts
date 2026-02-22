/**
 * Coach Context Builder
 * Builds comprehensive user context for the Self Mastery Coach
 * Includes predictive pattern intelligence from calendar + check-in correlations
 */

import { computeEnergyState, type CurrentEnergyState } from './energyStateEngine';
import { supabase } from '@/integrations/supabase/client';

export interface CalendarStateCorrelation {
  eventKeyword: string;
  typicalState: string;
  occurrences: number;
  confidence: number; // 0-1
}

export interface PredictivePatterns {
  todayPrediction?: {
    dayOfWeek: string;
    predictedState: string;
    triggerKeywords: string[];
    confidence: number;
  };
  calendarCorrelations?: CalendarStateCorrelation[];
}

export interface CoachContext {
  // Today's State
  todayState: {
    score: number;
    tier: string;
    outcome?: string;
    contextStatement?: string;
    dataAvailability?: {
      hasCheckin: boolean;
      hasWearable: boolean;
      hasCalendar: boolean;
    };
  };
  
   // Mastery recommendation (from energy state — not outer readiness brief)
   theme?: {
    phrase: string;
    context: string;
    driver?: string;
  };
  
  // JIT Intervention (if active)
  jitContext?: {
    trigger: string;
    eventTitle?: string;
    minutesUntil?: number;
  };
  
  // Performance Plan Status
  planStatus?: {
    completedModules: string[];
    pendingModules: string[];
  };
  
  // Consecutive Pattern (3+ days same low state)
  consecutivePattern?: {
    days: number;
    state: string;
  };
  
  // User Profile
  userArchetype?: string;
  identityRole?: string;
  
  // Recent Practices (last 7 days)
  recentPractices?: string[];
  
  // Time context
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  
  // Insights data for personalization
  insights?: {
    statePatterns?: {
      distribution: Record<string, number>;
      mostCommonState: string;
    };
    tinyWinsThemes?: string[];
    practiceCount: number;
    checkInStreak: number;
  };
  
  // Predictive pattern intelligence
  predictivePatterns?: PredictivePatterns;

  // Probing & Breakthrough context (injected for personalized coaching)
  effectiveProbes?: Array<{
    probe_type: string;
    avg_score: number;
    example_question: string;
    times_used: number;
  }>;
  pastBreakthroughs?: Array<{
    breakthrough_content: string;
    breakthrough_type: string;
    was_acted_on: boolean;
    created_at: string;
  }>;
}

// Get JIT intervention data from localStorage
function getJitInterventionData(): CoachContext['jitContext'] | undefined {
  try {
    const jitData = localStorage.getItem('jitInterventionData');
    if (!jitData) return undefined;
    
    const parsed = JSON.parse(jitData);
    return {
      trigger: parsed.trigger || 'calendar',
      eventTitle: parsed.eventTitle,
      minutesUntil: parsed.minutesUntil
    };
  } catch {
    return undefined;
  }
}

// Get performance plan status from localStorage
function getPlanStatus(): CoachContext['planStatus'] | undefined {
  try {
    const queue = localStorage.getItem('practiceQueue');
    if (!queue) return undefined;
    
    const practices = JSON.parse(queue);
    const completedIds = JSON.parse(localStorage.getItem('completedPracticeIds') || '[]');
    
    return {
      completedModules: completedIds,
      pendingModules: practices
        .filter((p: any) => !completedIds.includes(p.id))
        .map((p: any) => p.title)
    };
  } catch {
    return undefined;
  }
}

// Detect consecutive days in same low-energy state
async function detectConsecutivePattern(
  userId: string,
  currentOutcome?: string
): Promise<CoachContext['consecutivePattern'] | undefined> {
  if (!currentOutcome) return undefined;
  
  const lowEnergyStates = ['overwhelmed', 'drained', 'scattered'];
  if (!lowEnergyStates.includes(currentOutcome)) return undefined;
  
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    
    const { data: checkIns } = await supabase
      .from('daily_checkins')
      .select('checkin_date, outcome')
      .eq('user_id', userId)
      .gte('checkin_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('checkin_date', { ascending: false });
    
    if (!checkIns || checkIns.length < 2) return undefined;
    
    // Count consecutive days with same state
    let consecutiveCount = 0;
    for (const checkIn of checkIns) {
      if (checkIn.outcome === currentOutcome) {
        consecutiveCount++;
      } else {
        break;
      }
    }
    
    if (consecutiveCount >= 3) {
      return {
        days: consecutiveCount,
        state: currentOutcome
      };
    }
    
    return undefined;
  } catch {
    return undefined;
  }
}

// Get recent practices from last 7 days
async function getRecentPractices(userId: string): Promise<string[]> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data } = await supabase
      .from('practice_sessions')
      .select('content_type')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);
    
    return data?.map(s => s.content_type) || [];
  } catch {
    return [];
  }
}

// Get user profile data
async function getUserProfile(userId: string): Promise<{
  archetype?: string;
  identityRole?: string;
} | undefined> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('user_archetype, identity_role')
      .eq('id', userId)
      .single();
    
    return {
      archetype: data?.user_archetype || undefined,
      identityRole: data?.identity_role || undefined
    };
  } catch {
    return undefined;
  }
}

// Get user insights data for coach personalization
async function getUserInsights(userId: string): Promise<CoachContext['insights'] | undefined> {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    // Fetch state patterns (last 7 days)
    const { data: checkIns } = await supabase
      .from('daily_checkins')
      .select('outcome, checkin_date')
      .eq('user_id', userId)
      .gte('checkin_date', sevenDaysAgoStr)
      .order('checkin_date', { ascending: false });
    
    // Calculate state distribution
    const distribution: Record<string, number> = {};
    checkIns?.forEach(c => {
      if (c.outcome) {
        distribution[c.outcome] = (distribution[c.outcome] || 0) + 1;
      }
    });
    
    const mostCommonState = Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'steady';
    
    // Calculate check-in streak
    let streak = 0;
    if (checkIns && checkIns.length > 0) {
      const today = new Date().toLocaleDateString('en-CA');
      let checkDate = today;
      const checkInDates = new Set(checkIns.map(c => c.checkin_date));
      
      for (let i = 0; i < 14; i++) {
        if (checkInDates.has(checkDate)) {
          streak++;
          const d = new Date(checkDate);
          d.setDate(d.getDate() - 1);
          checkDate = d.toLocaleDateString('en-CA');
        } else {
          break;
        }
      }
    }
    
    // Fetch practice count
    const { count: practiceCount } = await supabase
      .from('sanctuary_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'completed')
      .gte('created_at', sevenDaysAgo.toISOString());
    
    // Fetch tiny wins themes (last 14 days)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const { data: wins } = await supabase
      .from('tiny_wins')
      .select('win_content')
      .eq('user_id', userId)
      .gte('win_date', fourteenDaysAgo.toISOString().split('T')[0])
      .order('win_date', { ascending: false })
      .limit(5);
    
    return {
      statePatterns: {
        distribution,
        mostCommonState
      },
      tinyWinsThemes: wins?.map(w => w.win_content.slice(0, 100)),
      practiceCount: practiceCount || 0,
      checkInStreak: streak
    };
  } catch (error) {
    console.error('[coachContextBuilder] Error fetching user insights:', error);
    return undefined;
  }
}

// Fetch probing effectiveness and breakthrough data for coach context
async function getProbingAndBreakthroughData(userId: string): Promise<{
  effectiveProbes: Array<{ probe_type: string; avg_score: number; example_question: string; times_used: number }>;
  pastBreakthroughs: Array<{ breakthrough_content: string; breakthrough_type: string; was_acted_on: boolean; created_at: string }>;
} | undefined> {
  try {
    const [probesResult, breakthroughsResult] = await Promise.all([
      supabase
        .from('coach_probing_effectiveness')
        .select('probe_type, effectiveness_score, probe_question, led_to_insight')
        .eq('user_id', userId)
        .eq('led_to_insight', true)
        .gte('effectiveness_score', 7)
        .order('effectiveness_score', { ascending: false })
        .limit(20),
      supabase
        .from('coach_breakthrough_moments')
        .select('breakthrough_content, breakthrough_type, was_acted_on, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    // Aggregate probes by type
    const probesByType: Record<string, { scores: number[]; questions: string[]; count: number }> = {};
    for (const p of probesResult.data || []) {
      if (!probesByType[p.probe_type]) {
        probesByType[p.probe_type] = { scores: [], questions: [], count: 0 };
      }
      probesByType[p.probe_type].scores.push(p.effectiveness_score || 0);
      probesByType[p.probe_type].questions.push(p.probe_question || '');
      probesByType[p.probe_type].count++;
    }

    const effectiveProbes = Object.entries(probesByType).map(([probe_type, data]) => ({
      probe_type,
      avg_score: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
      example_question: data.questions[0] || '',
      times_used: data.count
    })).sort((a, b) => b.avg_score - a.avg_score).slice(0, 5);

    const pastBreakthroughs = (breakthroughsResult.data || []).map(b => ({
      breakthrough_content: b.breakthrough_content || '',
      breakthrough_type: b.breakthrough_type || '',
      was_acted_on: b.was_acted_on || false,
      created_at: b.created_at || ''
    }));

    return { effectiveProbes, pastBreakthroughs };
  } catch (error) {
    console.error('[coachContextBuilder] Error fetching probing data:', error);
    return undefined;
  }
}

// Get time of day label
function getTimeOfDayLabel(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Build comprehensive coach context for personalized responses
 */
export async function buildCoachContext(userId?: string): Promise<CoachContext> {
  // Get energy state (works without userId too)
  const energyState = await computeEnergyState(userId);
  
  // Use the theme from energy state recommendation (already computed)
  const themeFromState = energyState.recommendation;
  
  // Detect data availability for handling missing inputs
  const hasCheckin = !!energyState.checkInOutcome;
  const hasWearable = energyState.dataSources.includes('wearable');
  const hasCalendar = energyState.dataSources.includes('calendar');
  
  // Base context (always available)
  const context: CoachContext = {
    todayState: {
      score: energyState.overallBalance,
      tier: energyState.energyTier,
      outcome: energyState.checkInOutcome,
      contextStatement: themeFromState?.contextStatement,
      // Add data availability flags for coach awareness
      dataAvailability: {
        hasCheckin,
        hasWearable,
        hasCalendar
      }
    },
    theme: themeFromState ? {
      phrase: `${themeFromState.primary} focus`,
      context: themeFromState.contextStatement || '',
      driver: energyState.checkInOutcome || undefined
    } : undefined,
    jitContext: getJitInterventionData(),
    planStatus: getPlanStatus(),
    timeOfDay: getTimeOfDayLabel()
  };
  
  // Add user-specific data if userId provided
  if (userId) {
    const [profile, recentPractices, consecutivePattern, insights, predictivePatterns, probingData] = await Promise.all([
      getUserProfile(userId),
      getRecentPractices(userId),
      detectConsecutivePattern(userId, energyState.checkInOutcome),
      getUserInsights(userId),
      detectCalendarStateCorrelations(userId),
      getProbingAndBreakthroughData(userId)
    ]);
    
    if (profile) {
      context.userArchetype = profile.archetype;
      context.identityRole = profile.identityRole;
    }
    
    if (recentPractices.length > 0) {
      context.recentPractices = recentPractices;
    }
    
    if (consecutivePattern) {
      context.consecutivePattern = consecutivePattern;
    }
    
    if (insights) {
      context.insights = insights;
    }
    
    if (predictivePatterns) {
      context.predictivePatterns = predictivePatterns;
    }

    if (probingData) {
      if (probingData.effectiveProbes.length > 0) {
        context.effectiveProbes = probingData.effectiveProbes;
      }
      if (probingData.pastBreakthroughs.length > 0) {
        context.pastBreakthroughs = probingData.pastBreakthroughs;
      }
    }
  }
  
  return context;
}

/**
 * Detect calendar-state correlations for predictive coaching
 * Analyzes past 30 days of check-ins + calendar events to find patterns
 * e.g., "Board Meeting days" → "overwhelmed" (85% of time)
 */
async function detectCalendarStateCorrelations(userId: string): Promise<PredictivePatterns | undefined> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    
    // Fetch check-ins and calendar events
    const [checkInsResult, calendarResult] = await Promise.all([
      supabase
        .from('daily_checkins')
        .select('checkin_date, outcome')
        .eq('user_id', userId)
        .gte('checkin_date', thirtyDaysAgoStr)
        .order('checkin_date', { ascending: false }),
      supabase
        .from('calendar_events')
        .select('start_time, title')
        .eq('user_id', userId)
        .gte('start_time', thirtyDaysAgo.toISOString())
    ]);
    
    if (!checkInsResult.data || !calendarResult.data) return undefined;
    
    const checkIns = checkInsResult.data;
    const events = calendarResult.data;
    
    if (checkIns.length < 5 || events.length < 3) return undefined;
    
    // Build correlation map: keyword → { state → count }
    const correlations: Record<string, Record<string, number>> = {};
    const highValueKeywords = ['board', 'quarterly', 'investor', 'all-hands', 'performance', 'review', 'presentation', 'pitch', 'interview', 'negotiation'];
    
    // For each check-in, find events on the same day
    for (const checkIn of checkIns) {
      if (!checkIn.outcome) continue;
      
      const checkInDate = new Date(checkIn.checkin_date).toDateString();
      
      for (const event of events) {
        const eventDate = new Date(event.start_time).toDateString();
        if (eventDate !== checkInDate || !event.title) continue;
        
        // Extract keywords from event title
        const titleLower = event.title.toLowerCase();
        for (const keyword of highValueKeywords) {
          if (titleLower.includes(keyword)) {
            if (!correlations[keyword]) {
              correlations[keyword] = {};
            }
            correlations[keyword][checkIn.outcome] = (correlations[keyword][checkIn.outcome] || 0) + 1;
          }
        }
      }
    }
    
    // Convert to CalendarStateCorrelation array
    const calendarCorrelations: CalendarStateCorrelation[] = [];
    
    for (const [keyword, stateCounts] of Object.entries(correlations)) {
      const total = Object.values(stateCounts).reduce((a, b) => a + b, 0);
      if (total < 2) continue; // Need at least 2 occurrences
      
      // Find most common state for this keyword
      const [typicalState, count] = Object.entries(stateCounts)
        .sort((a, b) => b[1] - a[1])[0];
      
      const confidence = count / total;
      if (confidence >= 0.6) { // Only include if 60%+ consistent
        calendarCorrelations.push({
          eventKeyword: keyword,
          typicalState,
          occurrences: total,
          confidence
        });
      }
    }
    
    if (calendarCorrelations.length === 0) return undefined;
    
    // Check if today matches any pattern
    const today = new Date();
    const dayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' });
    
    // Get today's events
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today);
    todayEnd.setHours(23, 59, 59, 999);
    
    const { data: todayEvents } = await supabase
      .from('calendar_events')
      .select('title')
      .eq('user_id', userId)
      .gte('start_time', todayStart.toISOString())
      .lte('start_time', todayEnd.toISOString());
    
    let todayPrediction: PredictivePatterns['todayPrediction'] | undefined;
    
    if (todayEvents && todayEvents.length > 0) {
      // Check if any of today's events match a known pattern
      for (const event of todayEvents) {
        if (!event.title) continue;
        const titleLower = event.title.toLowerCase();
        
        for (const correlation of calendarCorrelations) {
          if (titleLower.includes(correlation.eventKeyword)) {
            todayPrediction = {
              dayOfWeek,
              predictedState: correlation.typicalState,
              triggerKeywords: [correlation.eventKeyword],
              confidence: correlation.confidence
            };
            break;
          }
        }
        if (todayPrediction) break;
      }
}

/**
 * Fetch probing effectiveness and breakthrough data for context injection
 */
async function getProbingAndBreakthroughData(userId: string) {
  try {
    const [probesResult, breakthroughsResult] = await Promise.all([
      supabase
        .from('coach_probing_effectiveness' as any)
        .select('probe_type, effectiveness_score, probe_question, led_to_insight')
        .eq('user_id', userId)
        .eq('led_to_insight', true)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('coach_breakthrough_moments' as any)
        .select('breakthrough_content, breakthrough_type, was_acted_on, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    // Aggregate probes by type
    const probesByType: Record<string, { scores: number[]; example: string; count: number }> = {};
    if (probesResult.data) {
      for (const p of probesResult.data as any[]) {
        if (!probesByType[p.probe_type]) {
          probesByType[p.probe_type] = { scores: [], example: p.probe_question, count: 0 };
        }
        probesByType[p.probe_type].scores.push(p.effectiveness_score || 5);
        probesByType[p.probe_type].count++;
      }
    }

    const effectiveProbes = Object.entries(probesByType)
      .map(([type, data]) => ({
        probe_type: type,
        avg_score: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
        example_question: data.example,
        times_used: data.count,
      }))
      .filter(p => p.avg_score >= 7)
      .sort((a, b) => b.avg_score - a.avg_score)
      .slice(0, 5);

    const pastBreakthroughs = ((breakthroughsResult.data || []) as any[]).map((b: any) => ({
      breakthrough_content: b.breakthrough_content,
      breakthrough_type: b.breakthrough_type || 'self_awareness',
      was_acted_on: b.was_acted_on || false,
      created_at: b.created_at,
    }));

    return { effectiveProbes, pastBreakthroughs };
  } catch (error) {
    console.error('[coachContextBuilder] Error fetching probing data:', error);
    return { effectiveProbes: [], pastBreakthroughs: [] };
  }
}
    
    return {
      todayPrediction,
      calendarCorrelations
    };
  } catch (error) {
    console.error('[coachContextBuilder] Error detecting calendar correlations:', error);
    return undefined;
  }
}

/**
 * Format context for system prompt injection
 */
export function formatContextForPrompt(context: CoachContext): string {
  const lines: string[] = ['USER CONTEXT:'];
  
  // Today's state
  const stateLabel = context.todayState.outcome || context.todayState.tier;
  lines.push(`- Current State: ${stateLabel} (energy score: ${context.todayState.score}/100)`);
  
  // Theme
  if (context.theme) {
     lines.push(`- Mastery Focus: "${context.theme.phrase}"`);
     lines.push(`- Mastery Context: ${context.theme.context}`);
  }
  
  // JIT intervention
  if (context.jitContext?.eventTitle) {
    lines.push(`- Upcoming Event: "${context.jitContext.eventTitle}" in ${context.jitContext.minutesUntil || '?'} minutes`);
  }
  
  // Consecutive pattern
  if (context.consecutivePattern) {
    lines.push(`- Pattern Alert: Day ${context.consecutivePattern.days} of feeling ${context.consecutivePattern.state}`);
  }
  
  // User archetype
  if (context.userArchetype) {
    lines.push(`- Executive Archetype: ${context.userArchetype}`);
  }
  
  // Plan status - IMPORTANT: Completed protocols section
  if (context.planStatus && context.planStatus.completedModules.length > 0) {
    lines.push('');
    lines.push('=== ALREADY COMPLETED TODAY ===');
    lines.push(`Completed Protocols: ${context.planStatus.completedModules.join(', ')}`);
    lines.push('⚠️ Do NOT recommend these again. Build on what they have done.');
    lines.push('Instead, acknowledge their preparation and move to coaching/strategy.');
  }
  
  // Recent practices
  if (context.recentPractices && context.recentPractices.length > 0) {
    lines.push(`- Recent Practices (7 days): ${context.recentPractices.slice(0, 5).join(', ')}`);
  }
  
  // Data availability awareness
  if (context.todayState.dataAvailability) {
    const { hasCheckin, hasWearable, hasCalendar } = context.todayState.dataAvailability;
    if (!hasCheckin) {
      lines.push('');
      lines.push('⚠️ User has not completed their daily check-in yet. Ask how they are feeling before making state-based recommendations.');
    }
    if (!hasWearable && !hasCalendar) {
      lines.push('- Note: No wearable or calendar data connected. Focus on subjective state and self-reported context.');
    }
  }
  
  // Guidance
  lines.push('');
  lines.push('Use this context to personalize your responses:');
  lines.push('- Reference the theme or state when relevant');
  lines.push('- If they have an upcoming event, help them prepare specifically for it');
  lines.push("- If they've been in a low state for multiple days, acknowledge this pattern gently");
  lines.push('- If they have already completed protocols today, skip recommending the same ones');
  
  return lines.join('\n');
}