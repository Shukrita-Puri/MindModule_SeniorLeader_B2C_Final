import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MoreVertical, RefreshCw } from 'lucide-react';
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
import { requestHealthKitPermissions, isNativeApp } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend, clearHealthKitPermission, disconnectAppleHealthFromBackend } from '@/services/wearableSyncService';
import { clearOuterReadinessCache } from '@/hooks/useOuterReadiness';
import { clear as clearPersistent, cacheKeys, localISODate } from '@/utils/persistentBriefCache';
import { openUrl } from '@/utils/openUrl';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';

import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import appleHealthIcon from '@/assets/shared/apple-health-icon.png';
import microsoftCalendarLogo from '@/assets/shared/microsoft-calendar-logo.png';

/* ─── Types ─── */

interface ConnectionStatus {
  calendar: { connected: boolean; provider: string | null; lastSync: string | null };
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
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const res = await fetch(
      `https://${projectId}.supabase.co/functions/v1/sync-calendar`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Fetch connection status from backend – NO localStorage overrides
  const fetchStatus = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        console.warn('[ConnectedData] No auth token available, skipping status fetch');
        return;
      }
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/check-connections-status`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        // Trust backend connection state – do NOT override with localStorage
        console.log('[ConnectedData] Connection status from backend:', JSON.stringify(data));
        setStatus(data);
      } else {
        console.error('[ConnectedData] Status fetch failed:', res.status);
      }
    } catch (err) {
      console.error('[ConnectedData] Failed to fetch status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.id) {
      fetchStatus();
    } else {
      setLoading(false);
    }
  }, [user?.id, fetchStatus]);

  // Handle post-OAuth callback: ?calendar_connected=true
  useEffect(() => {
    const calendarCallback = searchParams.get('calendar_connected');
    if (calendarCallback !== 'true') return;

    searchParams.delete('calendar_connected');
    setSearchParams(searchParams, { replace: true });

    console.log('[ConnectedData] Post-OAuth callback detected, triggering sync...');
    setSyncing(true);

    const runPostConnectSync = async () => {
      await new Promise(r => setTimeout(r, 500));

      const token = await getAuthToken();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const statusRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/check-connections-status`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );

      let provider = 'google';
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setStatus(statusData);
        provider = statusData.calendar?.provider || 'google';

        if (!statusData.calendar?.connected) {
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
  }, [searchParams, setSearchParams, fetchStatus, queryClient]);

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
    // If a different calendar is already connected, warn the user.
    // The backend will replace the existing connection (UNIQUE on user_id).
    if (status?.calendar.connected && status.calendar.provider && status.calendar.provider !== targetProvider) {
      const currentLabel = status.calendar.provider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
      const targetLabel = targetProvider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
      const confirmed = window.confirm(
        `${currentLabel} is currently connected.\n\nConnecting ${targetLabel} will replace it. Continue?`
      );
      if (!confirmed) return;
    }

    setConnecting(cardId);
    try {
      const token = await getAuthToken();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/calendar-auth`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
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

  const handleDisconnectCalendar = async () => {
    const provider = status?.calendar.provider || 'google';
    const label = provider === 'microsoft' ? 'Microsoft Calendar' : 'Google Calendar';
    try {
      const token = await getAuthToken();
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/calendar-auth`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ action: 'disconnect', provider }),
        }
      );
      if (!res.ok) throw new Error('Disconnect failed');
      setStatus(prev => prev ? { ...prev, calendar: { connected: false, provider: null, lastSync: null } } : prev);
      invalidatePlanCache();
      clearOuterReadinessCache(user?.id);
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      toast.success(`${label} disconnected`);
    } catch {
      toast.error('Failed to disconnect calendar');
    }
  };

  const handleSyncNow = async () => {
    const provider = status?.calendar.provider || 'google';
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
      toast.success('Apple Health connected');

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
      'Disconnect Apple Health?\n\nYour historical data is preserved. Reconnecting will resume syncing — you won\'t lose anything.'
    );
    if (!confirmed) return;

    try {
      localStorage.removeItem('contextConnections');
      const backendDisconnected = await disconnectAppleHealthFromBackend();
      if (!backendDisconnected) {
        toast.error('Failed to disconnect Apple Health');
        return;
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
    } catch {
      toast.error('Failed to disconnect Apple Health');
    }
  };

  /* ─── Derive Apple Health display state ─── */

  const getAppleHealthState = () => {
    const aw = status?.appleWatch;
    if (!aw) {
      return {
        showConnected: false,
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
    const statusUpdatedAt = (aw as any).statusUpdatedAt;
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
          showConnected: true,
          statusLabel: isDbStateStale ? 'Last known: Connected' : 'Connected',
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
          : 'Catching up — new data will appear shortly';
        return {
          showConnected: true,
          statusLabel: 'Connected',
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
        showConnected: true,
        statusLabel: isDbStateStale ? 'Last known: Connected' : 'Connected',
        statusNote: [ lastSyncNote, lastSampleNote, staleHint ].filter(Boolean).join(' · ') || undefined,
        showReconnect: false,
      };
    }

    if (aw.connectionStatus === 'connecting') {
      return {
        showConnected: false,
        statusLabel: 'Verifying…',
        statusNote: 'Checking HealthKit authorization',
        showReconnect: false,
      };
    }

    if (aw.connectionStatus === 'permission_revoked') {
      return {
        showConnected: false,
        statusLabel: 'Permission revoked',
        statusNote: 'Go to iOS Settings → Privacy → Health to re-enable, then tap Reconnect',
        showReconnect: true,
      };
    }

    if (aw.connectionStatus === 'error') {
      return {
        showConnected: false,
        statusLabel: 'Connection issue',
        statusNote: aw.lastError ? 'A HealthKit sync error needs attention' : 'Reconnect may be required to restore sync',
        showReconnect: true,
      };
    }

    return {
      showConnected: false,
      statusLabel: 'Disconnected',
      statusNote: aw.hasHistoricalData ? 'Historical data is still available' : undefined,
      showReconnect: false,
    };
  };

  const appleHealthState = status
    ? getAppleHealthState()
    : { showConnected: false, statusLabel: 'Disconnected', statusNote: undefined, showReconnect: false };

  /* ─── Connection Data ─── */

  const calendarProvider = status?.calendar.provider ?? null;
  const calendarConnected = status?.calendar.connected ?? false;
  const googleConnected = calendarConnected && calendarProvider === 'google';
  const microsoftConnected = calendarConnected && calendarProvider === 'microsoft';

  const connections = [
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Sync your calendar for contextual recommendations',
      logo: <img src={googleCalendarLogo} alt="Google Calendar" className="h-8 w-8 rounded" loading="lazy" width={32} height={32} />,
      connected: googleConnected,
      lastSync: googleConnected ? formatLastSync(status?.calendar.lastSync ?? null) : null,
      statusLabel: undefined as string | undefined,
      statusNote: undefined as string | undefined,
      showReconnect: false,
      onConnect: handleConnectCalendar,
      onDisconnect: handleDisconnectCalendar,
      onSync: handleSyncNow,
      canSync: true,
    },
    {
      id: 'microsoft-calendar',
      name: 'Microsoft Calendar',
      description: 'Connect your Outlook calendar to help Mind Module understand meetings, decision load, and recovery windows.',
      logo: <img src={microsoftCalendarLogo} alt="Microsoft Calendar" className="h-8 w-8 rounded" loading="lazy" width={32} height={32} />,
      connected: microsoftConnected,
      lastSync: microsoftConnected ? formatLastSync(status?.calendar.lastSync ?? null) : null,
      statusLabel: undefined as string | undefined,
      statusNote: undefined as string | undefined,
      showReconnect: false,
      onConnect: handleConnectMicrosoftCalendar,
      onDisconnect: handleDisconnectCalendar,
      onSync: handleSyncNow,
      canSync: true,
    },
    {
      id: 'apple-health',
      name: 'Apple Health',
      description: 'Connect Apple Health for HRV data',
      logo: <img src={appleHealthIcon} alt="Apple Health" className="h-8 w-8 rounded-[10px]" />,
      connected: appleHealthState.showConnected,
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
                    <h3 className="font-medium text-foreground">{conn.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{conn.description}</p>
                    {conn.id === 'apple-health' && (
                      <p className="text-xs text-foreground/80 mt-0.5">{conn.statusLabel}</p>
                    )}
                    {conn.connected && conn.lastSync && (
                      <p className="text-xs text-muted-foreground mt-0.5">{conn.lastSync}</p>
                    )}
                    {conn.statusNote && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">{conn.statusNote}</p>
                    )}
                    {syncing && (conn.id === 'google-calendar' || conn.id === 'microsoft-calendar' || conn.id === 'apple-health') && (
                      <p className="text-xs text-primary mt-0.5 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
                      </p>
                    )}
                  </div>

                  {/* Action */}
                  {conn.connected ? (
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
      </div>
    </div>
  );
};

export default ConnectedData;
