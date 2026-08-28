import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getAuthToken } from '@/services/authTokenService';
import { DEV_MODE, DEV_USER } from '@/config/devMode';

export interface ExecutiveConnectionStatus {
  hasCalendar: boolean;
  hasWearable: boolean;
  integrationStatus: {
    calendar: {
      connected: boolean;
      connectionStatus: 'connected' | 'disconnected';
    };
    wearable: {
      connectionStatus: 'connected' | 'disconnected' | 'permission_revoked';
    };
  };
}

export function normalizeExecutiveConnectionStatus(data: unknown): ExecutiveConnectionStatus | null {
  if (!data || typeof data !== 'object') return null;
  const root = data as Record<string, any>;
  const calendar = root.calendar as Record<string, any> | undefined;
  const appleWatch = root.appleWatch as Record<string, any> | undefined;
  const oura = root.oura as Record<string, any> | undefined;

  const appleConnected = appleWatch?.connected === true;
  const ouraConnected = oura?.connected === true;
  const wearableStatusUnknown = appleWatch?.status === 'error' || oura?.status === 'error';

  // An explicit backend error is unknown, not disconnected. Returning null
  // leaves the last React Query value in place and prevents false copy flips.
  if (calendar?.status === 'error' || (wearableStatusUnknown && !appleConnected && !ouraConnected)) {
    return null;
  }

  const hasCalendar = calendar?.connected === true;
  const hasWearable = appleConnected || ouraConnected;
  const wearablePermissionRevoked =
    appleWatch?.connectionStatus === 'permission_revoked' ||
    oura?.connectionStatus === 'permission_revoked';

  return {
    hasCalendar,
    hasWearable,
    integrationStatus: {
      calendar: {
        connected: hasCalendar,
        connectionStatus: hasCalendar ? 'connected' : 'disconnected',
      },
      wearable: {
        connectionStatus: wearablePermissionRevoked
          ? 'permission_revoked'
          : hasWearable
            ? 'connected'
            : 'disconnected',
      },
    },
  };
}

async function fetchExecutiveConnectionStatus(): Promise<ExecutiveConnectionStatus | null> {
  const token = await getAuthToken().catch(() => null);
  if (!token) return null;
  const { data, error } = await supabase.functions.invoke('check-connections-status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  return normalizeExecutiveConnectionStatus(data);
}

/** One query key shared by MRS, Brief and Plan, so mounted cards make one request. */
export function useExecutiveConnectionStatus() {
  const { user } = useAuth();
  const effectiveUserId = DEV_MODE ? DEV_USER.id : user?.id;

  return useQuery({
    queryKey: ['executive-connection-status', effectiveUserId],
    queryFn: fetchExecutiveConnectionStatus,
    enabled: !!effectiveUserId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}