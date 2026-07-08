// Sprint 11 (Phase 9B) — HomeLocationCard static guard.
//
// HomeLocationCard writes to a location-sensitive endpoint and shows
// user-visible status about home / travel state. Rather than mount the
// component (which drags in auth + supabase-js + toast + dialog stack),
// this test locks the small set of privacy / correctness invariants by
// scanning the source text. If someone refactors the file in a way that
// breaks these invariants, the mismatch surfaces immediately.
//
// Invariants:
//   • Status label uses "Set" / "Not set" text.
//   • Geolocation is called ONLY inside captureLocation (which is behind
//     a button click), never in useEffect / on mount.
//   • Component does not render raw lat/lng coordinate values.
//   • A 409 response from set-home-location routes to the confirmation
//     dialog (setConfirmChange(true)), not to a silent overwrite.
//   • Permission-denied / geolocation errors are surfaced via toast.error
//     rather than crashing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(__dirname, "../components/profile/HomeLocationCard.tsx"),
  "utf8",
);

describe("HomeLocationCard privacy + UX guard", () => {
  it("shows Set / Not set status label", () => {
    expect(SRC).toMatch(/'Set'/);
    expect(SRC).toMatch(/'Not set'/);
  });

  it("only calls geolocation inside captureLocation (button-gated)", () => {
    const captureIdx = SRC.indexOf("const captureLocation");
    expect(captureIdx).toBeGreaterThan(-1);
    const useEffectIdx = SRC.indexOf("useEffect(");
    const geoIdx = SRC.indexOf("navigator.geolocation");
    expect(geoIdx).toBeGreaterThan(captureIdx);
    // Geolocation must NOT be referenced inside the useEffect block.
    const useEffectBlock = SRC.slice(useEffectIdx, SRC.indexOf("}, [user?.id])"));
    expect(useEffectBlock.includes("navigator.geolocation")).toBe(false);
  });

  it("never renders raw coordinate values", () => {
    // Rendered JSX must not interpolate raw coordinates. We look for
    // `.home_lat}` / `.home_lng}` (JSX expression close) and any
    // `position.coords.*}` interpolation, which would only appear if a
    // coord value were being rendered.
    expect(SRC).not.toMatch(/\.home_lat\s*\}/);
    expect(SRC).not.toMatch(/\.home_lng\s*\}/);
    expect(SRC).not.toMatch(/position\.coords\.latitude\s*\}/);
    expect(SRC).not.toMatch(/position\.coords\.longitude\s*\}/);
  });

  it("routes 409 to confirmation dialog", () => {
    expect(SRC).toMatch(/res\.status === 409/);
    // The 409 branch must set the confirm dialog, not silently retry.
    const idx = SRC.indexOf("res.status === 409");
    const block = SRC.slice(idx, idx + 200);
    expect(block).toMatch(/setConfirmChange\(true\)/);
  });

  it("handles geolocation errors via toast.error", () => {
    expect(SRC).toMatch(/toast\.error/);
    // Truncates OS error messages that may contain coords.
    expect(SRC).toMatch(/msg\.length > 80/);
  });

  it("uses meta.last_sync_at (not updated_at) for freshness display", () => {
    expect(SRC).toMatch(/meta.*last_sync_at/);
    // Guard: never display travel_state.updated_at as a freshness signal.
    expect(SRC).not.toMatch(/travel[^)]*\.updated_at/);
  });
});
