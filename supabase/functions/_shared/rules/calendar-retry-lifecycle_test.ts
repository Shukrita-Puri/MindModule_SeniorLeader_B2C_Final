/**
 * Cross-cutting regression tests that prove the retry-hint lifecycle
 * plumbed by `buildRateLimitedUpdate` + `isConnectionEligibleForSync`
 * behaves correctly end-to-end with real classifier output for both
 * Google and Microsoft calendar errors, and that a successful sync
 * fully clears every field the delayed write set.
 */
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRateLimitedUpdate,
  buildSuccessfulSyncUpdate,
  isConnectionEligibleForSync,
  RETRY_HINT_DEFAULT_SECONDS,
  RETRY_HINT_MAX_SECONDS,
} from "./calendar-connection-state.ts";
import { classifyGoogleCalendarError } from "./google-calendar-errors.ts";
import { classifyMicrosoftCalendarError } from "./microsoft-calendar-errors.ts";

function headers(map: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(map)) h.set(k, v);
  return h;
}

Deno.test("Google 429 with Retry-After: 120 → persisted delay honors the hint", () => {
  const cls = classifyGoogleCalendarError(
    429,
    JSON.stringify({ error: { code: 429, message: "rate limited", errors: [{ reason: "rateLimitExceeded" }] } }),
    headers({ "Retry-After": "120" }),
  );
  assertEquals(cls.kind, "rate_limited");
  assertEquals(cls.retryAfterSeconds, 120);

  const now = new Date("2026-07-05T10:00:00.000Z");
  const upd = buildRateLimitedUpdate({
    message: cls.message ?? "rate limited",
    reason: cls.reason,
    retryAfterSeconds: cls.retryAfterSeconds,
    now,
  });
  assertEquals(upd.sync_status, "sync_delayed");
  assertEquals(upd.retry_after_seconds, 120);
  assertEquals(upd.next_retry_at, "2026-07-05T10:02:00.000Z");

  // Scheduler should skip the row until the window elapses.
  assertEquals(isConnectionEligibleForSync({ next_retry_at: upd.next_retry_at }, now), false);
  const later = new Date("2026-07-05T10:02:00.000Z");
  assertEquals(isConnectionEligibleForSync({ next_retry_at: upd.next_retry_at }, later), true);
});

Deno.test("Google 403 quotaExceeded with no Retry-After → bounded default", () => {
  const cls = classifyGoogleCalendarError(
    403,
    JSON.stringify({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }),
    headers({}),
  );
  assertEquals(cls.kind, "rate_limited");
  assertEquals(cls.retryAfterSeconds, null);
  const upd = buildRateLimitedUpdate({
    message: cls.message ?? "quota",
    reason: cls.reason,
    retryAfterSeconds: cls.retryAfterSeconds,
    now: new Date("2026-07-05T10:00:00.000Z"),
  });
  assertEquals(upd.retry_after_seconds, RETRY_HINT_DEFAULT_SECONDS);
  assert(upd.next_retry_at > "2026-07-05T10:00:00.000Z");
});

Deno.test("Microsoft 429 Retry-After: 45 → persisted delay honors the hint", () => {
  const cls = classifyMicrosoftCalendarError(
    429,
    JSON.stringify({ error: { code: "TooManyRequests", message: "throttled" } }),
    headers({ "Retry-After": "45" }),
  );
  assertEquals(cls.kind, "rate_limited");
  assertEquals(cls.retryAfterSeconds, 45);

  const now = new Date("2026-07-05T10:00:00.000Z");
  const upd = buildRateLimitedUpdate({
    message: cls.message ?? "throttled",
    reason: cls.reason,
    retryAfterSeconds: cls.retryAfterSeconds,
    now,
  });
  // 45 is below the 60s floor.
  assertEquals(upd.retry_after_seconds, 60);
  assertEquals(upd.next_retry_at, "2026-07-05T10:01:00.000Z");
});

Deno.test("Microsoft 503 with absurd Retry-After: 999999 → clamped to max", () => {
  const cls = classifyMicrosoftCalendarError(
    503,
    JSON.stringify({ error: { code: "ServiceUnavailable", message: "down" } }),
    headers({ "Retry-After": "999999" }),
  );
  assertEquals(cls.kind, "rate_limited");
  const upd = buildRateLimitedUpdate({
    message: cls.message ?? "down",
    reason: cls.reason,
    retryAfterSeconds: cls.retryAfterSeconds,
  });
  assertEquals(upd.retry_after_seconds, RETRY_HINT_MAX_SECONDS);
});

Deno.test("successful sync after a delayed write clears ALL retry timing fields", () => {
  const t1 = new Date("2026-07-05T10:00:00.000Z");
  const delayed = buildRateLimitedUpdate({
    message: "quota",
    reason: "quotaExceeded",
    retryAfterSeconds: 300,
    now: t1,
  });

  const row: Record<string, unknown> = { ...delayed, last_sync: null };
  const success = buildSuccessfulSyncUpdate(new Date("2026-07-05T10:15:00.000Z"));
  Object.assign(row, success);

  assertEquals(row.sync_status, "synced");
  assertEquals(row.last_error, null);
  assertEquals(row.last_error_reason, null);
  assertEquals(row.last_error_at, null);
  assertEquals(row.last_sync_delayed_at, null);
  assertEquals(row.retry_after_seconds, null); // ← retry hint cleared
  assertEquals(row.next_retry_at, null);       // ← window cleared
});

Deno.test("scheduler eligibility mirrors the persisted next_retry_at exactly", () => {
  // Simulate three rows the scheduler enumerates.
  const now = new Date("2026-07-05T10:00:00.000Z");
  const rows = [
    { user_id: "a", provider: "google", next_retry_at: null }, // never delayed
    { user_id: "b", provider: "google", next_retry_at: "2026-07-05T10:05:00.000Z" }, // in window
    { user_id: "c", provider: "microsoft", next_retry_at: "2026-07-05T09:55:00.000Z" }, // elapsed
  ];
  const eligible = rows.filter((r) => isConnectionEligibleForSync(r, now)).map((r) => r.user_id);
  assertEquals(eligible, ["a", "c"]);
});
