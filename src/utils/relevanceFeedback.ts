import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";

export type FeedbackType = 'star_rating' | 'thumbs_up' | 'thumbs_down' | 'report_issue';

interface RelevanceFeedbackData {
  contentId: string;
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice';
  feedbackType: FeedbackType;
  starRating?: number;
  sessionId?: string;
  triggerContext?: string;
  feedbackText?: string;
  feedbackReason?: string;
  contextData?: Record<string, any>;
}

const feedbackSchema = z.object({
  contentId: z.string(),
  contentType: z.enum(['soundbath', 'guided-practice', 'micro-practice']),
  feedbackType: z.enum(['star_rating', 'thumbs_up', 'thumbs_down', 'report_issue']),
  starRating: z.number().min(1).max(5).optional(),
  sessionId: z.string().uuid().optional(),
  triggerContext: z.string().optional(),
  feedbackText: z.string().max(500).optional(),
  feedbackReason: z.string().optional(),
  contextData: z.record(z.any()).optional(),
});

export async function submitRelevanceFeedback(feedback: RelevanceFeedbackData) {
  try {
    const validated = feedbackSchema.parse(feedback);
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) return { success: false, error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('content_relevance_feedback')
      .insert({
        user_id: user.id,
        content_id: validated.contentId,
        content_type: validated.contentType,
        feedback_type: validated.feedbackType,
        star_rating: validated.starRating,
        session_id: validated.sessionId,
        trigger_context: validated.triggerContext,
        feedback_text: validated.feedbackText,
        feedback_reason: validated.feedbackReason,
        timestamp: new Date().toISOString(),
        context_data: validated.contextData || {}
      });

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to submit relevance feedback:', error);
    }
    return { success: false, error };
  }
}

/**
 * Submit post-practice star rating
 * Saves to both practice_sessions (effectiveness_rating) and content_relevance_feedback tables
 */
export async function submitPracticeRating(
  sessionId: string | undefined,
  contentId: string,
  contentType: 'soundbath' | 'guided-practice' | 'micro-practice',
  rating: number,
  feedback?: string
) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: new Error('Not authenticated') };

    // Map star rating to qualitative feedback
    const qualitativeRating = mapRatingToQualitative(rating);

    // Update practice_sessions if sessionId exists
    if (sessionId) {
      const { error: sessionError } = await supabase
        .from('practice_sessions')
        .update({
          effectiveness_rating: rating,
          metadata: {
            qualitative_rating: qualitativeRating,
            feedback_text: feedback
          }
        })
        .eq('id', sessionId)
        .eq('user_id', user.id);

      if (sessionError) {
        console.error('Failed to update practice session:', sessionError);
      }
    }

    // Save to content_relevance_feedback
    const feedbackResult = await submitRelevanceFeedback({
      contentId,
      contentType,
      feedbackType: 'star_rating',
      starRating: rating,
      sessionId,
      feedbackText: feedback,
      feedbackReason: qualitativeRating,
      triggerContext: 'post_practice_completion'
    });

    return feedbackResult;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to submit practice rating:', error);
    }
    return { success: false, error };
  }
}

/**
 * Map star rating to qualitative feedback categories
 */
function mapRatingToQualitative(rating: number): string {
  const ratingMap: Record<number, string> = {
    5: 'highly_effective',
    4: 'effective',
    3: 'neutral',
    2: 'somewhat_ineffective',
    1: 'not_helpful'
  };
  return ratingMap[rating] || 'neutral';
}
