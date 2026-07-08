// Sprint 12 (Phase 9B) — travel-state-sync visibility helper.
//
// travel_state_sync has NO dedicated run-log table. The old summary card
// therefore lied by showing `currentStatus: "idle"`, which the client
// could not distinguish from "actually idle for hours". This helper
// derives an honest status:
//
//   • enabled=false                    → "disabled"
//   • no observed sync signal          → "unknown"           + runLogAvailable=false
//   • observed within 2× dispatcher    → "observed_recently" + runLogAvailable=false (proxy only)
//   • observed but older than 2×       → "stale_or_unknown"  + runLogAvailable=false
//
// The "observed" signal is `MAX(travel_state.meta->>'last_sync_at')`
// which the sync producer writes on every user it visits (skip or
// write). This is a PROXY, not a real run-log — the response makes that
// explicit so no downstream UI mistakes it for authoritative history.

export interface TravelSyncSummaryInput {
  enabled: boolean;
  dispatcherIntervalMinutes: number | null;
  lastObservedSyncAt: string | null; // ISO from MAX(meta->>'last_sync_at')
  now: Date;
}

export type TravelSyncStatus =
  | "disabled"
  | "unknown"
  | "observed_recently"
  | "stale_or_unknown";

export interface TravelSyncSummary {
  currentStatus: TravelSyncStatus;
  lastObservedSyncAt: string | null;
  runLogAvailable: false;
  statusReason:
    | "no_run_log_table"
    | "disabled_in_config"
    | "no_observed_sync"
    | "observed_within_interval"
    | "observed_but_stale";
  observedProxy: true;
}

export function summarizeTravelSync(
  input: TravelSyncSummaryInput,
): TravelSyncSummary {
  if (!input.enabled) {
    return {
      currentStatus: "disabled",
      lastObservedSyncAt: input.lastObservedSyncAt,
      runLogAvailable: false,
      statusReason: "disabled_in_config",
      observedProxy: true,
    };
  }
  if (!input.lastObservedSyncAt) {
    return {
      currentStatus: "unknown",
      lastObservedSyncAt: null,
      runLogAvailable: false,
      statusReason: "no_observed_sync",
      observedProxy: true,
    };
  }
  const parsed = Date.parse(input.lastObservedSyncAt);
  if (!Number.isFinite(parsed)) {
    return {
      currentStatus: "unknown",
      lastObservedSyncAt: input.lastObservedSyncAt,
      runLogAvailable: false,
      statusReason: "no_observed_sync",
      observedProxy: true,
    };
  }
  const intervalMinutes = Math.max(5, input.dispatcherIntervalMinutes ?? 60);
  const ageMinutes = (input.now.getTime() - parsed) / 60000;
  if (ageMinutes <= intervalMinutes * 2) {
    return {
      currentStatus: "observed_recently",
      lastObservedSyncAt: input.lastObservedSyncAt,
      runLogAvailable: false,
      statusReason: "observed_within_interval",
      observedProxy: true,
    };
  }
  return {
    currentStatus: "stale_or_unknown",
    lastObservedSyncAt: input.lastObservedSyncAt,
    runLogAvailable: false,
    statusReason: "observed_but_stale",
    observedProxy: true,
  };
}
