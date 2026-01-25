/**
 * Coach Learning Engine
 * Tracks and learns from intervention outcomes to personalize coaching
 */

import { supabase } from '@/integrations/supabase/client';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

export type InterventionType = 'protocol_recommendation' | 'reframe' | 'wisdom_quote' | 'grounding_technique';
export type UserResponseType = 'accepted' | 'completed' | 'dismissed' | 'partial';

export interface InterventionOutcome {
  interventionType: InterventionType;
  interventionContent: string;
  contentId?: string;
  contentType?: string;
  userResponseType?: UserResponseType;
  effectivenessRating?: number;
  contextState: string;
  contextTags: string[];
}

export interface InterventionPreferences {
  preferredTypes: { type: string; successRate: number }[];
  preferredContent: { contentId: string; weight: number; title?: string }[];
  avoidPatterns: { pattern: string; reason: string }[];
}

/**
 * Track when the coach gives an intervention (protocol recommendation, reframe, etc.)
 */
export async function trackInterventionGiven(
  userId: string,
  sessionId: string,
  intervention: InterventionOutcome
): Promise<string | null> {
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
  
  try {
    const { data, error } = await supabase
      .from('coach_intervention_outcomes')
      .insert({
        user_id: effectiveUserId,
        session_id: sessionId,
        intervention_type: intervention.interventionType,
        intervention_content: intervention.interventionContent,
        content_id: intervention.contentId,
        content_type: intervention.contentType,
        user_response_type: intervention.userResponseType || null,
        context_state: intervention.contextState,
        context_tags: intervention.contextTags,
        success_weight: 1.0 // Default weight, updated based on outcomes
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('[CoachLearning] Error tracking intervention:', error);
      return null;
    }
    
    console.log('[CoachLearning] Intervention tracked:', intervention.interventionType);
    return data?.id || null;
  } catch (err) {
    console.error('[CoachLearning] trackInterventionGiven error:', err);
    return null;
  }
}

/**
 * Update an intervention with user's response (accepted, completed, dismissed)
 */
export async function trackInterventionResponse(
  interventionId: string,
  responseType: UserResponseType,
  rating?: number
): Promise<boolean> {
  try {
    // Calculate new success weight based on response
    let successWeight = 1.0;
    switch (responseType) {
      case 'completed':
        successWeight = rating ? (1.0 + (rating / 10)) : 1.5; // Boost for completion
        break;
      case 'accepted':
        successWeight = 1.2; // Slight boost for acceptance
        break;
      case 'partial':
        successWeight = 0.9; // Slight decrease for partial engagement
        break;
      case 'dismissed':
        successWeight = 0.5; // Significant decrease for dismissal
        break;
    }
    
    const { error } = await supabase
      .from('coach_intervention_outcomes')
      .update({
        user_response_type: responseType,
        effectiveness_rating: rating,
        success_weight: successWeight,
        updated_at: new Date().toISOString()
      })
      .eq('id', interventionId);
    
    if (error) {
      console.error('[CoachLearning] Error updating intervention response:', error);
      return false;
    }
    
    console.log('[CoachLearning] Response tracked:', responseType, 'weight:', successWeight);
    return true;
  } catch (err) {
    console.error('[CoachLearning] trackInterventionResponse error:', err);
    return false;
  }
}

/**
 * Get weighted intervention preferences for a user
 * Returns what works best and what to avoid
 */
export async function getInterventionPreferences(userId: string): Promise<InterventionPreferences> {
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
  
  const defaultPrefs: InterventionPreferences = {
    preferredTypes: [],
    preferredContent: [],
    avoidPatterns: []
  };
  
  try {
    const { data, error } = await supabase
      .from('coach_intervention_outcomes')
      .select('intervention_type, content_id, content_type, user_response_type, success_weight, context_state')
      .eq('user_id', effectiveUserId)
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error || !data || data.length === 0) {
      return defaultPrefs;
    }
    
    // Aggregate by intervention type
    const typeStats = new Map<string, { total: number; weightSum: number }>();
    data.forEach(row => {
      const type = row.intervention_type;
      const existing = typeStats.get(type) || { total: 0, weightSum: 0 };
      typeStats.set(type, {
        total: existing.total + 1,
        weightSum: existing.weightSum + (row.success_weight || 1)
      });
    });
    
    const preferredTypes = Array.from(typeStats.entries())
      .map(([type, stats]) => ({
        type,
        successRate: stats.weightSum / stats.total
      }))
      .sort((a, b) => b.successRate - a.successRate);
    
    // Aggregate by content
    const contentStats = new Map<string, { total: number; weightSum: number }>();
    data.filter(row => row.content_id).forEach(row => {
      const id = row.content_id!;
      const existing = contentStats.get(id) || { total: 0, weightSum: 0 };
      contentStats.set(id, {
        total: existing.total + 1,
        weightSum: existing.weightSum + (row.success_weight || 1)
      });
    });
    
    const preferredContent = Array.from(contentStats.entries())
      .map(([contentId, stats]) => ({
        contentId,
        weight: stats.weightSum / stats.total
      }))
      .filter(item => item.weight > 1.0) // Only include successful content
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 10);
    
    // Find patterns to avoid (consistently dismissed interventions)
    const avoidPatterns: { pattern: string; reason: string }[] = [];
    const dismissedByType = new Map<string, number>();
    data.filter(row => row.user_response_type === 'dismissed').forEach(row => {
      const count = (dismissedByType.get(row.intervention_type) || 0) + 1;
      dismissedByType.set(row.intervention_type, count);
    });
    
    dismissedByType.forEach((count, type) => {
      if (count >= 3) {
        avoidPatterns.push({
          pattern: type,
          reason: `Dismissed ${count} times - may not resonate with user`
        });
      }
    });
    
    return { preferredTypes, preferredContent, avoidPatterns };
  } catch (err) {
    console.error('[CoachLearning] getInterventionPreferences error:', err);
    return defaultPrefs;
  }
}

/**
 * Update success weights based on follow-up state improvements
 * Called after check-ins to see if previous interventions helped
 */
export async function updateSuccessWeightsFromCheckIn(
  userId: string,
  newState: string
): Promise<void> {
  const effectiveUserId = DEV_MODE ? DEV_USER.id : userId;
  
  try {
    // Get interventions from last 24 hours that were accepted/completed
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: recentInterventions, error } = await supabase
      .from('coach_intervention_outcomes')
      .select('id, context_state, success_weight')
      .eq('user_id', effectiveUserId)
      .gte('created_at', oneDayAgo)
      .in('user_response_type', ['accepted', 'completed']);
    
    if (error || !recentInterventions || recentInterventions.length === 0) return;
    
    // Positive states indicate improvement
    const positiveStates = ['focused', 'steady', 'peak', 'strong'];
    const isImprovement = positiveStates.includes(newState);
    
    // Update weights based on whether state improved
    for (const intervention of recentInterventions) {
      const contextWasNegative = !positiveStates.includes(intervention.context_state || '');
      
      if (contextWasNegative && isImprovement) {
        // State improved after intervention - boost weight
        await supabase
          .from('coach_intervention_outcomes')
          .update({
            follow_up_state: newState,
            success_weight: Math.min(2.0, (intervention.success_weight || 1) * 1.2),
            updated_at: new Date().toISOString()
          })
          .eq('id', intervention.id);
      } else if (!contextWasNegative && !isImprovement) {
        // State declined - slight decrease
        await supabase
          .from('coach_intervention_outcomes')
          .update({
            follow_up_state: newState,
            success_weight: Math.max(0.3, (intervention.success_weight || 1) * 0.9),
            updated_at: new Date().toISOString()
          })
          .eq('id', intervention.id);
      }
    }
    
    console.log('[CoachLearning] Updated weights based on check-in:', newState);
  } catch (err) {
    console.error('[CoachLearning] updateSuccessWeightsFromCheckIn error:', err);
  }
}

/**
 * Get learned content weights for performance plan generation
 * Returns a map of contentId -> weight boost
 */
export async function getLearnedContentWeights(userId: string): Promise<Map<string, number>> {
  const weights = new Map<string, number>();
  
  try {
    const prefs = await getInterventionPreferences(userId);
    
    prefs.preferredContent.forEach(item => {
      // Convert success rate to weight boost (max +35)
      const boost = Math.min(35, Math.round((item.weight - 1) * 50));
      if (boost > 0) {
        weights.set(item.contentId, boost);
      }
    });
    
    return weights;
  } catch (err) {
    console.error('[CoachLearning] getLearnedContentWeights error:', err);
    return weights;
  }
}
