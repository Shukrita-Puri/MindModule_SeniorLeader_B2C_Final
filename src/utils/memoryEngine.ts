// Memory Engine - Analyzes user patterns from sanctuary events

import { supabase } from "@/integrations/supabase/client";

export interface UserEnergyProfile {
  bestPracticeTimes: string[];
  preferredContentTypes: {
    contentType: string;
    frequency: number;
    avgEffectiveness: number;
  }[];
  energyPatterns: {
    timeOfDay: string;
    avgBalance: number;
    dominantState: string;
  }[];
  effectivenessByCategory: {
    category: string;
    avgEffectiveness: number;
    totalSessions: number;
  }[];
  topTriggers: string[];
  topRestorers: string[];
}

export async function analyzeUserPatterns(): Promise<UserEnergyProfile | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    
    // Get sanctuary events from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    const { data: events, error } = await supabase
      .from('sanctuary_events')
      .select('*')
      .eq('user_id', user.id)
      .gte('timestamp', ninetyDaysAgo.toISOString())
      .eq('event_type', 'session_complete');
    
    if (error || !events || events.length === 0) {
      console.log('No sanctuary events found for pattern analysis');
      return getDefaultProfile();
    }
    
    // Analyze best practice times
    const timeFrequency: Record<string, number> = {};
    events.forEach(event => {
      const time = (event.context_data as any)?.timeOfDay || 'unknown';
      timeFrequency[time] = (timeFrequency[time] || 0) + 1;
    });
    
    const bestPracticeTimes = Object.entries(timeFrequency)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([time]) => time);
    
    // Analyze preferred content types
    const contentTypeStats: Record<string, { count: number; totalEffectiveness: number }> = {};
    events.forEach(event => {
      const type = event.content_type;
      if (!contentTypeStats[type]) {
        contentTypeStats[type] = { count: 0, totalEffectiveness: 0 };
      }
      contentTypeStats[type].count++;
      contentTypeStats[type].totalEffectiveness += event.effectiveness_rating || 3;
    });
    
    const preferredContentTypes = Object.entries(contentTypeStats).map(([type, stats]) => ({
      contentType: type,
      frequency: stats.count,
      avgEffectiveness: stats.totalEffectiveness / stats.count
    }));
    
    // Analyze energy patterns by time of day
    const timeEnergyMap: Record<string, { states: string[]; balances: number[] }> = {};
    events.forEach(event => {
      const time = (event.context_data as any)?.timeOfDay || 'unknown';
      const state = (event.context_data as any)?.energyState || 'unknown';
      const balance = 70; // Would calculate from actual data
      
      if (!timeEnergyMap[time]) {
        timeEnergyMap[time] = { states: [], balances: [] };
      }
      timeEnergyMap[time].states.push(state);
      timeEnergyMap[time].balances.push(balance);
    });
    
    const energyPatterns = Object.entries(timeEnergyMap).map(([time, data]) => ({
      timeOfDay: time,
      avgBalance: data.balances.reduce((a, b) => a + b, 0) / data.balances.length,
      dominantState: mostFrequent(data.states)
    }));
    
    // Analyze effectiveness by category
    const categoryStats: Record<string, { count: number; totalEffectiveness: number }> = {};
    events.forEach(event => {
      const cat = event.category;
      if (!categoryStats[cat]) {
        categoryStats[cat] = { count: 0, totalEffectiveness: 0 };
      }
      categoryStats[cat].count++;
      categoryStats[cat].totalEffectiveness += event.effectiveness_rating || 3;
    });
    
    const effectivenessByCategory = Object.entries(categoryStats).map(([cat, stats]) => ({
      category: cat,
      avgEffectiveness: stats.totalEffectiveness / stats.count,
      totalSessions: stats.count
    }));
    
    return {
      bestPracticeTimes,
      preferredContentTypes,
      energyPatterns,
      effectivenessByCategory,
      topTriggers: ['High meeting density', 'Back-to-back calls', 'Low recovery'], // Would calculate from actual data
      topRestorers: ['Morning soundbaths', 'Grounding practices', 'Evening wind-down'] // Would calculate from actual data
    };
    
  } catch (error) {
    console.error('Error analyzing user patterns:', error);
    return getDefaultProfile();
  }
}

function mostFrequent(arr: string[]): string {
  const frequency: Record<string, number> = {};
  arr.forEach(item => {
    frequency[item] = (frequency[item] || 0) + 1;
  });
  return Object.entries(frequency).sort(([, a], [, b]) => b - a)[0]?.[0] || 'unknown';
}

function getDefaultProfile(): UserEnergyProfile {
  return {
    bestPracticeTimes: ['morning', 'evening'],
    preferredContentTypes: [],
    energyPatterns: [],
    effectivenessByCategory: [],
    topTriggers: [],
    topRestorers: []
  };
}

export async function getUserEnergyProfile(): Promise<UserEnergyProfile> {
  const profile = await analyzeUserPatterns();
  return profile || getDefaultProfile();
}
