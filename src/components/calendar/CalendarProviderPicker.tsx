import { useEffect, useState, useCallback } from 'react';
import { Loader2, Check, AlertCircle, AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { openUrl } from '@/utils/openUrl';
import {
  isAppleCalendarSupported,
  requestAppleCalendarPermission,
  showAppleCalendarPermissionRevokeNotice,
} from '@/utils/appleCalendar';
import { syncAppleCalendarToBackend } from '@/services/appleCalendarSync';
import googleCalendarLogo from '@/assets/shared/google-calendar-logo.avif';
import microsoftCalendarLogo from '@/assets/shared/microsoft-calendar-logo.png';

export type CalendarProviderId = 'google' | 'microsoft' | 'apple';

/**
 * Per-provider connection state.
 *
 * `status` is the new canonical field:
 *   - 'connected'    → row shows Connected badge + Disconnect action
 *   - 'disconnected' → row shows Connect action
 *   - 'unknown'      → status query failed transiently; row shows
 *                      "Status unavailable" and disables actions until retry.
 *
 * `connected` is retained for backward-compat consumers but derives from
 * `status === 'connected'` in the new fetch layer.
 */
export type ProviderConnectionStatus = 'connected' | 'disconnected' | 'unknown';

export interface ProviderStatus {
  connected: boolean;
  status: ProviderConnectionStatus;
  lastSync: string | null;
  needsReconnect?: boolean;
  accountIdentifier?: string | null;
}

export interface CalendarProvidersState {
  google?: ProviderStatus;
  microsoft?: ProviderStatus;
  apple?: ProviderStatus;
}

/** Typed result returned by fetchCalendarProvidersState. */
export type CalendarProvidersFetchResult =
  | { status: 'ok'; providers: CalendarProvidersState }
  | { status: 'error'; providers: CalendarProvidersState; message: string };

const UNKNOWN_PROVIDERS: CalendarProvidersState = {
  google: { connected: false, status: 'unknown', lastSync: null },
  microsoft: { connected: false, status: 'unknown', lastSync: null },
  apple: { connected: false, status: 'unknown', lastSync: null },
};

/**
 * Fetches the per-provider calendar connection state from the unified
 * check-connections-status edge function.
 *
 * Returns a typed { status, providers, message? } object. Transient failures
 * (network error, function 5xx, backend `calendar.error`) resolve to
 * `status: 'error'` with every provider marked `unknown` — NEVER to a
 * silently-disconnected shape. The UI is responsible for showing an error /
 * retry affordance for that state.
 */
export async function fetchCalendarProvidersState(): Promise<CalendarProvidersFetchResult> {
  const token = await getAuthToken().catch(() => null);
  if (!token) {
    return { status: 'error', providers: UNKNOWN_PROVIDERS, message: 'Not authenticated' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('check-connections-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) {
      console.warn('[CalendarProviderPicker] status fetch failed:', error);
      return {
        status: 'error',
        providers: UNKNOWN_PROVIDERS,
        message: (error as { message?: string } | null)?.message ?? 'Status service unavailable',
      };
    }
    const calendar = (data as { calendar?: Record<string, unknown> }).calendar ?? {};
    // Backend surfaces query failures as calendar.error even on a 200 body.
    if (calendar.error || calendar.status === 'error') {
      return {
        status: 'error',
        providers: UNKNOWN_PROVIDERS,
        message: (calendar.errorMessage as string | undefined) ?? 'Calendar status temporarily unavailable',
      };
    }
    const providers = (calendar.providers as Record<string, { connected?: boolean; status?: string; lastSync?: string | null } | undefined>) ?? {};
    const one = (p?: { connected?: boolean; status?: string; lastSync?: string | null }): ProviderStatus => {
      const s = (p?.status as ProviderConnectionStatus | undefined)
        ?? (p?.connected ? 'connected' : 'disconnected');
      return { connected: s === 'connected', status: s, lastSync: p?.lastSync ?? null };
    };
    return {
      status: 'ok',
      providers: {
        google: one(providers.google),
        microsoft: one(providers.microsoft),
        apple: one(providers.apple),
      },
    };
  } catch (err) {
    console.warn('[CalendarProviderPicker] fetch state failed:', err);
    return {
      status: 'error',
      providers: UNKNOWN_PROVIDERS,
      message: err instanceof Error ? err.message : 'Status service unavailable',
    };
  }
}

async function startOAuthConnect(provider: 'google' | 'microsoft', redirectPath: string) {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const { data, error } = await supabase.functions.invoke('calendar-auth', {
    body: { action: 'connect', provider, redirectPath },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
  if (!data?.authUrl) throw new Error('No auth URL returned');
  await openUrl(data.authUrl);
}

async function disconnectOAuth(provider: 'google' | 'microsoft' | 'apple') {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const { error } = await supabase.functions.invoke('calendar-auth', {
    body: { action: 'disconnect', provider },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) throw error;
}

function relativeLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface ProviderRowProps {
  provider: CalendarProviderId;
  label: string;
  iconSrc?: string;
  status: ProviderStatus | undefined;
  redirectPath: string;
  onChanged?: () => void;
  disabled?: boolean;
}

function ProviderRow({ provider, label, iconSrc, status, redirectPath, onChanged, disabled }: ProviderRowProps) {
  const [busy, setBusy] = useState(false);
  const isApple = provider === 'apple';
  const appleAvailable = isApple ? isAppleCalendarSupported() : true;

  const connected = !!status?.connected;
  const needsReconnect = !!status?.needsReconnect;
  const lastSyncLabel = relativeLabel(status?.lastSync);

  const handleConnect = useCallback(async () => {
    if (disabled || busy) return;
    setBusy(true);
    try {
      if (isApple) {
        if (!appleAvailable) {
          toast.info('Apple Calendar is available in the iOS app');
          return;
        }
        const granted = await requestAppleCalendarPermission();
        if (!granted) {
          toast.error('Calendar permission denied. Enable in Settings → Privacy → Calendars.');
          return;
        }
        // Ensure native Keychain has the current auth token BEFORE triggering
        // the native calendar sync — fresh installs may not have it yet.
        try {
          const { getAuthToken } = await import('@/services/authTokenService');
          const token = await getAuthToken();
          if (token) {
            const { updateNativeBackgroundAuthToken } = await import('@/utils/nativeBackgroundSync');
            await updateNativeBackgroundAuthToken(token);
          }
        } catch (e) {
          console.warn('[CalendarProviderPicker] pre-sync token flush failed (non-fatal):', e);
        }
        const result = await syncAppleCalendarToBackend();
        if (result?.success !== false) {
          toast.success('Apple Calendar connected');
        } else {
          toast.warning('Connected, but initial sync will retry shortly');
        }
      } else {
        await startOAuthConnect(provider, redirectPath);
      }
      onChanged?.();
    } catch (err) {
      console.error('[CalendarProviderPicker] connect failed:', err);
      toast.error(`Failed to connect ${label}`);
    } finally {
      setBusy(false);
    }
  }, [appleAvailable, busy, disabled, isApple, label, onChanged, provider, redirectPath]);

  const handleDisconnect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disconnectOAuth(provider);
      toast.success(`${label} disconnected`);
      if (isApple) {
        // See src/utils/appleCalendar.ts — this warns the user that in-app
        // disconnect does NOT revoke the iOS EventKit permission.
        showAppleCalendarPermissionRevokeNotice();
      }
      onChanged?.();
    } catch (err) {
      console.error('[CalendarProviderPicker] disconnect failed:', err);
      toast.error(`Failed to disconnect ${label}`);
    } finally {
      setBusy(false);
    }
  }, [busy, isApple, label, onChanged, provider]);

  const pill = needsReconnect ? (
    <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/30 text-[10px]">
      <AlertCircle className="w-3 h-3 mr-1" /> Reconnect
    </Badge>
  ) : connected ? (
    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px]">
      <Check className="w-3 h-3 mr-1" /> Connected
    </Badge>
  ) : null;

  return (
    <div className="flex items-center justify-between p-4 rounded-2xl bg-white border border-[#cfc7b8] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3 min-w-0">
        {iconSrc ? (
          <img src={iconSrc} alt={label} className="w-8 h-8 rounded-lg object-contain" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-foreground/5 flex items-center justify-center text-xs font-semibold">
            {label.charAt(0)}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{label}</span>
            {pill}
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {isApple && !appleAvailable
              ? 'Available in the iOS app'
              : status?.status === 'unknown'
                ? 'Status unavailable'
                : connected
                  ? lastSyncLabel ? `Last sync ${lastSyncLabel}` : 'Connected'
                  : needsReconnect
                    ? 'Permission revoked'
                    : 'Not connected'}
          </span>
        </div>
      </div>
      <div>
        {status?.status === 'unknown' ? (
          // We don't know the real state — do NOT show a Connect action that
          // would misleadingly imply the provider is disconnected.
          <Button size="sm" variant="ghost" disabled aria-label="Status unavailable">
            —
          </Button>
        ) : connected || needsReconnect ? (
          <Button
            size="sm"
            variant={needsReconnect ? 'default' : 'ghost'}
            onClick={needsReconnect ? handleConnect : handleDisconnect}
            disabled={busy || disabled}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : needsReconnect ? 'Reconnect' : 'Disconnect'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={handleConnect}
            disabled={busy || disabled || (isApple && !appleAvailable)}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}
          </Button>
        )}
      </div>
    </div>
  );
}

interface CalendarProviderPickerProps {
  redirectPath: string;
  /** When provided, only render these calendars. */
  only?: CalendarProviderId[];
  /** Optional callback fired whenever a provider state change is initiated. */
  onChanged?: () => void;
}

/**
 * Unified picker that lets the user connect/disconnect Apple Calendar (native
 * iOS), Google Calendar, and Microsoft Outlook through a single consistent UI.
 * Reads state from the multi-provider check-connections-status endpoint.
 */
export default function CalendarProviderPicker({ redirectPath, only, onChanged }: CalendarProviderPickerProps) {
  const [state, setState] = useState<CalendarProvidersState>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await fetchCalendarProvidersState();
    setState(result.providers);
    setFetchError(result.status === 'error' ? result.message : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const onConnectionsChanged = () => { refresh(); };
    window.addEventListener('mm:connections-changed', onConnectionsChanged);
    return () => {
      window.removeEventListener('mm:connections-changed', onConnectionsChanged);
    };
  }, [refresh]);

  const handleChanged = useCallback(() => {
    onChanged?.();
    // Small delay before refreshing to allow backend writes to settle.
    setTimeout(() => { refresh(); }, 400);
  }, [onChanged, refresh]);

  const show = (id: CalendarProviderId) => !only || only.includes(id);

  return (
    <div className="space-y-3">
      {fetchError && (
        <div
          role="alert"
          data-testid="calendar-provider-error"
          className="flex items-start gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Couldn't load calendar status</div>
            <div className="text-xs text-amber-900/80 truncate">
              {fetchError}. Your existing connections are still active.
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
            aria-label="Retry loading calendar status"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><RotateCw className="w-3.5 h-3.5 mr-1" /> Retry</>
            )}
          </Button>
        </div>
      )}
      {show('google') && (
        <ProviderRow
          provider="google"
          label="Google Calendar"
          iconSrc={googleCalendarLogo}
          status={state.google}
          redirectPath={redirectPath}
          onChanged={handleChanged}
          disabled={loading}
        />
      )}
      {show('microsoft') && (
        <ProviderRow
          provider="microsoft"
          label="Microsoft Outlook"
          iconSrc={microsoftCalendarLogo}
          status={state.microsoft}
          redirectPath={redirectPath}
          onChanged={handleChanged}
          disabled={loading}
        />
      )}
      {show('apple') && (
        <ProviderRow
          provider="apple"
          label="Apple Calendar"
          status={state.apple}
          redirectPath={redirectPath}
          onChanged={handleChanged}
          disabled={loading}
        />
      )}
    </div>
  );
}
