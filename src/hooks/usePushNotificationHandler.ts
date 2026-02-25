import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationEngagement } from '@/hooks/useNotificationEngagement';

const ROUTE_MAP: Record<string, string> = {
  pre_event_prep: '/executive-home',
  pattern_alert: '/insights',
  morning_anchor: '/daily-check-in',
  evening_close: '/executive-home',
  state_aware_nudge: '/recalibrate',
};

/**
 * Handles push notification taps and navigates to the appropriate screen.
 * Safe no-op on web.
 */
export function usePushNotificationHandler() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { trackTap } = useNotificationEngagement();
  const listenerAdded = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || listenerAdded.current) return;
    if (!Capacitor.isNativePlatform()) return;

    listenerAdded.current = true;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action.notification.data || {};
          const notificationType = data.notification_type as string;
          const notificationLogId = data.notification_log_id as string;

          console.log('[PushHandler] Notification tapped:', notificationType, notificationLogId);

          // Track engagement
          if (notificationLogId) {
            trackTap(notificationLogId);
          }

          // Navigate to appropriate screen
          const route = ROUTE_MAP[notificationType] || '/executive-home';
          navigate(route);
        });

        console.log('[PushHandler] Action listener registered');
      } catch (err) {
        console.error('[PushHandler] Setup error:', err);
      }
    })();
  }, [isAuthenticated, navigate, trackTap]);
}
