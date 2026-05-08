import { useCallback } from 'react';
import { getEdgeFunctionHeaders } from '@/services/authTokenService';

type EngagementAction = 'tap' | 'action_completed' | 'dismissed';

async function postNotificationEngagement(notificationLogId: string, action: EngagementAction) {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (!projectId) {
    throw new Error('Missing VITE_SUPABASE_PROJECT_ID');
  }

  const headers = await getEdgeFunctionHeaders();
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/notification-engagement`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        notification_log_id: notificationLogId,
        action,
        occurred_at: new Date().toISOString(),
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`notification-engagement failed: ${response.status} ${body}`);
  }
}

/**
 * Hook for tracking notification engagement from push notification deep links.
 * When the app opens from a push notification, call `trackTap` with the notification log ID.
 * When the user completes the target action, call `trackActionCompleted`.
 */
export function useNotificationEngagement() {
  const trackTap = useCallback(async (notificationLogId: string) => {
    try {
      await postNotificationEngagement(notificationLogId, 'tap');
    } catch (err) {
      console.error('[useNotificationEngagement] trackTap error:', err);
    }
  }, []);

  const trackActionCompleted = useCallback(async (notificationLogId: string) => {
    try {
      await postNotificationEngagement(notificationLogId, 'action_completed');
    } catch (err) {
      console.error('[useNotificationEngagement] trackActionCompleted error:', err);
    }
  }, []);

  const trackDismissed = useCallback(async (notificationLogId: string) => {
    try {
      await postNotificationEngagement(notificationLogId, 'dismissed');
    } catch (err) {
      console.error('[useNotificationEngagement] trackDismissed error:', err);
    }
  }, []);

  return { trackTap, trackActionCompleted, trackDismissed };
}
