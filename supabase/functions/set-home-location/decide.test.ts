import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideHomeLocation } from "./decide.ts";

Deno.test("clear=true → clear action regardless of coords", () => {
  const d = decideHomeLocation({ lat: null, lng: null, clear: true, existing: null });
  assertEquals(d, { action: "clear" });
});

Deno.test("missing coords → invalid_coords", () => {
  const d = decideHomeLocation({ lat: null, lng: null, existing: null });
  assertEquals(d, { action: "invalid", error: "invalid_coords" });
});

Deno.test("out-of-range lat → invalid_coords", () => {
  const d = decideHomeLocation({ lat: 95, lng: 0, existing: null });
  assertEquals(d, { action: "invalid", error: "invalid_coords" });
});

Deno.test("first-time set → write with changed=false", () => {
  const d = decideHomeLocation({ lat: 51.5, lng: -0.1, existing: null });
  assertEquals(d, { action: "write", lat: 51.5, lng: -0.1, timezone: null, changed: false });
});

Deno.test("existing set + no force → REFUSED (does not overwrite silently)", () => {
  const d = decideHomeLocation({
    lat: 40.7,
    lng: -74.0,
    existing: { home_lat: 51.5, home_lng: -0.1, home_location_set_at: "2026-06-01T00:00:00Z" },
  });
  assertEquals(d, { action: "refused", error: "already_set" });
});

Deno.test("existing set + force=true → write with changed=true", () => {
  const d = decideHomeLocation({
    lat: 40.7,
    lng: -74.0,
    force: true,
    timezone: "America/New_York",
    existing: { home_lat: 51.5, home_lng: -0.1, home_location_set_at: "2026-06-01T00:00:00Z" },
  });
  assertEquals(d, { action: "write", lat: 40.7, lng: -74.0, timezone: "America/New_York", changed: true });
});

Deno.test("invalid timezone string is dropped (never written)", () => {
  const d = decideHomeLocation({ lat: 51.5, lng: -0.1, timezone: "not-a-tz", existing: null });
  assertEquals(d, { action: "write", lat: 51.5, lng: -0.1, timezone: null, changed: false });
});

Deno.test("only home_lat present (no set_at) still counts as already set", () => {
  const d = decideHomeLocation({
    lat: 40.7,
    lng: -74.0,
    existing: { home_lat: 51.5, home_lng: -0.1, home_location_set_at: null },
  });
  assertEquals(d, { action: "refused", error: "already_set" });
});