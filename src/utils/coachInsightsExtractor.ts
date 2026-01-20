/**
 * Coach Insights Extractor - Client-side utilities for working with extracted coach insights
 * 
 * This module provides:
 * 1. Functions to fetch and filter active coach insights
 * 2. Utilities to match insights to content recommendations
 * 3. Helpers for enhancing theme context with personalized notes
 */

import { supabase } from '@/integrations/supabase/client';

export interface CoachInsight {
  id: string;
  type: 'preference' | 'goal' | 'feedback' | 'challenge';
  content: string;
  contentReference?: string;
  confidence: number;
  extractedAt: Date;
  sourceSessionId?: string;
}

/**
 * Fetch all active coach insights for a user
 */
export async function getActiveCoachInsights(userId: string): Promise<CoachInsight[]> {
  try {
    const { data, error } = await supabase
      .from('user_coach_insights')
      .select('id, insight_type, insight_content, content_reference, confidence_score, extracted_at, source_session_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('extracted_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('[CoachInsights] Error fetching insights:', error);
      return [];
    }

    return (data || []).map(row => ({
      id: row.id,
      type: row.insight_type as CoachInsight['type'],
      content: row.insight_content,
      contentReference: row.content_reference || undefined,
      confidence: row.confidence_score || 0.5,
      extractedAt: new Date(row.extracted_at),
      sourceSessionId: row.source_session_id || undefined
    }));
  } catch (error) {
    console.error('[CoachInsights] Unexpected error:', error);
    return [];
  }
}

/**
 * Get only preference insights (what works for the user)
 */
export function getPreferenceInsights(insights: CoachInsight[]): CoachInsight[] {
  return insights.filter(i => i.type === 'preference' && i.confidence >= 0.7);
}

/**
 * Get goal insights (what the user wants to work on)
 */
export function getGoalInsights(insights: CoachInsight[]): CoachInsight[] {
  return insights.filter(i => i.type === 'goal' && i.confidence >= 0.6);
}

/**
 * Get challenge insights (what the user struggles with)
 */
export function getChallengeInsights(insights: CoachInsight[]): CoachInsight[] {
  return insights.filter(i => i.type === 'challenge' && i.confidence >= 0.6);
}

/**
 * Match insights to content and return a score map
 * Higher scores = better match for recommendations
 */
export function matchInsightsToContent(
  insights: CoachInsight[], 
  contentPool: Array<{ id: string; title: string; tags?: string[] }>
): Map<string, number> {
  const scoreMap = new Map<string, number>();
  
  for (const content of contentPool) {
    let score = 0;
    
    for (const insight of insights) {
      // Direct reference match (+25)
      if (insight.contentReference === content.id) {
        score += 25;
        continue;
      }
      
      // Keyword matching
      const insightWords = insight.content.toLowerCase().split(/\s+/);
      const titleLower = content.title.toLowerCase();
      const tagsLower = content.tags?.map(t => t.toLowerCase()) || [];
      
      for (const word of insightWords) {
        if (word.length <= 3) continue;
        
        // Title match (+10 per word)
        if (titleLower.includes(word)) {
          score += 10;
        }
        
        // Tag match (+5 per word)
        if (tagsLower.some(t => t.includes(word))) {
          score += 5;
        }
      }
    }
    
    if (score > 0) {
      scoreMap.set(content.id, score);
    }
  }
  
  return scoreMap;
}

/**
 * Get a personalized note for the theme context based on coach insights
 * Returns undefined if no relevant insight found
 */
export function getPersonalizedThemeNote(
  insights: CoachInsight[],
  themePhrase: string,
  checkInOutcome: string
): string | undefined {
  // Look for preference insights that match the current context
  const preferences = getPreferenceInsights(insights);
  
  if (preferences.length === 0) return undefined;
  
  // Map check-in outcomes to relevant preference keywords
  const contextKeywords: Record<string, string[]> = {
    overwhelmed: ['breathing', 'calm', 'regulate', 'box breathing', 'grounding', 'reset'],
    drained: ['rest', 'restore', 'energy', 'recovery', 'gentle'],
    scattered: ['focus', 'grounding', 'anchor', 'clarity', 'attention'],
    steady: ['maintain', 'balance', 'sustain', 'rhythm'],
    focused: ['optimize', 'perform', 'flow', 'peak']
  };
  
  const relevantKeywords = contextKeywords[checkInOutcome] || [];
  
  // Find a matching preference
  const matchingPreference = preferences.find(p => {
    const contentLower = p.content.toLowerCase();
    return relevantKeywords.some(kw => contentLower.includes(kw));
  });
  
  if (matchingPreference) {
    return `Based on our conversations, ${matchingPreference.content.toLowerCase()} has been effective for you.`;
  }
  
  // Fall back to most recent high-confidence preference
  const topPreference = preferences[0];
  if (topPreference && topPreference.confidence >= 0.85) {
    return `You've mentioned that ${topPreference.content.toLowerCase()} works well for you.`;
  }
  
  return undefined;
}

/**
 * Format insights for display in UI
 */
export function formatInsightForDisplay(insight: CoachInsight): {
  label: string;
  icon: 'heart' | 'target' | 'lightbulb' | 'alert';
  color: string;
} {
  const formats: Record<CoachInsight['type'], { label: string; icon: 'heart' | 'target' | 'lightbulb' | 'alert'; color: string }> = {
    preference: { label: 'What works', icon: 'heart', color: 'text-rose-500' },
    goal: { label: 'Focus area', icon: 'target', color: 'text-blue-500' },
    feedback: { label: 'Insight', icon: 'lightbulb', color: 'text-amber-500' },
    challenge: { label: 'Growth edge', icon: 'alert', color: 'text-purple-500' }
  };
  
  return formats[insight.type];
}

/**
 * Deactivate old or conflicting insights
 * Called when user provides new contradictory feedback
 */
export async function deactivateInsight(insightId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_coach_insights')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', insightId);
    
    if (error) {
      console.error('[CoachInsights] Error deactivating insight:', error);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('[CoachInsights] Unexpected error:', error);
    return false;
  }
}
