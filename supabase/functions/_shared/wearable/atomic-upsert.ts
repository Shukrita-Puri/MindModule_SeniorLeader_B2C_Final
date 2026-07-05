/**
 * Atomic merge+upsert for public.wearable_data.
 *
 * CAS token: `write_token` (uuid). We used to CAS on `updated_at`, but that
 * value is generated in JavaScript with millisecond precision — two writers
 * that finish in the same ms would stamp the identical string and the second
 * (stale) writer's CAS predicate would still match the first writer's
 * post-write row, silently clobbering it. `write_token` is a fresh
 * `crypto.randomUUID()` on every successful write, so every commit strictly
 * advances the token and stale writers always miss.
 *
 * Flow (bounded retry):
 *   1. Read the existing row incl. `write_token`.
 *   2. Run mergeCanonicalWearableRow (single source of TS merge truth).
 *   3. Stamp a new `write_token`, then guard the write:
 *        - no row existed → INSERT; on 23505 retry as update.
 *        - row existed → UPDATE ... WHERE write_token = <prev_write_token>.
 *      Zero rows affected ⇒ another writer committed first ⇒ re-read + merge.
 *
 * Preserves per-metric provenance/source_apps, recency guard, reconciliation
 * callbacks, and yields a deterministic final row that reflects ALL inputs
 * regardless of arrival order.
 */

import {
  mergeCanonicalWearableRow,
  type WearableMergeContext,
  type ReconciliationRecord,
} from "./canonical.ts";

/** Columns required for a lossless canonical merge round-trip. */
export const WEARABLE_MERGE_COLUMNS =
  "hrv, hrv_samples, resting_heart_rate, heart_rate, hr_samples, " +
  "total_sleep_minutes, deep_sleep_minutes, rem_sleep_minutes, " +
  "sleep_score, sleep_efficiency, source, source_provider, source_apps, " +
  "raw_data, updated_at, write_token";

export interface AtomicUpsertOptions {
  context: WearableMergeContext;
  onReconciliation?: (rec: ReconciliationRecord) => void;
  /** Bounded retries when CAS detects a concurrent writer. */
  maxAttempts?: number;
  /** When set (not undefined), force this raw_data onto the merged row. */
  overrideRawData?: unknown;
}

export interface AtomicUpsertResult {
  ok: boolean;
  attempts: number;
  /** True when the winning write was an UPDATE (existing row); false = INSERT. */
  wasUpdate?: boolean;
  error?: unknown;
}

// Minimal shape of the supabase-js query builder we exercise. Kept structural
// so tests can hand in a mock and production can pass a real client.
// deno-lint-ignore no-explicit-any
export type WearableDbClient = any;

export async function atomicMergeUpsertWearable(
  db: WearableDbClient,
  userId: string,
  summaryDate: string,
  incomingRow: Record<string, unknown>,
  opts: AtomicUpsertOptions,
): Promise<AtomicUpsertResult> {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 5);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { data: existing, error: readErr } = await db
      .from("wearable_data")
      .select(WEARABLE_MERGE_COLUMNS)
      .eq("user_id", userId)
      .eq("summary_date", summaryDate)
      .maybeSingle();

    if (readErr) return { ok: false, attempts: attempt, error: readErr };

    // Legacy rows written before the write_token column existed will surface
    // as null here; the CAS predicate below handles that via `.is(...)`.
    const prevWriteToken: string | null =
      (existing as { write_token?: string | null } | null)?.write_token ?? null;

    const merged = mergeCanonicalWearableRow(
      (existing as Record<string, unknown> | null) ?? null,
      incomingRow,
      { context: opts.context, onReconciliation: opts.onReconciliation },
    );
    merged.user_id = userId;
    merged.summary_date = summaryDate;
    merged.updated_at = new Date().toISOString();
    // Always advance the CAS token, even on same-millisecond writes.
    merged.write_token = crypto.randomUUID();
    if (opts.overrideRawData !== undefined) {
      merged.raw_data = opts.overrideRawData;
    }

    if (!existing) {
      const { error: insErr } = await db.from("wearable_data").insert(merged);
      if (!insErr) return { ok: true, attempts: attempt, wasUpdate: false };
      // Unique-violation: a concurrent writer inserted first. Retry as update.
      const code = (insErr as { code?: string } | null)?.code;
      if (code !== "23505") {
        return { ok: false, attempts: attempt, error: insErr };
      }
      continue;
    }

    let update = db
      .from("wearable_data")
      .update(merged)
      .eq("user_id", userId)
      .eq("summary_date", summaryDate);
    update = prevWriteToken === null
      ? update.is("write_token", null)
      : update.eq("write_token", prevWriteToken);

    const { data: updated, error: updErr } = await update.select("summary_date");
    if (updErr) return { ok: false, attempts: attempt, error: updErr };
    if (Array.isArray(updated) && updated.length > 0) {
      return { ok: true, attempts: attempt, wasUpdate: true };
    }
    // CAS miss: another writer moved updated_at. Loop and re-merge.
  }

  return {
    ok: false,
    attempts: maxAttempts,
    error: new Error("atomic_merge_max_retries_exceeded"),
  };
}