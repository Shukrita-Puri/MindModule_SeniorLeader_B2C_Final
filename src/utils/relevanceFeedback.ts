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
 * Writes ONLY to content_relevance_feedback (CRF) — the single source of truth
 * for all Brief, Plan, and Practice feedback. The legacy dual-write to
 * practice_sessions.effectiveness_rating has been removed.
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

    // Save to content_relevance_feedback — the canonical feedback store.
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
 * Submit plan-level feedback (distinct from practice feedback)
 * Uses trigger_context='post_plan_completion' so plan feedback is queryable separately
 */
export async function submitPlanFeedback(
  planType: 'tod' | 'jit',
  rating: number,
  feedback?: string,
  energyTier?: string
) {
  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return { success: false, error: new Error('Not authenticated') };

    const qualitativeRating = mapRatingToQualitative(rating);

    const { data: result, error } = await supabase.functions.invoke('content-feedback', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'SUBMIT_FEEDBACK',
        feedbackData: {
          content_id: `plan-${planType}`,
          content_type: `plan-${planType}`,
          feedback_type: 'star_rating',
          star_rating: rating,
          trigger_context: 'post_plan_completion',
          feedback_text: feedback,
          feedback_reason: qualitativeRating,
          context_data: {
            feedback_scope: 'plan',
            plan_type: planType,
            energy_tier: energyTier,
          }
        }
      }
    });

    if (error) throw error;

    // Also store reflection-like feedback as a tiny win
    if (feedback && isReflectionContent(feedback)) {
      await storeFeedbackAsWin(feedback, `plan-${planType}`, `plan-${planType}`);
    }

    return { success: true, data: result?.data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to submit plan feedback:', error);
    }
    return { success: false, error };
  }
}

/**
 * Attribute a completed plan-slot rating to EVERY practice in that slot.
 *
 * A slot can hold one, two or more practices; the slot rating applies to all
 * of them. This writes one `content_relevance_feedback` row per practice, in
 * addition to the plan-level row written by `submitPlanFeedback`, so the
 * impact engine (which keys on `content_id`) picks each practice up.
 *
 * Existing columns only — no schema change.
 */
export async function submitPlanSlotPracticeFeedback(args: {
  planType: 'tod' | 'jit';
  slotIndex: number;
  slotLabel?: string | null;
  rating: number;
  feedback?: string;
  practices: Array<{ contentId: string; contentType?: string | null; title?: string | null }>;
}) {
  const practices = (args.practices || []).filter((p) => !!p?.contentId);
  if (practices.length === 0) return { success: true, written: 0 };

  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return { success: false, error: new Error('Not authenticated') };

    const qualitativeRating = mapRatingToQualitative(args.rating);
    const slotContentIds = practices.map((p) => p.contentId);
    const dateKey = new Date().toLocaleDateString('en-CA');
    const readTiming = (contentId: string) => {
      try {
        if (typeof window === 'undefined') return null;
        const raw = window.localStorage.getItem('practiceCompletionTiming');
        if (!raw) return null;
        const timings = JSON.parse(raw);
        return timings?.[`${contentId}|${dateKey}`] || null;
      } catch {
        return null;
      }
    };

    const results = await Promise.allSettled(
      practices.map((practice) => {
        const timing = readTiming(practice.contentId);
        return supabase.functions.invoke('content-feedback', {
            headers: { Authorization: `Bearer ${accessToken}` },
            body: {
              action: 'SUBMIT_FEEDBACK',
              feedbackData: {
                content_id: practice.contentId,
                content_type: normalisePracticeContentType(practice.contentType),
                feedback_type: 'star_rating',
                star_rating: args.rating,
                trigger_context: 'post_plan_completion',
                feedback_text: args.feedback,
                feedback_reason: qualitativeRating,
                context_data: {
                  feedback_scope: 'plan_slot_practice',
                  plan_type: args.planType,
                  plan_slot_index: args.slotIndex,
                  slot_label: args.slotLabel ?? null,
                  slot_content_ids: slotContentIds,
                  slot_practice_count: slotContentIds.length,
                  local_date: dateKey,
                  practice_started_at: timing?.practice_started_at ?? null,
                  practice_completed_at: timing?.practice_completed_at ?? null,
                  session_period: timing?.session_period ?? null,
                },
              },
            },
          });
      }),
    );

    const written = results.filter((r) => r.status === 'fulfilled' && !(r.value as any)?.error).length;
    return { success: written > 0, written };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to submit plan slot practice feedback:', error);
    }
    return { success: false, error };
  }
}

/** Map plan practice content types onto the canonical feedback content types. */
function normalisePracticeContentType(raw?: string | null): string {
  const value = (raw || '').toLowerCase();
  if (value.includes('sound')) return 'soundbath';
  if (value.includes('guided')) return 'guided-practice';
  if (value.includes('micro') || value.includes('exercise')) return 'micro-practice';
  return value || 'micro-practice';
}

/**
 * Check if the current practice is the last item in the active plan queue
 */
export function isLastPracticeInPlan(practiceId: string | undefined): boolean {
  if (!practiceId) return false;
  try {
    const queue = JSON.parse(localStorage.getItem('practiceQueue') || 'null');
    if (!Array.isArray(queue) || queue.length === 0) return false;
    const idx = queue.findIndex((p: any) => p.id === practiceId);
    return idx === queue.length - 1;
  } catch {
    return false;
  }
}

/**
 * Set plan feedback flag with timestamp for staleness detection.
 *
 * When `entryRoute === '/plan'`, this is a no-op — the Plan page (TodayThreePriorities)
 * already shows a per-priority feedback modal as soon as a slot completes. Setting the
 * global flag would cause ExecutiveHome to surface a duplicate plan-level modal on the
 * next home visit. Each Today priority owns its own feedback loop.
 */
export function setPlanFeedbackFlag(planType: 'tod' | 'jit', entryRoute?: string) {
  if (entryRoute === '/plan') return;
  localStorage.setItem('showPlanFeedback', JSON.stringify({
    planType,
    timestamp: Date.now()
  }));
}

/**
 * Mark the active plan complete and queue plan feedback for the next home return.
 * Keeps JIT data intact so callers can still route into Coach before landing home.
 *
 * Pass `entryRoute` so that completions originating from `/plan` skip the global
 * homepage feedback modal — TodayThreePriorities owns per-priority feedback there.
 */
export function markPlanCompleteForFeedback(entryRoute?: string): { planType: 'tod' | 'jit' } {
  const ritualMode = localStorage.getItem('ritualMode');
  const jitData = localStorage.getItem('jitInterventionData');
  const planType: 'tod' | 'jit' = (ritualMode === 'jit' || jitData) ? 'jit' : 'tod';

  setPlanFeedbackFlag(planType, entryRoute);
  localStorage.removeItem('practiceQueue');
  localStorage.removeItem('ritualMode');

  return { planType };
}

/**
 * Read and consume plan feedback flag (returns null if stale >5min or absent)
 */
export function consumePlanFeedbackFlag(): { planType: 'tod' | 'jit' } | null {
  const raw = localStorage.getItem('showPlanFeedback');
  if (!raw) return null;
  localStorage.removeItem('showPlanFeedback');
  try {
    const parsed = JSON.parse(raw);
    // Expire if older than 5 minutes
    if (parsed.timestamp && Date.now() - parsed.timestamp > 5 * 60 * 1000) {
      return null;
    }
    return { planType: parsed.planType || 'tod' };
  } catch {
    return null;
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

/**
 * Submit Performance Readiness Brief feedback (non-intrusive inline thumbs row)
 * Maps up→5, neutral→3, down→1. Fire-and-forget — no toasts, no spinners.
 */
export async function submitBriefFeedback(
  rating: 'up' | 'neutral' | 'down',
  feedback?: string,
  briefSnapshotId?: string,
  extraContext?: { tier?: string; score?: number }
) {
  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return { success: false, error: new Error('Not authenticated') };

    const star = rating === 'up' ? 5 : rating === 'neutral' ? 3 : 1;
    const qualitativeRating = mapRatingToQualitative(star);
    const dateKey = new Date().toISOString().slice(0, 10);

    const { data: result, error } = await supabase.functions.invoke('content-feedback', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'SUBMIT_FEEDBACK',
        feedbackData: {
          content_id: `prb-${dateKey}`,
          content_type: 'brief',
          feedback_type: 'star_rating',
          star_rating: star,
          trigger_context: 'brief_inline',
          feedback_text: feedback,
          feedback_reason: qualitativeRating,
          context_data: {
            feedback_scope: 'brief',
            brief_snapshot_id: briefSnapshotId,
            tier: extraContext?.tier,
            score: extraContext?.score,
          },
        },
      },
    });

    if (error) throw error;
    return { success: true, data: result?.data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to submit brief feedback:', error);
    }
    return { success: false, error };
  }
}

/**
 * Submit structured cancel feedback for a Today-plan priority slot.
 *
 * Writes a single row to `content_relevance_feedback` with enough metadata to
 * be queryable independently of the free-text `feedback_text`:
 *   - feedback_reason: 'not_relevant_now' | 'not_relevant_ever'
 *   - trigger_context: 'plan_slot_cancel'
 *   - context_data: { feedback_scope, plan_slot_index, slot_title, cancel_reason, session_period, local_date }
 *
 * This is the canonical write path for slot-cancel feedback. The plan-ledger
 * edit (in `daily_ritual_completions.plan_ledger.userEdits`) is persisted
 * separately and is the source of truth for slot edit STATE; this row is the
 * source of truth for slot-cancel REASONS and free-text notes.
 */
export async function submitPlanSlotCancelFeedback(args: {
  slotIndex: number;
  slotTitle: string;
  cancelReason: 'now' | 'ever';
  feedbackText?: string;
  sessionPeriod?: 'morning' | 'afternoon' | 'evening';
}) {
  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return { success: false, error: new Error('Not authenticated') };

    const reasonCode = args.cancelReason === 'now' ? 'not_relevant_now' : 'not_relevant_ever';
    const dateKey = new Date().toLocaleDateString('en-CA');

    const { data: result, error } = await supabase.functions.invoke('content-feedback', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'SUBMIT_FEEDBACK',
        feedbackData: {
          content_id: `plan-slot-${args.slotIndex}-${dateKey}`,
          content_type: 'plan-tod',
          feedback_type: 'thumbs_down',
          trigger_context: 'plan_slot_cancel',
          feedback_text: args.feedbackText,
          feedback_reason: reasonCode,
          context_data: {
            feedback_scope: 'plan_slot_cancel',
            plan_type: 'tod',
            plan_slot_index: args.slotIndex,
            slot_title: args.slotTitle,
            cancel_reason: args.cancelReason,
            session_period: args.sessionPeriod,
            local_date: dateKey,
          },
        },
      },
    });

    if (error) throw error;
    return { success: true, data: result?.data };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('Failed to submit plan-slot cancel feedback:', error);
    }
    return { success: false, error };
  }
}
