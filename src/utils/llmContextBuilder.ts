import { supabase } from "@/integrations/supabase/client";
import type { CurrentEnergyState } from "./energyStateEngine";

export interface UserContext {
  // Immediate State
  currentBalance: number;
  currentState: string;
  checkInOutcome?: string;
  calendarDensity: number;
  timeOfDay: number;
  timeLabel: 'morning' | 'afternoon' | 'evening' | 'night';
  dataSources?: string[];
  
  // User Profile
  archetype?: string;
  identityRole?: string;
  biggestPressure?: string;
  growthPriority?: string;
  
  // Short-term Memory (last 7 days)
  recentPractices: Array<{
    type: string;
    effectiveness?: number;
    timestamp: string;
  }>;
  
  // Circadian Patterns
  peakWindows?: string[];
  dipWindows?: string[];
  
  // Meta Skills Focus
  metaSkillFocus: 'self_regulation'; // Currently only self-regulation for MVP
  subSkillsInPlay: string[]; // e.g., ['emotional_awareness', 'focus', 'discipline']
}

export async function buildUserContext(
  energyState: CurrentEnergyState,
  userId?: string
): Promise<UserContext> {
  const hour = new Date().getHours();
  const timeLabel = getTimeLabel(hour);
  
  // Fetch user profile if userId provided
  let profile = null;
  if (userId) {
    const { data } = await supabase
      .from('profiles')
      .select('user_archetype, identity_role, biggest_pressure, growth_priority')
      .eq('id', userId)
      .single();
    profile = data;
  }
  
  // Fetch recent practices (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  
  let sessions = [];
  if (userId) {
    const { data } = await supabase
      .from('practice_sessions')
      .select('content_type, effectiveness_rating, created_at')
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);
    sessions = data || [];
  }
  
  const recentPractices = sessions.map(s => ({
    type: s.content_type,
    effectiveness: s.effectiveness_rating,
    timestamp: s.created_at
  }));
  
  // Determine sub-skills based on current state and priority
  const subSkillsInPlay = deriveSubSkills(energyState.recommendationPriority);
  
  return {
    currentBalance: energyState.overallBalance,
    currentState: energyState.state,
    checkInOutcome: energyState.checkInOutcome,
    calendarDensity: energyState.calendarDensity || 0,
    timeOfDay: hour,
    timeLabel,
    dataSources: energyState.dataSources || ['checkin', 'circadian'],
    archetype: profile?.user_archetype,
    identityRole: profile?.identity_role,
    biggestPressure: profile?.biggest_pressure,
    growthPriority: profile?.growth_priority,
    recentPractices,
    metaSkillFocus: 'self_regulation',
    subSkillsInPlay
  };
}

function getTimeLabel(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

function deriveSubSkills(priority: string): string[] {
  const skillMap: Record<string, string[]> = {
    'rest': ['emotional_awareness', 'self_compassion', 'energy_management'],
    'restore': ['emotional_regulation', 'mindfulness', 'attention_management'],
    'activate': ['self_motivation', 'focus', 'discipline'],
    'maintain': ['attention_control', 'cognitive_flexibility', 'task_switching'],
    'ground': ['emotional_regulation', 'mindfulness', 'self_awareness'],
    'center_focus': ['focus', 'attention_control', 'concentration'],
    'calm_cool': ['emotional_regulation', 'stress_management', 'self_awareness'],
    'restore_energize': ['energy_management', 'self_motivation', 'emotional_regulation']
  };
  return skillMap[priority] || ['self_awareness'];
}
