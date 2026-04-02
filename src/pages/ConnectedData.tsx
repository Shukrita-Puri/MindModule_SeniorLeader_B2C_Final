import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MoreVertical, RefreshCw } from 'lucide-react';
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
import { openUrl } from '@/utils/openUrl';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';

import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import appleHealthIcon from '@/assets/shared/apple-health-icon.png';

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
  const todayDate = new Date().toISOString().split('T')[0];
  const periods = ['morning', 'afternoon', 'evening'];
  for (const period of periods) {
    sessionStorage.removeItem(`plan-loaded-${todayDate}-${period}`);
    sessionStorage.removeItem(`plan-data-${todayDate}-${period}`);
  }
  sessionStorage.removeItem(`plan-energy-hash-${todayDate}`);
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

  // Fetch connection status from backend — NO localStorage overrides
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
        // Trust backend connection state — do NOT override with localStorage
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

      toast.success('Google Calendar connected!');

      const syncResult = await triggerCalendarSync(provider);
      if (syncResult.reconnectRequired) {
        toast.error('Calendar session expired. Please reconnect your calendar.');
      } else if (syncResult.skipped) {
        toast.error(syncResult.error || 'Calendar is disconnected. Reconnect to sync.');
      } else if (syncResult.success) {
        toast.success(`Synced ${syncResult.eventCount ?? 0} calendar events`);
        invalidatePlanCache();
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

  /* ─── Google Calendar Handlers ─── */

  const handleConnectCalendar = async () => {
    setConnecting('google-calendar');
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
            provider: 'google',
            redirectPath: '/connected-data',
          }),
        }
      );
      if (!res.ok) throw new Error(`calendar-auth failed: ${res.status}`);
      const data = await res.json();
      if (data?.authUrl) {
        await openUrl(data.authUrl);
      }
    } catch (err) {
      console.error('Error connecting calendar:', err);
      toast.error('Failed to connect calendar');
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnectCalendar = async () => {
    const provider = status?.calendar.provider || 'google';
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
      queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
      toast.success('Google Calendar disconnected');
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

      if (result.connectionState === 'connected') {
        toast.success('Apple Health data synced successfully');
      } else if (result.connectionState === 'connected_but_waiting_for_data') {
        toast.info('Apple Health is connected. Waiting for new HRV data from Apple Health.');
      } else if (result.connectionState === 'sync_delayed') {
        toast.warning('Apple Health is connected, but sync is delayed. We will retry automatically.');
      } else if (result.connectionState === 'permission_revoked') {
        toast.error('Apple Health permission was revoked. Please reconnect in Health settings.');
      } else {
        toast.error('Apple Health encountered an issue. Try Sync Now later.');
      }

      // Refresh status from backend
      await fetchStatus();
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

      if (result.connectionState === 'connected') {
        toast.success('Apple Health data synced');
        await fetchStatus();
      } else if (result.connectionState === 'connected_but_waiting_for_data') {
        toast.info('Apple Health is connected. Waiting for new HRV data.');
        await fetchStatus();
      } else if (result.connectionState === 'sync_delayed') {
        toast.warning('Apple Health is still connected, but sync is delayed.');
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

    if (aw.connectionStatus === 'connected') {
      if (aw.syncStatus === 'waiting_for_data') {
        return {
          showConnected: true,
          statusLabel: 'Connected',
          statusNote: [ 'Waiting for new data', lastSyncNote ].filter(Boolean).join(' · '),
          showReconnect: false,
        };
      }

      if (aw.syncStatus === 'sync_delayed' || aw.syncStatus === 'watch_unavailable') {
        return {
          showConnected: true,
          statusLabel: 'Connected',
          statusNote: [ 'Watch unavailable or no recent samples', lastSyncNote, lastSampleNote ].filter(Boolean).join(' · '),
          showReconnect: false,
        };
      }

      return {
        showConnected: true,
        statusLabel: 'Connected',
        statusNote: [ lastSyncNote, lastSampleNote ].filter(Boolean).join(' · ') || undefined,
        showReconnect: false,
      };
    }

    if (aw.connectionStatus === 'connecting') {
      return {
        showConnected: false,
        statusLabel: 'Connecting...',
        statusNote: 'Checking HealthKit authorization',
        showReconnect: false,
      };
    }

    if (aw.connectionStatus === 'permission_revoked') {
      return {
        showConnected: false,
        statusLabel: 'Permission revoked',
        statusNote: 'Reconnect Apple Health in iOS Health permissions to resume sync',
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

  const connections = [
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Sync your calendar for contextual recommendations',
      logo: <img src={googleCalendarLogo} alt="Google Calendar" className="h-8 w-8 rounded" />,
      connected: status?.calendar.connected ?? false,
      lastSync: formatLastSync(status?.calendar.lastSync ?? null),
      statusLabel: undefined as string | undefined,
      statusNote: undefined as string | undefined,
      showReconnect: false,
      onConnect: handleConnectCalendar,
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
        <h1 className="text-xl font-headline font-semibold">Connected Data Sources</h1>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
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
                    {syncing && (conn.id === 'google-calendar' || conn.id === 'apple-health') && (
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
