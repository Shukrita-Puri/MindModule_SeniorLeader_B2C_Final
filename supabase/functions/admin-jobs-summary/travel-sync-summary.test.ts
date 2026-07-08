// Sprint 12 tests — honest travel-state-sync admin summary.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeTravelSync } from "./travel-sync-summary.ts";

const NOW = new Date("2026-07-08T12:00:00Z");

Deno.test("disabled config → disabled status, no fake last-run", () => {
  const s = summarizeTravelSync({
    enabled: false,
    dispatcherIntervalMinutes: 60,
    lastObservedSyncAt: "2026-07-08T11:00:00Z",
    now: NOW,
  });
  assertEquals(s.currentStatus, "disabled");
  assertEquals(s.runLogAvailable, false);
  assertEquals(s.statusReason, "disabled_in_config");
});

Deno.test("enabled but no observed sync → unknown (never 'idle')", () => {
  const s = summarizeTravelSync({
    enabled: true,
    dispatcherIntervalMinutes: 60,
    lastObservedSyncAt: null,
    now: NOW,
  });
  assertEquals(s.currentStatus, "unknown");
  assertEquals(s.lastObservedSyncAt, null);
  assertEquals(s.statusReason, "no_observed_sync");
  assertEquals(s.runLogAvailable, false);
});

Deno.test("enabled + observed within 2× interval → observed_recently", () => {
  const s = summarizeTravelSync({
    enabled: true,
    dispatcherIntervalMinutes: 60,
    lastObservedSyncAt: "2026-07-08T11:00:00Z", // 60m ago, within 2×60=120m
    now: NOW,
  });
  assertEquals(s.currentStatus, "observed_recently");
  assertEquals(s.statusReason, "observed_within_interval");
});

Deno.test("enabled + observed older than 2× interval → stale_or_unknown", () => {
  const s = summarizeTravelSync({
    enabled: true,
    dispatcherIntervalMinutes: 60,
    lastObservedSyncAt: "2026-07-08T08:00:00Z", // 4h ago
    now: NOW,
  });
  assertEquals(s.currentStatus, "stale_or_unknown");
  assertEquals(s.statusReason, "observed_but_stale");
});

Deno.test("garbled last-observed timestamp → unknown, no crash", () => {
  const s = summarizeTravelSync({
    enabled: true,
    dispatcherIntervalMinutes: 60,
    lastObservedSyncAt: "not-a-date",
    now: NOW,
  });
  assertEquals(s.currentStatus, "unknown");
});

Deno.test("null dispatcher interval falls back to safe minimum, still honest", () => {
  const s = summarizeTravelSync({
    enabled: true,
    dispatcherIntervalMinutes: null,
    lastObservedSyncAt: "2026-07-08T11:00:00Z",
    now: NOW,
  });
  // 60m ago, default 60→2× = 120m, still fresh
  assertEquals(s.currentStatus, "observed_recently");
});

Deno.test("summary NEVER reports runLogAvailable=true", () => {
  const cases = [null, "2026-07-08T11:00:00Z", "2020-01-01T00:00:00Z"];
  for (const c of cases) {
    const s = summarizeTravelSync({
      enabled: true,
      dispatcherIntervalMinutes: 60,
      lastObservedSyncAt: c,
      now: NOW,
    });
    assertEquals(s.runLogAvailable, false);
    assertEquals(s.observedProxy, true);
  }
});
