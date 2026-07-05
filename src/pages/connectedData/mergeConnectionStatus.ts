/**
 * Pure merge helper for backend `check-connections-status` responses.
 *
 * Backend now surfaces transient query failures on the Oura and Apple Watch
 * branches as `status: 'error'` (see supabase/functions/check-connections-
 * status/index.ts). Overwriting the local UI state with such a response
 * would flip a real connected wearable to "Not connected" until the next
 * healthy poll. This merge keeps the freshest prior state for any errored
 * branch while letting healthy branches update normally.
 *
 * Pure by design so it can be unit-tested without React.
 */

// Structural type — we intentionally do not import the full ConnectionStatus
// interface from ConnectedData.tsx to avoid a circular import from tests.
type Branch = {
  status?: 'ok' | 'error' | string;
  [k: string]: unknown;
};

export interface MergeableStatus {
  oura?: Branch | null;
  appleWatch?: Branch | null;
  calendar?: unknown;
  [k: string]: unknown;
}

export function mergeConnectionStatus<T extends MergeableStatus>(
  prev: T | null,
  incoming: T,
): T {
  if (!prev) return incoming;
  const next: T = { ...incoming };
  if (incoming?.oura && (incoming.oura as Branch).status === 'error' && prev.oura) {
    console.warn(
      '[ConnectedData] Oura status transiently unavailable — preserving prior state',
    );
    (next as MergeableStatus).oura = prev.oura;
  }
  if (
    incoming?.appleWatch &&
    (incoming.appleWatch as Branch).status === 'error' &&
    prev.appleWatch
  ) {
    console.warn(
      '[ConnectedData] Apple Watch status transiently unavailable — preserving prior state',
    );
    (next as MergeableStatus).appleWatch = prev.appleWatch;
  }
  return next;
}