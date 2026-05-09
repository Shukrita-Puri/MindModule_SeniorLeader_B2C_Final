import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeBackgroundSyncPlugin {
  updateAuthToken(opts: { token: string; expiresAt?: number }): Promise<{ success: boolean }>;
  clearAuthToken(): Promise<{ success: boolean }>;
  runNow(): Promise<{ success: boolean; wearableDone?: boolean; calendarDone?: boolean }>;
}

const NativeBackgroundSync = registerPlugin<NativeBackgroundSyncPlugin>('NativeBackgroundSync');

function isNativeIos(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch {
    return false;
  }
}

export async function updateNativeBackgroundAuthToken(token: string, expiresAt?: number): Promise<void> {
  if (!isNativeIos() || !token) return;
  try {
    await NativeBackgroundSync.updateAuthToken({ token, expiresAt });
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
