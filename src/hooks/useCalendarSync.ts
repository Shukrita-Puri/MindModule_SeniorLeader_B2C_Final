import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { type CalendarEvent } from '@/utils/historicalPatternEngine';
import { clearLocalCalendarData, saveCalendarEventsLocally } from '@/services/localDataStore';
import { syncAppleCalendarToBackend } from '@/services/appleCalendarSync';
import {
  isAppleCalendarSupported,
  onAppleCalendarStoreChanged,
  verifyAppleCalendarPermission,
  wasAppleCalendarManuallyDisconnected,
} from '@/utils/appleCalendar';
import { getAuthToken } from '@/services/authTokenService';
import { emitIntegrationEvent } from '@/utils/integrationTelemetry';
import { queuePendingDisconnect } from '@/utils/integrationQaHelpers';
import { describeFetchError, getSupabaseFunctionHeaders, getSupabaseFunctionUrl } from '@/utils/supabaseFunctions';
import { mergeCalendarEvents } from '@/utils/rules/calendarEvents';
import { isNativeApp } from '@/utils/nativeAuth';

interface CalendarConnection {
  id: string;
  provider: string;
  is_active: boolean;
  last_sync: string | null;
}

interface UseCalendarSyncResult {
  events: CalendarEvent[];
  isLoading: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  hasCalendar: boolean;
  triggerSync: () => Promise<void>;
  error: string | null;
}

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours (Google/Microsoft)
const APPLE_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 min — native fetch is cheap

export function useCalendarSync(): UseCalendarSyncResult {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [hasCalendar, setHasCalendar] = useState(false);
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerCalendarRelationshipLearning = useCallback(() => {
    if (!user?.id) return;

    void supabase.functions.invoke('extract-calendar-relationship-insights', {
      body: { lookbackDays: 30, minOccurrences: 3 },
    }).then(({ error: insightError }) => {
      if (insightError) {
        console.warn('[useCalendarSync] Relationship insight extraction failed:', insightError);
      }
    }).catch(err => {
      console.warn('[useCalendarSync] Relationship insight invocation failed:', err);
    });
  }, [user?.id]);

  const resetCalendarState = useCallback(() => {
    setEvents([]);
    setConnection(null);
    setHasCalendar(false);
    setLastSync(null);
    clearLocalCalendarData();
  }, []);

  const markAppleCalendarInactive = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        queuePendingDisconnect('apple-calendar');
        return;
      }

      const res = await fetch(getSupabaseFunctionUrl('calendar-auth'), {
        method: 'POST',
        headers: getSupabaseFunctionHeaders(token),
        body: JSON.stringify({ action: 'disconnect', provider: 'apple' }),
      });

      if (!res.ok) {
        console.warn('[useCalendarSync] Failed to mark Apple Calendar inactive:', res.status);
        queuePendingDisconnect('apple-calendar');
        emitIntegrationEvent({
          provider: 'apple-calendar',
          event: 'disconnect_failed',
          userId: user?.id,
          errorCode: String(res.status),
        });
      }
    } catch (err) {
      console.warn('[useCalendarSync] Apple Calendar inactive cleanup failed:', err);
      queuePendingDisconnect('apple-calendar');
      emitIntegrationEvent({
        provider: 'apple-calendar',
        event: 'disconnect_failed',
        userId: user?.id,
        errorMessage: describeFetchError(err),
      });
    }
  }, [user?.id]);

  const persistAppleCalendarPresence = useCallback(async (lastSync?: string | null) => {
    try {
      const token = await getAuthToken();
      if (!token) return false;

      const res = await fetch(getSupabaseFunctionUrl('calendar-auth'), {
        method: 'POST',
        headers: getSupabaseFunctionHeaders(token),
        body: JSON.stringify({ action: 'update_status', provider: 'apple', lastSync: lastSync ?? null }),
      });

      if (!res.ok) {
        console.warn('[useCalendarSync] Failed to persist Apple Calendar presence:', res.status);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[useCalendarSync] Apple Calendar presence persistence failed:', err);
      return false;
    }
  }, []);

  const verifyConnectionUsable = useCallback(async (conn: CalendarConnection | null) => {
    if (!conn) return null;
    if (conn.provider !== 'apple') return conn;

    if (!isAppleCalendarSupported()) {
      console.warn('[useCalendarSync] Apple Calendar DB row exists but native calendar is unsupported');
      resetCalendarState();
      return null;
    }

    const permissionGranted = await verifyAppleCalendarPermission();
    console.log('[useCalendarSync] Apple Calendar permission verification:', { permissionGranted });
    emitIntegrationEvent({
      provider: 'apple-calendar',
      event: permissionGranted ? 'native_verify_success' : 'permission_revoked_external',
      userId: user?.id,
      connectionState: conn.is_active ? 'db_active' : 'db_inactive',
      nativePermissionState: permissionGranted ? 'authorized' : 'denied',
    });
    if (!permissionGranted) {
      resetCalendarState();
      await markAppleCalendarInactive();
      setError('Apple Calendar permission denied. Reconnect calendar access in iOS Settings.');
      return null;
    }

    return conn;
  }, [markAppleCalendarInactive, resetCalendarState, user?.id]);

  // Fetch calendar connection status
  const fetchConnection = useCallback(async () => {
    if (!user?.id) return null;

    try {
      const { data, error: connError } = await supabase
        .from('calendar_connections')
        .select('id, provider, is_active, last_sync')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (connError && connError.code !== 'PGRST116') {
        console.error('[useCalendarSync] Error fetching connection:', connError);
      }

      let usableConnection = await verifyConnectionUsable(data);

      if (!usableConnection && isAppleCalendarSupported() && !wasAppleCalendarManuallyDisconnected()) {
        const permissionGranted = await verifyAppleCalendarPermission();
        if (permissionGranted) {
          usableConnection = {
            id: 'local-apple-permission',
            provider: 'apple',
            is_active: true,
            last_sync: null,
          };
          void persistAppleCalendarPresence(null);
          emitIntegrationEvent({
            provider: 'apple-calendar',
            event: 'native_verify_success',
            userId: user?.id,
            connectionState: 'permission_connected',
            syncState: 'backend_pending',
          });
        }
      }

      if (usableConnection) {
        setConnection(usableConnection);
        setHasCalendar(true);
        setLastSync(usableConnection.last_sync ? new Date(usableConnection.last_sync) : null);
        return usableConnection;
      } else {
        resetCalendarState();
        return null;
      }
    } catch (err) {
      console.error('[useCalendarSync] Error:', err);
      return null;
    }
  }, [persistAppleCalendarPresence, resetCalendarState, user?.id, verifyConnectionUsable]);

  // Fetch events from database
  const fetchEvents = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: rawData, error: eventsError } = await supabase
        .from('calendar_events')
        .select('*')
        .eq('user_id', user.id)
        .order('start_time', { ascending: true });

      if (eventsError) {
        console.error('[useCalendarSync] Error fetching events:', eventsError);
        return;
      }

      // Cross-provider dedupe before display counts (Apple/Google/MSFT mirrors -> 1).
      const data = mergeCalendarEvents((rawData || []) as any[], isNativeApp() ? 'ios' : 'web');

      // Transform database format to CalendarEvent interface
      const transformedEvents: CalendarEvent[] = (data || []).map(event => {
        const metadata = event.event_metadata as Record<string, unknown> || {};
        return {
          id: (event as any).external_id ?? (event as any).id,
          title: event.title || 'Untitled Event',
          startTime: new Date(event.start_time),
          endTime: new Date(event.end_time),
          isHighStakes: metadata.isHighStakes === true,
          eventType: typeof metadata.eventType === 'string' ? metadata.eventType : 'meeting',
        };
      });

      setEvents(transformedEvents);
      // Write-through to local device storage
      saveCalendarEventsLocally(transformedEvents.map(e => ({
        id: e.id,
        title: e.title,
        startTime: e.startTime.toISOString(),
        endTime: e.endTime.toISOString(),
        isHighStakes: e.isHighStakes,
        eventType: e.eventType,
      })));
      console.log('[useCalendarSync] Fetched', transformedEvents.length, 'events from database');
    } catch (err) {
      console.error('[useCalendarSync] Error fetching events:', err);
    }
  }, [user?.id]);

  // Trigger calendar sync
  const triggerSync = useCallback(async () => {
    if (!user?.id || !connection) {
      console.log('[useCalendarSync] Cannot sync: no user or connection');
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      console.log('[useCalendarSync] Triggering sync for provider:', connection.provider);

      if (connection.provider === 'apple') {
        if (!isAppleCalendarSupported()) {
          setError('Apple Calendar sync is only available in the iOS app.');
          resetCalendarState();
          return;
        }

        const permissionGranted = await verifyAppleCalendarPermission();
        if (!permissionGranted) {
          emitIntegrationEvent({
            provider: 'apple-calendar',
            event: 'permission_revoked_external',
            userId: user?.id,
            connectionState: 'sync_blocked',
            nativePermissionState: 'denied',
          });
          setError('Apple Calendar permission denied. Reconnect calendar access in iOS Settings.');
          resetCalendarState();
          await markAppleCalendarInactive();
          return;
        }

        const result = await syncAppleCalendarToBackend({ reason: 'manual' });
        if (!result.success) {
          void persistAppleCalendarPresence(connection.last_sync ?? null);
          emitIntegrationEvent({
            provider: 'apple-calendar',
            event: 'sync_failed',
            userId: user?.id,
            connectionState: 'connected',
            syncState: 'sync_failed',
            errorMessage: result.error || 'Apple Calendar sync failed',
          });
          setError(result.error || 'Apple Calendar sync failed');
          return;
        }

        emitIntegrationEvent({
          provider: 'apple-calendar',
          event: 'sync_success',
          userId: user?.id,
          connectionState: 'connected',
          syncState: 'synced',
          meta: { eventCount: result.eventCount ?? 0, source: 'useCalendarSync' },
        });
        void persistAppleCalendarPresence(new Date().toISOString());
        setLastSync(new Date());
        await fetchEvents();
        void triggerCalendarRelationshipLearning();
        return;
      }

      const { data, error: syncError } = await supabase.functions.invoke('sync-calendar', {
        body: {
          provider: connection.provider,
          userId: user.id,
        },
      });

      if (syncError) {
        console.error('[useCalendarSync] Sync error:', syncError);
        setError(syncError.message);
        return;
      }

      // Handle reconnect-required or skipped responses
      if (data?.reconnectRequired) {
        console.warn('[useCalendarSync] Calendar reconnect required:', data.reason);
        setError(data.error || 'Calendar session expired. Please reconnect your calendar.');
        return;
      }

      if (data?.skipped) {
        console.warn('[useCalendarSync] Sync skipped:', data.reason);
        setError(data.error || 'Calendar is disconnected.');
        return;
      }

      if (data?.success === false) {
        console.warn('[useCalendarSync] Sync returned failure:', data.error);
        setError(data.error || 'Sync failed');
        return;
      }

      console.log('[useCalendarSync] Sync complete:', data);
      emitIntegrationEvent({
        provider: connection.provider === 'google' ? 'google-calendar' : 'microsoft-calendar',
        event: 'sync_success',
        userId: user?.id,
        connectionState: 'connected',
        syncState: 'synced',
        meta: { source: 'useCalendarSync' },
      });
      setLastSync(new Date());
      
      // Refresh events from database
      await fetchEvents();
      void triggerCalendarRelationshipLearning();
    } catch (err) {
      console.error('[useCalendarSync] Sync failed:', err);
      emitIntegrationEvent({
        provider: connection.provider === 'apple'
          ? 'apple-calendar'
          : connection.provider === 'google'
            ? 'google-calendar'
            : 'microsoft-calendar',
        event: 'sync_failed',
        userId: user?.id,
        syncState: 'sync_failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [connection, fetchEvents, markAppleCalendarInactive, persistAppleCalendarPresence, resetCalendarState, triggerCalendarRelationshipLearning, user?.id]);

  // Initial load: check connection and fetch events
  useEffect(() => {
    let cancelled = false;
    
    const init = async () => {
      if (!user?.id) {
        resetCalendarState();
        emitIntegrationEvent({
          provider: 'system',
          event: 'qa_action',
          connectionState: 'cleared',
          meta: { action: 'logout_calendar_state_cleared' },
        });
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      
      try {
        const { data: connData, error: connError } = await supabase
          .from('calendar_connections')
          .select('id, provider, is_active, last_sync')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        
        if (cancelled) return;
        
        if (connError && connError.code !== 'PGRST116') {
          console.error('[useCalendarSync] Error fetching connection:', connError);
        }
        
        let usableConnection = await verifyConnectionUsable(connData);
        if (!usableConnection && isAppleCalendarSupported() && !wasAppleCalendarManuallyDisconnected()) {
          const permissionGranted = await verifyAppleCalendarPermission();
          if (permissionGranted) {
            usableConnection = {
              id: 'local-apple-permission',
              provider: 'apple',
              is_active: true,
              last_sync: null,
            };
            emitIntegrationEvent({
              provider: 'apple-calendar',
              event: 'native_verify_success',
              userId: user?.id,
              connectionState: 'permission_connected',
              syncState: 'backend_pending',
            });
          }
        }
        if (cancelled) return;

        if (usableConnection) {
          setConnection(usableConnection);
          setHasCalendar(true);
          setLastSync(usableConnection.last_sync ? new Date(usableConnection.last_sync) : null);
          
          // Fetch events
          const { data: rawEventsData, error: eventsError } = await supabase
            .from('calendar_events')
            .select('*')
            .eq('user_id', user.id)
            .order('start_time', { ascending: true });
          
          if (cancelled) return;
          
          if (!eventsError && rawEventsData) {
            const eventsData = mergeCalendarEvents(rawEventsData as any[], isNativeApp() ? 'ios' : 'web');
            const transformedEvents: CalendarEvent[] = eventsData.map((event: any) => {
              const metadata = event.event_metadata as Record<string, unknown> || {};
              return {
                id: event.external_id ?? event.id,
                title: event.title || 'Untitled Event',
                startTime: new Date(event.start_time),
                endTime: new Date(event.end_time),
                isHighStakes: metadata.isHighStakes === true,
                eventType: typeof metadata.eventType === 'string' ? metadata.eventType : 'meeting',
              };
            });
            setEvents(transformedEvents);
            // Write-through to local device storage
            saveCalendarEventsLocally(transformedEvents.map(e => ({
              id: e.id,
              title: e.title,
              startTime: e.startTime.toISOString(),
              endTime: e.endTime.toISOString(),
              isHighStakes: e.isHighStakes,
              eventType: e.eventType,
            })));
            console.log('[useCalendarSync] Fetched', transformedEvents.length, 'events');
          }
          
          if (usableConnection.provider === 'apple' && isAppleCalendarSupported()) {
            console.log('[useCalendarSync] Apple Calendar bootstrap sync on init...');
            syncAppleCalendarToBackend({ reason: 'init_bootstrap' })
              .then((res) => {
                if (!cancelled && res.success === true) {
                  void persistAppleCalendarPresence(new Date().toISOString());
                  setLastSync(new Date());
                  fetchEvents();
                  void triggerCalendarRelationshipLearning();
                }
                if (!cancelled && res.success === false) {
                  void persistAppleCalendarPresence(usableConnection.last_sync ?? null);
                  console.warn('[useCalendarSync] Apple bootstrap sync returned failure');
                }
              })
              .catch(err => console.error('[useCalendarSync] Apple bootstrap sync failed:', err));
          }

          // If data is stale, trigger a background sync
          const syncTime = usableConnection.last_sync ? new Date(usableConnection.last_sync) : null;
          const threshold = usableConnection.provider === 'apple' ? APPLE_STALE_THRESHOLD_MS : STALE_THRESHOLD_MS;
          if (!syncTime || Date.now() - syncTime.getTime() > threshold) {
            console.log('[useCalendarSync] Data is stale, triggering background sync...');
            // Background sync - don't await
            if (usableConnection.provider === 'apple') {
              if (isAppleCalendarSupported()) {
                syncAppleCalendarToBackend({ reason: 'init_stale_refresh' })
                  .then((res) => {
                if (!cancelled && res.success === true) {
                  void persistAppleCalendarPresence(new Date().toISOString());
                  setLastSync(new Date());
                  fetchEvents();
                  void triggerCalendarRelationshipLearning();
                }
                if (!cancelled && res.success === false) {
                  void persistAppleCalendarPresence(usableConnection.last_sync ?? null);
                  console.warn('[useCalendarSync] Apple stale refresh failed; keeping permission-connected state');
                }
              })
              .catch(err => console.error('[useCalendarSync] Apple background sync failed:', err));
          }
            } else {
              supabase.functions.invoke('sync-calendar', {
                body: { provider: usableConnection.provider, userId: user.id }
              }).then((res) => {
                if (!cancelled && res.data?.success === true) {
                  fetchEvents();
                  void triggerCalendarRelationshipLearning();
                }
                if (res.data?.reconnectRequired) console.warn('[useCalendarSync] Background sync: reconnect required');
              }).catch(err => console.error('[useCalendarSync] Background sync failed:', err));
            }
          }
        } else {
          resetCalendarState();
        }
      } catch (err) {
        console.error('[useCalendarSync] Init error:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    init();
    
    return () => { cancelled = true; };
  }, [fetchEvents, persistAppleCalendarPresence, resetCalendarState, user?.id, verifyConnectionUsable, triggerCalendarRelationshipLearning]);

  // Apple Calendar live refresh:
  //  - native EKEventStoreChanged → debounce → sync + refetch
  //  - app resume on iOS → sync + refetch
  // Both are no-ops on web.
  useEffect(() => {
    if (!user?.id || !connection || connection.provider !== 'apple') return;
    if (!isAppleCalendarSupported()) return;

    let cancelled = false;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let unsubChange: (() => void) | null = null;
    let unsubResume: (() => void) | null = null;
    let lastSyncAt = 0;
    const MIN_GAP_MS = 4000;

    const runSync = (reason: string) => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastSyncAt < MIN_GAP_MS) return;
      lastSyncAt = now;
      console.log('[useCalendarSync] Apple instant sync triggered:', reason);
      emitIntegrationEvent({
        provider: 'apple-calendar',
        event: 'sync_started',
        userId: user.id,
        meta: { source: 'useCalendarSync', reason },
      });
        syncAppleCalendarToBackend({ reason })
        .then((res) => {
          if (cancelled) return;
          if (res.success) {
            void persistAppleCalendarPresence(new Date().toISOString());
            setLastSync(new Date());
            void fetchEvents();
            void triggerCalendarRelationshipLearning();
          }
        })
        .catch((err) => console.warn('[useCalendarSync] Apple instant sync failed:', err));
    };

    const scheduleSync = (reason: string) => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => runSync(reason), 1500);
    };

    onAppleCalendarStoreChanged(() => scheduleSync('eventStoreChanged'))
      .then((unsub) => { if (!cancelled) unsubChange = unsub; else unsub(); })
      .catch((err) => console.warn('[useCalendarSync] onAppleCalendarStoreChanged failed:', err));

    import('@capacitor/app').then(({ App }) => {
      if (cancelled) return;
      App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) scheduleSync('app_resume');
      }).then((handle) => {
        if (cancelled) { void handle.remove(); return; }
        unsubResume = () => { void handle.remove(); };
      }).catch((err) => console.warn('[useCalendarSync] App resume listener failed:', err));
    }).catch(() => { /* web — no-op */ });

    return () => {
      cancelled = true;
      if (debounce) clearTimeout(debounce);
      unsubChange?.();
      unsubResume?.();
    };
  }, [user?.id, connection, fetchEvents, triggerCalendarRelationshipLearning]);

  return {
    events,
    isLoading,
    isSyncing,
    lastSync,
    hasCalendar,
    triggerSync,
    error,
  };
}
