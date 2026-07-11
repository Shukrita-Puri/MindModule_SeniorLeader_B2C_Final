/**
 * Central normalization for legacy Apple Watch integration rows.
 *
 * Older app versions mistakenly persisted the internal handoff marker
 * `native_healthkit_fallback_triggered` into `watch_last_error`, and
 * some of those same rows carried a co-occurring `watch_sync_status`
 * of `sync_delayed`. Masking only `lastError` in the API response was
 * not enough: the UI still rendered "sync delayed" with no error
 * reason, and the sync-state model (see `src/services/syncStateModel.ts`)
 * still mapped that to `partial_sync`.
 *
 * This helper is the single source of truth used by every user-visible
 * status surface. If additional legacy markers appear in the future,
 * add them here (see `LEGACY_INTERNAL_MARKERS`).
 */

export const LEGACY_INTERNAL_MARKERS = new Set<string>([
  "native_healthkit_fallback_triggered",
]);

export interface WatchIntegrationInput {
  watch_sync_status?: string | null;
  watch_last_error?: string | null;
  watch_last_error_at?: string | null;
}

export interface NormalizedWatchStatus {
  syncStatus: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  /** True when the incoming row carried a known legacy internal marker. */
  wasLegacyMarker: boolean;
}

export function normalizeWatchStatus(
  row: WatchIntegrationInput | null | undefined,
  fallbackSyncStatus?: string | null,
): NormalizedWatchStatus {
  const rawError = row?.watch_last_error ?? null;
  const isLegacy = !!rawError && LEGACY_INTERNAL_MARKERS.has(rawError);
  const rawSync = row?.watch_sync_status ?? fallbackSyncStatus ?? null;

  // When the row carries a legacy internal marker, hide the error
  // AND coerce any co-persisted `sync_delayed` back to
  // `waiting_for_data` so the client renders the true benign state.
  const syncStatus = isLegacy && rawSync === "sync_delayed"
    ? "waiting_for_data"
    : rawSync;

  return {
    syncStatus,
    lastError: isLegacy ? null : rawError,
    lastErrorAt: isLegacy ? null : (row?.watch_last_error_at ?? null),
    wasLegacyMarker: isLegacy,
  };
}