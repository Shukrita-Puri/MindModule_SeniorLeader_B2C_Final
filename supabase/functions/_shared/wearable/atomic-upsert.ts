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
import { redactUserId } from "../identity/redact-user-id.ts";

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
  /** Injectable sleep for tests. Defaults to setTimeout. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable RNG for tests (0..1). Used for full-jitter backoff. */
  random?: () => number;
  /** Initial backoff delay in ms (default 20). */
  initialBackoffMs?: number;
  /** Maximum backoff delay in ms (default 500). */
  maxBackoffMs?: number;
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

/** Default retry budget. Raised from 5 → 12 to survive bursts of concurrent
 *  HealthKit + Oura writers on the same (user_id, summary_date). */
export const DEFAULT_ATOMIC_UPSERT_MAX_ATTEMPTS = 12;

const DEFAULT_INITIAL_BACKOFF_MS = 20;
const DEFAULT_MAX_BACKOFF_MS = 500;

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function atomicMergeUpsertWearable(
  db: WearableDbClient,
  userId: string,
  summaryDate: string,
  incomingRow: Record<string, unknown>,
  opts: AtomicUpsertOptions,
): Promise<AtomicUpsertResult> {
  const maxAttempts = Math.max(
    1,
    opts.maxAttempts ?? DEFAULT_ATOMIC_UPSERT_MAX_ATTEMPTS,
  );
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const initialBackoff = Math.max(1, opts.initialBackoffMs ?? DEFAULT_INITIAL_BACKOFF_MS);
  const maxBackoff = Math.max(initialBackoff, opts.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS);
  const redactedUser = redactUserId(userId);

  // Full-jitter: delay = random(0, min(cap, base * 2^conflicts))
  const backoffDelay = (conflictOrdinal: number): number => {
    const exp = Math.min(maxBackoff, initialBackoff * Math.pow(2, conflictOrdinal));
    return Math.floor(random() * exp);
  };

  let conflicts = 0;

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
      if (!insErr) {
        if (conflicts > 0) {
          console.log(
            `[atomic-upsert] recovered user=${redactedUser} date=${summaryDate} attempt=${attempt} conflicts=${conflicts} path=insert`,
          );
        }
        return { ok: true, attempts: attempt, wasUpdate: false };
      }
      const code = (insErr as { code?: string } | null)?.code;
      if (code !== "23505") {
        return { ok: false, attempts: attempt, error: insErr };
      }
      // Concurrent writer inserted first — backoff, re-read, retry as update.
      conflicts += 1;
      console.log(
        `[atomic-upsert] conflict user=${redactedUser} date=${summaryDate} attempt=${attempt} type=duplicate_insert`,
      );
      if (attempt < maxAttempts) await sleep(backoffDelay(conflicts));
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
      if (conflicts > 0) {
        console.log(
          `[atomic-upsert] recovered user=${redactedUser} date=${summaryDate} attempt=${attempt} conflicts=${conflicts} path=update`,
        );
      }
      return { ok: true, attempts: attempt, wasUpdate: true };
    }
    // CAS miss: another writer committed first. Backoff (jittered) + re-read.
    conflicts += 1;
    console.log(
      `[atomic-upsert] conflict user=${redactedUser} date=${summaryDate} attempt=${attempt} type=cas_miss`,
    );
    if (attempt < maxAttempts) await sleep(backoffDelay(conflicts));
  }

  console.error(
    `[atomic-upsert] exhausted user=${redactedUser} date=${summaryDate} attempts=${maxAttempts} conflicts=${conflicts}`,
  );
  return {
    ok: false,
    attempts: maxAttempts,
    error: new Error("atomic_merge_max_retries_exceeded"),
  };
}