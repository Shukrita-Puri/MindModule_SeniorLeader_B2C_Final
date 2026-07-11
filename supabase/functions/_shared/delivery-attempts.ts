/**
 * Batch C — Per-device delivery attempts.
 *
 * A user may have several active devices. The old model overwrote
 * `notification_log.delivery_state` with the LAST APNs response, so
 * a two-device user where one device succeeded and one failed would
 * appear as "failed" (or vice versa). We now persist one row per
 * device per notification and derive the parent state from the set.
 *
 * Raw device tokens are never written or logged. Attempts reference
 * `notification_device_tokens.id` and a hashed token prefix only.
 */

import { hashTokenPrefix } from "./token-hash.ts";

export interface RecordAttemptInput {
  notificationLogId: string;
  userId: string;
  deviceTokenId?: string | null;
  rawToken: string;
  platform: "ios" | "android" | string;
  apnsEnvironment: string | null;
  apnsStatus: number | null;
  apnsReason: string | null;
  apnsId: string | null;
  attemptNumber?: number;
  permanentFailure?: boolean;
  extra?: Record<string, unknown>;
}

// deno-lint-ignore no-explicit-any
export async function recordDeliveryAttempt(supabase: any, input: RecordAttemptInput): Promise<void> {
  try {
    const hashed = await hashTokenPrefix(input.rawToken);
    await supabase.from("notification_delivery_attempts").insert({
      notification_log_id: input.notificationLogId,
      user_id: input.userId,
      device_token_id: input.deviceTokenId ?? null,
      token_hash_prefix: hashed,
      platform: input.platform,
      apns_environment: input.apnsEnvironment,
      apns_status: input.apnsStatus,
      apns_reason: input.apnsReason,
      apns_id: input.apnsId,
      attempt_number: input.attemptNumber ?? 1,
      permanent_failure: input.permanentFailure ?? false,
      extra: input.extra ?? {},
    });
  } catch (err) {
    // Never let telemetry failures break the send loop.
    console.warn(`[delivery-attempts] insert failed: ${String(err)}`);
  }
}

export type AttemptOutcome = "accepted" | "failed" | "unknown";

/**
 * Derive the parent notification's overall outcome from per-device
 * attempts. Used by the reconciler and by admin diagnostics.
 */
export function deriveParentOutcome(attempts: Array<{ apnsStatus: number | null }>): AttemptOutcome {
  if (!attempts.length) return "unknown";
  const anyAccepted = attempts.some((a) => a.apnsStatus === 200);
  const allFailed = attempts.every((a) => a.apnsStatus !== null && a.apnsStatus !== 200);
  if (anyAccepted) return "accepted";
  if (allFailed) return "failed";
  return "unknown";
}