import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';

interface NormalizedApnsToken {
  token: string | null;
  source: 'hex' | 'base64' | 'invalid';
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeApnsToken(value: unknown): NormalizedApnsToken {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const trimmed = raw.trim();

  // Capacitor normally returns an APNs hex token. Older/native paths can
  // include Data.description wrappers like "<ab cd ...>", so strip only those.
  // Do not hardcode 64 chars: Apple treats device-token size as variable.
  const hexCandidate = trimmed.replace(/[<>\s]/g, '').toLowerCase();
  if (/^[0-9a-f]+$/.test(hexCandidate) && hexCandidate.length >= 64 && hexCandidate.length <= 256 && hexCandidate.length % 2 === 0) {
    return { token: hexCandidate, source: 'hex' };
  }

  // Some iOS bridges expose the binary token as base64. Convert that to the
  // hex format APNs HTTP/2 expects.
  try {
    const base64Candidate = trimmed.replace(/^data:.*?;base64,/, '');
    const decoded = atob(base64Candidate);
    if (decoded.length >= 32 && decoded.length <= 128) {
      const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      return { token: bytesToHex(bytes), source: 'base64' };
    }
  } catch {
    // Not base64; fall through to invalid.
  }

  return { token: null, source: 'invalid' };
}

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
          const raw = token.value ?? '';
          const normalized = normalizeApnsToken(raw);
          const cleaned = normalized.token;
          console.log(
            `[PushReg] Device token received: type=${typeof raw} len=${String(raw).length} ` +
            `source=${normalized.source} valid=${!!cleaned} prefix=${cleaned?.substring(0, 12) ?? 'n/a'}...`
          );
          if (!cleaned) {
            registered.current = false;
            console.error(
              '[PushReg] Refusing to register malformed APNs token. Expected an even-length hex token ' +
              'or a base64-encoded binary token. Reinstall if this persists.'
            );
            return;
          }
          try {
            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
            const accessToken = await window.__auth0Client?.getAccessTokenSilently();

            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/register-device-token`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  device_token: cleaned,
                  platform: 'ios',
                }),
              }
            );
            const responseText = await response.text();
            if (!response.ok) {
              registered.current = false;
              console.error('[PushReg] Backend rejected token:', response.status, responseText);
              return;
            }
            console.log('[PushReg] Token persisted to backend');
          } catch (err) {
            registered.current = false;
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
