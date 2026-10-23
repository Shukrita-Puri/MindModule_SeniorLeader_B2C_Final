// [KIND: test] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Unit tests for Layer 0 Wearable domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveSleepEfficiency,
  ouraSleepEfficiencyFromSession,
  mergeCanonicalWearableRow,
} from "./index.ts";

Deno.test("Wearable Domain: Sleep efficiency derivation", () => {
  // Test derivation from time_in_bed (minutes) + total_sleep_minutes
  const eff = deriveSleepEfficiency({ time_in_bed: 480 }, 408);
  assertEquals(eff, 85); // 408 / 480 * 100 = 85%

  // Test direct efficiency field
  const directEff = deriveSleepEfficiency({ efficiency: 92.4 }, null);
  assertEquals(directEff, 92);

  // Test Oura session duration (seconds)
  const ouraEff = ouraSleepEfficiencyFromSession({
    total_sleep_duration: 25200, // 7h
    time_in_bed: 28800,          // 8h
  });
  assertEquals(ouraEff, 88); // 25200 / 28800 * 100 = 87.5% -> 88%
});

Deno.test("Wearable Domain: Merge canonical row direct Oura vs Apple Health", () => {
  const existing = {
    source_provider: "apple_healthkit",
    source: "apple-healthkit",
    total_sleep_minutes: 400,
    sleep_score: 70,
  };
  const incoming = {
    source_provider: "oura",
    source: "oura",
    total_sleep_minutes: 420,
    sleep_score: 88,
  };
  const ctxOuraConnected = {
    ouraDirectConnected: true,
    ouraWritesToAppleHealth: false,
    appleWatchPresentToday: false,
  };

  const merged = mergeCanonicalWearableRow(existing, incoming, { context: ctxOuraConnected });
  assertEquals(merged.total_sleep_minutes, 420);
  assertEquals(merged.sleep_score, 88);
});
