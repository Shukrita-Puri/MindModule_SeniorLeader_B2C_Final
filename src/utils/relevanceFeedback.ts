import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { getAuthToken } from '@/services/authTokenService';

// Patterns that indicate reflection-worthy content
const REFLECTION_PATTERNS = [
  /i noticed/i,
  /i realized/i,
  /i learned/i,
  /helped me/i,
  /i felt/i,
  /gave me/i,
  /i appreciated/i,
  /i discovered/i,
  /shifted my/i,
  /i understood/i,
  /this practice/i,
  /i was able to/i,
  /breakthrough/i,
];

function isReflectionContent(text: string): boolean {
  if (!text || text.length < 20) return false;
  return REFLECTION_PATTERNS.some(pattern => pattern.test(text));
}

async function storeFeedbackAsWin(
  feedbackText: string,
  contentId: string,
  contentType: string
): Promise<void> {
  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return;

    await supabase.functions.invoke('store-tiny-win', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        winContent: feedbackText,
        source: 'practice_reflection',
        practiceId: contentId,
        practiceType: contentType,
      },
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to store feedback as win:', error);
    }
  }
}

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
    const accessToken = await getAuthToken();
    
    if (!accessToken) return { success: false, error: new Error('Not authenticated') };

    // Route through content-feedback edge function (Auth0 token → service role write)
    const { data: result, error } = await supabase.functions.invoke('content-feedback', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'SUBMIT_FEEDBACK',
        feedbackData: {
          content_id: validated.contentId,
          content_type: validated.contentType,
          feedback_type: validated.feedbackType,
          star_rating: validated.starRating,
          session_id: validated.sessionId,
          trigger_context: validated.triggerContext,
          feedback_text: validated.feedbackText,
          feedback_reason: validated.feedbackReason,
          context_data: validated.contextData || {}
        }
      }
    });

    if (error) throw error;

    // Also store reflection-like feedback as a tiny win for pattern analysis
    if (validated.feedbackText && isReflectionContent(validated.feedbackText)) {
      await storeFeedbackAsWin(
        validated.feedbackText,
        validated.contentId,
        validated.contentType
      );
    }

    return { success: true, data: result?.data };
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
    const accessToken = await getAuthToken();
    if (!accessToken) return { success: false, error: new Error('Not authenticated') };

    // Map star rating to qualitative feedback
    const qualitativeRating = mapRatingToQualitative(rating);

    // Update practice_sessions rating via edge function (RLS blocks direct client writes)
    if (sessionId) {
      try {
        await supabase.functions.invoke('content-feedback', {
          headers: { Authorization: `Bearer ${accessToken}` },
          body: {
            action: 'UPDATE_SESSION_RATING',
            sessionId,
            rating,
            qualitativeRating,
            feedbackText: feedback
          }
        });
      } catch (e) {
        console.error('Failed to update practice session rating:', e);
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
