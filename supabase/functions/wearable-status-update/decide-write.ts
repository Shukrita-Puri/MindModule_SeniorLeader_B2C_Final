// Pure decision helper for wearable-status-update — split out so unit
// tests can import it without triggering the top-level Deno.serve() in
// index.ts. See ./decide-write_test.ts for behavior contract.

export interface CurrentRow {
  watch_sync_status?: string | null;
  watch_last_error?: string | null;
  watch_status_source?: string | null;
  watch_status_authoritative_at?: string | null;
}

export interface IncomingWrite {
  status: "synced" | "waiting_for_data" | "sync_delayed" | "permission_revoked" | "error";
  source: "native-ios" | "js-opportunistic";
  authoritativeAt: string;
}

export type WriteDecision =
  | { apply: true }
  | { apply: false; reason: "stale_timestamp" | "js_cannot_downgrade_native" | "js_cannot_downgrade_synced" };

export function decideWrite(
  current: CurrentRow | null | undefined,
  incoming: IncomingWrite,
): WriteDecision {
  if (!current || !current.watch_status_authoritative_at) return { apply: true };

  const currentAt = Date.parse(current.watch_status_authoritative_at);
  const incomingAt = Date.parse(incoming.authoritativeAt);
  const isNewer = Number.isFinite(incomingAt) && incomingAt > currentAt;

  const currentStatus = current.watch_sync_status ?? null;
  const currentSource = current.watch_status_source ?? null;

  // "synced" always wins over any non-synced current, regardless of clock skew.
  if (incoming.status === "synced" && currentStatus !== "synced") return { apply: true };

  // JS opportunistic writes may NEVER downgrade an authoritative native record.
  if (incoming.source === "js-opportunistic") {
    if (currentSource === "native-ios" && currentStatus === "synced" && incoming.status !== "synced") {
      return { apply: false, reason: "js_cannot_downgrade_synced" };
    }
    if (currentSource === "native-ios" && !isNewer) {
      return { apply: false, reason: "js_cannot_downgrade_native" };
    }
  }

  // Native downgrade requires newer timestamp.
  if (
    incoming.source === "native-ios" &&
    currentStatus === "synced" &&
    incoming.status !== "synced" &&
    !isNewer
  ) {
    return { apply: false, reason: "stale_timestamp" };
  }

  if (isNewer) return { apply: true };
  if (incomingAt === currentAt) return { apply: true };
  return { apply: false, reason: "stale_timestamp" };
}