import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MoreVertical, RefreshCw, CalendarDays } from 'lucide-react';
import EngravedLoader from '@/components/ui/engraved-loader';
import UnifiedTopBar from '@/components/navigation/UnifiedTopBar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { requestHealthKitPermissions, isNativeApp, verifyHealthKitAccess } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend, clearHealthKitPermission, disconnectAppleHealthFromBackend } from '@/services/wearableSyncService';
import { clearOuterReadinessCache } from '@/hooks/useOuterReadiness';
import { clear as clearPersistent, cacheKeys, localISODate } from '@/utils/persistentBriefCache';
import { clearLocalCalendarData, clearLocalWearableData } from '@/services/localDataStore';
import { openUrl } from '@/utils/openUrl';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';

import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import appleHealthIcon from '@/assets/shared/apple-health-icon.png';
import microsoftCalendarLogo from '@/assets/shared/microsoft-calendar-logo.png';
import { getAppleCalendarPermissionStatus, isAppleCalendarAuthorizedStatus, isAppleCalendarSupported, requestAppleCalendarPermission } from '@/utils/appleCalendar';
import { syncAppleCalendarToBackend } from '@/services/appleCalendarSync';
import { forceNativeCalendarSync } from '@/utils/nativeBackgroundSync';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import {
  isQaDebugEnabled,
  queuePendingDisconnect,
  clearPendingDisconnect,
  getPendingDisconnects,
} from '@/utils/integrationQaHelpers';
import AppleIntegrationsDebugPanel from '@/components/debug/AppleIntegrationsDebugPanel';
import { describeFetchError, getSupabaseFunctionHeaders, getSupabaseFunctionUrl, readResponseBody } from '@/utils/supabaseFunctions';
import { Switch } from '@/components/ui/switch';
import { useCheckInMode } from '@/hooks/useCheckInMode';

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
  };
}

/** Trigger sync-calendar edge function with Auth0 token */
async function triggerCalendarSync(provider: string): Promise<{ success: boolean; eventCount?: number; reconnectRequired?: boolean; skipped?: boolean; error?: string }> {
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
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [appleCalendarPermissionStatus, setAppleCalendarPermissionStatus] = useState<string | null>(null);

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
        const providers = { ...(next.calendar.providers ?? {}) };
        providers.apple = { connected: false, lastSync: null };
        const googleConnected = providers.google?.connected ?? false;
        const microsoftConnected = providers.microsoft?.connected ?? false;
        const remainingProvider = googleConnected ? 'google' : microsoftConnected ? 'microsoft' : null;
        next = {
          ...next,
          calendar: {
            ...next.calendar,
            connected: googleConnected || microsoftConnected,
            provider: remainingProvider,
            lastSync: remainingProvider ? providers[remainingProvider]?.lastSync ?? null : null,
            providers,
          },
        };
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
        const verifiedStatus = await verifyNativeConnectionState(data);
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
        const stillConnected = googleStillConnected || microsoftStillConnected;
        const remainingProvider = googleStillConnected ? 'google' : microsoftStillConnected ? 'microsoft' : null;
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
    if (!isAppleCalendarSupported()) {
      toast.info('Apple Calendar is available in the iOS app.');
      return;
    }
    setConnecting('apple-calendar');
    try {
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
      const result = await syncAppleCalendarToBackend();
      console.log('[ConnectedData] Apple Calendar initial sync result:', JSON.stringify(result));
      if (result.success) {
        // Belt-and-braces: also trigger a native fetch so the iOS background
        // observer is primed and the next event change is picked up instantly.
        void forceNativeCalendarSync();
        toast.success(`Apple Calendar connected — synced ${result.eventCount ?? 0} events`);
        invalidatePlanCache();
        clearOuterReadinessCache(user?.id);
        queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
        await fetchStatus();
      } else {
        try {
          const token = await getAuthToken();
          await fetch(getSupabaseFunctionUrl('calendar-auth'), {
            method: 'POST',
            headers: getSupabaseFunctionHeaders(token),
            body: JSON.stringify({ action: 'disconnect', provider: 'apple' }),
          });
          clearIntegrationCaches('calendar');
          await fetchStatus();
        } catch (cleanupErr) {
          console.warn('[ConnectedData] Apple Calendar cleanup after failed sync failed:', cleanupErr);
        }
        toast.error(result.error || 'Apple Calendar connected but initial sync failed.');
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
      const result = await syncAppleCalendarToBackend();
      if (result.success) {
        toast.success(`Synced ${result.eventCount ?? 0} events`);
        invalidatePlanCache();
        clearOuterReadinessCache(user?.id);
        queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
        await fetchStatus();
      } else {
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
      clearIntegrationCaches('calendar');
      setStatus(prev => {
        if (!prev) return prev;
        const providers = { ...(prev.calendar.providers ?? {}) };
        providers.apple = { connected: false, lastSync: null };
        const googleConnected = providers.google?.connected ?? false;
        const microsoftConnected = providers.microsoft?.connected ?? false;
        const remainingProvider = googleConnected ? 'google' : microsoftConnected ? 'microsoft' : null;
        return {
          ...prev,
          calendar: {
            connected: googleConnected || microsoftConnected,
            provider: remainingProvider,
            lastSync: remainingProvider ? providers[remainingProvider]?.lastSync ?? null : null,
            providers,
          },
        };
      });
      invalidatePlanCache();
      clearOuterReadinessCache(user?.id);
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      toast.success('Apple Calendar disconnected');
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

    // Detect if DB state may be stale
    const statusUpdatedAt = aw.statusUpdatedAt;
    const hoursSinceStatusUpdate = statusUpdatedAt
      ? (Date.now() - new Date(statusUpdatedAt).getTime()) / (1000 * 60 * 60)
      : null;
    // On web: stale after 2h. On native: stale after 24h (since native re-verifies on resume).
    const staleThresholdHours = isNativeApp() ? 24 : 2;
    const isDbStateStale = hoursSinceStatusUpdate !== null && hoursSinceStatusUpdate > staleThresholdHours;

    if (aw.connectionStatus === 'connected') {
      // Check if sync is very old (> 24h)
      const hoursSinceSync = aw.lastSync
        ? (Date.now() - new Date(aw.lastSync).getTime()) / (1000 * 60 * 60)
        : null;
      const syncIsOld = hoursSinceSync !== null && hoursSinceSync > 24;

      if (aw.syncStatus === 'waiting_for_data') {
        return {
          isLinked: true,
          isHealthyConnected: false,
          statusLabel: 'Syncing',
          statusNote: [ 'Waiting for new data', lastSyncNote ].filter(Boolean).join(' · '),
          showReconnect: false,
        };
      }

      if (aw.syncStatus === 'sync_delayed' || aw.syncStatus === 'watch_unavailable') {
        // Distinguish "watch wasn't worn" (last sample > 24h old) from "actual sync failure"
        const hoursSinceSample = aw.lastSampleAt
          ? (Date.now() - new Date(aw.lastSampleAt).getTime()) / (1000 * 60 * 60)
          : null;
        const watchNotWorn = hoursSinceSample !== null && hoursSinceSample > 24;
        const gapMessage = watchNotWorn
          ? `No data captured ${formatDistanceToNowStrict(new Date(aw.lastSampleAt!), { addSuffix: true })} — wear your watch to resume`
          : 'Health data is not syncing cleanly';
        return {
          isLinked: true,
          isHealthyConnected: false,
          statusLabel: watchNotWorn ? 'Needs attention' : 'Not syncing',
          statusNote: [ gapMessage, lastSampleNote ].filter(Boolean).join(' · '),
          showReconnect: false,
        };
      }

      // Normal connected state
      const staleHint = isDbStateStale
        ? 'Status verified when you last opened the app'
        : syncIsOld
          ? 'Open the app on your phone to refresh'
          : undefined;

      return {
        isLinked: true,
        isHealthyConnected: !(isDbStateStale || syncIsOld),
        statusLabel: isDbStateStale || syncIsOld ? 'Needs attention' : 'Connected',
        statusNote: [ lastSyncNote, lastSampleNote, staleHint ].filter(Boolean).join(' · ') || undefined,
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
        statusLabel: 'Permission revoked',
        statusNote: 'Go to iOS Settings → Privacy → Health to re-enable, then tap Reconnect',
        showReconnect: true,
      };
    }

    if (aw.connectionStatus === 'error') {
      return {
        isLinked: false,
        isHealthyConnected: false,
        statusLabel: 'Connection issue',
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
  const appleCalendarConnected = appleCalendarDbConnected && appleCalendarPermissionGranted;
  const appleCalendarPermissionDenied = isAppleCalendarSupported()
    && appleCalendarPermissionStatus !== null
    && (appleCalendarPermissionStatus === 'denied' || appleCalendarPermissionStatus === 'restricted');
  const googleLastSync = status?.calendar.providers?.google?.lastSync
    ?? (googleConnected ? (status?.calendar.lastSync ?? null) : null);
  const microsoftLastSync = status?.calendar.providers?.microsoft?.lastSync
    ?? (microsoftConnected ? (status?.calendar.lastSync ?? null) : null);
  const appleCalendarLastSync = status?.calendar.providers?.apple?.lastSync ?? null;
  const showAppleCalendar = isAppleCalendarSupported();
  const showWebCalendars = !showAppleCalendar;

  const connections = [
    ...(showWebCalendars ? [{
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Get a daily brief and nudges tuned to your real meeting load, decision density, and high stakes events - so practices land when they matter.',
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
      name: 'Microsoft Calendar',
      description: 'Tune your brief and nudges to your Outlook meeting load, decision density and high pressure events - so practices land before high-stakes moments.',
      logo: <img src={microsoftCalendarLogo} alt="Microsoft Calendar" className="h-8 w-8 rounded" loading="lazy" width={32} height={32} />,
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
    }] : []),
    ...(showAppleCalendar ? [{
      id: 'apple-calendar',
      name: 'Apple Calendar',
      description: 'Tune your brief and nudges to your real meeting load, decision density, and high pressure events - so practices land before high-stakes moments.',
      logo: (
        <div className="h-8 w-8 rounded-[10px] bg-foreground/5 border border-border flex items-center justify-center">
          <CalendarDays className="h-4 w-4 text-foreground/70" />
        </div>
      ),
      connected: appleCalendarConnected,
      linked: appleCalendarConnected,
      lastSync: appleCalendarConnected ? formatLastSync(appleCalendarLastSync) : null,
      statusLabel: appleCalendarPermissionDenied ? 'Permission denied' : appleCalendarConnected ? 'Connected' : 'Disconnected',
      statusNote: appleCalendarPermissionDenied
        ? 'Enable full calendar access in iOS Settings, then reconnect'
        : (appleCalendarDbConnected && !appleCalendarConnected ? 'Stored connection is inactive until permission is verified' : undefined),
      showReconnect: appleCalendarPermissionDenied,
      onConnect: handleConnectAppleCalendar,
      onDisconnect: handleDisconnectAppleCalendar,
      onSync: handleSyncAppleCalendar,
      canSync: true,
    }] : []),
    {
      id: 'apple-health',
      name: 'Apple Health',
      description: 'Share HRV, resting HR, sleep, and HR so your readiness reflects your real physiology.',
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
  ];

  return (
    <div className="min-h-screen bg-background" data-tour="connected-data-content">
      <UnifiedTopBar hideCoach backPath="/profile" />

      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8 space-y-4">
        <h1 className="text-[28px] font-headline font-semibold">Connected Data Sources</h1>
        {loading ? (
          <EngravedLoader label="Loading connections…" />
        ) : (
          connections.map((conn) => (
            <Card key={conn.id}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-4">
                  {/* Brand Logo */}
                  <div className="shrink-0">{conn.logo}</div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground">{conn.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-snug break-words">{conn.description}</p>
                    {conn.statusLabel && (
                      <p className="text-xs text-foreground/80 mt-0.5">{conn.statusLabel}</p>
                    )}
                    {conn.connected && conn.lastSync && (
                      <p className="text-xs text-muted-foreground mt-0.5">{conn.lastSync}</p>
                    )}
                    {conn.statusNote && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{conn.statusNote}</p>
                    )}
                    {syncing && (conn.id === 'google-calendar' || conn.id === 'microsoft-calendar' || conn.id === 'apple-calendar' || conn.id === 'apple-health') && (
                      <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
                      </p>
                    )}
                  </div>

                  {/* Action */}
                  {conn.connected || conn.linked ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {conn.canSync && (
                          <DropdownMenuItem
                            onClick={conn.onSync}
                            disabled={syncing}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Sync Now
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={conn.onDisconnect}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : conn.showReconnect ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={conn.onConnect}
                      disabled={connecting === conn.id}
                    >
                      {connecting === conn.id ? 'Connecting…' : 'Reconnect'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={conn.onConnect}
                      disabled={connecting === conn.id}
                    >
                      {connecting === conn.id ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}

        {/* Daily self check-ins toggle — visible to ALL wearable-connected users so they can toggle either direction. */}
        {showSelfCheckInToggle && (
          <Card>
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-foreground">Daily self check-ins</h3>
                  <p className="text-sm text-muted-foreground">
                    Adds a short morning check-in for a more rounded assessment alongside your wearable.
                  </p>
                </div>
                <Switch
                  checked={selfCheckInsEnabled}
                  disabled={updatingSelfCheckIns}
                  onCheckedChange={handleToggleSelfCheckIns}
                  aria-label="Enable daily self check-ins"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legal Links */}
        <div className="flex items-center gap-4">
          <Button
            variant="link"
            className="text-sm text-muted-foreground px-0"
            onClick={() => navigate('/privacy')}
          >
            Privacy Policy
          </Button>
          <span className="text-muted-foreground/40">·</span>
          <Button
            variant="link"
            className="text-sm text-muted-foreground px-0"
            onClick={() => navigate('/terms')}
          >
            Terms of Use
          </Button>
        </div>

        {isQaDebugEnabled() && (
          <AppleIntegrationsDebugPanel
            derived={{
              appleHealthLabel: appleHealthState.statusLabel,
              appleHealthLastSync: status?.appleWatch?.lastSync ?? null,
              appleHealthSyncStatus: status?.appleWatch?.syncStatus ?? null,
              appleHealthConnectionStatus: status?.appleWatch?.connectionStatus ?? null,
              appleCalendarLabel: appleCalendarConnected ? 'Connected' : (appleCalendarPermissionDenied ? 'Permission denied' : 'Disconnected'),
              appleCalendarLastSync: appleCalendarLastSync,
              appleCalendarPermissionStatus: appleCalendarPermissionStatus,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ConnectedData;
