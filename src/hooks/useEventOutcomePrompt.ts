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
export function useEventOutcomePrompt(enabled: boolean, dryRun = false) {
  const [candidate, setCandidate] = useState<EventOutcomeCandidate | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      const found = await fetchEventOutcomeCandidate({ dryRun });
      if (cancelled || !found?.eventId) return;
      if (!dryRun && dismissedIds().has(found.eventId)) return;
      setCandidate(found);
    })();

    return () => { cancelled = true; };
  }, [enabled, dryRun]);

  const skip = useCallback(() => {
    if (candidate?.eventId && !dryRun) markDismissed(candidate.eventId);
    setCandidate(null);
  }, [candidate, dryRun]);

  const submit = useCallback(
    async (rating: number, feedback?: string) => {
      if (!candidate?.eventId) return;
      // Dry run: render + interact only, never persist.
      if (dryRun) {
        setCandidate(null);
        return;
      }
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
    [candidate, dryRun],
  );

  return { candidate, skip, submit };
}
