import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationEngagement } from '@/hooks/useNotificationEngagement';
import { supabase } from '@/integrations/supabase/client';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { registerLocalNotificationTelemetryListeners } from '@/utils/notificationDiagnostics';

/**
 * Deep link routing for smart nudges.
 * Each nudge type maps to the action it drives.
 * Fallback uses check-in status to decide between check-in and home.
 */
const ACTION_ROUTES: Record<string, string> = {
  // MVP 3-nudge types
  nudge_one: '/daily-check-in',           // Default; JIT variant uses deep_link_route from payload
  nudge_two: '/executive-home',           // Default; recalibrate variant uses deep_link_route
  nudge_three: '/daily-check-in',         // Evening close
  // Week-Ahead picker invite always opens the Plan page in week-ahead mode.
  week_ahead_picker_invite: '/plan?mode=week-ahead',

  // Legacy types (backward compat)
  morning_prep: '/daily-check-in',
  pre_event_prep: '/executive-home',
  calendar_gap: '/executive-home',
  coach_meeting_match: '/self-mastery-coach',
  state_aware_nudge: '/daily-check-in',
  evening_close: '/daily-check-in',
  pattern_alert: '/insights',
  daily_fallback: '/executive-home',
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
  const listenerHandleRef = useRef<{ remove: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    registerLocalNotificationTelemetryListeners();

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        const handle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action.notification.data || {};
          const notificationType = data.notification_type as string;
          const notificationLogId = data.notification_log_id as string;
          const deepLinkRoute = data.deep_link_route as string | undefined;

          console.log('[PushHandler] Notification tapped:', notificationType, notificationLogId);
          emitIntegrationEvent({ provider: 'notification', event: 'notification_action_performed', meta: { notificationType, notificationLogId, deepLinkRoute } });

          // Track engagement
          if (notificationLogId) {
            trackTap(notificationLogId);
            // v5.3 — Honest receipts: tap is also a "delivered" signal.
            supabase.functions.invoke('notification-receipt', {
              body: {
                notification_log_id: notificationLogId,
                received_at: new Date().toISOString(),
                source: 'tap',
              },
            }).catch(() => { /* best-effort */ });
          }

          // Priority: server-provided deep_link_route > type-based mapping > fallback
          const route = deepLinkRoute || ACTION_ROUTES[notificationType] || '/executive-home';
          navigate(route);
        });

        if (cancelled) {
          await handle.remove();
        } else {
          listenerHandleRef.current = handle;
        }

        console.log('[PushHandler] Action listener registered');
      } catch (err) {
        console.error('[PushHandler] Setup error:', err);
      }
    })();

    return () => {
      cancelled = true;
      const handle = listenerHandleRef.current;
      listenerHandleRef.current = null;
      handle?.remove().catch(() => { /* ignore */ });
    };
  }, [isAuthenticated, navigate, trackTap]);
}
