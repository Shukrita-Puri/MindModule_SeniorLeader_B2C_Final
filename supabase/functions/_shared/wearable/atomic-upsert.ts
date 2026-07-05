/**
 * Atomic merge+upsert for public.wearable_data.
 *
 * Problem this solves:
 *   Two concurrent syncs (e.g. sync-oura + persist-wearable-data) could each
 *   read the same (user_id, summary_date) row, compute a merged variant, and
 *   both upsert — the later write silently clobbering metrics chosen by the
 *   earlier merge. That is a classic lost-update race even though
 *   mergeCanonicalWearableRow is correct.
 *
 * Strategy: optimistic concurrency control (CAS) on `updated_at`.
 *   1. Read the existing row (including updated_at).
 *   2. Run mergeCanonicalWearableRow with the same TS logic every path uses.
 *   3. Guard the write:
 *        - if no row existed → INSERT; on unique-violation retry as update.
 *        - if a row existed → UPDATE ... WHERE updated_at = <prev_updated_at>.
 *      If the guarded UPDATE affects 0 rows, a concurrent writer moved
 *      updated_at → re-read and retry the merge (bounded).
 *
 * This preserves:
 *   - per-metric provenance / source_apps merging
 *   - recency guard + reconciliation callbacks (called during merge)
 *   - deterministic outcome for near-simultaneous Oura + Apple writes:
 *     after the last successful CAS the row is a merge of ALL inputs seen so
 *     far, regardless of arrival order.
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
  "raw_data, updated_at";

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

    const prevUpdatedAt: string | null =
      (existing as { updated_at?: string | null } | null)?.updated_at ?? null;

    const merged = mergeCanonicalWearableRow(
      (existing as Record<string, unknown> | null) ?? null,
      incomingRow,
      { context: opts.context, onReconciliation: opts.onReconciliation },
    );
    merged.user_id = userId;
    merged.summary_date = summaryDate;
    merged.updated_at = new Date().toISOString();
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
    update = prevUpdatedAt === null
      ? update.is("updated_at", null)
      : update.eq("updated_at", prevUpdatedAt);

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