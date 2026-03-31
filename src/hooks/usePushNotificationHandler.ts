import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationEngagement } from '@/hooks/useNotificationEngagement';

/**
 * Deep link routing for smart nudges.
 * Each nudge type maps to the action it drives.
 * Fallback uses check-in status to decide between check-in and home.
 */
const ACTION_ROUTES: Record<string, string> = {
  // Morning prep → check in first
  morning_prep: '/daily-check-in',
  // JIT pre-event → executive home (where JIT carousel lives)
  pre_event_prep: '/executive-home',
  // Calendar gap → check in during the gap
  calendar_gap: '/daily-check-in',
  // Coach commitment match → go straight to coach
  coach_meeting_match: '/self-mastery-coach',
  // State-aware afternoon → recalibrate
  state_aware_nudge: '/recalibrate',
  // Evening close → check in (evening)
  evening_close: '/daily-check-in',
  // Pattern alert → insights page
  pattern_alert: '/insights',
  // Daily fallback → check in (or home if done)
  daily_fallback: '/daily-check-in',
};

/**
 * Handles push notification taps and navigates to the appropriate screen.
 * Uses deep_link_route from payload if available, otherwise falls back to type-based routing.
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
          const deepLinkRoute = data.deep_link_route as string | undefined;

          console.log('[PushHandler] Notification tapped:', notificationType, notificationLogId);

          // Track engagement
          if (notificationLogId) {
            trackTap(notificationLogId);
          }

          // Priority: server-provided deep_link_route > type-based mapping > fallback
          const route = deepLinkRoute || ACTION_ROUTES[notificationType] || '/executive-home';
          navigate(route);
        });

        console.log('[PushHandler] Action listener registered');
      } catch (err) {
        console.error('[PushHandler] Setup error:', err);
      }
    })();
  }, [isAuthenticated, navigate, trackTap]);
}
