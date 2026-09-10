import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

export type ConnectionRecoveryIssue = 'wearable' | 'calendar' | 'push';

export interface ConnectionRecoveryPromptData {
  issue: ConnectionRecoveryIssue;
  reason: string;
  title: string;
  body: string;
}

/** One prompt per day, tracked locally so a refresh doesn't re-show it. */
const LOCAL_KEY = 'mm_connection_recovery_last_shown_v1';

function shownToday(): boolean {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return false;
    return raw === new Date().toISOString().slice(0, 10);
  } catch {
    return false;
  }
}

function markShownToday(): void {
  try {
    localStorage.setItem(LOCAL_KEY, new Date().toISOString().slice(0, 10));
  } catch {
    /* best-effort */
  }
}

/**
 * Decides whether the reconnect prompt should appear on this app open.
 * Read-only until the user acts; never blocks rendering.
 */
export function useConnectionRecoveryPrompt(enabled: boolean) {
  const { user } = useAuth();
  const userId = DEV_MODE ? DEV_USER.id : user?.id;
  const [prompt, setPrompt] = useState<ConnectionRecoveryPromptData | null>(null);

  useEffect(() => {
    if (!enabled || !userId || shownToday()) return;
    let cancelled = false;

    (async () => {
      try {
        const token = await getAuthToken().catch(() => null);
        if (!token) return;
        const { data, error } = await supabase.functions.invoke('connection-recovery-state', {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled || error) return;
        const next = (data as { prompt?: ConnectionRecoveryPromptData | null } | null)?.prompt;
        if (next) {
          setPrompt(next);
          markShownToday();
          void record(next.issue, 'shown');
        }
      } catch {
        /* silent — this surface must never break the home screen */
      }
    })();

    return () => { cancelled = true; };
  }, [enabled, userId]);

  const record = useCallback(
    async (issue: ConnectionRecoveryIssue, action: 'shown' | 'dismissed' | 'acted') => {
      try {
        const token = await getAuthToken().catch(() => null);
        if (!token) return;
        await supabase.functions.invoke('connection-recovery-state', {
          body: { issue, action },
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* best-effort */
      }
    },
    [],
  );

  const dismiss = useCallback(() => {
    if (prompt) void record(prompt.issue, 'dismissed');
    setPrompt(null);
  }, [prompt, record]);

  const acknowledge = useCallback(() => {
    if (prompt) void record(prompt.issue, 'acted');
    setPrompt(null);
  }, [prompt, record]);

  return { prompt, dismiss, acknowledge };
}
