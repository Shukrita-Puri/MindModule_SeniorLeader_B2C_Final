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
