/**
 * Batch C — Atomic dispatch-key idempotency.
 *
 * Overlapping cron ticks, evaluator retries, and admin force-runs must
 * never produce more than one logical send per notification decision.
 * We enforce this with a database-unique claim on a deterministic key
 * BEFORE any APNs traffic or notification_log insert.
 *
 * The key composition below is deliberately narrow: it identifies the
 * decision, not the payload. Two evaluators that pick the same slot +
 * anchor for the same user + local day collapse to a single claim.
 * The claimant that wins performs the send; the loser observes the
 * claim row and exits with the shared `duplicate_claim` outcome.
 */

export interface DispatchKeyInput {
  userId: string;
  notificationType: string;
  slot?: string | null;
  localDate: string; // YYYY-MM-DD in user's effective timezone
  eventReference?: string | null;
  weekReference?: string | null; // e.g. week_ahead ISO week key
  planSnapshotId?: string | null;
  candidateType?: string | null;
}

/**
 * Deterministic, human-inspectable dispatch key. Order and delimiter
 * are stable so a re-run for the same decision always regenerates the
 * same string. Anything null/undefined normalises to '-' so its
 * absence is explicit (never accidentally equal to a present value).
 */
export function computeDispatchKey(input: DispatchKeyInput): string {
  const parts = [
    "nd", // family prefix ("nudge dispatch")
    input.userId,
    input.localDate,
    input.notificationType,
    input.slot ?? "-",
    input.eventReference ?? "-",
    input.weekReference ?? "-",
    input.planSnapshotId ?? "-",
    input.candidateType ?? "-",
  ];
  // Delimiter is a double-colon: uncommon in IDs / dates / slots and
  // won't be produced by any of our identifier generators. If a future
  // field could legitimately contain "::" it must be sanitised here.
  return parts.map((p) => String(p).replace(/::/g, "_")).join("::");
}

export interface ClaimResult {
  claimed: boolean;
  dispatchKey: string;
  claimId: string | null;
  existingLogId: string | null;
  reason?: "already_claimed" | "insert_error" | null;
  error?: unknown;
}

/**
 * Attempt to insert a row into `notification_dispatch_claims`. The
 * table has a UNIQUE constraint on `dispatch_key`, so concurrent
 * inserts collapse to a single winner. Losers surface
 * `{ claimed: false, existingLogId }` and MUST exit without sending.
 */
// deno-lint-ignore no-explicit-any
export async function claimDispatch(supabase: any, input: DispatchKeyInput): Promise<ClaimResult> {
  const dispatchKey = computeDispatchKey(input);
  try {
    const { data, error } = await supabase
      .from("notification_dispatch_claims")
      .insert({
        user_id: input.userId,
        dispatch_key: dispatchKey,
        notification_type: input.notificationType,
        slot: input.slot ?? null,
        local_date: input.localDate,
        event_reference: input.eventReference ?? null,
        week_reference: input.weekReference ?? null,
      })
      .select("id")
      .single();

    if (error) {
      const msg = String((error as { message?: string })?.message ?? error);
      // Postgres unique_violation → 23505. supabase-js surfaces it as
      // an error object; matching on either the code or the message
      // keeps this resilient to client version drift.
      if (
        (error as { code?: string })?.code === "23505" ||
        /duplicate key|unique/i.test(msg)
      ) {
        const { data: existing } = await supabase
          .from("notification_dispatch_claims")
          .select("id, notification_log_id")
          .eq("dispatch_key", dispatchKey)
          .maybeSingle();
        return {
          claimed: false,
          dispatchKey,
          claimId: existing?.id ?? null,
          existingLogId: existing?.notification_log_id ?? null,
          reason: "already_claimed",
        };
      }
      return {
        claimed: false,
        dispatchKey,
        claimId: null,
        existingLogId: null,
        reason: "insert_error",
        error,
      };
    }

    return {
      claimed: true,
      dispatchKey,
      claimId: data?.id ?? null,
      existingLogId: null,
    };
  } catch (err) {
    return {
      claimed: false,
      dispatchKey,
      claimId: null,
      existingLogId: null,
      reason: "insert_error",
      error: err,
    };
  }
}

/**
 * Attach the resulting notification_log id to the winning claim so
 * losers observing the claim can point at the canonical send row.
 * Best-effort — failure here does not roll back the send.
 */
// deno-lint-ignore no-explicit-any
export async function attachNotificationLogToClaim(
  supabase: any,
  claimId: string,
  notificationLogId: string,
): Promise<void> {
  try {
    await supabase
      .from("notification_dispatch_claims")
      .update({ notification_log_id: notificationLogId })
      .eq("id", claimId);
  } catch (_) {
    // best-effort
  }
}