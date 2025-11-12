import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export type InterventionEventType = 'nudge_sent' | 'nudge_clicked' | 'nudge_dismissed' | 'nudge_ignored';

interface InterventionEventData {
  eventType: InterventionEventType;
  interventionId: string;
  interventionType: string;
  triggerEventId?: string;
  triggerReason?: string;
  timingWindow?: string;
  urgencyLevel?: 'critical' | 'high' | 'medium' | 'low';
  recommendedContentId?: string;
  recommendedContentType?: string;
  timeToActionSeconds?: number;
  dismissedReason?: string;
  contextData?: Record<string, any>;
}

const interventionEventSchema = z.object({
  eventType: z.enum(['nudge_sent', 'nudge_clicked', 'nudge_dismissed', 'nudge_ignored']),
  interventionId: z.string(),
  interventionType: z.string(),
  triggerEventId: z.string().optional(),
  triggerReason: z.string().optional(),
  timingWindow: z.string().optional(),
  urgencyLevel: z.enum(['critical', 'high', 'medium', 'low']).optional(),
  recommendedContentId: z.string().optional(),
  recommendedContentType: z.string().optional(),
  timeToActionSeconds: z.number().positive().optional(),
  dismissedReason: z.string().optional(),
  contextData: z.record(z.any()).optional(),
});

export async function trackInterventionEvent(event: InterventionEventData) {
  try {
    const validated = interventionEventSchema.parse(event);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return { success: false, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('micro_intervention_events')
      .insert({
        user_id: user.id,
        event_type: validated.eventType,
        intervention_id: validated.interventionId,
        intervention_type: validated.interventionType,
        trigger_event_id: validated.triggerEventId,
        trigger_reason: validated.triggerReason,
        timing_window: validated.timingWindow,
        urgency_level: validated.urgencyLevel,
        recommended_content_id: validated.recommendedContentId,
        recommended_content_type: validated.recommendedContentType,
        time_to_action_seconds: validated.timeToActionSeconds,
        dismissed_reason: validated.dismissedReason,
        timestamp: new Date().toISOString(),
        context_data: validated.contextData || {}
      });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to track intervention event:', error);
    }
    return { success: false, error };
  }
}

/**
 * Get intervention analytics for internal product intelligence
 * NOT displayed to users - for ML training and product decisions only
 */
export async function getInterventionAnalytics(userId: string, days: number = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('micro_intervention_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', since.toISOString());

  if (error || !data) return null;

  // Calculate hidden metrics
  const sent = data.filter(e => e.event_type === 'nudge_sent').length;
  const clicked = data.filter(e => e.event_type === 'nudge_clicked').length;
  const ignored = data.filter(e => e.event_type === 'nudge_ignored').length;

  const responseRate = sent > 0 ? (clicked / sent * 100) : 0;

  // Find best timing window
  const clickedEvents = data.filter(e => e.event_type === 'nudge_clicked');
  const timingCounts: Record<string, number> = {};
  clickedEvents.forEach(e => {
    if (e.timing_window) {
      timingCounts[e.timing_window] = (timingCounts[e.timing_window] || 0) + 1;
    }
  });
  const bestTiming = Object.keys(timingCounts).reduce((a, b) => 
    timingCounts[a] > timingCounts[b] ? a : b, ''
  );

  // Find ignored event types
  const ignoredEvents = data.filter(e => e.event_type === 'nudge_ignored');
  const ignoredTypes: Record<string, number> = {};
  ignoredEvents.forEach(e => {
    if (e.intervention_type) {
      ignoredTypes[e.intervention_type] = (ignoredTypes[e.intervention_type] || 0) + 1;
    }
  });

  return {
    nudges_sent: sent,
    nudges_acted_on: clicked,
    response_rate: responseRate,
    best_timing: bestTiming || 'Not enough data',
    ignored_event_types: Object.keys(ignoredTypes).filter(t => ignoredTypes[t] >= 2) // Ignored 2+ times
  };
}
