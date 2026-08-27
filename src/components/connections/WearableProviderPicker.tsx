import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, AlertCircle, AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { openUrl } from '@/utils/openUrl';
import { startOuraOAuth } from '@/services/ouraSyncService';
import { requestHealthKitPermissions, isNativeApp } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend } from '@/services/wearableSyncService';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { clearOuterReadinessCache } from '@/hooks/useOuterReadiness';
import { invalidatePlanCache } from '@/hooks/useMasteryPlan';
import appleHealthLogo from '@/assets/shared/apple-health-logo.png';
import ouraLogo from '@/assets/shared/oura-ring-logo.png';
import whoopLogo from '@/assets/shared/whoop-logo.png';

export type WearableProviderId = 'apple-watch' | 'oura' | 'whoop';

/**
 * Per-wearable connection state.
 *
 * `status` mirrors the calendar branch:
 *  - 'connected'    → provider is verifiably connected
 *  - 'disconnected' → provider is verifiably not connected
 *  - 'unknown'      → status query failed transiently. UI must show
 *                     "Status unavailable" and disable Connect/Disconnect
 *                     actions so the user does not incorrectly re-connect an
 *                     already-connected provider.
 */
export type WearableConnectionStatus = 'connected' | 'disconnected' | 'unknown';

export interface WearableStatus {
  connected: boolean;
  status: WearableConnectionStatus;
  lastSync: string | null;
  needsReconnect?: boolean;
}

export interface WearableProvidersState {
  appleWatch?: WearableStatus;
  oura?: WearableStatus;
  whoop?: WearableStatus;
}

/** Typed result returned by fetchWearableProvidersState — mirrors the calendar branch. */
export type WearableProvidersFetchResult =
  | { status: 'ok'; providers: WearableProvidersState }
  | {
      status: 'error';
      providers: WearableProvidersState;
      message: string;
      /** Which upstream data sources were unavailable, when the backend split it out. */
      erroredSources?: string[];
      /** True when only Oura or only Apple Watch failed; the healthy side still carries real state. */
      partial?: boolean;
    };

const UNKNOWN_STATE: WearableStatus = { connected: false, status: 'unknown', lastSync: null };

const UNKNOWN_PROVIDERS: WearableProvidersState = {
  appleWatch: UNKNOWN_STATE,
  oura: UNKNOWN_STATE,
  whoop: { connected: false, status: 'disconnected', lastSync: null },
};

/**
 * Fetch Oura + Apple Watch (+ placeholder Whoop) connection state from the
 * unified check-connections-status edge function.
 *
 * Transient failures — network error, function 5xx, or backend
 * `oura.status === 'error'` / `appleWatch.status === 'error'` — resolve to
 * an explicit `status: 'error'` with the affected provider(s) marked
 * `unknown`. This prevents the UI from silently rendering a connected
 * wearable as "Not connected" during a DB blip.
 */
export async function fetchWearableProvidersState(): Promise<WearableProvidersFetchResult> {
  const token = await getAuthToken().catch(() => null);
  if (!token) {
    return { status: 'error', providers: UNKNOWN_PROVIDERS, message: 'Not authenticated' };
  }
  try {
    const { data, error } = await supabase.functions.invoke('check-connections-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) {
      return {
        status: 'error',
        providers: UNKNOWN_PROVIDERS,
        message: (error as { message?: string } | null)?.message ?? 'Status service unavailable',
      };
    }
    const aw = ((data as Record<string, unknown>).appleWatch ?? {}) as Record<string, unknown>;
    const o = ((data as Record<string, unknown>).oura ?? {}) as Record<string, unknown>;
    const ouraErrored = aw && (o.status === 'error' || o.error);
    const appleErrored = aw && (aw.status === 'error' || aw.error);

    const oura: WearableStatus = ouraErrored
      ? UNKNOWN_STATE
      : {
          connected: !!o.connected,
          status: o.connected ? 'connected' : 'disconnected',
          lastSync: (o.lastSync as string | null) ?? null,
          needsReconnect: !!o.needsReconnect,
        };
    const appleWatch: WearableStatus = appleErrored
      ? UNKNOWN_STATE
      : {
          connected: !!aw.connected,
          status: aw.connected ? 'connected' : 'disconnected',
          lastSync: (aw.lastSync as string | null) ?? null,
          needsReconnect: !!aw.needsReconnect,
        };
    const providers: WearableProvidersState = {
      appleWatch,
      oura,
      whoop: { connected: false, status: 'disconnected', lastSync: null },
    };
    if (ouraErrored || appleErrored) {
      const messages: string[] = [];
      if (ouraErrored) messages.push((o.errorMessage as string | undefined) ?? 'Oura status unavailable');
      if (appleErrored) messages.push((aw.errorMessage as string | undefined) ?? 'Apple Watch status unavailable');
      const erroredSources = [
        ...((aw.erroredSources as string[] | undefined) ?? []),
        ...(ouraErrored ? ['oura_connections'] : []),
      ];
      return {
        status: 'error',
        providers,
        message: messages.join(' · '),
        erroredSources,
        partial: !(ouraErrored && appleErrored),
      };
    }
    return { status: 'ok', providers };
  } catch (err) {
    console.warn('[WearableProviderPicker] fetch state failed:', err);
    return {
      status: 'error',
      providers: UNKNOWN_PROVIDERS,
      message: err instanceof Error ? err.message : 'Status service unavailable',
    };
  }
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
  return `${Math.floor(hours / 24)}d ago`;
}

interface RowProps {
  provider: WearableProviderId;
  label: string;
  iconSrc: string;
  status: WearableStatus | undefined;
  redirectPath?: string;
  onChanged?: () => void;
  disabled?: boolean;
}

function WearableRow({ provider, label, iconSrc, status, redirectPath, onChanged, disabled }: RowProps) {
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isAppleWatch = provider === 'apple-watch';
  const isWhoop = provider === 'whoop';
  const native = isNativeApp();

  const isUnknown = status?.status === 'unknown';
  const connected = !!status?.connected && !isUnknown;
  const needsReconnect = !!status?.needsReconnect;
  const lastSyncLabel = relativeLabel(status?.lastSync);

  const handleConnect = useCallback(async () => {
    if (disabled || busy) return;
    if (isWhoop) {
      toast.info('Whoop integration is coming soon');
      return;
    }
    setBusy(true);
    try {
      if (isAppleWatch) {
        if (!native) {
          toast.info('Apple Watch is available in the iOS app');
          return;
        }
        const granted = await requestHealthKitPermissions();
        if (!granted) {
          toast.error('HealthKit permission denied. Enable in Settings → Privacy → Health.');
          return;
        }
        const result = await syncHealthKitToBackend();
        if (result?.success !== false) {
          toast.success('Apple Watch connected');
          if (user?.id) clearOuterReadinessCache(user.id);
          queryClient.invalidateQueries({ queryKey: ['outer-readiness'] });
          invalidatePlanCache();
        } else {
          toast.warning('Connected, initial sync will retry shortly');
        }
      } else {
        // Oura
        const { url, error } = await startOuraOAuth(redirectPath);
        if (error || !url) {
          toast.error('Failed to start Oura connection');
          return;
        }
        await openUrl(url);
      }
      onChanged?.();
    } catch (err) {
      console.error('[WearableProviderPicker] connect failed:', err);
      toast.error(`Failed to connect ${label}`);
    } finally {
      setBusy(false);
    }
  }, [busy, disabled, isAppleWatch, isWhoop, label, native, onChanged]);

  const pill = needsReconnect ? (
    <Badge variant="outline" className="bg-foreground/5 text-foreground/70 border-border text-[10px]">
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
        <img src={iconSrc} alt={label} className="w-8 h-8 rounded-lg object-contain bg-white p-1" />
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{label}</span>
            {pill}
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {isWhoop
              ? 'Coming soon'
              : isAppleWatch && !native
                ? 'Available in the iOS app'
                : isUnknown
                  ? 'Status unavailable'
                  : connected
                    ? lastSyncLabel ? `Last sync ${lastSyncLabel}` : 'Connected'
                    : needsReconnect ? 'Permission revoked' : 'Not connected'}
          </span>
        </div>
      </div>
      <div>
        {isUnknown ? (
          // Do NOT offer a Connect action while the real state is unknown —
          // that would mislead users during a transient status failure.
          <Button size="sm" variant="ghost" disabled aria-label="Status unavailable">—</Button>
        ) : (
          <Button
            size="sm"
            variant={connected ? 'ghost' : 'outline'}
            onClick={handleConnect}
            disabled={busy || disabled || isWhoop || (isAppleWatch && !native) || connected}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : connected ? 'Connected' : needsReconnect ? 'Reconnect' : 'Connect'}
          </Button>
        )}
      </div>
    </div>
  );
}

interface WearableProviderPickerProps {
  redirectPath?: string;
  /** When provided, only render these wearables. */
  only?: WearableProviderId[];
  onChanged?: () => void;
}

export default function WearableProviderPicker({ redirectPath, only, onChanged }: WearableProviderPickerProps) {
  const [state, setState] = useState<WearableProvidersState>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await fetchWearableProvidersState();
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
    setTimeout(() => { refresh(); }, 400);
  }, [onChanged, refresh]);

  const show = (id: WearableProviderId) => !only || only.includes(id);

  return (
    <div className="space-y-3">
      {fetchError && (
        <div
          role="alert"
          data-testid="wearable-provider-error"
          className="flex items-start gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900"
        >
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Couldn't load wearable status</div>
            <div className="text-xs text-amber-900/80 truncate">
              {fetchError}. Your existing connections are still active.
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={loading}
            aria-label="Retry loading wearable status"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <><RotateCw className="w-3.5 h-3.5 mr-1" /> Retry</>
            )}
          </Button>
        </div>
      )}
      {show('apple-watch') && (
        <WearableRow provider="apple-watch" label="Apple Watch" iconSrc={appleHealthLogo}
          status={state.appleWatch} redirectPath={redirectPath} onChanged={handleChanged} disabled={loading} />
      )}
      {show('oura') && (
        <WearableRow provider="oura" label="Oura Ring" iconSrc={ouraLogo}
          status={state.oura} redirectPath={redirectPath} onChanged={handleChanged} disabled={loading} />
      )}
      {show('whoop') && (
        <WearableRow provider="whoop" label="Whoop" iconSrc={whoopLogo}
          status={state.whoop} redirectPath={redirectPath} onChanged={handleChanged} disabled={loading} />
      )}
    </div>
  );
}