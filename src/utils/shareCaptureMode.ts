/**
 * Global "share capture" flag.
 *
 * While a card is being snapshotted for the iOS share sheet, components may
 * render an export-optimised layout (e.g. the month calendar switches from a
 * horizontally-scrolling week strip to a compact 7-column grid so the whole
 * month fits a portrait image). Purely presentational — no data changes.
 */
import { useSyncExternalStore } from 'react';

let capturing = false;
const listeners = new Set<() => void>();

export function setShareCapture(next: boolean) {
  if (capturing === next) return;
  capturing = next;
  listeners.forEach((l) => l());
}

export function isShareCapturing() {
  return capturing;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useShareCapture(): boolean {
  return useSyncExternalStore(subscribe, () => capturing, () => false);
}

/** Wait for React to flush the export layout before snapshotting. */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
