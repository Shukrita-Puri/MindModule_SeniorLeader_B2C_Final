import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Loader2, MoreVertical, RefreshCw } from 'lucide-react';
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
import { syncHealthKitToBackend, markHealthKitPermissionGranted, clearHealthKitPermission, isHealthKitPermissionGranted } from '@/services/wearableSyncService';
import { openUrl } from '@/utils/openUrl';
import { format } from 'date-fns';
import { toast } from 'sonner';

import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import appleWatchLogo from '@/assets/shared/apple-watch-logo.jpg';

/* ─── Types ─── */

interface ConnectionStatus {
  calendar: { connected: boolean; provider: string | null; lastSync: string | null };
  appleWatch: { connected: boolean; lastSync: string | null; hasData?: boolean };
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
    // sync-calendar now always returns 200 with structured body
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

  // Fetch connection status from backend
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
        console.log('[ConnectedData] Connection status:', JSON.stringify(data));
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

  // Auto-sync stale wearable data when opening Connected Data on native
  useEffect(() => {
    // Consider connected if backend says so OR local permission flag is set
    const isConnected = status?.appleWatch.connected || isHealthKitPermissionGranted();
    if (!isConnected || !isNativeApp()) return;
    const lastSyncTime = status?.appleWatch.lastSync ? new Date(status.appleWatch.lastSync).getTime() : 0;
    const STALE_MS = 6 * 60 * 60 * 1000; // 6 hours
    if (Date.now() - lastSyncTime > STALE_MS) {
      console.log('[ConnectedData] Wearable data stale, auto-syncing...');
      syncHealthKitToBackend().then((result) => {
        if (result.permissionGranted) {
          // Update local status to show connected even without data
          setStatus(prev => prev ? {
            ...prev,
            appleWatch: {
              connected: true,
              lastSync: prev.appleWatch.lastSync,
              hasData: result.hasData,
            },
          } : prev);
        }
        if (result.hasData && result.success) fetchStatus();
      }).catch(() => {});
    }
  }, [status?.appleWatch.connected, status?.appleWatch.lastSync, fetchStatus]);

  // Handle post-OAuth callback: ?calendar_connected=true
  useEffect(() => {
    const calendarCallback = searchParams.get('calendar_connected');
    if (calendarCallback !== 'true') return;

    // Clean URL param immediately
    searchParams.delete('calendar_connected');
    setSearchParams(searchParams, { replace: true });

    console.log('[ConnectedData] Post-OAuth callback detected, triggering sync...');
    setSyncing(true);

    const runPostConnectSync = async () => {
      // Small delay to let connection row settle
      await new Promise(r => setTimeout(r, 500));

      // Re-fetch status to get the provider
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

      // Trigger initial sync
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
  }, [searchParams, setSearchParams]);

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

  /* ─── Apple Watch Handlers ─── */

  const handleConnectAppleWatch = async () => {
    if (!isNativeApp()) {
      toast.info('Apple Watch connects via the native iOS app. Download MindModule from the App Store to connect.');
      return;
    }
    setConnecting('apple-watch');
    try {
      const granted = await requestHealthKitPermissions();
      if (granted) {
        markHealthKitPermissionGranted();
        toast.success('Apple Health connected');
        // Sync HealthKit data to backend
        const result = await syncHealthKitToBackend();
        if (result.hasData && result.success) {
          toast.success('Apple Watch data synced');
        } else if (result.permissionGranted && !result.hasData) {
          toast.info('Connected! HRV data will appear once available from Apple Health.');
        }
        // Update local status immediately
        setStatus(prev => prev ? {
          ...prev,
          appleWatch: {
            connected: true,
            lastSync: prev?.appleWatch.lastSync ?? null,
            hasData: result.hasData,
          },
        } : prev);
        // Refresh from backend
        await fetchStatus();
      } else {
        toast.error('Health permissions were denied');
      }
    } catch {
      toast.error('Failed to connect Apple Health');
    } finally {
      setConnecting(null);
    }
  };

  const handleSyncAppleWatch = async () => {
    if (!isNativeApp()) return;
    setSyncing(true);
    try {
      const granted = await requestHealthKitPermissions();
      if (!granted) {
        toast.error('HealthKit permission not granted');
        setSyncing(false);
        return;
      }
      const result = await syncHealthKitToBackend();
      if (result.hasData && result.success) {
        toast.success('Apple Watch data synced');
        await fetchStatus();
      } else if (result.permissionGranted && !result.hasData) {
        toast.info('No HRV data available yet from Apple Health');
      } else {
        toast.error('Apple Watch sync failed');
      }
    } catch {
      toast.error('Apple Watch sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnectAppleWatch = () => {
    try {
      localStorage.removeItem('contextConnections');
      clearHealthKitPermission();
      setStatus(prev => prev ? { ...prev, appleWatch: { connected: false, lastSync: null, hasData: false } } : prev);
      toast.success('Apple Watch disconnected');
    } catch {
      toast.error('Failed to disconnect Apple Watch');
    }
  };

  /* ─── Connection Data ─── */

  const connections = [
    {
      id: 'google-calendar',
      name: 'Google Calendar',
      description: 'Sync your calendar for contextual recommendations',
      logo: <img src={googleCalendarLogo} alt="Google Calendar" className="h-8 w-8 rounded" />,
      connected: status?.calendar.connected ?? false,
      lastSync: formatLastSync(status?.calendar.lastSync ?? null),
      onConnect: handleConnectCalendar,
      onDisconnect: handleDisconnectCalendar,
      onSync: handleSyncNow,
      canSync: true,
    },
    {
      id: 'apple-watch',
      name: 'Apple Watch',
      description: 'Connect via Apple Health for HRV and sleep data',
      logo: <img src={appleWatchLogo} alt="Apple Watch" className="h-8 w-8 rounded" />,
      connected: status?.appleWatch.connected ?? false,
      lastSync: formatLastSync(status?.appleWatch.lastSync ?? null),
      onConnect: handleConnectAppleWatch,
      onDisconnect: handleDisconnectAppleWatch,
      onSync: handleSyncAppleWatch,
      canSync: isNativeApp(),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 safe-area-top bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/profile')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-xl font-headline font-semibold">Connected Data</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
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
                    {conn.connected && conn.lastSync && (
                      <p className="text-xs text-muted-foreground mt-0.5">{conn.lastSync}</p>
                    )}
                    {syncing && (conn.id === 'google-calendar' || conn.id === 'apple-watch') && (
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

        {/* Privacy Policy Link */}
        <Button
          variant="link"
          className="text-sm text-muted-foreground px-0"
          onClick={() => navigate('/privacy')}
        >
          Privacy Policy →
        </Button>
      </div>
    </div>
  );
};

export default ConnectedData;
