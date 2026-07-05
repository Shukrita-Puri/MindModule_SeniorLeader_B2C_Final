import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRateLimitedUpdate,
  buildSuccessfulSyncUpdate,
  buildAuthFailureUpdate,
  buildGenericErrorUpdate,
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
  });
});

Deno.test("rate-limited → successful sync sequence leaves no stale delayed markers", () => {
  // Simulate what sync-calendar writes on a rate-limit hit ...
  const t1 = new Date("2026-07-05T10:00:00.000Z");
  const delayed = buildRateLimitedUpdate({
    message: "Google rate limit: quotaExceeded",
    reason: "quotaExceeded",
    now: t1,
  });
  assertEquals(delayed.last_sync_delayed_at, "2026-07-05T10:00:00.000Z");
  assertEquals(delayed.sync_status, "sync_delayed");

  // ... then the next sync succeeds. Merge into a mock DB row.
  const t2 = new Date("2026-07-05T10:15:00.000Z");
  const success = buildSuccessfulSyncUpdate(t2);

  const row: Record<string, unknown> = {
    sync_status: delayed.sync_status,
    last_error: delayed.last_error,
    last_error_reason: delayed.last_error_reason,
    last_error_at: delayed.last_error_at,
    last_sync_delayed_at: delayed.last_sync_delayed_at,
    last_sync: null,
  };
  Object.assign(row, success);

  assertEquals(row.sync_status, "synced");
  assertEquals(row.last_error, null);
  assertEquals(row.last_error_reason, null);
  assertEquals(row.last_error_at, null);
  assertEquals(row.last_sync_delayed_at, null); // ← the bug guard
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
