import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  mergeCanonicalWearableRow,
  loadWearableMergeContext,
  DEFAULT_RECENCY_GUARD_HOURS,
  type WearableMergeContext,
  type ReconciliationRecord,
} from "./canonical.ts";

const ctxOuraConnected: WearableMergeContext = {
  ouraDirectConnected: true,
  ouraWritesToAppleHealth: false,
  appleWatchPresentToday: false,
};
const ctxNoOura: WearableMergeContext = {
  ouraDirectConnected: false,
  ouraWritesToAppleHealth: true,
  appleWatchPresentToday: false,
};
const ctxAppleWatch: WearableMergeContext = {
  ouraDirectConnected: true,
  ouraWritesToAppleHealth: false,
  appleWatchPresentToday: true,
};

Deno.test("direct-Oura sleep preferred when Oura is connected", () => {
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
  const merged = mergeCanonicalWearableRow(existing, incoming, { context: ctxOuraConnected });
  assertEquals(merged.total_sleep_minutes, 420);
  assertEquals(merged.sleep_score, 88);
});

Deno.test("Oura-via-Apple-Health deprioritised when direct Oura NOT connected → Apple Health wins sleep", () => {
  // Existing = Apple Health row (which may contain mirrored Oura data).
  // Incoming = row explicitly tagged 'oura' but user has no direct Oura conn.
  // Expectation: Apple Health (existing) wins.
  const existing = {
    source_provider: "apple_healthkit",
    source: "apple-healthkit",
    total_sleep_minutes: 415,
  };
  const incoming = {
    source_provider: "oura",
    source: "oura",
    total_sleep_minutes: 430,
  };
  const merged = mergeCanonicalWearableRow(existing, incoming, { context: ctxNoOura });
  assertEquals(merged.total_sleep_minutes, 415);
});

Deno.test("Apple Watch hard-preferred for heart_rate + hr_samples", () => {
  const existing = {
    source_provider: "apple_healthkit",
    source_apps: { hr_samples: ["Apple Watch"], heart_rate: ["Apple Watch"] },
    heart_rate: 62,
    hr_samples: [{ t: "10:00", bpm: 60 }],
  };
  const incoming = {
    source_provider: "oura",
    source: "oura",
    heart_rate: 70,
    hr_samples: [{ t: "10:00", bpm: 72 }],
  };
  const merged = mergeCanonicalWearableRow(existing, incoming, { context: ctxAppleWatch });
  assertEquals(merged.heart_rate, 62);
  assertEquals(Array.isArray(merged.hr_samples) && (merged.hr_samples as unknown[]).length, 1);
});

Deno.test("recency guard BLOCKS cross-source HRV overwrite beyond 12h (freshness-only edge)", () => {
  const recon: ReconciliationRecord[] = [];
  // Equal completeness (both have hrv + resting_heart_rate). Incoming Apple
  // would win purely by being 20h newer — guard blocks it.
  const existing = {
    source_provider: "oura",
    source: "oura",
    hrv: 62,
    resting_heart_rate: 55,
    updated_at: "2026-07-04T08:00:00.000Z",
  };
  const incoming = {
    source_provider: "apple_healthkit",
    source: "apple-healthkit",
    hrv: 40,
    resting_heart_rate: 70,
    updated_at: "2026-07-05T04:00:00.000Z", // +20h
  };
  const merged = mergeCanonicalWearableRow(existing, incoming, {
    context: ctxOuraConnected,
    onReconciliation: (r) => recon.push(r),
  });
  assertEquals(merged.hrv, 62, "existing HRV preserved");
  assertEquals(merged.resting_heart_rate, 55, "existing RHR preserved");
  assertEquals(recon.length >= 1, true, "reconciliation record emitted");
  assertEquals(recon[0].reason, "recency_guard_blocked_overwrite");
  assertEquals(recon[0].details.guard_hours, DEFAULT_RECENCY_GUARD_HOURS);
});

Deno.test("recency guard does NOT trigger within 12h threshold", () => {
  const recon: ReconciliationRecord[] = [];
  const existing = {
    source_provider: "oura",
    source: "oura",
    hrv: 62,
    resting_heart_rate: 55,
    updated_at: "2026-07-04T08:00:00.000Z",
  };
  const incoming = {
    source_provider: "apple_healthkit",
    source: "apple-healthkit",
    hrv: 58,
    resting_heart_rate: 60,
    updated_at: "2026-07-04T14:00:00.000Z", // +6h, within 12h guard
  };
  const merged = mergeCanonicalWearableRow(existing, incoming, {
    context: ctxOuraConnected,
    onReconciliation: (r) => recon.push(r),
  });
  // Within guard threshold: freshness tiebreak lets incoming Apple win.
  assertEquals(merged.hrv, 58);
  assertEquals(recon.length, 0, "no reconciliation within threshold");
});

Deno.test("per-metric source_apps written for each chosen metric", () => {
  const existing = {
    source_provider: "apple_healthkit",
    source_apps: { heart_rate: ["Apple Watch"], hr_samples: ["Apple Watch"] },
    heart_rate: 62,
    hr_samples: [{ t: "10:00", bpm: 60 }],
  };
  const incoming = {
    source_provider: "oura",
    source: "oura",
    total_sleep_minutes: 420,
    sleep_score: 88,
  };
  const merged = mergeCanonicalWearableRow(existing, incoming, { context: ctxOuraConnected });
  const apps = merged.source_apps as Record<string, string[]>;
  // Sleep chosen from Oura
  assertEquals(apps.total_sleep_minutes, ["oura"]);
  assertEquals(apps.sleep_score, ["oura"]);
  // Heart chosen from Apple Watch (retained from existing)
  assertEquals(apps.heart_rate, ["Apple Watch"]);
  assertEquals(apps.hr_samples, ["Apple Watch"]);
});

Deno.test("loadWearableMergeContext derives connection state from stubbed client", async () => {

});

Deno.test("recency guard boundary: exactly 12h does NOT trigger (strict >)", () => {
  const recon: ReconciliationRecord[] = [];
  const existing = {
    source_provider: "oura",
    source: "oura",
    hrv: 62,
    resting_heart_rate: 55,
    updated_at: "2026-07-04T08:00:00.000Z",
  };
  const incoming = {
    source_provider: "apple_healthkit",
    source: "apple-healthkit",
    hrv: 40,
    resting_heart_rate: 70,
    updated_at: "2026-07-04T20:00:00.000Z", // +12h exactly
  };
  const merged = mergeCanonicalWearableRow(existing, incoming, {
    context: ctxOuraConnected,
    onReconciliation: (r) => recon.push(r),
  });
  assertEquals(recon.length, 0, "guard must NOT fire at exactly 12h");
  assertEquals(merged.hrv, 40, "incoming wins at boundary");
});

Deno.test("recency guard boundary: 12h + 1ms DOES trigger", () => {
  const recon: ReconciliationRecord[] = [];
  const existing = {
    source_provider: "oura",
    source: "oura",
    hrv: 62,
    resting_heart_rate: 55,
    updated_at: "2026-07-04T08:00:00.000Z",
  };
  const incoming = {
    source_provider: "apple_healthkit",
    source: "apple-healthkit",
    hrv: 40,
    resting_heart_rate: 70,
    updated_at: "2026-07-04T20:00:00.001Z", // +12h + 1ms
  };
  const merged = mergeCanonicalWearableRow(existing, incoming, {
    context: ctxOuraConnected,
    onReconciliation: (r) => recon.push(r),
  });
  assertEquals(recon.length, 1, "guard fires just past 12h");
  assertEquals(merged.hrv, 62, "existing preserved");
});

Deno.test("_placeholder", () => {
  const stub = {
    from(table: string) {
      if (table === "oura_connections") {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ connection_status: "connected", writes_to_apple_health: true }],
            }),
          }),
        };
      }
      if (table === "wearable_data") {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({
                data: [{ source_provider: "apple_healthkit", source_apps: { heart_rate: ["Apple Watch"] } }],
              }),
            }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
  const ctx = await loadWearableMergeContext(stub, "user_abc", "2026-07-04");
  assertEquals(ctx.ouraDirectConnected, true);
  assertEquals(ctx.ouraWritesToAppleHealth, true);
  assertEquals(ctx.appleWatchPresentToday, true);
});