import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { rememberPushTokenMeta } from '@/utils/notificationDiagnostics';

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

  // Some broken native bridges return a comma-separated byte array or an
  // NSData-style description that can be accidentally converted into 160 hex
  // chars. APNs rejects those as BadDeviceToken. Only accept canonical token
  // byte lengths (32/36/64 bytes => 64/72/128 hex chars).
  const allowedHexLengths = new Set([64, 72, 128]);

  // Capacitor normally returns an APNs hex token. Older/native paths can
  // include Data.description wrappers like "<ab cd ...>", so strip only those.
  // Do not hardcode 64 chars: Apple treats device-token size as variable.
  const hexCandidate = trimmed.replace(/[<>\s]/g, '').toLowerCase();
  if (/^[0-9a-f]+$/.test(hexCandidate) && allowedHexLengths.has(hexCandidate.length)) {
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getRegistrationAuthToken(): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = await getAuthToken();
    if (token) return token;
    await sleep(500 * (attempt + 1));
  }
  return null;
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
        emitIntegrationEvent({ provider: 'notification', event: 'notification_permission_state', userId: user.id, meta: { receive: permStatus.receive } });
        if (permStatus.receive === 'prompt') {
          permStatus = await PushNotifications.requestPermissions();
          emitIntegrationEvent({ provider: 'notification', event: 'notification_permission_state', userId: user.id, meta: { receive: permStatus.receive, afterRequest: true } });
        }
        if (permStatus.receive !== 'granted') {
          console.log('[PushReg] Permission not granted:', permStatus.receive);
          emitIntegrationEvent({ provider: 'notification', event: 'notification_permission_denied', userId: user.id, meta: { receive: permStatus.receive } });
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
          emitIntegrationEvent({
            provider: 'notification',
            event: cleaned ? 'notification_apns_registration_success' : 'notification_apns_registration_failed',
            userId: user.id,
            meta: { rawLength: String(raw).length, normalizedLength: cleaned?.length ?? 0, source: normalized.source, tokenPrefix: cleaned?.substring(0, 12) ?? null },
          });
          if (!cleaned) {
            registered.current = false;
            console.error(
              '[PushReg] Refusing to register malformed APNs token. Expected an even-length hex token ' +
              'or a base64-encoded binary token. Reinstall if this persists.'
            );
            return;
          }
          rememberPushTokenMeta({ userId: user.id, tokenPrefix: cleaned.substring(0, 12), tokenLength: cleaned.length, source: normalized.source });
          try {
            const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
            if (!projectId) {
              registered.current = false;
              console.error('[PushReg] Missing VITE_SUPABASE_PROJECT_ID; cannot persist device token');
              return;
            }

            const accessToken = await getRegistrationAuthToken();
            if (!accessToken && !DEV_MODE) {
              registered.current = false;
              console.error('[PushReg] Auth token unavailable after retries; cannot persist device token');
              return;
            }

            emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_started', userId: user.id, meta: { tokenPrefix: cleaned.substring(0, 12), tokenLength: cleaned.length } });
            const response = await fetch(
              `https://${projectId}.supabase.co/functions/v1/register-device-token`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
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
              emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_failed', userId: user.id, errorCode: String(response.status), errorMessage: responseText, meta: { tokenPrefix: cleaned.substring(0, 12), tokenLength: cleaned.length } });
              return;
            }
            console.log('[PushReg] Token persisted to backend');
            emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_success', userId: user.id, meta: { tokenPrefix: cleaned.substring(0, 12), tokenLength: cleaned.length } });
          } catch (err) {
            registered.current = false;
            console.error('[PushReg] Failed to persist token:', err);
            emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_failed', userId: user.id, errorMessage: err instanceof Error ? err.message : String(err) });
          }
        });

        // Listen for registration errors
        await PushNotifications.addListener('registrationError', (err) => {
          registered.current = false;
          console.error('[PushReg] Registration error:', err);
        });

        // Listen for foreground notifications
        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[PushReg] Foreground notification:', notification.title);
        });

        // Register with APNs
        await PushNotifications.register();
        console.log('[PushReg] APNs registration initiated');
        emitIntegrationEvent({ provider: 'notification', event: 'notification_apns_registration_started', userId: user.id });

        // Re-register on every resume so a rotated APNs token (common after
        // reinstall, OS upgrade, or long background) gets persisted to the
        // backend and nudges keep firing.
        try {
          await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
            if (!isActive) return;
            try {
              const perm = await PushNotifications.checkPermissions();
              emitIntegrationEvent({ provider: 'notification', event: 'notification_permission_state', userId: user.id, meta: { receive: perm.receive, reason: 'resume' } });
              if (perm.receive !== 'granted') return;
              await PushNotifications.register();
              console.log('[PushReg] Resume: APNs re-registration initiated');
            } catch (e) {
              console.warn('[PushReg] Resume re-register failed:', e);
            }
          });
        } catch (e) {
          console.warn('[PushReg] appStateChange listener failed:', e);
        }
      } catch (err) {
        console.error('[PushReg] Setup error:', err);
      }
    })();
  }, [isAuthenticated, user?.id]);
}
