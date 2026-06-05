import { ReactNode } from 'react';
import { Loader2, MoreVertical, RefreshCw } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface ProviderRowCardProps {
  id: string;
  name: string;
  /** Short description shown when disconnected. */
  description: string;
  logo: ReactNode;
  /** Whether the provider is healthily connected. */
  connected: boolean;
  /** Whether the provider is linked (connected but possibly degraded). */
  linked: boolean;
  /** Pre-formatted "Last synced …" string, or null. */
  lastSync: string | null;
  /** Short status label (e.g. "Needs attention"). */
  statusLabel?: string;
  /** Secondary status detail. */
  statusNote?: string;
  /** Show coral "Reconnect" CTA instead of "Connect". */
  showReconnect?: boolean;
  /** Currently running an OAuth/connect flow for this row. */
  isConnecting?: boolean;
  /** A manual sync is in flight (affects this row). */
  isSyncing?: boolean;
  /** Whether the manual sync action is supported. */
  canSync?: boolean;
  onConnect?: () => void;
  onSync?: () => void;
  onDisconnect?: () => void;
}

/**
 * Parchment-styled provider row used on /connected-data. Visually matches the
 * onboarding /onboarding/permissions cards (logo + name + note inside a soft
 * rounded card on parchment), while exposing the richer per-provider
 * controls — Connect / Reconnect / Disconnect / Sync now — plus a
 * last-synced timestamp.
 */
export default function ProviderRowCard({
  name,
  description,
  logo,
  connected,
  linked,
  lastSync,
  statusLabel,
  statusNote,
  showReconnect,
  isConnecting,
  isSyncing,
  canSync,
  onConnect,
  onSync,
  onDisconnect,
}: ProviderRowCardProps) {
  // Active surfaces stay white so connected rows feel trustworthy rather than
  // greyed-out. Permission/auth problems surface as the coral reconnect tone.
  const tone = showReconnect
    ? 'border-[#e8714a]/50 bg-[#e8714a]/[0.04]'
    : connected || linked
    ? 'border-[#cfc7b8] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
    : 'border-[#cfc7b8] bg-white';

  const subtitle = connected && lastSync ? lastSync : description;

  return (
    <div
      className={`flex items-start justify-between gap-3 p-3.5 rounded-[14px] border mb-2 transition-colors ${tone}`}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-[10px] bg-white p-1 border border-[#cfc7b8] shrink-0 flex items-center justify-center overflow-hidden">
          {logo}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-[13px] font-medium text-[#1a1712]">{name}</div>
            {(connected || linked) && !showReconnect && (
              <span
                aria-label="Connected"
                className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"
              />
            )}
          </div>
          <div className="text-[11px] text-[#7a7060] mt-0.5 leading-[1.45]">{subtitle}</div>
          {statusLabel && (
            <div className="text-[10px] tracking-[1.5px] uppercase text-[#7a7060] mt-1">
              {statusLabel}
            </div>
          )}
          {statusNote && (
            <div className="text-[10px] text-[#7a7060] italic mt-0.5 leading-[1.4]">
              {statusNote}
            </div>
          )}
          {isSyncing && (
            <div className="text-[10px] text-[#e8714a] mt-1 flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-1.5">
        {linked || connected ? (
          (canSync || onDisconnect) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="More actions"
                  className="w-8 h-8 rounded-full border border-[#1a1712]/25 text-[#1a1712] hover:bg-[#1a1712]/[0.06] flex items-center justify-center transition-colors"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#f5f0e8] border-[#cfc7b8]">
                {canSync && onSync && (
                  <DropdownMenuItem onClick={onSync} disabled={isSyncing}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync now
                  </DropdownMenuItem>
                )}
                {onConnect && (
                  <DropdownMenuItem onClick={onConnect} disabled={isConnecting}>
                    Reconnect
                  </DropdownMenuItem>
                )}
                {onDisconnect && (
                  <DropdownMenuItem
                    className="text-[#c2410c] focus:text-[#c2410c]"
                    onClick={onDisconnect}
                  >
                    Disconnect
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : showReconnect ? (
          <button
            type="button"
            onClick={onConnect}
            disabled={isConnecting}
            className="h-8 px-3 rounded-full bg-[#e8714a] text-white text-[12px] font-medium hover:bg-[#c55a35] disabled:opacity-50 transition-colors"
          >
            {isConnecting ? 'Connecting…' : 'Reconnect'}
          </button>
        ) : (
          onConnect && (
            <button
              type="button"
              onClick={onConnect}
              disabled={isConnecting}
              className="h-8 px-3 rounded-full border border-[#1a1712]/35 text-[#1a1712] text-[12px] font-medium hover:bg-[#1a1712]/[0.06] disabled:opacity-50 transition-colors"
            >
              {isConnecting ? 'Connecting…' : 'Connect'}
            </button>
          )
        )}
      </div>
    </div>
  );
}