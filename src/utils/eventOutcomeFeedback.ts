import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';

export interface EventOutcomeCandidate {
  eventId: string;
  title: string | null;
  categoryId: string;
  subcategory: string | null;
  endTime: string | null;
}

/**
 * Returns the most recent high-demand event (canonical A–D) that ended between
 * 20 minutes and 6 hours ago and has no outcome feedback yet. Null when there
 * is nothing to ask about.
 */
export async function fetchEventOutcomeCandidate(
  options: { dryRun?: boolean } = {},
): Promise<EventOutcomeCandidate | null> {
  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return null;

    const { data, error } = await supabase.functions.invoke('content-feedback', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: { action: 'GET_EVENT_OUTCOME_CANDIDATE', dryRun: options.dryRun === true },
    });
    if (error) throw error;
    return (data?.data ?? null) as EventOutcomeCandidate | null;
  } catch (error) {
    console.warn('[eventOutcomeFeedback] candidate lookup failed:', error);
    return null;
  }
}

export async function submitEventOutcome(input: {
  eventId: string;
  title?: string | null;
  categoryId?: string | null;
  rating?: number;
  openText?: string;
  practiceIdsUsed?: string[];
}): Promise<boolean> {
  try {
    const accessToken = await getAuthToken();
    if (!accessToken) return false;

    const { error } = await supabase.functions.invoke('content-feedback', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        action: 'SUBMIT_EVENT_OUTCOME',
        eventOutcome: {
          eventId: input.eventId,
          title: input.title ?? null,
          categoryId: input.categoryId ?? null,
          eventDate: new Date().toLocaleDateString('en-CA'),
          rating: input.rating,
          openText: input.openText,
          practiceIdsUsed: input.practiceIdsUsed,
          triggerContext: 'post_event_prompt',
        },
      },
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[eventOutcomeFeedback] submit failed:', error);
    return false;
  }
}
