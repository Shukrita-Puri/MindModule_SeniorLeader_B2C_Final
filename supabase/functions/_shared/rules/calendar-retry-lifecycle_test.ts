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

/**
 * Simulate the full server-side lifecycle for a connection that hits
 * repeated Google 403 quotaExceeded (no Retry-After) followed by a
 * clean success. We mimic what the DB row would look like after each
 * sync-calendar tick by feeding the previous row's counter back into
 * the next call.
 */
Deno.test("Google: 3 consecutive quotaExceeded → backoff ladder advances, success resets", () => {
  let row: Record<string, unknown> = {
    consecutive_delay_count: 0,
    next_retry_at: null,
    retry_after_seconds: null,
    sync_status: "synced",
    is_active: true,
  };

  // ── Tick 1: first miss ─────────────────────────────────────────
  let cls = classifyGoogleCalendarError(
    403,
    JSON.stringify({ error: { code: 403, message: "quota", errors: [{ reason: "quotaExceeded" }] } }),
    headers({}),
  );
  let upd = buildRateLimitedUpdate({
    message: cls.message ?? "quota",
    reason: cls.reason,
    retryAfterSeconds: cls.retryAfterSeconds,
    consecutivePriorCount: (row.consecutive_delay_count as number) ?? 0,
    now: new Date("2026-07-05T10:00:00.000Z"),
  });
  row = { ...row, ...upd };
  assertEquals(row.consecutive_delay_count, 1);
  assertEquals(row.retry_after_seconds, 300);
  assertEquals(row.is_active, true); // never flipped by a transient outcome

  // ── Tick 2 (after next_retry_at elapsed): still quotaExceeded ───
  upd = buildRateLimitedUpdate({
    message: cls.message ?? "quota",
    reason: cls.reason,
    retryAfterSeconds: cls.retryAfterSeconds,
    consecutivePriorCount: row.consecutive_delay_count as number,
    now: new Date("2026-07-05T10:05:00.000Z"),
  });
  row = { ...row, ...upd };
  assertEquals(row.consecutive_delay_count, 2);
  assertEquals(row.retry_after_seconds, 600);

  // ── Tick 3: still throttled ───────────────────────────────────
  upd = buildRateLimitedUpdate({
    message: cls.message ?? "quota",
    reason: cls.reason,
    retryAfterSeconds: cls.retryAfterSeconds,
    consecutivePriorCount: row.consecutive_delay_count as number,
    now: new Date("2026-07-05T10:15:00.000Z"),
  });
  row = { ...row, ...upd };
  assertEquals(row.consecutive_delay_count, 3);
  assertEquals(row.retry_after_seconds, 1200);
  assertEquals(row.sync_status, "sync_delayed");

  // ── Tick 4: clean success ─────────────────────────────────────
  const success = buildSuccessfulSyncUpdate(new Date("2026-07-05T10:35:00.000Z"));
  row = { ...row, ...success };
  assertEquals(row.sync_status, "synced");
  assertEquals(row.consecutive_delay_count, 0);
  assertEquals(row.retry_after_seconds, null);
  assertEquals(row.next_retry_at, null);
  assertEquals(row.last_error, null);
  assertEquals(row.last_sync_delayed_at, null);
});

/**
 * Microsoft equivalent: 3 consecutive 503s with NO Retry-After, then
 * one 429 that DOES provide Retry-After (must override the ladder),
 * then success.
 */
Deno.test("Microsoft: 3× 503 (no hint) → 429 with hint → success resets streak", () => {
  let row: Record<string, unknown> = {
    consecutive_delay_count: 0,
    next_retry_at: null,
    retry_after_seconds: null,
    sync_status: "synced",
    is_active: true,
  };

  const cls503 = classifyMicrosoftCalendarError(
    503,
    JSON.stringify({ error: { code: "ServiceUnavailable", message: "down" } }),
    headers({}),
  );
  assertEquals(cls503.kind, "rate_limited");
  assertEquals(cls503.retryAfterSeconds, null);

  const expectedLadder = [300, 600, 1200];
  for (let i = 0; i < 3; i++) {
    const upd = buildRateLimitedUpdate({
      message: cls503.message ?? "down",
      reason: cls503.reason,
      retryAfterSeconds: cls503.retryAfterSeconds,
      consecutivePriorCount: row.consecutive_delay_count as number,
      now: new Date(`2026-07-05T10:0${i}:00.000Z`),
    });
    row = { ...row, ...upd };
    assertEquals(row.consecutive_delay_count, i + 1);
    assertEquals(row.retry_after_seconds, expectedLadder[i]);
    assertEquals(row.is_active, true);
  }

  // Provider then returns 429 with explicit Retry-After: 90 → clamp
  // to floor is not needed (90 >= 60). It MUST override the ladder
  // even though the streak is now at 3 (which would otherwise yield
  // 2400s).
  const cls429 = classifyMicrosoftCalendarError(
    429,
    JSON.stringify({ error: { code: "TooManyRequests", message: "throttled" } }),
    headers({ "Retry-After": "90" }),
  );
  const upd429 = buildRateLimitedUpdate({
    message: cls429.message ?? "throttled",
    reason: cls429.reason,
    retryAfterSeconds: cls429.retryAfterSeconds,
    consecutivePriorCount: row.consecutive_delay_count as number,
    now: new Date("2026-07-05T10:10:00.000Z"),
  });
  row = { ...row, ...upd429 };
  assertEquals(row.retry_after_seconds, 90);            // explicit hint wins
  assertEquals(row.consecutive_delay_count, 4);         // streak still advances
  assertEquals(row.is_active, true);

  // Clean success resets everything.
  const success = buildSuccessfulSyncUpdate(new Date("2026-07-05T10:20:00.000Z"));
  row = { ...row, ...success };
  assertEquals(row.consecutive_delay_count, 0);
  assertEquals(row.retry_after_seconds, null);
  assertEquals(row.next_retry_at, null);
  assertEquals(row.sync_status, "synced");
});
