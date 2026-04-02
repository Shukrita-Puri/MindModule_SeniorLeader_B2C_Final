import { useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';

interface StepMetadata {
  selected_plan?: string;
  context_calendar_enabled?: boolean;
  context_watch_enabled?: boolean;
  completed?: boolean;
  skipped?: boolean;
  reason?: string;
}

/**
 * Hook for persisting onboarding step completion to the database.
 * Fire-and-forget writes – does not block UI.
 * Falls back silently if unauthenticated.
 */
export function useOnboardingProgress() {
  const { isAuthenticated } = useAuth();
  const inflight = useRef<Set<string>>(new Set());

  const recordStep = useCallback(async (step: string, metadata?: StepMetadata) => {
    if (!isAuthenticated) return;
    if (inflight.current.has(step)) return; // dedupe
    inflight.current.add(step);

    try {
      const token = await getAuthToken();
      if (!token) return;

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/onboarding-progress`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'UPSERT_STEP', step, metadata }),
        }
      );

      if (res.ok) {
        console.log(`[onboarding-progress] ✅ Step '${step}' persisted`);
      } else {
        console.warn(`[onboarding-progress] ⚠️ Step '${step}' failed:`, res.status);
      }
    } catch (err) {
      console.warn(`[onboarding-progress] ⚠️ Step '${step}' error:`, err);
    } finally {
      inflight.current.delete(step);
    }
  }, [isAuthenticated]);

  return { recordStep };
}
