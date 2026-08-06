import { useDeviceTokenRegistration } from '@/hooks/useDeviceTokenRegistration';
import { usePushNotificationHandler } from '@/hooks/usePushNotificationHandler';
import { NotificationPermissionBanner } from '@/components/NotificationPermissionBanner';


/**
 * Wrapper component that initialises push notification hooks.
 * Rendered outside RouterProvider since it doesn't need routing context.
 */
export function PushNotificationProvider() {
  useDeviceTokenRegistration();
  // Surfaces the recovery CTAs (denied / provisional / background-refresh-off /
  // stale token). The banner self-hides off native iOS and when healthy.
  return <NotificationPermissionBanner />;
}

/**
 * Must be rendered inside a Router context (needs useNavigate).
 * Handles notification tap → screen navigation.
 */
export function PushNotificationActionHandler() {
  usePushNotificationHandler();
  return null;
}
