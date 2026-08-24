import { useCallback, useEffect, useState } from 'react';
import {
  fetchEventOutcomeCandidate,
  submitEventOutcome,
  type EventOutcomeCandidate,
} from '@/utils/eventOutcomeFeedback';

const DISMISS_KEY = 'eventOutcomePromptDismissed';

function dismissedIds(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function markDismissed(eventId: string) {
  try {
    const next = dismissedIds();
    next.add(eventId);
    sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
  } catch {
    /* noop */
  }
}

/**
 * Looks for a recently ended high-demand event (canonical A–D) with no outcome
 * feedback yet and surfaces a single lightweight prompt. Skipped events are
 * suppressed for the rest of the session; submitted ones never return because
 * the server filters on stored feedback.
 */
export function useEventOutcomePrompt(enabled: boolean) {
  const [candidate, setCandidate] = useState<EventOutcomeCandidate | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const found = await fetchEventOutcomeCandidate();
      if (cancelled || !found?.eventId) return;
      if (dismissedIds().has(found.eventId)) return;
      setCandidate(found);
    })();

    return () => { cancelled = true; };
  }, [enabled]);

  const skip = useCallback(() => {
    if (candidate?.eventId) markDismissed(candidate.eventId);
    setCandidate(null);
  }, [candidate]);

  const submit = useCallback(
    async (rating: number, feedback?: string) => {
      if (!candidate?.eventId) return;
      markDismissed(candidate.eventId);
      setCandidate(null);
      await submitEventOutcome({
        eventId: candidate.eventId,
        title: candidate.title,
        categoryId: candidate.categoryId,
        rating,
        openText: feedback,
      });
    },
    [candidate],
  );

  return { candidate, skip, submit };
}
