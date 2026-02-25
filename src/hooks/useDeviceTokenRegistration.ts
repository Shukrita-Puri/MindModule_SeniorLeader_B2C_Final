import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';

/**
 * Registers the iOS device token for push notifications.
 * Safe no-op on web. Must be called after auth is loaded.
 */
export function useDeviceTokenRegistration() {
  const { user, isAuthenticated } = useAuth();
  const registered = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.id || registered.current) return;
    if (!Capacitor.isNativePlatform()) return;

    registered.current = true;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Check / request permission
        let permStatus = await PushNotifications.checkPermissions();
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
        }
        if (permStatus.receive !== 'granted') {
          console.log('[PushReg] Permission not granted:', permStatus.receive);
          return;
        }

        // Listen for registration success
        await PushNotifications.addListener('registration', async (token) => {
          console.log('[PushReg] Device token received:', token.value.substring(0, 12) + '...');
          try {
            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
            const accessToken = await window.__auth0Client?.getAccessTokenSilently();

            await fetch(
              `https://${projectId}.supabase.co/functions/v1/register-device-token`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  device_token: token.value,
                  platform: 'ios',
                }),
              }
            );
            console.log('[PushReg] Token persisted to backend');
          } catch (err) {
            console.error('[PushReg] Failed to persist token:', err);
          }
        });

        // Listen for registration errors
        await PushNotifications.addListener('registrationError', (err) => {
          console.error('[PushReg] Registration error:', err);
        });

        // Listen for foreground notifications
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[PushReg] Foreground notification:', notification.title);
        });

        // Register with APNs
        await PushNotifications.register();
        console.log('[PushReg] APNs registration initiated');
      } catch (err) {
        console.error('[PushReg] Setup error:', err);
      }
    })();
  }, [isAuthenticated, user?.id]);
}
