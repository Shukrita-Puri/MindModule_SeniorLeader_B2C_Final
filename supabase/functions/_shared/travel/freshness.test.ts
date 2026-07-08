import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideTravelFreshness } from "./freshness.ts";

const NOW = new Date("2026-07-08T10:00:00Z");

Deno.test("freshness — no row → missing, ignored", () => {
  assertEquals(decideTravelFreshness(null), { used: false, reason: "missing" });
});

Deno.test("freshness — row exists but no signal timestamps → no_signal (skip-only meta)", () => {
  const r = decideTravelFreshness({
    state: "not_travelling",
    lastStateChangeAt: null,
    lastLocationAt: null,
    now: NOW,
  });
  assertEquals(r, { used: false, reason: "no_signal" });
});

Deno.test("freshness — recent state change (2 days ago) → fresh", () => {
  const r = decideTravelFreshness({
    state: "arrived",
    lastStateChangeAt: new Date(NOW.getTime() - 2 * 24 * 3600 * 1000).toISOString(),
    lastLocationAt: null,
    now: NOW,
  });
  assertEquals(r, { used: true, reason: "fresh" });
});

Deno.test("freshness — recent location fix (12h ago) → fresh", () => {
  const r = decideTravelFreshness({
    state: "not_travelling",
    lastStateChangeAt: null,
    lastLocationAt: new Date(NOW.getTime() - 12 * 3600 * 1000).toISOString(),
    now: NOW,
  });
  assertEquals(r, { used: true, reason: "fresh" });
});

Deno.test("freshness — state change 30 days ago + no location → stale", () => {
  const r = decideTravelFreshness({
    state: "arrived",
    lastStateChangeAt: new Date(NOW.getTime() - 30 * 24 * 3600 * 1000).toISOString(),
    lastLocationAt: null,
    now: NOW,
  });
  assertEquals(r, { used: false, reason: "stale" });
});

Deno.test("freshness — location fix 48h ago (>24h) + no recent state change → stale", () => {
  const r = decideTravelFreshness({
    state: "not_travelling",
    lastStateChangeAt: null,
    lastLocationAt: new Date(NOW.getTime() - 48 * 3600 * 1000).toISOString(),
    now: NOW,
  });
  assertEquals(r, { used: false, reason: "stale" });
});

Deno.test("freshness — skip-updated updated_at is IRRELEVANT (only state/location matter)", () => {
  // Simulate: sync job touched meta only 5 minutes ago, but real
  // state and location signals are ancient. Must NOT count as fresh.
  const r = decideTravelFreshness({
    state: "arrived",
    lastStateChangeAt: new Date(NOW.getTime() - 60 * 24 * 3600 * 1000).toISOString(),
    lastLocationAt: new Date(NOW.getTime() - 60 * 24 * 3600 * 1000).toISOString(),
    now: NOW,
  });
  assertEquals(r, { used: false, reason: "stale" });
});