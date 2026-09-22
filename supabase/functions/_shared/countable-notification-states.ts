/**
 * Batch B — Shared "countable notification" contract.
 *
 * The single source of truth for whether a historical
 * `notification_log` row should count toward:
 *   • the daily notification cap
 *   • the 2-hour intra-tick suppression window
 *   • per-slot suppression
 *   • Week-Ahead weekly checks (where applicable)
 *
 * A row is COUNTABLE only if it represents a meaningful production send
 * to a real user device. Anything that never reached (or intentionally
 * bypassed) a real user MUST NOT consume user-facing limits.
 *
 * NOTE (Batch F): the delivery-state vocabulary is being migrated to
 *   accepted_by_apns | opened | action_completed | failed | expired
 * We keep legacy states readable here so existing production rows still
 * count/exclude correctly during the transition.
 */
export const COUNTABLE_DELIVERY_STATES = [
  // Post-Batch F canonical:
  "accepted_by_apns",
  "opened",
  "action_completed",
  // Legacy (still present in production data):
  "pending",
  "accepted",
  "delivered",
  "sent",
] as const;

export const NON_COUNTABLE_DELIVERY_STATES = [
  "failed",
  "dry_run",
  "suppressed",
  "validation_rejected",
  "expired_before_delivery",
  "expired",
  "configuration_failed",
  "duplicate_claim",
  "test_push",
] as const;

export type CountableDeliveryState = (typeof COUNTABLE_DELIVERY_STATES)[number];

export function isCountableDeliveryState(state: string | null | undefined): boolean {
  if (!state) return false;
  return (COUNTABLE_DELIVERY_STATES as readonly string[]).includes(state);
}

export function isNonCountableDeliveryState(state: string | null | undefined): boolean {
  if (!state) return false;
  return (NON_COUNTABLE_DELIVERY_STATES as readonly string[]).includes(state);
}

// ═══════════════════════════════════════════════════════════════════════
// USER-VISIBLE NOTIFICATION CONTRACT
//
// Background sync pushes are content-available only: the user never sees
// them. They are logged with `variant_id = 'silent_sync'` and a
// `notification_type` of `early_morning_sync_*` / `daytime_sync_*`.
//
// They MUST NOT consume any user-facing allowance — daily cap, 2-hour
// spacing, or per-slot occupancy. Nine silent syncs a day were exhausting
// the 3/day cap and permanently tripping the 2h window.
//
// This is the single rule; every limit check reads it.
// ═══════════════════════════════════════════════════════════════════════

/** Sentinel variant written by every silent background-sync push. */
export const SILENT_SYNC_VARIANT_ID = "silent_sync";

/** notification_type prefixes owned by silent background sync. */
export const SILENT_SYNC_TYPE_PREFIXES = [
  "early_morning_sync",
  "daytime_sync",
] as const;

export interface NotificationLogIdentity {
  notification_type?: string | null;
  variant_id?: string | null;
}

/** True when the row is a silent background-sync push (never user-visible). */
export function isSilentSyncNotification(
  row: NotificationLogIdentity | null | undefined,
): boolean {
  if (!row) return false;
  if (String(row.variant_id ?? "") === SILENT_SYNC_VARIANT_ID) return true;
  const type = String(row.notification_type ?? "");
  return SILENT_SYNC_TYPE_PREFIXES.some((p) => type.startsWith(p));
}

/**
 * True when the row represents a notification the user actually saw, i.e. it
 * entered the delivery lifecycle AND is not a silent background sync.
 * This is the only rule allowed to gate caps, spacing and slot occupancy.
 */
export function isUserVisibleNotification(
  row: (NotificationLogIdentity & { delivery_state?: string | null }) | null | undefined,
): boolean {
  if (!row) return false;
  if (isSilentSyncNotification(row)) return false;
  return isCountableDeliveryState(row.delivery_state ?? null);
}

/**
 * Drop silent-sync rows from a fetched notification_log page. Use when the
 * query already filtered `delivery_state` server-side.
 */
export function excludeSilentSync<T extends NotificationLogIdentity>(
  rows: readonly T[] | null | undefined,
): T[] {
  return (rows ?? []).filter((r) => !isSilentSyncNotification(r));
}
