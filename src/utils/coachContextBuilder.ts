/**
 * Coach Context Builder
 * Builds comprehensive user context for the Self Mastery Coach
 */

import { computeEnergyState, type CurrentEnergyState } from './energyStateEngine';
import { supabase } from '@/integrations/supabase/client';

export interface CoachContext {
  // Today's State
  todayState: {
    score: number;
    tier: string;
    outcome?: string;
    contextStatement?: string;
  };
  
  // Theme for Today
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
  
  // Base context (always available)
  const context: CoachContext = {
    todayState: {
      score: energyState.overallBalance,
      tier: energyState.energyTier,
      outcome: energyState.checkInOutcome,
      contextStatement: themeFromState?.contextStatement
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
    const [profile, recentPractices, consecutivePattern, insights] = await Promise.all([
      getUserProfile(userId),
      getRecentPractices(userId),
      detectConsecutivePattern(userId, energyState.checkInOutcome),
      getUserInsights(userId)
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
  }
  
  return context;
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
    lines.push(`- Theme for Today: "${context.theme.phrase}"`);
    lines.push(`- Theme Context: ${context.theme.context}`);
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
  
  // Plan status
  if (context.planStatus && context.planStatus.completedModules.length > 0) {
    lines.push(`- Completed Today: ${context.planStatus.completedModules.join(', ')}`);
  }
  
  // Guidance
  lines.push('');
  lines.push('Use this context to personalize your responses:');
  lines.push('- Reference the theme or state when relevant');
  lines.push('- If they have an upcoming event, help them prepare specifically for it');
  lines.push("- If they've been in a low state for multiple days, acknowledge this pattern gently");
  
  return lines.join('\n');
}