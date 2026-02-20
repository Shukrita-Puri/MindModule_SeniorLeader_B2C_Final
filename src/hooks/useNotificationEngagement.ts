import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook for tracking notification engagement from push notification deep links.
 * When the app opens from a push notification, call `trackTap` with the notification log ID.
 * When the user completes the target action, call `trackActionCompleted`.
 */
export function useNotificationEngagement() {
  const trackTap = useCallback(async (notificationLogId: string) => {
    try {
      // Get the notification to calculate time_to_engagement
      const { data: notif } = await supabase
        .from('notification_log')
        .select('sent_at')
        .eq('id', notificationLogId)
        .single();

      const timeToEngagement = notif?.sent_at
        ? Math.round((Date.now() - new Date(notif.sent_at).getTime()) / 1000)
        : null;

      await (supabase as any)
        .from('notification_log')
        .update({
          tapped: true,
          app_opened: true,
          time_to_engagement_seconds: timeToEngagement,
        })
        .eq('id', notificationLogId);
    } catch (err) {
      console.error('[useNotificationEngagement] trackTap error:', err);
    }
  }, []);

  const trackActionCompleted = useCallback(async (notificationLogId: string) => {
    try {
      await (supabase as any)
        .from('notification_log')
        .update({ target_action_completed: true })
        .eq('id', notificationLogId);
    } catch (err) {
      console.error('[useNotificationEngagement] trackActionCompleted error:', err);
    }
  }, []);

  const trackDismissed = useCallback(async (notificationLogId: string) => {
    try {
      await (supabase as any)
        .from('notification_log')
        .update({ dismissed: true })
        .eq('id', notificationLogId);
    } catch (err) {
      console.error('[useNotificationEngagement] trackDismissed error:', err);
    }
  }, []);

  return { trackTap, trackActionCompleted, trackDismissed };
}
