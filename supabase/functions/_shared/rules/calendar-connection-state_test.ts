import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRateLimitedUpdate,
  buildSuccessfulSyncUpdate,
  buildAuthFailureUpdate,
  buildGenericErrorUpdate,
  resolveRetryDelaySeconds,
  computeNextRetryAt,
  isConnectionEligibleForSync,
  RETRY_HINT_DEFAULT_SECONDS,
  RETRY_HINT_MIN_SECONDS,
  RETRY_HINT_MAX_SECONDS,
} from "./calendar-connection-state.ts";

Deno.test("successful sync clears every transient delay/error field", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");
  const upd = buildSuccessfulSyncUpdate(now);
  assertEquals(upd, {
    last_sync: "2026-07-05T12:00:00.000Z",
    sync_status: "synced",
    last_error: null,
    last_error_reason: null,
    last_error_at: null,
    last_sync_delayed_at: null,
    retry_after_seconds: null,
    next_retry_at: null,
  });
});

Deno.test("rate-limited → successful sync sequence leaves no stale delayed markers", () => {
  // Simulate what sync-calendar writes on a rate-limit hit ...
  const t1 = new Date("2026-07-05T10:00:00.000Z");
  const delayed = buildRateLimitedUpdate({
    message: "Google rate limit: quotaExceeded",
    reason: "quotaExceeded",
    retryAfterSeconds: 120,
    now: t1,
  });
  assertEquals(delayed.last_sync_delayed_at, "2026-07-05T10:00:00.000Z");
  assertEquals(delayed.sync_status, "sync_delayed");
  assertEquals(delayed.retry_after_seconds, 120);
  assertEquals(delayed.next_retry_at, "2026-07-05T10:02:00.000Z");

  // ... then the next sync succeeds. Merge into a mock DB row.
  const t2 = new Date("2026-07-05T10:15:00.000Z");
  const success = buildSuccessfulSyncUpdate(t2);

  const row: Record<string, unknown> = {
    sync_status: delayed.sync_status,
    last_error: delayed.last_error,
    last_error_reason: delayed.last_error_reason,
    last_error_at: delayed.last_error_at,
    last_sync_delayed_at: delayed.last_sync_delayed_at,
    retry_after_seconds: delayed.retry_after_seconds,
    next_retry_at: delayed.next_retry_at,
    last_sync: null,
  };
  Object.assign(row, success);

  assertEquals(row.sync_status, "synced");
  assertEquals(row.last_error, null);
  assertEquals(row.last_error_reason, null);
  assertEquals(row.last_error_at, null);
  assertEquals(row.last_sync_delayed_at, null); // ← the bug guard
  assertEquals(row.retry_after_seconds, null);
  assertEquals(row.next_retry_at, null);
  assertEquals(row.last_sync, "2026-07-05T10:15:00.000Z");
});

Deno.test("auth failure update flips is_active off and does not touch delayed marker", () => {
  const upd = buildAuthFailureUpdate({
    message: "unauthorized",
    reason: "invalidCredentials",
    now: new Date("2026-07-05T09:00:00.000Z"),
  });
  assertEquals(upd.is_active, false);
  assertEquals(upd.sync_status, "error");
  // Note: we deliberately do NOT include last_sync_delayed_at in auth
  // failure writes — clearing it is the responsibility of the next
  // successful sync via buildSuccessfulSyncUpdate.
  assertEquals(
    Object.prototype.hasOwnProperty.call(upd, "last_sync_delayed_at"),
    false,
  );
});

Deno.test("generic error update never disconnects the account", () => {
  const upd = buildGenericErrorUpdate({
    message: "Google API error 500",
    reason: "backendError",
    now: new Date("2026-07-05T09:00:00.000Z"),
  });
  assertEquals(upd.sync_status, "error");
  assertEquals(
    Object.prototype.hasOwnProperty.call(upd, "is_active"),
    false,
  );
});

Deno.test("resolveRetryDelaySeconds: honors provider hint when within bounds", () => {
  assertEquals(resolveRetryDelaySeconds(120), 120);
  assertEquals(resolveRetryDelaySeconds(60), 60);
  assertEquals(resolveRetryDelaySeconds(3599), 3599);
});

Deno.test("resolveRetryDelaySeconds: clamps below minimum", () => {
  assertEquals(resolveRetryDelaySeconds(5), RETRY_HINT_MIN_SECONDS);
  assertEquals(resolveRetryDelaySeconds(0), RETRY_HINT_DEFAULT_SECONDS);
  assertEquals(resolveRetryDelaySeconds(-42), RETRY_HINT_DEFAULT_SECONDS);
});

Deno.test("resolveRetryDelaySeconds: clamps above maximum", () => {
  assertEquals(resolveRetryDelaySeconds(999_999), RETRY_HINT_MAX_SECONDS);
  assertEquals(resolveRetryDelaySeconds(86_400), RETRY_HINT_MAX_SECONDS);
});

Deno.test("resolveRetryDelaySeconds: defaults when hint missing/invalid", () => {
  assertEquals(resolveRetryDelaySeconds(null), RETRY_HINT_DEFAULT_SECONDS);
  assertEquals(resolveRetryDelaySeconds(undefined), RETRY_HINT_DEFAULT_SECONDS);
  assertEquals(resolveRetryDelaySeconds(Number.NaN), RETRY_HINT_DEFAULT_SECONDS);
});

Deno.test("computeNextRetryAt returns UTC ISO", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  assertEquals(computeNextRetryAt(now, 300), "2026-07-05T10:05:00.000Z");
});

Deno.test("isConnectionEligibleForSync: no hint → eligible", () => {
  assertEquals(isConnectionEligibleForSync({ next_retry_at: null }), true);
  assertEquals(isConnectionEligibleForSync({}), true);
});

Deno.test("isConnectionEligibleForSync: within retry window → skipped", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const future = new Date("2026-07-05T10:05:00.000Z").toISOString();
  assertEquals(isConnectionEligibleForSync({ next_retry_at: future }, now), false);
});

Deno.test("isConnectionEligibleForSync: past window → eligible again", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const past = new Date("2026-07-05T09:55:00.000Z").toISOString();
  assertEquals(isConnectionEligibleForSync({ next_retry_at: past }, now), true);
});

Deno.test("isConnectionEligibleForSync: unparseable value fails open", () => {
  assertEquals(
    isConnectionEligibleForSync({ next_retry_at: "not-a-date" }),
    true,
  );
});
