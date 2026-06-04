import { useCallback, useEffect, useState } from 'react';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getAuthToken } from '@/services/authTokenService';
import { openUrl } from '@/utils/openUrl';
import { startOuraOAuth } from '@/services/ouraSyncService';
import { requestHealthKitPermissions, isNativeApp } from '@/utils/healthKitCapacitor';
import { syncHealthKitToBackend } from '@/services/wearableSyncService';
import appleHealthLogo from '@/assets/shared/apple-health-logo.png';
import ouraLogo from '@/assets/shared/oura-ring-logo.png';
import whoopLogo from '@/assets/shared/whoop-logo.png';

export type WearableProviderId = 'apple-watch' | 'oura' | 'whoop';

export interface WearableStatus {
  connected: boolean;
  lastSync: string | null;
  needsReconnect?: boolean;
}

export interface WearableProvidersState {
  appleWatch?: WearableStatus;
  oura?: WearableStatus;
  whoop?: WearableStatus;
}

export async function fetchWearableProvidersState(): Promise<WearableProvidersState> {
  try {
    const token = await getAuthToken();
    if (!token) return {};
    const { data, error } = await supabase.functions.invoke('check-connections-status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data) return {};
    const aw = (data as any)?.appleWatch ?? {};
    const o = (data as any)?.oura ?? {};
    return {
      appleWatch: {
        connected: !!aw.connected,
        lastSync: aw.lastSync ?? null,
        needsReconnect: !!aw.needsReconnect,
      },
      oura: {
        connected: !!o.connected,
        lastSync: o.lastSync ?? null,
        needsReconnect: !!o.needsReconnect,
      },
      whoop: { connected: false, lastSync: null },
    };
  } catch (err) {
    console.warn('[WearableProviderPicker] fetch state failed:', err);
    return {};
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
  onChanged?: () => void;
  disabled?: boolean;
}

function WearableRow({ provider, label, iconSrc, status, onChanged, disabled }: RowProps) {
  const [busy, setBusy] = useState(false);
  const isAppleWatch = provider === 'apple-watch';
  const isWhoop = provider === 'whoop';
  const native = isNativeApp();

  const connected = !!status?.connected;
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
        if (result?.success !== false) toast.success('Apple Watch connected');
        else toast.warning('Connected, initial sync will retry shortly');
      } else {
        // Oura
        const { url, error } = await startOuraOAuth();
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
                : connected
                  ? lastSyncLabel ? `Last sync ${lastSyncLabel}` : 'Connected'
                  : needsReconnect ? 'Permission revoked' : 'Not connected'}
          </span>
        </div>
      </div>
      <div>
        <Button
          size="sm"
          variant={connected ? 'ghost' : 'outline'}
          onClick={handleConnect}
          disabled={busy || disabled || isWhoop || (isAppleWatch && !native) || connected}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : connected ? 'Connected' : needsReconnect ? 'Reconnect' : 'Connect'}
        </Button>
      </div>
    </div>
  );
}

interface WearableProviderPickerProps {
  /** When provided, only render these wearables. */
  only?: WearableProviderId[];
  onChanged?: () => void;
}

export default function WearableProviderPicker({ only, onChanged }: WearableProviderPickerProps) {
  const [state, setState] = useState<WearableProvidersState>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setState(await fetchWearableProvidersState());
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleChanged = useCallback(() => {
    onChanged?.();
    setTimeout(() => { refresh(); }, 400);
  }, [onChanged, refresh]);

  const show = (id: WearableProviderId) => !only || only.includes(id);

  return (
    <div className="space-y-3">
      {show('apple-watch') && (
        <WearableRow provider="apple-watch" label="Apple Watch" iconSrc={appleHealthLogo}
          status={state.appleWatch} onChanged={handleChanged} disabled={loading} />
      )}
      {show('oura') && (
        <WearableRow provider="oura" label="Oura Ring" iconSrc={ouraLogo}
          status={state.oura} onChanged={handleChanged} disabled={loading} />
      )}
      {show('whoop') && (
        <WearableRow provider="whoop" label="Whoop" iconSrc={whoopLogo}
          status={state.whoop} onChanged={handleChanged} disabled={loading} />
      )}
    </div>
  );
}