import { Capacitor, registerPlugin } from '@capacitor/core';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';

export interface NativeOutboxDiagnostics {
  lastHealthObserverAt?: number | null;
  lastHealthUploadAt?: number | null;
  lastCalendarBackgroundAt?: number | null;
  lastCalendarUploadAt?: number | null;
  lastBackgroundFetchAt?: number | null;
  lastUploadError?: { at: number; message: string } | null;
  outboxDepth?: { 'apple-health': number; 'apple-calendar': number };
  maxItemsPerProvider?: number;
  // Hardening counters (added in production-grade hardening pass).
  anchorShortCircuits?: number;
  reconnectDrains?: number;
  dedupHits?: number;
  lastUploadLatencyMs?: number | null;
  uploadSuccessCount?: number;
  uploadFailureCount?: number;
}

export interface NativeOutboxItem {
  id: string;
  provider: 'apple-health' | 'apple-calendar';
  payload: unknown;
  createdAt: number;
  lastAttemptAt?: number;
  retryCount: number;
  lastError?: string;
}

interface NativeBackgroundSyncPlugin {
  updateAuthToken(opts: { token: string; expiresAt?: number }): Promise<{ success: boolean }>;
  clearAuthToken(): Promise<{ success: boolean }>;
  runNow(): Promise<{ success: boolean; wearableDone?: boolean; calendarDone?: boolean }>;
  forceHealthSync(): Promise<{ success: boolean }>;
  forceCalendarSync(): Promise<{ success: boolean }>;
  getDiagnostics(): Promise<NativeOutboxDiagnostics>;
  getPendingOutboxItems(): Promise<{ items: Record<string, NativeOutboxItem[]> }>;
  flushOutbox(): Promise<{ success: boolean; remaining?: Record<string, number> }>;
  clearOutbox(opts?: { provider?: 'apple-health' | 'apple-calendar' }): Promise<{ success: boolean }>;
  retryFailedItems(): Promise<{ success: boolean; remaining?: Record<string, number> }>;
}

const NativeBackgroundSync = registerPlugin<NativeBackgroundSyncPlugin>('NativeBackgroundSync');

function isNativeIos(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

export async function updateNativeBackgroundAuthToken(
  token: string, 
  expiresAt?: number, 
  refreshToken?: string, 
  domain?: string, 
  clientId?: string
): Promise<void> {
  if (!isNativeIos() || !token) return;
  try {
    await NativeBackgroundSync.updateAuthToken({ 
      token, 
      expiresAt,
      refreshToken,
      domain,
      clientId 
    });
  } catch (err) {
    console.warn('[NativeBackgroundSync] Failed to update native auth token:', err);
  }
}

export async function clearNativeBackgroundAuthToken(): Promise<void> {
  if (!isNativeIos()) return;
  try {
    await NativeBackgroundSync.clearAuthToken();
  } catch (err) {
    console.warn('[NativeBackgroundSync] Failed to clear native auth token:', err);
  }
}

export async function runNativeBackgroundSyncNow(): Promise<void> {
  if (!isNativeIos()) return;
  try {
    const result = await NativeBackgroundSync.runNow();
    console.log('[NativeBackgroundSync] Manual native sync result:', result);
  } catch (err) {
    console.warn('[NativeBackgroundSync] Manual native sync failed:', err);
  }
}

export async function forceNativeHealthSync(): Promise<boolean> {
  if (!isNativeIos()) return false;
  try {
    await NativeBackgroundSync.forceHealthSync();
    return true;
  } catch (err) {
    console.warn('[NativeBackgroundSync] forceHealthSync failed:', err);
    return false;
  }
}

/**
 * Force a native Apple Calendar fetch + POST. Used after a permission grant
 * or manual reconnect so the UI reflects the new connection state without
 * waiting for the next background-fetch slot.
 *
 * Rejects when the native bridge itself fails. Callers that want fire-and-
 * forget semantics must attach `.catch(() => {})` explicitly — silently
 * swallowing failures here caused the UI to render `Synced 0 events` after a
 * failed native invocation.
 */
export async function forceNativeCalendarSync(): Promise<void> {
  if (!isNativeIos()) return;
  await NativeBackgroundSync.forceCalendarSync();
}

export async function getNativeSyncDiagnostics(): Promise<NativeOutboxDiagnostics | null> {
  if (!isNativeIos()) return null;
  try {
    return await NativeBackgroundSync.getDiagnostics();
  } catch (err) {
    console.warn('[NativeBackgroundSync] getDiagnostics failed:', err);
    return null;
  }
}

export async function getNativeOutboxItems(): Promise<Record<string, NativeOutboxItem[]>> {
  if (!isNativeIos()) return {};
  try {
    const r = await NativeBackgroundSync.getPendingOutboxItems();
    return r?.items ?? {};
  } catch (err) {
    console.warn('[NativeBackgroundSync] getPendingOutboxItems failed:', err);
    return {};
  }
}

export async function flushNativeOutbox(): Promise<void> {
  if (!isNativeIos()) return;
  try {
    const r = await NativeBackgroundSync.flushOutbox();
    emitIntegrationEvent({ provider: 'system', event: 'native_outbox_flushed', meta: r as Record<string, unknown> });
  } catch (err) {
    console.warn('[NativeBackgroundSync] flushOutbox failed:', err);
  }
}

export async function clearNativeOutbox(provider?: 'apple-health' | 'apple-calendar'): Promise<void> {
  if (!isNativeIos()) return;
  try {
    await NativeBackgroundSync.clearOutbox(provider ? { provider } : undefined);
    emitIntegrationEvent({ provider: 'system', event: 'native_outbox_cleared', meta: { provider: provider ?? 'all' } });
  } catch (err) {
    console.warn('[NativeBackgroundSync] clearOutbox failed:', err);
  }
}
