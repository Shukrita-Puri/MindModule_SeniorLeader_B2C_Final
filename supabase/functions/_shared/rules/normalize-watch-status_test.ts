import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeWatchStatus } from "./normalize-watch-status.ts";

Deno.test("normalizeWatchStatus: passes real errors through unchanged", () => {
  const out = normalizeWatchStatus({
    watch_sync_status: "sync_delayed",
    watch_last_error: "healthkit_read_failed",
    watch_last_error_at: "2026-07-10T00:00:00Z",
  });
  assertEquals(out.syncStatus, "sync_delayed");
  assertEquals(out.lastError, "healthkit_read_failed");
  assertEquals(out.lastErrorAt, "2026-07-10T00:00:00Z");
  assertEquals(out.wasLegacyMarker, false);
});

Deno.test("normalizeWatchStatus: masks legacy native_healthkit_fallback_triggered marker", () => {
  const out = normalizeWatchStatus({
    watch_sync_status: "sync_delayed",
    watch_last_error: "native_healthkit_fallback_triggered",
    watch_last_error_at: "2026-07-10T00:00:00Z",
  });
  assertEquals(out.lastError, null);
  assertEquals(out.lastErrorAt, null);
  // Critical: also coerces the co-persisted sync_delayed → waiting_for_data
  // so the UI stops rendering a stale "delayed" state with no reason.
  assertEquals(out.syncStatus, "waiting_for_data");
  assertEquals(out.wasLegacyMarker, true);
});

Deno.test("normalizeWatchStatus: legacy marker with synced status leaves sync alone", () => {
  const out = normalizeWatchStatus({
    watch_sync_status: "synced",
    watch_last_error: "native_healthkit_fallback_triggered",
    watch_last_error_at: "2026-07-10T00:00:00Z",
  });
  assertEquals(out.lastError, null);
  assertEquals(out.lastErrorAt, null);
  assertEquals(out.syncStatus, "synced");
});

Deno.test("normalizeWatchStatus: null-safe on missing rows", () => {
  const out = normalizeWatchStatus(null, "unknown");
  assertEquals(out.syncStatus, "unknown");
  assertEquals(out.lastError, null);
  assertEquals(out.lastErrorAt, null);
  assertEquals(out.wasLegacyMarker, false);
});

Deno.test("normalizeWatchStatus: preserves non-legacy sync_delayed + no error", () => {
  const out = normalizeWatchStatus({
    watch_sync_status: "sync_delayed",
    watch_last_error: null,
  });
  assertEquals(out.syncStatus, "sync_delayed");
  assertEquals(out.lastError, null);
});