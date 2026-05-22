import { Capacitor } from '@capacitor/core';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';

const TOKEN_META_KEY = 'mm_push_latest_token_meta_v1';
const LAST_LOCAL_SCHEDULE_KEY = 'mm_local_notification_last_schedule_v1';
const LAST_LOCAL_DELIVERED_KEY = 'mm_local_notification_last_delivered_v1';
const LAST_LOCAL_FAILURE_KEY = 'mm_local_notification_last_failure_v1';

export interface PushTokenMeta {
  userId?: string | null;
  tokenPrefix?: string | null;
  tokenLength?: number;
  source?: string;
  updatedAt: string;
}

export interface NotificationDiagnostics {
  platform: string;
  isNative: boolean;
  timezone: string | null;
  timezoneOffsetMinutes: number;
  pushPermission: unknown;
  localPermission: unknown;
  apnsToken: PushTokenMeta | null;
  pendingLocalCount: number;
  pendingLocalNotifications: unknown[];
  lastScheduledLocal: unknown | null;
  lastDeliveredLocal: unknown | null;
  lastLocalFailure: unknown | null;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* best-effort */ }
}

export function rememberPushTokenMeta(meta: Omit<PushTokenMeta, 'updatedAt'>): void {
  writeJson(TOKEN_META_KEY, { ...meta, updatedAt: new Date().toISOString() });
}

export function getRememberedPushTokenMeta(): PushTokenMeta | null {
  return readJson<PushTokenMeta>(TOKEN_META_KEY);
}

export async function getNotificationDiagnostics(): Promise<NotificationDiagnostics> {
  const isNative = Capacitor.isNativePlatform();
  const platform = Capacitor.getPlatform();
  const timezone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; } })();
  const timezoneOffsetMinutes = -(new Date().getTimezoneOffset());
  let pushPermission: unknown = 'unavailable';
  let localPermission: unknown = 'unavailable';
  let pendingLocalNotifications: unknown[] = [];

  if (isNative) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      pushPermission = await PushNotifications.checkPermissions();
    } catch (err) {
      pushPermission = { error: err instanceof Error ? err.message : String(err) };
    }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      localPermission = await LocalNotifications.checkPermissions();
      const pending = await LocalNotifications.getPending();
      pendingLocalNotifications = pending.notifications ?? [];
    } catch (err) {
      localPermission = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  const diagnostics: NotificationDiagnostics = {
    platform,
    isNative,
    timezone,
    timezoneOffsetMinutes,
    pushPermission,
    localPermission,
    apnsToken: getRememberedPushTokenMeta(),
    pendingLocalCount: pendingLocalNotifications.length,
    pendingLocalNotifications,
    lastScheduledLocal: readJson(LAST_LOCAL_SCHEDULE_KEY),
    lastDeliveredLocal: readJson(LAST_LOCAL_DELIVERED_KEY),
    lastLocalFailure: readJson(LAST_LOCAL_FAILURE_KEY),
  };

  emitIntegrationEvent({ provider: 'notification', event: 'notification_permission_state', meta: diagnostics as unknown as Record<string, unknown> });
  return diagnostics;
}

export async function refreshNotificationPermissions(): Promise<NotificationDiagnostics> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const push = await PushNotifications.checkPermissions();
      if (push.receive === 'prompt') await PushNotifications.requestPermissions();
    } catch { /* diagnostics below reports actual state */ }

    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const local = await LocalNotifications.checkPermissions();
      if (local.display === 'prompt') await LocalNotifications.requestPermissions();
    } catch { /* diagnostics below reports actual state */ }
  }
  return getNotificationDiagnostics();
}

/**
 * Force a fresh APNs registration. Useful after reinstall, OS upgrade, or
 * when diagnostics show a stale/malformed token. The token-registration
 * hook re-persists the new token to the backend automatically.
 */
export async function forcePushReRegistration(): Promise<NotificationDiagnostics> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt') perm = await PushNotifications.requestPermissions();
      if (perm.receive === 'granted') {
        await PushNotifications.register();
        emitIntegrationEvent({ provider: 'notification', event: 'notification_apns_registration_started', meta: { reason: 'qa_force_reregister' } });
      } else {
        emitIntegrationEvent({ provider: 'notification', event: 'notification_permission_denied', meta: { reason: 'qa_force_reregister', receive: perm.receive } });
      }
    } catch (err) {
      emitIntegrationEvent({ provider: 'notification', event: 'notification_apns_registration_failed', errorMessage: err instanceof Error ? err.message : String(err) });
    }
  }
  return getNotificationDiagnostics();
}

export async function sendLocalTestNotificationNow(): Promise<NotificationDiagnostics> {
  if (!Capacitor.isNativePlatform()) return getNotificationDiagnostics();

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === 'prompt') perm = await LocalNotifications.requestPermissions();
    if (perm.display !== 'granted') {
      const failure = { at: new Date().toISOString(), reason: 'permission_not_granted', permission: perm };
      writeJson(LAST_LOCAL_FAILURE_KEY, failure);
      emitIntegrationEvent({ provider: 'notification', event: 'notification_local_schedule_failed', errorCode: 'permission_not_granted', meta: failure });
      return getNotificationDiagnostics();
    }

    const id = Math.floor(Date.now() % 2147483647);
    const fireAt = new Date(Date.now() + 3000);
    emitIntegrationEvent({ provider: 'notification', event: 'notification_local_schedule_started', meta: { id, fireAt: fireAt.toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: 'Mind Module test',
        body: 'Local notifications are firing on this device.',
        schedule: { at: fireAt },
        sound: 'default',
      }],
    });
    const scheduled = { id, fireAt: fireAt.toISOString(), createdAt: new Date().toISOString() };
    writeJson(LAST_LOCAL_SCHEDULE_KEY, scheduled);
    emitIntegrationEvent({ provider: 'notification', event: 'notification_local_schedule_success', meta: scheduled });
  } catch (err) {
    const failure = { at: new Date().toISOString(), error: err instanceof Error ? err.message : String(err) };
    writeJson(LAST_LOCAL_FAILURE_KEY, failure);
    emitIntegrationEvent({ provider: 'notification', event: 'notification_local_schedule_failed', errorMessage: failure.error, meta: failure });
  }

  return getNotificationDiagnostics();
}

export async function dumpPendingLocalNotifications(): Promise<NotificationDiagnostics> {
  const diagnostics = await getNotificationDiagnostics();
  emitIntegrationEvent({ provider: 'notification', event: 'notification_pending_dump', meta: { pendingLocalCount: diagnostics.pendingLocalCount, pendingLocalNotifications: diagnostics.pendingLocalNotifications } });
  return diagnostics;
}

export async function clearAllScheduledLocalNotifications(): Promise<NotificationDiagnostics> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const pending = await LocalNotifications.getPending();
      if (pending.notifications?.length) await LocalNotifications.cancel({ notifications: pending.notifications });
      await LocalNotifications.removeAllDeliveredNotifications();
      emitIntegrationEvent({ provider: 'notification', event: 'notification_scheduled_cleared', meta: { count: pending.notifications?.length ?? 0 } });
    } catch (err) {
      emitIntegrationEvent({ provider: 'notification', event: 'notification_local_schedule_failed', errorMessage: err instanceof Error ? err.message : String(err) });
    }
  }
  return getNotificationDiagnostics();
}

export function registerLocalNotificationTelemetryListeners(): void {
  if (!Capacitor.isNativePlatform()) return;
  const windowWithFlag = window as typeof window & { __mmLocalNotificationListenersRegistered?: boolean };
  if (windowWithFlag.__mmLocalNotificationListenersRegistered) return;
  windowWithFlag.__mmLocalNotificationListenersRegistered = true;

  import('@capacitor/local-notifications').then(({ LocalNotifications }) => {
    LocalNotifications.addListener('localNotificationReceived', (notification) => {
      const payload = { at: new Date().toISOString(), notification };
      writeJson(LAST_LOCAL_DELIVERED_KEY, payload);
      emitIntegrationEvent({ provider: 'notification', event: 'notification_received_foreground', meta: payload as unknown as Record<string, unknown> });
    });
    LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      emitIntegrationEvent({ provider: 'notification', event: 'notification_action_performed', meta: action as unknown as Record<string, unknown> });
    });
  }).catch((err) => {
    emitIntegrationEvent({ provider: 'notification', event: 'plugin_call_failed', errorMessage: err instanceof Error ? err.message : String(err), meta: { plugin: 'LocalNotifications' } });
  });
}
