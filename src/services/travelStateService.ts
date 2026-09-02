/**
 * travelStateService — source-agnostic travel state coordinator.
 * The native iOS LocationBridge produces pings; this service consumes
 * them, exposes state to the UI, and resiliently degrades to cache when
 * offline. Errors never escape; everything emits telemetry.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { getAuthToken } from '@/services/authTokenService';

export type TravelState =
  | 'not_travelling'
  | 'travel_planned'
  | 'en_route'
  | 'arrived'
  | 'returning'
  | 'location_unknown';

export type TravelPermissionStatus =
  | 'authorized_always'
  | 'authorized_when_in_use'
  | 'denied'
  | 'restricted'
  | 'not_determined'
  | 'web_granted'
  | 'web_unavailable'
  | 'unsupported'
  | 'unknown';

export type TravelPlatform = 'ios' | 'android' | 'web';

export function getTravelPlatform(): TravelPlatform {
  if (!LocationBridgeNative) return 'web';
  return Capacitor.getPlatform() as TravelPlatform;
}

/**
 * Reads the current OS-level location permission without prompting.
 * On iOS this goes to the native bridge; on web we infer from the
 * Permissions API when available.
 */
export async function getTravelPermissionStatus(): Promise<TravelPermissionStatus> {
  try {
    if (LocationBridgeNative) {
      const { value } = await LocationBridgeNative.currentAuthorizationString();
      return (value as TravelPermissionStatus) ?? 'unknown';
    }
    if (typeof navigator !== 'undefined' && 'permissions' in navigator && navigator.geolocation) {
      try {
        const res = await (navigator as any).permissions.query({ name: 'geolocation' });
        if (res.state === 'granted') return 'web_granted';
        if (res.state === 'denied') return 'denied';
        return 'not_determined';
      } catch {
        return 'not_determined';
      }
    }
    return 'web_unavailable';
  } catch {
    return 'unknown';
  }
}

/**
 * Idempotent: if iOS authorization is already granted, ensure the
 * native significant-change + visits monitoring is running. Safe to
 * call on every mount/app-resume. No-op on web.
 */
export async function ensureTravelMonitoringIfAuthorized(): Promise<void> {
  try {
    if (!LocationBridgeNative) return;
    const status = await getTravelPermissionStatus();
    if (status === 'authorized_always' || status === 'authorized_when_in_use') {
      await LocationBridgeNative.startIfAuthorized();
    }
  } catch { /* never throw */ }
}

export interface TravelStateSnapshot {
  state: TravelState;
  lastKnownTimezone: string | null;
  lastLocationAt: string | null;
  distanceFromHomeKm: number | null;
  lastStateChangeAt: string | null;
}

const CACHE_KEY = 'mm_travel_state_cache_v1';
const TZ_LAST_SEEN_KEY = 'mm_travel_last_seen_tz_v1';
const PERMISSION_LAST_ASKED_KEY = 'mm_travel_perm_last_asked_v1';
const PERMISSION_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

interface LocationBridgePlugin {
  startIfAuthorized(): Promise<void>;
  requestAlwaysAuthorization(): Promise<void>;
  requestOneShotLocation(): Promise<void>;
  currentAuthorizationString(): Promise<{ value: string }>;
}
const LocationBridgeNative =
  Capacitor.isNativePlatform()
    ? registerPlugin<LocationBridgePlugin>('LocationBridge')
    : null;

function safeGet(key: string): string | null {
  try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); } catch { /* */ }
}

export function getCachedTravelState(): TravelStateSnapshot | null {
  const raw = safeGet(CACHE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function writeCache(snap: TravelStateSnapshot): void {
  safeSet(CACHE_KEY, JSON.stringify(snap));
}

async function authToken(): Promise<string | null> {
  try { return await getAuthToken(); } catch { return null; }
}

export async function fetchTravelState(userId: string): Promise<TravelStateSnapshot> {
  try {
    const { data, error } = await supabase
      .from('travel_state' as any)
      .select('state, last_known_timezone, last_location_at, distance_from_home_km, last_state_change_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    const snap: TravelStateSnapshot = {
      state: ((data as any)?.state ?? 'not_travelling') as TravelState,
      lastKnownTimezone: (data as any)?.last_known_timezone ?? null,
      lastLocationAt: (data as any)?.last_location_at ?? null,
      distanceFromHomeKm: (data as any)?.distance_from_home_km ?? null,
      lastStateChangeAt: (data as any)?.last_state_change_at ?? null,
    };
    writeCache(snap);
    return snap;
  } catch (e) {
    emitIntegrationEvent({
      provider: 'system',
      event: 'sync_temporary_unavailable',
      meta: { area: 'travel_state_fetch', message: (e as Error).message },
    });
    return getCachedTravelState() ?? {
      state: 'location_unknown',
      lastKnownTimezone: null,
      lastLocationAt: null,
      distanceFromHomeKm: null,
      lastStateChangeAt: null,
    };
  }
}

async function postPing(body: Record<string, unknown>): Promise<void> {
  try {
    const token = await authToken();
    if (!token) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/persist-travel-location`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    emitIntegrationEvent({
      provider: 'system',
      event: 'sync_failed',
      meta: { area: 'travel_ping_post', message: (e as Error).message },
    });
  }
}

async function sendForegroundPing(lat: number, lng: number, accuracy?: number): Promise<void> {
  const permission_status = await getTravelPermissionStatus().catch(() => 'unknown');
  await postPing({
    lat, lng, accuracy_m: accuracy ?? null,
    source: 'ios-foreground',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    captured_at: new Date().toISOString(),
    permission_status,
  });
}

/**
 * Persists the current OS-level location permission to travel_state
 * without requiring a location fix. Safe to call on permission change
 * or app resume; no-op on auth failure.
 */
export async function persistPermissionStatus(): Promise<void> {
  try {
    const permission_status = await getTravelPermissionStatus();
    await postPing({
      permission_status,
      source: 'permission-sync',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      captured_at: new Date().toISOString(),
    });
  } catch (e) {
    emitIntegrationEvent({
      provider: 'system',
      event: 'sync_failed',
      meta: { area: 'travel_permission_sync', message: (e as Error).message },
    });
  }
}

export async function requestTravelLocationPermission(): Promise<'granted' | 'denied' | 'cooldown' | 'unsupported'> {
  const lastAsked = Number(safeGet(PERMISSION_LAST_ASKED_KEY) ?? '0');
  if (lastAsked > 0 && Date.now() - lastAsked < PERMISSION_COOLDOWN_MS) return 'cooldown';
  safeSet(PERMISSION_LAST_ASKED_KEY, String(Date.now()));

  try {
    if (LocationBridgeNative) {
      await LocationBridgeNative.requestAlwaysAuthorization();
      await new Promise((r) => setTimeout(r, 800));
      const status = (await LocationBridgeNative.currentAuthorizationString())?.value ?? 'unknown';
      const granted = status === 'authorized_always' || status === 'authorized_when_in_use';
      emitIntegrationEvent({
        provider: 'system',
        event: granted ? 'permission_granted' : 'permission_denied',
        meta: { area: 'travel_location', status },
      });
      if (granted) {
        try { await LocationBridgeNative.startIfAuthorized(); } catch { /* */ }
        try { await LocationBridgeNative.requestOneShotLocation(); } catch { /* */ }
      }
      return granted ? 'granted' : 'denied';
    }

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      return await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            void sendForegroundPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
            emitIntegrationEvent({ provider: 'system', event: 'permission_granted', meta: { area: 'travel_location_web' } });
            resolve('granted');
          },
          (err) => {
            emitIntegrationEvent({ provider: 'system', event: 'permission_denied', meta: { area: 'travel_location_web', message: err.message } });
            resolve('denied');
          },
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
        );
      });
    }
    return 'unsupported';
  } catch (e) {
    emitIntegrationEvent({
      provider: 'system',
      event: 'plugin_call_failed',
      meta: { area: 'travel_location_permission', message: (e as Error).message },
    });
    return 'denied';
  }
}

export function startTimezoneWatcher(): () => void {
  let lastTz = safeGet(TZ_LAST_SEEN_KEY) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  safeSet(TZ_LAST_SEEN_KEY, lastTz);

  const check = async () => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && tz !== lastTz) {
        emitIntegrationEvent({
          provider: 'system',
          event: 'app_resume_refresh',
          meta: { area: 'timezone_change_detected', from: lastTz, to: tz },
        });
        lastTz = tz;
        safeSet(TZ_LAST_SEEN_KEY, tz);
        const permission_status = await getTravelPermissionStatus().catch(() => 'unknown');
        await postPing({
          timezone: tz,
          source: 'js-tz-change',
          captured_at: new Date().toISOString(),
          permission_status,
        });
      }
    } catch { /* never throw */ }
  };

  const id = setInterval(check, 60_000);
  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') void check();
  };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
  return () => {
    clearInterval(id);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  };
}

export async function manualTravelRefresh(userId?: string | null): Promise<TravelStateSnapshot | null> {
  try {
    if (LocationBridgeNative) {
      await LocationBridgeNative.requestOneShotLocation();
    } else if (typeof navigator !== 'undefined' && navigator.geolocation) {
      await new Promise<void>((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (pos) => { void sendForegroundPing(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy); resolve(); },
          () => resolve(),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
        ),
      );
    }
    emitIntegrationEvent({ provider: 'system', event: 'manual_sync_triggered', meta: { area: 'travel_state' } });
  } catch (e) {
    emitIntegrationEvent({
      provider: 'system',
      event: 'plugin_call_failed',
      meta: { area: 'travel_manual_refresh', message: (e as Error).message },
    });
  }
  if (!userId) return getCachedTravelState();
  return fetchTravelState(userId);
}