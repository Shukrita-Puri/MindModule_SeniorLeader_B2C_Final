import { useDeviceTokenRegistration } from '@/hooks/useDeviceTokenRegistration';
import { usePushNotificationHandler } from '@/hooks/usePushNotificationHandler';

/**
 * Wrapper component that initialises push notification hooks.
 * Rendered outside RouterProvider since it doesn't need routing context.
 */
export function PushNotificationProvider() {
  useDeviceTokenRegistration();
  return null;
}

/**
 * Must be rendered inside a Router context (needs useNavigate).
 * Handles notification tap → screen navigation.
 */
export function PushNotificationActionHandler() {
  usePushNotificationHandler();
  return null;
}
