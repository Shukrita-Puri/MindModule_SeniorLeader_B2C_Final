/**
 * Hook to check coach access before starting a session.
 * Calls the check-coach-access edge function.
 */

import { useState, useCallback } from 'react';
import { getAuthToken } from '@/services/authTokenService';

interface CoachAccessResult {
  canStart: boolean;
  unlimited?: boolean;
  sessionsRemaining?: number;
  sessionsUsed?: number;
  sessionsLimit?: number;
  showWarning?: boolean;
  beta?: boolean;
  reason?: string;
  error?: string;
}

export function useCoachAccess() {
  const [accessResult, setAccessResult] = useState<CoachAccessResult | null>(null);
  const [checking, setChecking] = useState(false);

  const checkAccess = useCallback(async (): Promise<CoachAccessResult> => {
    setChecking(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        const result = { canStart: false, reason: 'Not authenticated' };
        setAccessResult(result);
        return result;
      }

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/check-coach-access`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const result = { canStart: false, error: err.error || 'Access check failed' };
        setAccessResult(result);
        return result;
      }

      const result: CoachAccessResult = await res.json();
      setAccessResult(result);
      return result;
    } catch (err) {
      console.error('[useCoachAccess] Error:', err);
      // Fail open for now – don't block users on network errors
      const result = { canStart: true, unlimited: false };
      setAccessResult(result);
      return result;
    } finally {
      setChecking(false);
    }
  }, []);

  const clearAccess = useCallback(() => {
    setAccessResult(null);
  }, []);

  return { accessResult, checking, checkAccess, clearAccess };
}
