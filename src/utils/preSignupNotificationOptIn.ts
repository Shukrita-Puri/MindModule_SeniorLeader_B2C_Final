/**
 * Pre-sign-in (quiet) notification opt-in, iOS only.
 *
 * Uses the provisional authorisation path already in the app: no visible
 * system prompt, nothing to accept, nothing blocking the welcome screen. The
 * resulting device token is stored against the anonymous install so a single
 * "finish setting up" reminder can reach someone who never created an account.
 *
 * Entirely optional and failure-tolerant — every path resolves silently.
 */
import { Capacitor } from '@capacitor/core';
import {
  getNativeNotificationAuthorizationStatus,
  isAuthorizedForRemoteNotifications,
  requestProvisionalNotificationPermission,
} from '@/utils/nativeNotificationAuthorization';
import { recordInstallNotificationState } from '@/hooks/useAppUsageTracking';

const ATTEMPT_KEY = 'mm_presignup_push_optin_attempted';

function alreadyAttempted(): boolean {
  try {
    return window.localStorage.getItem(ATTEMPT_KEY) === '1';
  } catch {
    return false;
  }
}

function markAttempted(): void {
  try {
    window.localStorage.setItem(ATTEMPT_KEY, '1');
  } catch {
    /* ignore */
  }
}

export async function requestPreSignupNotificationOptIn(): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'ios') return;
    if (alreadyAttempted()) return;
    markAttempted();

    const existing = await getNativeNotificationAuthorizationStatus();
    const status = isAuthorizedForRemoteNotifications(existing)
      ? existing
      : await requestProvisionalNotificationPermission();

    const optIn = isAuthorizedForRemoteNotifications(status);
    if (!optIn) {
      recordInstallNotificationState(false, status?.authorizationStatus ?? null);
      return;
    }

    // Capture the APNs token for this device so the reminder can be delivered
    // without any account. Resolves silently if registration never fires.
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let settled = false;
    const handle = await PushNotifications.addListener('registration', (token) => {
      if (settled) return;
      settled = true;
      const raw = String(token?.value ?? '').replace(/[<>\s]/g, '').toLowerCase();
      const valid = /^[0-9a-f]{64,128}$/.test(raw) ? raw : null;
      recordInstallNotificationState(true, status?.authorizationStatus ?? null, valid);
      void handle.remove();
    });
    await PushNotifications.register();

    window.setTimeout(() => {
      if (settled) return;
      settled = true;
      recordInstallNotificationState(true, status?.authorizationStatus ?? null);
      void handle.remove();
    }, 8000);
  } catch {
    /* never block or surface — this is optional context only */
  }
}
