/**
 * Shared quota-scope layer for calendar syncs.
 *
 * Rationale
 * ---------
 * Per-connection backoff + jitter (see calendar-connection-state.ts)
 * spreads *individual* rows, but many Google/Microsoft throttles are
 * project- or tenant-scoped: if one row is throttled, every other row
 * that shares the same OAuth client / project / tenant is very likely
 * throttled too. Retrying them independently just re-triggers the same
 * upstream limit.
 *
 * This module owns two pieces of pure logic:
 *   1. Deriving a stable `scope_key` for a (provider, oauth-client) pair.
 *   2. Deciding whether a persisted `calendar_quota_cooldowns` row is
 *      still active for a given `now`.
 *
 * The DB row is written by `sync-calendar` after a transient outcome
 * and read by `sync-calendar-scheduled` before dispatching. Both call
 * sites use the helpers below so the scope semantics cannot drift.
 */

export interface QuotaScopeInput {
  provider: string;
  /**
   * Best available identifier for the upstream quota bucket. We use
   * the OAuth client id because every calendar sync in this project
   * shares the same client id across users, so it is the coarsest
   * accurate proxy for the Google project / Microsoft app quota
   * bucket. If the env var is missing we fall back to
   * `"unknown-client"` — documented and covered by tests so operators
   * can spot mis-configured scopes in the DB.
   */
  clientId: string | null | undefined;
}

export const UNKNOWN_CLIENT_FALLBACK = 'unknown-client';

export function computeQuotaScopeKey(input: QuotaScopeInput): string {
  const provider = String(input.provider ?? '').trim().toLowerCase() || 'unknown';
  const raw = (input.clientId ?? '').trim();
  const clientId = raw.length > 0 ? raw : UNKNOWN_CLIENT_FALLBACK;
  return `${provider}:${clientId}`;
}

export interface QuotaCooldownRow {
  scope_key?: string | null;
  cooldown_until?: string | null;
  retry_after_seconds?: number | null;
  last_reason?: string | null;
  hit_count?: number | null;
  updated_at?: string | null;
}

/**
 * `true` when the scope is NOT cooling down (i.e. safe to try). A
 * missing row, missing timestamp, or unparseable timestamp all fail
 * open so a corrupted debug row cannot lock out sync forever.
 */
export function isScopeEligibleForSync(
  row: QuotaCooldownRow | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!row?.cooldown_until) return true;
  const t = new Date(row.cooldown_until).getTime();
  if (Number.isNaN(t)) return true;
  return t <= now.getTime();
}

export interface QuotaCooldownUpsertInput {
  scopeKey: string;
  provider: string;
  /**
   * The final retry delay (post-jitter, post-clamp) already computed
   * for the per-connection row. Reusing it — instead of a second
   * policy — guarantees the shared cooldown never lasts longer than
   * the per-row cooldown it is coordinating, so it cannot silently
   * extend a well-behaved provider window.
   */
  finalRetryAfterSeconds: number;
  reason: string | null;
  /**
   * Existing `hit_count` (if any). The upsert increments it by one.
   * Purely informational — used for debugging thundering-herd events.
   */
  priorHitCount?: number | null;
  /**
   * Existing `cooldown_until` (if any). If the incoming event would
   * expire BEFORE the currently-persisted cooldown, we keep the
   * longer window — see MERGE POLICY below.
   */
  priorCooldownUntil?: string | null;
  now?: Date;
}

export interface QuotaCooldownUpsertRow {
  scope_key: string;
  provider: string;
  cooldown_until: string;
  retry_after_seconds: number;
  last_reason: string | null;
  hit_count: number;
  updated_at: string;
}

export function buildQuotaCooldownUpsert(
  input: QuotaCooldownUpsertInput,
): QuotaCooldownUpsertRow {
  const now = input.now ?? new Date();
  const seconds = Math.max(1, Math.floor(input.finalRetryAfterSeconds));
  const candidateMs = now.getTime() + seconds * 1000;
  // ------------------------------------------------------------------
  // MERGE POLICY (documented):
  //
  // When a new transient event arrives for a scope that is already
  // cooling down, we keep the LATER of the existing and new
  // `cooldown_until`. Rationale:
  //
  //   - Never shorten an active cooldown. If provider A already told
  //     us "wait 30 min", a smaller Retry-After from provider B on a
  //     different endpoint must not shrink the window.
  //   - Extending is safe: we're only over-cautious for a few extra
  //     minutes on the shared bucket.
  //   - `retry_after_seconds` on the row reflects the delay that
  //     PRODUCED the winning `cooldown_until` — so the two fields stay
  //     consistent and don't disagree about how long the window is.
  //   - `hit_count` always increments; it counts transient events
  //     against the scope, not extensions of the cooldown itself.
  // ------------------------------------------------------------------
  let winningMs = candidateMs;
  let winningSeconds = seconds;
  if (input.priorCooldownUntil) {
    const priorMs = new Date(input.priorCooldownUntil).getTime();
    if (!Number.isNaN(priorMs) && priorMs > candidateMs) {
      winningMs = priorMs;
      winningSeconds = Math.max(1, Math.ceil((priorMs - now.getTime()) / 1000));
    }
  }
  const cooldownUntil = new Date(winningMs).toISOString();
  const prior = Math.max(0, Math.floor(input.priorHitCount ?? 0));
  return {
    scope_key: input.scopeKey,
    provider: input.provider,
    cooldown_until: cooldownUntil,
    retry_after_seconds: winningSeconds,
    last_reason: input.reason,
    hit_count: prior + 1,
    updated_at: now.toISOString(),
  };
}

/**
 * SUCCESS POLICY (documented):
 *
 * A single connection succeeding does NOT clear the shared cooldown.
 * The cooldown was written because the *upstream quota bucket* was
 * throttling — one row squeaking through (cache hit, different
 * endpoint, off-peak second) is not evidence the bucket has recovered.
 * Instead we let the cooldown expire naturally via `cooldown_until`.
 *
 * This intentionally biases toward being over-cautious for a few
 * extra minutes rather than re-triggering a herd. If we later collect
 * data showing the cooldown is systematically too long, add a
 * dedicated `clearQuotaCooldownIfHealthy` helper here — do NOT inline
 * that logic in `sync-calendar`.
 */
export const QUOTA_COOLDOWN_SUCCESS_POLICY =
  'per_connection_success_does_not_clear_shared_scope';