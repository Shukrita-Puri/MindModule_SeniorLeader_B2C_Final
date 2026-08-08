import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, ArrowLeft } from 'lucide-react';
import EngravedLoader from '@/components/ui/engraved-loader';
import ProviderRowCard from '@/components/connections/ProviderRowCard';
import ProfilePageLayout from '@/components/profile/ProfilePageLayout';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { requestHealthKitPermissions, isNativeApp, verifyHealthKitAccess, getHealthKitAuthorization } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend, clearHealthKitPermission, disconnectAppleHealthFromBackend } from '@/services/wearableSyncService';
import { startOuraOAuth, triggerOuraSync } from '@/services/ouraSyncService';
import { useWearableSync } from '@/hooks/useWearableSync';
import { Badge } from '@/components/ui/badge';
import { clearOuterReadinessCache } from '@/hooks/useOuterReadiness';
import { clear as clearPersistent, cacheKeys, localISODate } from '@/utils/persistentBriefCache';
import { clearLocalCalendarData, clearLocalWearableData } from '@/services/localDataStore';
import { openUrl } from '@/utils/openUrl';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { deriveSyncState } from '@/services/syncStateModel';

import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import appleHealthIcon from '@/assets/shared/apple-health-icon.png';
import microsoftCalendarLogo from '@/assets/shared/microsoft-calendar-logo.png';
import { CALENDAR_PROVIDER_META, WEARABLE_PROVIDER_META } from '@/utils/providerMetadata';
import {
  clearAppleCalendarManualDisconnect,
  getAppleCalendarPermissionStatus,
  isAppleCalendarAuthorizedStatus,
  isAppleCalendarSupported,
  markAppleCalendarManuallyDisconnected,
  requestAppleCalendarPermission,
  showAppleCalendarPermissionRevokeNotice,
  wasAppleCalendarManuallyDisconnected,
} from '@/utils/appleCalendar';
import { syncAppleCalendarToBackend } from '@/services/appleCalendarSync';
import { forceNativeCalendarSync } from '@/utils/nativeBackgroundSync';
import { appleCalendarSyncSuccessMessage } from '@/utils/appleCalendarSyncMessages';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import {
  isQaDebugEnabled,
  queuePendingDisconnect,
  clearPendingDisconnect,
  getPendingDisconnects,
} from '@/utils/integrationQaHelpers';
import AppleIntegrationsDebugPanel from '@/components/debug/AppleIntegrationsDebugPanel';
import { describeFetchError, getSupabaseFunctionHeaders, getSupabaseFunctionUrl, readResponseBody } from '@/utils/supabaseFunctions';
import { useCheckInMode } from '@/hooks/useCheckInMode';
import { mergeConnectionStatus } from '@/pages/connectedData/mergeConnectionStatus';

/* ─── Types ─── */

interface ConnectionStatus {
  calendar: {
    connected: boolean;
    provider: string | null;
    lastSync: string | null;
    providers?: {
      google?: { connected: boolean; lastSync: string | null };
      microsoft?: { connected: boolean; lastSync: string | null };
      apple?: { connected: boolean; lastSync: string | null };
    };
  };
  appleWatch: {
    connected: boolean;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'permission_revoked' | 'error';
    syncStatus: 'unknown' | 'synced' | 'waiting_for_data' | 'sync_delayed' | 'watch_unavailable' | 'error';
    lastSync: string | null;
    lastSampleAt?: string | null;
    watchConnectedAt?: string | null;
    hasHistoricalData?: boolean;
    needsReconnect?: boolean;
    disconnectedAt?: string | null;
    lastError?: string | null;
    lastErrorAt?: string | null;
    statusUpdatedAt?: string | null;
    sourceProvider?: string | null;
    ouraDetectedViaAppleHealth?: boolean;
    sourceApps?: Record<string, string[]> | null;
  };
  oura?: {
    connected: boolean;
    connectionStatus?: 'disconnected' | 'connecting' | 'connected' | 'permission_revoked' | 'error';
    syncStatus?: 'unknown' | 'synced' | 'waiting_for_data' | 'sync_delayed' | 'error';
    lastSync: string | null;
    lastSampleAt?: string | null;
    needsReconnect?: boolean;
    lastError?: string | null;
    lastErrorAt?: string | null;
    statusUpdatedAt?: string | null;
  };
}

function withAppleCalendarProvider(
  status: ConnectionStatus,
  apple: { connected: boolean; lastSync: string | null },
): ConnectionStatus {
  const providers = { ...(status.calendar.providers ?? {}) };
  providers.apple = apple;

  const googleConnected = providers.google?.connected ?? false;
  const microsoftConnected = providers.microsoft?.connected ?? false;
  const appleConnected = providers.apple?.connected ?? false;
  const provider = googleConnected ? 'google' : microsoftConnected ? 'microsoft' : appleConnected ? 'apple' : null;

  return {
    ...status,
    calendar: {
      ...status.calendar,
      connected: googleConnected || microsoftConnected || appleConnected,
      provider,
      lastSync: provider ? providers[provider]?.lastSync ?? null : null,
      providers,
    },
  };
}

/** Trigger sync-calendar edge function with Auth0 token */
async function triggerCalendarSync(provider: string): Promise<{
  success: boolean;
  eventCount?: number;
  reconnectRequired?: boolean;
  skipped?: boolean;
  /** Temporary provider rate-limit / quota — NOT a hard failure. */
  rateLimited?: boolean;
  syncStatus?: 'sync_delayed' | 'error' | 'synced' | null;
  retryAfterSeconds?: number | null;
  reason?: string;
  error?: string;
}> {
  try {
    const token = await getAuthToken();
    if (!token) {
      console.warn('[ConnectedData] No auth token for sync');
      return { success: false };
    }
    const url = getSupabaseFunctionUrl('sync-calendar');
    const res = await fetch(
      url,
      {
        method: 'POST',
        headers: getSupabaseFunctionHeaders(token),
        body: JSON.stringify({ provider }),
      }
    );
    const data = await res.json();
    if (data.reconnectRequired) {
      console.warn('[ConnectedData] Calendar reconnect required:', data.reason);
      return { success: false, reconnectRequired: true, error: data.error };
    }
    if (data.rateLimited) {
      console.warn('[ConnectedData] Calendar rate-limited:', JSON.stringify({
        reason: data.reason, retryAfterSeconds: data.retryAfterSeconds,
      }));
      return {
        success: false,
        rateLimited: true,
        syncStatus: data.syncStatus ?? 'sync_delayed',
        retryAfterSeconds: data.retryAfterSeconds ?? null,
        reason: data.reason,
        error: data.error,
      };
    }
    if (data.skipped) {
      console.warn('[ConnectedData] Sync skipped:', data.reason);
      return { success: false, skipped: true, error: data.error };
    }
    if (data.success === false) {
      console.warn('[ConnectedData] Sync failure:', data.error);
      return { success: false, error: data.error };
    }
    console.log('[ConnectedData] ✅ Sync complete:', data.eventCount, 'events');
    return { success: true, eventCount: data.eventCount };
  } catch (err) {
    console.error('[ConnectedData] sync-calendar error:', err);
    return { success: false };
  }
}

/** Invalidate cached mastery plan so next load regenerates with fresh calendar data */
function invalidatePlanCache() {
  const todayDate = localISODate();
  const periods = ['morning', 'afternoon', 'evening'];
  for (const period of periods) {
    clearPersistent(cacheKeys.planLoaded(todayDate, period));
    clearPersistent(cacheKeys.planData(todayDate, period));
    sessionStorage.removeItem(`plan-energy-hash-${todayDate}-${period}`);
    sessionStorage.setItem(cacheKeys.planForceRefresh(todayDate, period), '1');
  }
  console.log('[ConnectedData] Plan cache invalidated');
}

const ConnectedData = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { wearableConnected, selfCheckInsEnabled } = useCheckInMode();
  const [updatingSelfCheckIns, setUpdatingSelfCheckIns] = useState(false);
  const { isBackfilling: appleHealthBackfilling } = useWearableSync();

  // Visible to ALL wearable-connected users so they can toggle the preference either way.
  const showSelfCheckInToggle = wearableConnected;

  const handleToggleSelfCheckIns = useCallback(async (next: boolean) => {
    if (!user?.id) return;
    setUpdatingSelfCheckIns(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ self_check_ins_enabled: next })
        .eq('id', user.id);
      if (error) throw error;
      toast.success(next ? 'Daily self check-ins enabled' : 'Daily self check-ins disabled');
      queryClient.invalidateQueries({ queryKey: ['check-in-mode', user.id] });
    } catch (err) {
      console.error('[ConnectedData] Failed to update self check-ins preference:', err);
      toast.error('Could not update preference');
    } finally {
      setUpdatingSelfCheckIns(false);
    }
  }, [user?.id, queryClient]);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  // Ref mirror of `status`. Kept in sync via the effect below and read inside
  // fetchStatus/listeners so we always merge against the freshest committed
  // state without recreating those callbacks (which would re-register the
  // native `appStateChange` listener and cause churn/leaks).
  const statusRef = useRef<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [appleCalendarPermissionStatus, setAppleCalendarPermissionStatus] = useState<string | null>(null);
  const [appleCalendarSyncFailed, setAppleCalendarSyncFailed] = useState(false);

  // Keep the ref mirror aligned with every committed status update. React
  // guarantees this effect runs after commit, so `statusRef.current` always
  // reflects the freshest DOM-visible state by the time any async work
  // (fetchStatus, listeners, resume handlers) reads it.
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const clearIntegrationCaches = useCallback((scope: 'calendar' | 'wearable' | 'all') => {
    console.log('[ConnectedData] Clearing integration caches:', scope);
    try {
      if (scope === 'calendar' || scope === 'all') {
        clearLocalCalendarData();
        localStorage.removeItem('contextConnections');
      }
      if (scope === 'wearable' || scope === 'all') {
        clearLocalWearableData();
        clearHealthKitPermission();
        localStorage.removeItem('contextConnections');
      }
    } catch (err) {
      console.warn('[ConnectedData] Failed to clear integration caches:', err);
    }
  }, []);

  const verifyNativeConnectionState = useCallback(async (backendStatus: ConnectionStatus): Promise<ConnectionStatus> => {
    let next = backendStatus;

    if (isNativeApp() && backendStatus.appleWatch?.connectionStatus === 'connected') {
      const verified = await verifyHealthKitAccess();
      console.log('[ConnectedData] HealthKit resume/startup verification:', {
        verified,
        backendConnectionStatus: backendStatus.appleWatch.connectionStatus,
        backendSyncStatus: backendStatus.appleWatch.syncStatus,
      });
      if (!verified) {
        const auth = await getHealthKitAuthorization();
        if (auth.permissionGranted === false && (auth.readDenied?.length ?? 0) > 0) {
          next = {
            ...next,
            appleWatch: {
              ...next.appleWatch,
              connected: false,
              connectionStatus: 'permission_revoked',
              syncStatus: 'error',
              lastError: 'healthkit_authorization_not_verified',
              statusUpdatedAt: new Date().toISOString(),
            },
          };
        } else {
          next = {
            ...next,
            appleWatch: {
              ...next.appleWatch,
              connected: true,
              connectionStatus: 'connected',
              syncStatus: 'sync_delayed',
              lastError: 'healthkit_unavailable',
              statusUpdatedAt: new Date().toISOString(),
            },
          };
        }
      }
    }

    if (isAppleCalendarSupported()) {
      const permissionStatus = await getAppleCalendarPermissionStatus();
      setAppleCalendarPermissionStatus(permissionStatus);
      const appleDbConnected = !!backendStatus.calendar.providers?.apple?.connected;
      const applePermissionGranted = isAppleCalendarAuthorizedStatus(permissionStatus);
      console.log('[ConnectedData] Apple Calendar startup/resume verification:', {
        permissionStatus,
        applePermissionGranted,
        appleDbConnected,
      });

      if (appleDbConnected && !applePermissionGranted) {
        next = withAppleCalendarProvider(next, { connected: false, lastSync: null });
      } else if (
        applePermissionGranted &&
        !appleDbConnected &&
        !wasAppleCalendarManuallyDisconnected()
      ) {
        // iOS permission is the real local connection. Backend status can lag
        // behind foreground/native sync, so keep the Profile UI truthful and
        // let sync fill in lastSync/events asynchronously.
        next = withAppleCalendarProvider(next, { connected: true, lastSync: null });
      }
    }

    return next;
  }, []);

  // Fetch connection status from backend – NO localStorage overrides
  const fetchStatus = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('[ConnectedData] No auth token available, skipping status fetch');
        return;
      }
      const url = getSupabaseFunctionUrl('check-connections-status');
      emitIntegrationEvent({
        provider: 'system',
        event: 'app_resume_refresh',
        userId: user?.id,
        meta: {
          phase: 'fetch_status',
          url,
          online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        },
      });
      const res = await fetch(url, {
        method: 'POST',
        headers: getSupabaseFunctionHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        console.log('[ConnectedData] Connection status from backend:', JSON.stringify(data));
        // Read the freshest committed state from a ref mirror. We do NOT
        // rely on `setStatus(prev => prev)` — under React batching /
        // concurrent rendering the functional updater is not guaranteed to
        // execute synchronously before the next line, so it can't be used as
        // a "read latest" primitive. The ref is updated in a post-commit
        // effect above and is always the freshest DOM-visible state here.
        const merged = mergeConnectionStatus(statusRef.current, data);
        const verifiedStatus = await verifyNativeConnectionState(merged);
        setStatus(verifiedStatus);
      } else {
        const body = await readResponseBody(res);
        console.error('[ConnectedData] Status fetch failed:', res.status, body);
        emitIntegrationEvent({
          provider: 'system',
          event: 'plugin_call_failed',
          userId: user?.id,
          errorCode: `status_http_${res.status}`,
          errorMessage: body || res.statusText,
          meta: { url },
        });
      }
    } catch (err) {
      const errorMessage = describeFetchError(err);
      console.error('[ConnectedData] Failed to fetch status:', errorMessage, err);
      emitIntegrationEvent({
        provider: 'system',
        event: 'plugin_call_failed',
        userId: user?.id,
        errorCode: 'status_network_error',
        errorMessage,
        meta: {
          online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
          supabaseUrlConfigured: !!import.meta.env.VITE_SUPABASE_URL,
          projectIdConfigured: !!import.meta.env.VITE_SUPABASE_PROJECT_ID,
        },
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id, verifyNativeConnectionState]);

  useEffect(() => {
    if (user?.id) {
      fetchStatus();
    } else {
      console.log('[ConnectedData] No user, clearing user-specific integration state');
      clearIntegrationCaches('all');
      setStatus(null);
      setAppleCalendarPermissionStatus(null);
      setLoading(false);
    }
  }, [user?.id, fetchStatus, clearIntegrationCaches]);

  // Online-event retry: if a backend disconnect previously failed, retry now.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = async () => {
      const pending = getPendingDisconnects();
      if (pending.length === 0) return;
      emitIntegrationEvent({ provider: 'system', event: 'qa_action', meta: { action: 'retry_pending_disconnects', count: pending.length } });
      for (const p of pending) {
        try {
          if (p.provider === 'apple-health') {
            const ok = await disconnectAppleHealthFromBackend();
            if (ok) clearPendingDisconnect('apple-health');
          } else if (p.provider === 'apple-calendar') {
            const token = await getAuthToken();
            const res = await fetch(getSupabaseFunctionUrl('calendar-auth'), {
              method: 'POST',
              headers: getSupabaseFunctionHeaders(token),
              body: JSON.stringify({ action: 'disconnect', provider: 'apple' }),
            });
            if (res.ok) clearPendingDisconnect('apple-calendar');
          }
        } catch (err) {
          console.warn('[ConnectedData] retry pending disconnect failed:', err);
        }
      }
      fetchStatus();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [fetchStatus]);

  useEffect(() => {
    if (!isNativeApp() || !user?.id) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('appStateChange', async (state) => {
          if (!state.isActive) return;
          console.log('[ConnectedData] App resumed — refreshing integration statuses');
          emitIntegrationEvent({ provider: 'system', event: 'app_resume_refresh', userId: user?.id });
          await fetchStatus();
          if (status?.appleWatch?.connectionStatus === 'connected') {
            const hoursSinceSync = status.appleWatch.lastSync
              ? (Date.now() - new Date(status.appleWatch.lastSync).getTime()) / (1000 * 60 * 60)
              : Number.POSITIVE_INFINITY;
            if (hoursSinceSync > 6) {
              console.log('[ConnectedData] App resume — Apple Health stale, triggering safe retry sync');
              syncHealthKitToBackend()
                .then((result) => {
                  console.log('[ConnectedData] App resume HealthKit retry result:', JSON.stringify(result));
                  fetchStatus();
                })
                .catch((err) => console.warn('[ConnectedData] App resume HealthKit retry failed:', err));
            }
          }
        });
        if (cancelled) {
          listener.remove();
          return;
        }
        cleanup = () => listener.remove();
        emitIntegrationEvent({ provider: 'system', event: 'listener_registered', meta: { listener: 'appStateChange' } });
      } catch (err) {
        console.warn('[ConnectedData] Failed to register app resume refresh:', err);
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
      emitIntegrationEvent({ provider: 'system', event: 'listener_unregistered', meta: { listener: 'appStateChange' } });
    };
  }, [user?.id, fetchStatus, status?.appleWatch?.connectionStatus, status?.appleWatch?.lastSync]);

  // Handle post-OAuth callback: ?calendar_connected=true
  useEffect(() => {
    const calendarCallback = searchParams.get('calendar_connected');
    if (calendarCallback !== 'true') return;

    const callbackProvider = (searchParams.get('provider') as 'google' | 'microsoft' | null) ?? null;
    searchParams.delete('calendar_connected');
    searchParams.delete('provider');
    setSearchParams(searchParams, { replace: true });

    console.log('[ConnectedData] Post-OAuth callback detected, triggering sync...');
    setSyncing(true);

    const runPostConnectSync = async () => {
      await new Promise(r => setTimeout(r, 500));

      const token = await getAuthToken();
      const statusRes = await fetch(
        getSupabaseFunctionUrl('check-connections-status'),
        {
          method: 'POST',
          headers: getSupabaseFunctionHeaders(token),
        }
      );

      let provider: 'google' | 'microsoft' = callbackProvider ?? 'google';
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
        // Prefer the provider from the OAuth callback URL; fall back to backend.
        if (!callbackProvider) {
          provider = (statusData.calendar?.provider as 'google' | 'microsoft') || 'google';
        }

        const providerConnected = provider === 'microsoft'
          ? (statusData.calendar?.providers?.microsoft?.connected ?? statusData.calendar?.connected)
          : (statusData.calendar?.providers?.google?.connected ?? statusData.calendar?.connected);

        if (!providerConnected) {
          console.warn('[ConnectedData] Calendar not verified as connected after OAuth');
          toast.error('Calendar connection could not be verified');
          setSyncing(false);
          return;
        }
      }

      const providerLabel = provider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
      toast.success(`${providerLabel} connected!`);

      const syncResult = await triggerCalendarSync(provider);
      if (syncResult.reconnectRequired) {
        toast.error('Calendar session expired. Please reconnect your calendar.');
      } else if (syncResult.rateLimited) {
        toast.warning(syncResult.error ?? 'Google Calendar is rate-limiting sync — will retry shortly.');
        await fetchStatus();
      } else if (syncResult.skipped) {
        toast.error(syncResult.error || 'Calendar is disconnected. Reconnect to sync.');
      } else if (syncResult.success) {
        toast.success(`Synced ${syncResult.eventCount ?? 0} calendar events`);
        invalidatePlanCache();
        clearOuterReadinessCache(user?.id);
        queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
        await fetchStatus();
      } else {
        toast.error('Calendar connected but initial sync failed. Try "Sync Now".');
      }
      setSyncing(false);
    };

    runPostConnectSync();
  }, [searchParams, setSearchParams, fetchStatus, queryClient, user?.id]);

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return null;
    try {
      return `Last synced ${format(new Date(dateStr), 'MMM d, h:mm a')}`;
    } catch {
      return null;
    }
  };

  /* ─── Calendar Handlers (provider-aware) ─── */

  const startCalendarConnect = async (
    targetProvider: 'google' | 'microsoft',
    cardId: 'google-calendar' | 'microsoft-calendar'
  ) => {
    setConnecting(cardId);
    try {
      const token = await getAuthToken();
      const res = await fetch(
        getSupabaseFunctionUrl('calendar-auth'),
        {
          method: 'POST',
          headers: getSupabaseFunctionHeaders(token),
          body: JSON.stringify({
            action: 'connect',
            provider: targetProvider,
            redirectPath: '/connected-data',
          }),
        }
      );
      if (!res.ok) throw new Error(`calendar-auth failed: ${res.status}`);
      const data = await res.json();
      if (data?.authUrl) {
        await openUrl(data.authUrl);
      } else {
        throw new Error('No auth URL returned');
      }
    } catch (err) {
      console.error('Error connecting calendar:', err);
      toast.error(
        targetProvider === 'microsoft'
          ? 'Failed to connect Microsoft Calendar'
          : 'Failed to connect Google Calendar'
      );
    } finally {
      setConnecting(null);
    }
  };

  const handleConnectCalendar = () => startCalendarConnect('google', 'google-calendar');
  const handleConnectMicrosoftCalendar = () => startCalendarConnect('microsoft', 'microsoft-calendar');

  const disconnectCalendarProvider = async (provider: 'google' | 'microsoft') => {
    const label = provider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
    try {
      const token = await getAuthToken();
      const res = await fetch(
        getSupabaseFunctionUrl('calendar-auth'),
        {
          method: 'POST',
          headers: getSupabaseFunctionHeaders(token),
          body: JSON.stringify({ action: 'disconnect', provider }),
        }
      );
      if (!res.ok) throw new Error('Disconnect failed');
      setStatus(prev => {
        if (!prev) return prev;
        const providers = { ...(prev.calendar.providers ?? {}) };
        providers[provider] = { connected: false, lastSync: null };
        const googleStillConnected = providers.google?.connected ?? false;
        const microsoftStillConnected = providers.microsoft?.connected ?? false;
        const appleStillConnected = providers.apple?.connected ?? false;
        const stillConnected = googleStillConnected || microsoftStillConnected || appleStillConnected;
        const remainingProvider = googleStillConnected ? 'google' : microsoftStillConnected ? 'microsoft' : appleStillConnected ? 'apple' : null;
        return {
          ...prev,
          calendar: {
            connected: stillConnected,
            provider: remainingProvider,
            lastSync: stillConnected ? (providers[remainingProvider!]?.lastSync ?? null) : null,
            providers,
          },
        };
      });
      invalidatePlanCache();
      clearOuterReadinessCache(user?.id);
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      toast.success(`${label} disconnected`);
    } catch {
      toast.error('Failed to disconnect calendar');
    }
  };

  const handleDisconnectGoogle = () => disconnectCalendarProvider('google');
  const handleDisconnectMicrosoft = () => disconnectCalendarProvider('microsoft');

  const syncCalendarProvider = async (provider: 'google' | 'microsoft') => {
    setSyncing(true);
    const result = await triggerCalendarSync(provider);
    if (result.reconnectRequired) {
      toast.error('Calendar session expired. Please reconnect your calendar.');
    } else if (result.rateLimited) {
      toast.warning(result.error ?? 'Google Calendar is rate-limiting sync — will retry shortly.');
      await fetchStatus();
    } else if (result.skipped) {
      toast.error(result.error || 'Calendar is disconnected. Reconnect to sync.');
    } else if (result.success) {
      toast.success(`Synced ${result.eventCount ?? 0} events`);
      invalidatePlanCache();
      clearOuterReadinessCache(user?.id);
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      await fetchStatus();
    } else {
      toast.error('Sync failed. Please try again.');
    }
    setSyncing(false);
  };

  const handleSyncGoogle = () => syncCalendarProvider('google');
  const handleSyncMicrosoft = () => syncCalendarProvider('microsoft');

  /* ─── Apple Calendar Handlers (native iOS only) ─── */

  const handleConnectAppleCalendar = async () => {
    console.log('[ConnectedData] Apple Calendar connect tapped', {
      platform: isNativeApp() ? 'native' : 'web',
      supported: isAppleCalendarSupported(),
      permissionStatus: appleCalendarPermissionStatus,
    });
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: 'connect_started',
      userId: user?.id,
      nativePermissionState: appleCalendarPermissionStatus ?? 'unknown',
      meta: { platform: isNativeApp() ? 'native' : 'web' },
    });
    if (!isAppleCalendarSupported()) {
      toast.info('Apple Calendar is available in the iOS app.');
      return;
    }
    setConnecting('apple-calendar');
    try {
      setAppleCalendarSyncFailed(false);
      const beforeStatus = await getAppleCalendarPermissionStatus();
      console.log('[ConnectedData] Apple Calendar permission before request:', beforeStatus);
      const granted = await requestAppleCalendarPermission();
      const permissionStatus = await getAppleCalendarPermissionStatus();
      setAppleCalendarPermissionStatus(permissionStatus);
      const verified = granted && isAppleCalendarAuthorizedStatus(permissionStatus);
      console.log('[ConnectedData] Apple Calendar permission request result:', { granted, verified, permissionStatus });
      if (!granted) {
        toast.error('Calendar permission denied. Enable in Settings → Privacy → Calendars.');
        return;
      }
      if (!verified) {
        toast.error('Apple Calendar permission could not be verified. Enable full calendar access in iOS Settings.');
        return;
      }
      clearAppleCalendarManualDisconnect();
      const optimisticConnectedAt = new Date().toISOString();
      setStatus(prev => prev
        ? withAppleCalendarProvider(prev, { connected: true, lastSync: prev.calendar.providers?.apple?.lastSync ?? null })
        : {
            calendar: {
              connected: true,
              provider: 'apple',
              lastSync: null,
              providers: {
                apple: { connected: true, lastSync: null },
              },
            },
            appleWatch: {
              connected: false,
              connectionStatus: 'disconnected',
              syncStatus: 'unknown',
              lastSync: null,
            },
            oura: {
              connected: false,
              connectionStatus: 'disconnected',
              syncStatus: 'unknown',
              lastSync: null,
            },
          });
      emitIntegrationEvent({
        provider: 'apple-calendar',
        event: 'native_verify_success',
        userId: user?.id,
        connectionState: 'permission_connected',
        nativePermissionState: permissionStatus,
        meta: { optimisticConnectedAt },
      });
      console.log('[ConnectedData] Apple Calendar sync started after connect');
      const result = await syncAppleCalendarToBackend({ reason: 'connect' });
      console.log('[ConnectedData] Apple Calendar initial sync result:', JSON.stringify(result));
      if (result.success) {
        // Note: syncAppleCalendarToBackend already delegated to the native
        // bridge — do NOT invoke forceNativeCalendarSync again here or we
        // trigger a duplicate sync + a second (parallel) drain.
        toast.success(appleCalendarSyncSuccessMessage('connect', result.eventCount));
        setStatus(prev => prev
          ? withAppleCalendarProvider(prev, { connected: true, lastSync: new Date().toISOString() })
          : prev);
        invalidatePlanCache();
        clearOuterReadinessCache(user?.id);
        queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
        await fetchStatus();
      } else {
        setAppleCalendarSyncFailed(true);
        toast.warning(result.error || 'Apple Calendar is connected. Sync will retry when the app is active.');
        // Fire-and-forget retry — swallow errors here since we already
        // surfaced a warning toast.
        forceNativeCalendarSync().catch(() => {});
        await fetchStatus();
      }
    } catch (err) {
      console.error('[ConnectedData] Apple Calendar connect error:', err);
      toast.error('Failed to connect Apple Calendar');
    } finally {
      setConnecting(null);
    }
  };

  const handleSyncAppleCalendar = async () => {
    if (!isAppleCalendarSupported()) return;
    setSyncing(true);
    try {
      setAppleCalendarSyncFailed(false);
      console.log('[ConnectedData] Apple Calendar manual sync started');
      const result = await syncAppleCalendarToBackend({ reason: 'manual_sync_now' });
      console.log('[ConnectedData] Apple Calendar manual sync result:', JSON.stringify(result));
      if (result.success) {
        toast.success(appleCalendarSyncSuccessMessage('manual', result.eventCount));
        setStatus(prev => prev
          ? withAppleCalendarProvider(prev, { connected: true, lastSync: new Date().toISOString() })
          : prev);
        invalidatePlanCache();
        clearOuterReadinessCache(user?.id);
        queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
        await fetchStatus();
      } else {
        setAppleCalendarSyncFailed(true);
        toast.error(result.error || 'Sync failed');
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectAppleCalendar = async () => {
    try {
      setConnecting('apple-calendar');
      emitIntegrationEvent({ provider: 'apple-calendar', event: 'disconnect_started', userId: user?.id });
      const token = await getAuthToken();
      let backendOk = false;
      try {
        const res = await fetch(
          getSupabaseFunctionUrl('calendar-auth'),
          {
            method: 'POST',
            headers: getSupabaseFunctionHeaders(token),
            body: JSON.stringify({ action: 'disconnect', provider: 'apple' }),
          }
        );
        backendOk = res.ok;
      } catch (netErr) {
        console.warn('[ConnectedData] Apple Calendar backend disconnect failed (network):', netErr);
      }
      if (!backendOk) {
        // Backend unreachable: keep local UI truthful, queue retry, do NOT
        // restore optimistic connected state.
        queuePendingDisconnect('apple-calendar');
        emitIntegrationEvent({
          provider: 'apple-calendar',
          event: 'disconnect_failed',
          errorCode: 'backend_unreachable',
        });
      } else {
        emitIntegrationEvent({ provider: 'apple-calendar', event: 'disconnect_success' });
        clearPendingDisconnect('apple-calendar');
      }
      markAppleCalendarManuallyDisconnected();
      clearIntegrationCaches('calendar');
      setStatus(prev => {
        if (!prev) return prev;
        return withAppleCalendarProvider(prev, { connected: false, lastSync: null });
      });
      invalidatePlanCache();
      clearOuterReadinessCache(user?.id);
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      toast.success('Apple Calendar disconnected');
      // Explicit iOS Settings guidance: in-app disconnect never revokes the
      // underlying EventKit permission. Show this at the actual disconnect
      // flow so users aren't left thinking device-level access is gone.
      showAppleCalendarPermissionRevokeNotice();
      await fetchStatus();
    } catch (err) {
      console.error('[ConnectedData] Apple Calendar disconnect result:', err);
      emitIntegrationEvent({
        provider: 'apple-calendar',
        event: 'disconnect_failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      toast.error('Failed to disconnect Apple Calendar');
    } finally {
      setConnecting(null);
    }
  };

  /* ─── Apple Health Handlers ─── */

  const handleConnectAppleHealth = async () => {
    if (!isNativeApp()) {
      toast.info('Apple Health connects via the native iOS app. Download MindModule from the App Store to connect.');
      return;
    }
    setConnecting('apple-health');
    try {
      console.log('[ConnectedData] Starting Apple Health connect flow...');
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        console.warn('[ConnectedData] HealthKit permission denied or verification failed');
        toast.error('Health permissions were denied. Please enable in Settings > Privacy > Health.');
        setConnecting(null);
        return;
      }

      console.log('[ConnectedData] HealthKit permission verified, triggering sync...');
      toast.info('Apple Health permission verified. Syncing data…');

      // Immediately sync HealthKit data
      const result = await syncHealthKitToBackend();
      console.log('[ConnectedData] Sync result:', JSON.stringify(result));

      if (result.connectionState === 'connected' && result.dbPersisted) {
        toast.success('Apple Health data synced successfully');
      } else if (result.connectionState === 'connected' && !result.dbPersisted) {
        toast.warning('Apple Health connected but data could not be saved to server. Will retry.');
      } else if (result.connectionState === 'connected_but_waiting_for_data') {
        toast.info('Apple Health is connected. Waiting for new HRV data from Apple Health.');
      } else if (result.connectionState === 'sync_delayed') {
        // Distinguish persistence failures from soft "catching up" states.
        // `persist_failed:*` and `healthkit_read_failed` represent real issues
        // the user may need to act on; everything else is a normal background
        // catch-up.
        const code = result.errorCode ?? '';
        if (code.startsWith('persist_failed') || code === 'healthkit_read_failed') {
          toast.warning('Apple Health connected, but server sync needs attention. We\'ll retry automatically.');
        } else {
          toast.info('Apple Health connected. Catching up in the background.');
        }
      } else if (result.connectionState === 'permission_revoked') {
        toast.error('Apple Health permission was revoked. Please reconnect in Health settings.');
      } else {
        toast.error('Apple Health encountered an issue. Try Sync Now later.');
      }

      // Refresh status from backend
      await fetchStatus();
      // Wearable connection just changed — wipe brief caches so the next
      // mount can promote an awaiting state to a real brief.
      clearOuterReadinessCache(user?.id);
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
    } catch (err) {
      console.error('[ConnectedData] Apple Health connect error:', err);
      toast.error('Failed to connect Apple Health');
    } finally {
      setConnecting(null);
    }
  };

  const handleSyncAppleHealth = async () => {
    if (!isNativeApp()) return;
    setSyncing(true);
    try {
      console.log('[ConnectedData] Manual Apple Health sync triggered...');
      const result = await syncHealthKitToBackend();
      console.log('[ConnectedData] Manual sync result:', JSON.stringify(result));

      if (result.connectionState === 'connected' && result.dbPersisted) {
        toast.success('Apple Health data synced');
        await fetchStatus();
        clearOuterReadinessCache(user?.id);
        queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      } else if (result.connectionState === 'connected' && !result.dbPersisted) {
        toast.warning('Data read from Apple Health but could not be saved. Will retry on next sync.');
        await fetchStatus();
      } else if (result.connectionState === 'connected_but_waiting_for_data') {
        toast.info('Apple Health is connected. Waiting for new HRV data.');
        await fetchStatus();
      } else if (result.connectionState === 'sync_delayed') {
        const code = result.errorCode ?? '';
        if (code.startsWith('persist_failed') || code === 'healthkit_read_failed') {
          toast.warning('Sync to server failed. We\'ll retry automatically — pull to refresh if it persists.');
        } else {
          toast.info('Apple Health is connected. Catching up in the background.');
        }
        await fetchStatus();
      } else if (result.connectionState === 'permission_revoked') {
        toast.error('Apple Health permission revoked. Please reconnect.');
        await fetchStatus();
      } else {
        toast.error('Apple Health sync failed');
      }
    } catch (err) {
      console.error('[ConnectedData] Apple Health sync error:', err);
      toast.error('Apple Health sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectAppleHealth = async () => {
    // Confirm — make it clear historical data is preserved
    const confirmed = window.confirm(
      'Disconnect Apple Health?\n\nYour historical data locally available will only be accessed. Reconnecting will resume syncing so your system stays up to date.'
    );
    if (!confirmed) return;

    try {
      clearIntegrationCaches('wearable');
      const backendDisconnected = await disconnectAppleHealthFromBackend();
      if (!backendDisconnected) {
        // Keep UI truthful (we still flip to disconnected locally) but queue
        // a server retry. Telemetry already emitted by the service.
        queuePendingDisconnect('apple-health');
        toast.warning('Disconnected locally — will retry server sync when online.');
      } else {
        clearPendingDisconnect('apple-health');
      }

      clearHealthKitPermission();
      setStatus(prev => prev ? {
        ...prev,
        appleWatch: {
          connected: false,
          connectionStatus: 'disconnected',
          syncStatus: 'unknown',
          lastSync: null,
          lastSampleAt: prev.appleWatch?.lastSampleAt ?? null,
          hasHistoricalData: prev.appleWatch?.hasHistoricalData ?? false,
          needsReconnect: false,
          watchConnectedAt: null,
          disconnectedAt: new Date().toISOString(),
          lastError: null,
          lastErrorAt: null,
        }
      } : prev);
      toast.success('Apple Health disconnected');
      clearOuterReadinessCache(user?.id);
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      console.log('[ConnectedData] Apple Health disconnect complete');
    } catch (err) {
      console.error('[ConnectedData] Apple Health disconnect failed:', err);
      toast.error('Failed to disconnect Apple Health');
    }
  };

  /* ─── Derive Apple Health display state ─── */

  const getAppleHealthState = () => {
    const aw = status?.appleWatch;
    if (!aw) {
      return {
        isLinked: false,
        isHealthyConnected: false,
        statusLabel: 'Disconnected',
        statusNote: undefined as string | undefined,
        showReconnect: false,
      };
    }

    const lastSyncNote = aw.lastSync
      ? `Last synced ${formatDistanceToNowStrict(new Date(aw.lastSync), { addSuffix: true })}`
      : undefined;
    const lastSampleNote = aw.lastSampleAt
      ? `Last sample ${formatDistanceToNowStrict(new Date(aw.lastSampleAt), { addSuffix: true })}`
      : undefined;

    if (aw.connectionStatus === 'connected') {
      // Permission is the authority for "connected". Stale samples are
      // "awaiting data", not a disconnect. Only real persist failures or
      // explicit error states surface as Sync failed.
      const code = aw.lastError ?? '';
      const hasPersistFailure =
        code.startsWith('persist_failed') || code === 'healthkit_read_failed';

      if (hasPersistFailure) {
        return {
          isLinked: true,
          isHealthyConnected: false,
          statusLabel: 'Sync failed',
          statusNote: [
            'We could not save the latest sync — we will retry automatically.',
            lastSampleNote,
          ].filter(Boolean).join(' · '),
          showReconnect: false,
        };
      }

      const hoursSinceSample = aw.lastSampleAt
        ? (Date.now() - new Date(aw.lastSampleAt).getTime()) / (1000 * 60 * 60)
        : null;
      const hasRecentSample = hoursSinceSample !== null && hoursSinceSample <= 24;
      const hasHistoricalSample = !!aw.lastSampleAt || aw.hasHistoricalData === true;
      const awaitingData =
        (aw.syncStatus === 'waiting_for_data' && !hasHistoricalSample) ||
        aw.syncStatus === 'watch_unavailable' ||
        aw.syncStatus === 'sync_delayed' ||
        (hoursSinceSample !== null && hoursSinceSample > 24);

      if (awaitingData) {
        return {
          isLinked: true,
          // Still healthy — permission is granted, just no fresh data.
          isHealthyConnected: true,
          statusLabel: 'Connected · waiting for new data',
          statusNote: [
            'No new data yet — wear your device overnight to refresh.',
            lastSampleNote,
          ].filter(Boolean).join(' · '),
          showReconnect: false,
        };
      }

      if (aw.syncStatus === 'waiting_for_data' && hasRecentSample) {
        return {
          isLinked: true,
          isHealthyConnected: true,
          statusLabel: 'Connected',
          statusNote: [lastSyncNote, lastSampleNote].filter(Boolean).join(' · ') || undefined,
          showReconnect: false,
        };
      }

      return {
        isLinked: true,
        isHealthyConnected: true,
        statusLabel: 'Connected',
        statusNote: [lastSyncNote, lastSampleNote].filter(Boolean).join(' · ') || undefined,
        showReconnect: false,
      };
    }

    if (aw.connectionStatus === 'connecting') {
      return {
        isLinked: false,
        isHealthyConnected: false,
        statusLabel: 'Verifying…',
        statusNote: 'Checking HealthKit authorization',
        showReconnect: false,
      };
    }

    if (aw.connectionStatus === 'permission_revoked') {
      return {
        isLinked: false,
        isHealthyConnected: false,
        statusLabel: 'Permission needed',
        statusNote: 'Go to iOS Settings → Privacy → Health to re-enable, then tap Reconnect',
        showReconnect: true,
      };
    }

    if (aw.connectionStatus === 'error') {
      return {
        isLinked: false,
        isHealthyConnected: false,
        statusLabel: 'Sync failed',
        statusNote: aw.lastError ? 'A HealthKit sync error needs attention' : 'Reconnect may be required to restore sync',
        showReconnect: true,
      };
    }

    return {
      isLinked: false,
      isHealthyConnected: false,
      statusLabel: 'Disconnected',
      statusNote: aw.hasHistoricalData ? 'Historical data is still available' : undefined,
      showReconnect: false,
    };
  };

  const appleHealthState = status
    ? getAppleHealthState()
    : { isLinked: false, isHealthyConnected: false, statusLabel: 'Disconnected', statusNote: undefined, showReconnect: false };

  /* ─── Oura Ring ─── */

  const handleConnectOura = useCallback(async () => {
    setConnecting('oura');
    try {
      const { url, error } = await startOuraOAuth();
      if (error || !url) {
        toast.error('Could not start Oura connection');
        return;
      }
      // Redirect user to Oura authorize page. Capacitor's openUrl handles
      // both web and native (Safari View Controller on iOS).
      await openUrl(url);
    } catch (err) {
      console.error('[ConnectedData] Oura connect error:', err);
      toast.error('Failed to connect Oura');
    } finally {
      setConnecting(null);
    }
  }, []);

  const handleSyncOura = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await triggerOuraSync(true);
      if (r.ok) toast.success('Oura data synced');
      else toast.warning('Oura sync could not complete — will retry automatically');
      await fetchStatus();
    } finally {
      setSyncing(false);
    }
  }, [fetchStatus]);

  const handleDisconnectOura = useCallback(async () => {
    emitIntegrationEvent({ provider: 'oura', event: 'disconnect_started' });
    try {
      const token = await getAuthToken();
      const url = getSupabaseFunctionUrl('disconnect-oura');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...getSupabaseFunctionHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await readResponseBody(res).catch(() => '');
        emitIntegrationEvent({
          provider: 'oura',
          event: 'disconnect_failed',
          errorCode: `http_${res.status}`,
          errorMessage: typeof body === 'string' ? body.slice(0, 200) : undefined,
        });
        toast.error('Could not disconnect Oura — please try again');
        return;
      }
      // Invalidate readiness caches that may have been keyed off Oura data.
      try { clearOuterReadinessCache(user?.id); } catch { /* noop */ }
      emitIntegrationEvent({ provider: 'oura', event: 'disconnect_success' });
      toast.success('Oura disconnected');
      await fetchStatus();
    } catch (err) {
      emitIntegrationEvent({
        provider: 'oura',
        event: 'disconnect_failed',
        errorCode: 'network_error',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      toast.error('Failed to disconnect Oura');
    }
  }, [fetchStatus, user?.id]);

  const getOuraState = () => {
    const o = status?.oura;
    if (!o) return { isLinked: false, isHealthyConnected: false, statusLabel: 'Disconnected' as string, statusNote: undefined as string | undefined, showReconnect: false };
    if (o.connectionStatus === 'connected') {
      const lastSyncNote = o.lastSync ? `Last synced ${formatDistanceToNowStrict(new Date(o.lastSync), { addSuffix: true })}` : undefined;
      const hoursSinceSample = o.lastSampleAt
        ? (Date.now() - new Date(o.lastSampleAt).getTime()) / (1000 * 60 * 60)
        : null;
      const awaitingData =
        o.syncStatus === 'waiting_for_data' ||
        o.syncStatus === 'sync_delayed' ||
        (hoursSinceSample !== null && hoursSinceSample > 24);
      if (awaitingData) {
        return {
          isLinked: true,
          // Token is valid — surface as healthily connected, just no fresh data.
          isHealthyConnected: true,
          statusLabel: 'Connected · waiting for new data',
          statusNote: 'No new data yet — wear the ring overnight to refresh.',
          showReconnect: false,
        };
      }
      return { isLinked: true, isHealthyConnected: true, statusLabel: 'Connected', statusNote: lastSyncNote, showReconnect: false };
    }
    if (o.connectionStatus === 'permission_revoked') {
      return { isLinked: true, isHealthyConnected: false, statusLabel: 'Permission needed', statusNote: 'Reconnect to resume syncing', showReconnect: true };
    }
    if (o.connectionStatus === 'connecting') {
      return { isLinked: false, isHealthyConnected: false, statusLabel: 'Verifying…', statusNote: 'Completing Oura authorization', showReconnect: false };
    }
    if (o.connectionStatus === 'error') {
      return { isLinked: true, isHealthyConnected: false, statusLabel: 'Sync failed', statusNote: o.lastError ?? 'We will retry automatically.', showReconnect: false };
    }
    return { isLinked: false, isHealthyConnected: false, statusLabel: 'Disconnected', statusNote: undefined, showReconnect: false };
  };

  const ouraState = getOuraState();

  // OAuth-return handler — show toast based on callback query string.
  useEffect(() => {
    const cb = searchParams.get('oura_connected');
    if (cb === null) return;
    const ok = cb === 'true';
    const reason = searchParams.get('reason');
    searchParams.delete('oura_connected');
    searchParams.delete('reason');
    setSearchParams(searchParams, { replace: true });
    if (ok) {
      toast.success('Oura connected. Pulling your last 7 days…');
      fetchStatus();
    } else {
      toast.error(`Oura connect failed${reason ? `: ${reason}` : ''}`);
    }
  }, [searchParams, setSearchParams, fetchStatus]);

  /* ─── Connection Data ─── */

  const googleConnected = status?.calendar.providers?.google?.connected
    ?? (status?.calendar.connected && status?.calendar.provider === 'google')
    ?? false;
  const microsoftConnected = status?.calendar.providers?.microsoft?.connected
    ?? (status?.calendar.connected && status?.calendar.provider === 'microsoft')
    ?? false;
  const appleCalendarDbConnected = status?.calendar.providers?.apple?.connected ?? false;
  const appleCalendarPermissionGranted = isAppleCalendarSupported()
    ? isAppleCalendarAuthorizedStatus(appleCalendarPermissionStatus)
    : false;
  const appleCalendarNativeLinked = isAppleCalendarSupported()
    && appleCalendarPermissionGranted
    && !wasAppleCalendarManuallyDisconnected();
  const appleCalendarConnected = appleCalendarDbConnected || appleCalendarNativeLinked;
  const appleCalendarPermissionDenied = isAppleCalendarSupported()
    && appleCalendarPermissionStatus !== null
    && (appleCalendarPermissionStatus === 'denied' || appleCalendarPermissionStatus === 'restricted');
  const googleLastSync = status?.calendar.providers?.google?.lastSync
    ?? (googleConnected ? (status?.calendar.lastSync ?? null) : null);
  const microsoftLastSync = status?.calendar.providers?.microsoft?.lastSync
    ?? (microsoftConnected ? (status?.calendar.lastSync ?? null) : null);
  const appleCalendarLastSync = status?.calendar.providers?.apple?.lastSync ?? null;
  const appleCalendarSyncState = deriveSyncState({
    backendConnectionState: appleCalendarConnected ? 'connected' : 'disconnected',
    backendSyncStatus: appleCalendarPermissionDenied ? 'permission_revoked' : 'synced',
    lastSyncAt: appleCalendarLastSync,
    staleThresholdHours: 24,
  });
  const isOnIOS = isAppleCalendarSupported();
  const showAppleCalendar = isOnIOS;
  const appleCalendarStatusLabel = appleCalendarPermissionDenied
    ? 'Permission denied'
    : appleCalendarSyncFailed
      ? 'Sync failed'
    : appleCalendarConnected && appleCalendarSyncState === 'stale'
      ? 'Needs sync'
      : appleCalendarConnected && appleCalendarSyncState === 'never_synced'
        ? 'Connected via iOS app'
        : appleCalendarConnected && appleCalendarLastSync
          ? 'Connected · synced'
          : appleCalendarConnected
            ? 'Connected via iOS app'
            : 'Disconnected';
  const appleCalendarStatusNote = appleCalendarPermissionDenied
    ? 'Enable full calendar access in iOS Settings, then reconnect.'
    : appleCalendarSyncFailed
      ? 'Tap Sync now to retry.'
    : appleCalendarConnected && appleCalendarSyncState === 'never_synced'
      ? 'No successful sync yet. Tap Sync now.'
      : appleCalendarConnected && appleCalendarSyncState === 'stale'
        ? 'Last successful sync is older than 24 hours. Tap Sync now.'
        : undefined;

  useEffect(() => {
    console.log('[ConnectedData] Platform detected for calendar rows:', {
      platform: isOnIOS ? 'ios-native' : 'web',
      showGoogle: true,
      showMicrosoft: true,
      showAppleCalendar,
    });
  }, [isOnIOS, showAppleCalendar]);

  useEffect(() => {
    console.log('[ConnectedData] Final Apple Calendar UI status:', {
      dbConnected: appleCalendarDbConnected,
      permissionStatus: appleCalendarPermissionStatus,
      permissionGranted: appleCalendarPermissionGranted,
      connected: appleCalendarConnected,
      lastSync: appleCalendarLastSync,
      syncState: appleCalendarSyncState,
      statusLabel: appleCalendarStatusLabel,
    });
  }, [
    appleCalendarDbConnected,
    appleCalendarPermissionStatus,
    appleCalendarPermissionGranted,
    appleCalendarConnected,
    appleCalendarLastSync,
    appleCalendarSyncState,
    appleCalendarStatusLabel,
  ]);

  const connections = [
    {
      id: 'google-calendar',
      name: CALENDAR_PROVIDER_META.google.name,
      description: CALENDAR_PROVIDER_META.google.note,
      logo: <img src={googleCalendarLogo} alt="Google Calendar" className="h-8 w-8 rounded" loading="lazy" width={32} height={32} />,
      connected: googleConnected,
      linked: googleConnected,
      lastSync: googleConnected ? formatLastSync(googleLastSync) : null,
      statusLabel: undefined as string | undefined,
      statusNote: undefined as string | undefined,
      showReconnect: false,
      onConnect: handleConnectCalendar,
      onDisconnect: handleDisconnectGoogle,
      onSync: handleSyncGoogle,
      canSync: true,
    },
    {
      id: 'microsoft-calendar',
      name: CALENDAR_PROVIDER_META.microsoft.name,
      description: CALENDAR_PROVIDER_META.microsoft.note,
      logo: <img src={microsoftCalendarLogo} alt="Microsoft Outlook" className="h-8 w-8 rounded" loading="lazy" width={32} height={32} />,
      connected: microsoftConnected,
      linked: microsoftConnected,
      lastSync: microsoftConnected ? formatLastSync(microsoftLastSync) : null,
      statusLabel: undefined as string | undefined,
      statusNote: undefined as string | undefined,
      showReconnect: false,
      onConnect: handleConnectMicrosoftCalendar,
      onDisconnect: handleDisconnectMicrosoft,
      onSync: handleSyncMicrosoft,
      canSync: true,
    },
    ...(showAppleCalendar ? [{
      id: 'apple-calendar',
      name: CALENDAR_PROVIDER_META.apple.name,
      description: CALENDAR_PROVIDER_META.apple.note,
      logo: (
        <div className="h-8 w-8 rounded-[10px] bg-foreground/5 border border-border flex items-center justify-center">
          <CalendarDays className="h-4 w-4 text-foreground/70" />
        </div>
      ),
      connected: appleCalendarConnected,
      linked: appleCalendarConnected,
      lastSync: appleCalendarConnected ? formatLastSync(appleCalendarLastSync) : null,
      statusLabel: appleCalendarStatusLabel,
      statusNote: appleCalendarStatusNote,
      showReconnect: appleCalendarPermissionDenied,
      onConnect: handleConnectAppleCalendar,
      onDisconnect: appleCalendarConnected ? handleDisconnectAppleCalendar : undefined,
      onSync: appleCalendarConnected ? handleSyncAppleCalendar : undefined,
      canSync: appleCalendarConnected,
    }] : []),
    {
      id: 'apple-health',
      name: WEARABLE_PROVIDER_META['apple-health'].name,
      description: WEARABLE_PROVIDER_META['apple-health'].note,
      logo: <img src={appleHealthIcon} alt="Apple Health" className="h-8 w-8 rounded-[10px]" />,
      connected: appleHealthState.isHealthyConnected,
      linked: appleHealthState.isLinked,
      lastSync: formatLastSync(status?.appleWatch?.lastSync ?? null),
      statusLabel: appleHealthState.statusLabel,
      statusNote: appleHealthState.statusNote,
      showReconnect: appleHealthState.showReconnect,
      onConnect: handleConnectAppleHealth,
      onDisconnect: handleDisconnectAppleHealth,
      onSync: handleSyncAppleHealth,
      canSync: isNativeApp(),
    },
    {
      id: 'oura',
      name: WEARABLE_PROVIDER_META.oura.name,
      description: WEARABLE_PROVIDER_META.oura.note,
      logo: (
        <div className="h-8 w-8 rounded-full bg-foreground/5 border border-border flex items-center justify-center text-[10px] font-semibold text-foreground/70 tracking-wider">
          OURA
        </div>
      ),
      // Oura is a direct OAuth integration on both web and iOS. Apple Health
      // may also surface Oura samples, but the Oura Ring row always offers a
      // first-class OAuth/sync/disconnect path so users aren't stranded.
      connected: ouraState.isHealthyConnected,
      linked: ouraState.isLinked,
      lastSync: formatLastSync(status?.oura?.lastSync ?? null),
      statusLabel: ouraState.statusLabel,
      statusNote: ouraState.statusNote,
      showReconnect: ouraState.showReconnect,
      onConnect: handleConnectOura,
      onDisconnect: ouraState.isLinked ? handleDisconnectOura : undefined,
      onSync: handleSyncOura,
      canSync: true,
    },
  ];

  const calendarIds = new Set(['google-calendar', 'microsoft-calendar', 'apple-calendar']);
  const calendarConnections = connections.filter((c) => calendarIds.has(c.id));
  const wearableConnections = connections.filter((c) => !calendarIds.has(c.id));

  const renderRow = (conn: (typeof connections)[number]) => (
    <ProviderRowCard
      key={conn.id}
      id={conn.id}
      name={conn.name}
      description={conn.description}
      logo={conn.logo}
      connected={conn.connected}
      linked={conn.linked}
      lastSync={conn.lastSync}
      statusLabel={conn.statusLabel}
      statusNote={conn.statusNote}
      showReconnect={conn.showReconnect}
      isConnecting={connecting === conn.id}
      isSyncing={syncing && (conn.connected || conn.linked)}
      canSync={conn.canSync}
      onConnect={conn.onConnect}
      onSync={conn.onSync}
      onDisconnect={conn.onDisconnect}
    />
  );

  return (
    <ProfilePageLayout backPath="/profile">
        <h1 className="text-[28px] font-headline font-semibold">Manage your connected data</h1>

        {loading ? (
          <EngravedLoader label="Loading connections…" />
        ) : (
          <>
            <p className="text-xs text-muted-foreground leading-[1.65]">
              Connect, reconnect, or disconnect any source. Tap the menu on a connected row to
              sync now or remove it.
            </p>

            {calendarConnections.length > 0 && (
              <section>
                <div className="text-[10px] tracking-[2px] uppercase text-muted-foreground font-medium mb-2">
                  Calendar
                </div>
                {calendarConnections.map(renderRow)}
              </section>
            )}

            {wearableConnections.length > 0 && (
              <section>
                <div className="text-[10px] tracking-[2px] uppercase text-muted-foreground font-medium mb-2">
                  Wearable
                </div>
                {appleHealthBackfilling && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-muted/60">
                    <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                    <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-muted-foreground">
                      Syncing your health history…
                    </span>
                  </div>
                )}
                {wearableConnections.map(renderRow)}
              </section>
            )}

            {showSelfCheckInToggle && (
              <section>
                <div className="text-[10px] tracking-[2px] uppercase text-muted-foreground font-medium mb-2">
                  Preferences
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5 rounded-[14px] border bg-card mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-foreground">
                      Daily self check-ins
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-[1.45]">
                      Adds a short morning check-in for a more rounded assessment alongside your
                      wearable.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleSelfCheckIns(!selfCheckInsEnabled)}
                    disabled={updatingSelfCheckIns}
                    aria-label="Toggle daily self check-ins"
                    aria-pressed={selfCheckInsEnabled}
                    className={`relative w-[46px] h-[26px] rounded-full shrink-0 transition-colors disabled:opacity-50 ${
                      selfCheckInsEnabled ? 'bg-saffron' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${
                        selfCheckInsEnabled ? 'left-[23px]' : 'left-[3px]'
                      }`}
                    />
                  </button>
                </div>
              </section>
            )}

            <div className="flex items-center gap-3 pt-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() => navigate('/privacy')}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Privacy Policy
              </button>
              <span className="text-muted-foreground/50">·</span>
              <button
                type="button"
                onClick={() => navigate('/terms')}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Terms of Use
              </button>
            </div>

            {isQaDebugEnabled() && (
              <details className="mt-4 rounded-[14px] border bg-card p-3">
                <summary className="text-[11px] tracking-[1.5px] uppercase text-muted-foreground cursor-pointer">
                  QA debug
                </summary>
                <div className="mt-3">
                  <AppleIntegrationsDebugPanel
                    derived={{
                      appleHealthLabel: appleHealthState.statusLabel,
                      appleHealthLastSync: status?.appleWatch?.lastSync ?? null,
                      appleHealthSyncStatus: status?.appleWatch?.syncStatus ?? null,
                      appleHealthConnectionStatus: status?.appleWatch?.connectionStatus ?? null,
                      appleCalendarLabel: appleCalendarConnected
                        ? 'Connected'
                        : appleCalendarPermissionDenied
                        ? 'Permission denied'
                        : 'Disconnected',
                      appleCalendarLastSync: appleCalendarLastSync,
                      appleCalendarPermissionStatus: appleCalendarPermissionStatus,
                    }}
                  />
                </div>
              </details>
            )}
          </>
        )}
    </ProfilePageLayout>
  );
};

export default ConnectedData;
