import { useEffect, useRef } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '@/hooks/useAuth';
import { DEV_MODE } from '@/config/devMode';
import { getAuthToken } from '@/services/authTokenService';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { rememberPushTokenMeta, rememberCurrentDeviceToken } from '@/utils/notificationDiagnostics';
import { hashTokenPrefix } from '@/utils/tokenHash';
import { getSupabaseFunctionHeaders, getSupabaseFunctionUrl } from '@/utils/supabaseFunctions';

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
  const setupStarted = useRef(false);
  const lastUserId = useRef<string | null>(null);
  // Handle for the Capacitor App.appStateChange listener so we can remove it
  // on unmount / user swap and avoid accumulating duplicate resume hooks.
  const appStateHandleRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const authTokenRefreshCleanupRef = useRef<(() => void) | null>(null);
  const pushListenerHandlesRef = useRef<Array<{ remove: () => Promise<void> }>>([]);

  useEffect(() => {
    // If user identity changes (logout + login as different user, or first
    // login after reinstall), reset the latch so the new user re-registers.
    if (user?.id && lastUserId.current && lastUserId.current !== user.id) {
      console.log('[PushReg] User changed; resetting registration latch');
      registered.current = false;
      setupStarted.current = false;
    }
    if (user?.id) lastUserId.current = user.id;
    if (!isAuthenticated || !user?.id) {
      // Logged out: allow re-register on next login.
      registered.current = false;
      setupStarted.current = false;
      return;
    }
    if (setupStarted.current) return;
    if (!Capacitor.isNativePlatform()) return;

    setupStarted.current = true;
    let cancelled = false;

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        // Remove only the registration listeners owned by this hook. Do not
        // clear the plugin globally: that also deletes the
        // tap/navigation listener registered by usePushNotificationHandler,
        // which makes accepted pushes appear to "do nothing" on device.
        if (pushListenerHandlesRef.current.length) {
          const handles = pushListenerHandlesRef.current;
          pushListenerHandlesRef.current = [];
          await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
        }
        // Also remove any prior app-state listener handle from a previous run.
        if (appStateHandleRef.current) {
          try { await appStateHandleRef.current.remove(); } catch { /* ignore */ }
          appStateHandleRef.current = null;
        }
        authTokenRefreshCleanupRef.current?.();
        authTokenRefreshCleanupRef.current = null;

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
        }

        // Listen for registration success
        const registrationHandle = await PushNotifications.addListener('registration', async (token) => {
          const raw = token.value ?? '';
          const normalized = normalizeApnsToken(raw);
          const cleaned = normalized.token;
          const tokenHash = cleaned ? await hashTokenPrefix(cleaned) : 'sha256:invalid';
          console.log(
            `[PushReg] Device token received: type=${typeof raw} len=${String(raw).length} ` +
            `source=${normalized.source} valid=${!!cleaned} hash=${tokenHash}`
          );
          emitIntegrationEvent({
            provider: 'notification',
            event: cleaned ? 'notification_apns_registration_success' : 'notification_apns_registration_failed',
            userId: user.id,
            meta: { rawLength: String(raw).length, normalizedLength: cleaned?.length ?? 0, source: normalized.source, tokenHash },
          });
          if (!cleaned) {
            registered.current = false;
            console.error(
              '[PushReg] Refusing to register malformed APNs token. Expected an even-length hex token ' +
              'or a base64-encoded binary token. Reinstall if this persists.'
            );
            return;
          }
          rememberPushTokenMeta({ userId: user.id, tokenPrefix: tokenHash, tokenLength: cleaned.length, source: normalized.source });
          rememberCurrentDeviceToken(cleaned);
          try {
            const accessToken = await getRegistrationAuthToken();
            if (!accessToken && !DEV_MODE) {
              registered.current = false;
              console.error('[PushReg] Auth token unavailable after retries; cannot persist device token');
              return;
            }

              emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_started', userId: user.id, meta: { tokenHash, tokenLength: cleaned.length } });
            const response = await fetch(
              getSupabaseFunctionUrl('register-device-token'),
              {
                method: 'POST',
                headers: getSupabaseFunctionHeaders(accessToken),
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
              emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_failed', userId: user.id, errorCode: String(response.status), errorMessage: responseText, meta: { tokenHash, tokenLength: cleaned.length } });
              return;
            }
            console.log('[PushReg] Token persisted to backend');
            registered.current = true;
            emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_success', userId: user.id, meta: { tokenHash, tokenLength: cleaned.length } });
          } catch (err) {
            registered.current = false;
            console.error('[PushReg] Failed to persist token:', err);
            emitIntegrationEvent({ provider: 'notification', event: 'notification_token_persist_failed', userId: user.id, errorMessage: err instanceof Error ? err.message : String(err) });
          }
        });

        // Listen for registration errors
        const registrationErrorHandle = await PushNotifications.addListener('registrationError', (err) => {
          registered.current = false;
          console.error('[PushReg] Registration error:', err);
        });

        // Listen for foreground notifications
        const foregroundHandle = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[PushReg] Foreground notification:', notification.title);
        });
        pushListenerHandlesRef.current = [registrationHandle, registrationErrorHandle, foregroundHandle];
        if (cancelled) {
          const handles = pushListenerHandlesRef.current;
          pushListenerHandlesRef.current = [];
          await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)));
          return;
        }

        const registerIfAllowed = async (reason: 'launch' | 'resume' | 'auth_token_refreshed') => {
          const perm = await PushNotifications.checkPermissions();
          emitIntegrationEvent({
            provider: 'notification',
            event: 'notification_permission_state',
            userId: user.id,
            meta: { receive: perm.receive, reason },
          });
          if (perm.receive !== 'granted') return;
          await PushNotifications.register();
          console.log(`[PushReg] ${reason}: APNs registration initiated`);
          emitIntegrationEvent({
            provider: 'notification',
            event: 'notification_apns_registration_started',
            userId: user.id,
            meta: { reason },
          });
        };

        // Register with APNs when permission is available. The registration
        // callback is the only place that marks this device as persisted.
        await registerIfAllowed('launch');

        // Re-register on every resume so a rotated APNs token (common after
        // reinstall, OS upgrade, or long background) gets persisted to the
        // backend and nudges keep firing.
        try {
          const handle = await CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
            if (!isActive) return;
            try {
              await registerIfAllowed('resume');
            } catch (e) {
              console.warn('[PushReg] Resume re-register failed:', e);
            }
          });
          if (cancelled) {
            try { await handle.remove(); } catch { /* ignore */ }
          } else {
            appStateHandleRef.current = handle;
          }
        } catch (e) {
          console.warn('[PushReg] appStateChange listener failed:', e);
        }

        const onAuthTokenRefreshed = () => {
          if (registered.current) return;
          registerIfAllowed('auth_token_refreshed').catch((e) => {
            console.warn('[PushReg] Auth-token-refresh re-register failed:', e);
          });
        };
        window.addEventListener('mm:auth-token-refreshed', onAuthTokenRefreshed);
        authTokenRefreshCleanupRef.current = () => {
          window.removeEventListener('mm:auth-token-refreshed', onAuthTokenRefreshed);
        };
        if (cancelled) {
          authTokenRefreshCleanupRef.current?.();
          authTokenRefreshCleanupRef.current = null;
        }
      } catch (err) {
        setupStarted.current = false;
        console.error('[PushReg] Setup error:', err);
      }
    })();

    return () => {
      cancelled = true;
      // Tear down listeners on unmount or before the effect re-runs for a
      // different user. We intentionally don't await here — React effect
      // cleanups are synchronous and the native calls are fire-and-forget.
      if (appStateHandleRef.current) {
        const handle = appStateHandleRef.current;
        appStateHandleRef.current = null;
        handle.remove().catch(() => { /* ignore */ });
      }
      authTokenRefreshCleanupRef.current?.();
      authTokenRefreshCleanupRef.current = null;
      const handles = pushListenerHandlesRef.current;
      pushListenerHandlesRef.current = [];
      handles.forEach((handle) => { handle.remove().catch(() => { /* ignore */ }); });
    };
  }, [isAuthenticated, user?.id]);
}
