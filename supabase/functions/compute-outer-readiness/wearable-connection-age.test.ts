import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import {
  deriveWearableDaysConnected,
  safeDaysSince,
} from "./wearable-connection-age.ts";

Deno.test("safeDaysSince returns null for missing or invalid dates", () => {
  assertEquals(safeDaysSince(null), null);
  assertEquals(safeDaysSince(undefined), null);
  assertEquals(safeDaysSince("not-a-date"), null);
});

Deno.test("deriveWearableDaysConnected returns days when connected_at exists", () => {
  assertEquals(deriveWearableDaysConnected({
    connectedAt: "2026-07-01T00:00:00.000Z",
    isConnected: true,
    nowMs: new Date("2026-07-05T12:00:00.000Z").getTime(),
  }), 4);
});

Deno.test("deriveWearableDaysConnected does not throw when connected date is missing", () => {
  assertEquals(deriveWearableDaysConnected({
    connectedAt: null,
    fallbackConnectedAt: null,
    isConnected: true,
    nowMs: new Date("2026-07-05T12:00:00.000Z").getTime(),
  }), null);
});

Deno.test("deriveWearableDaysConnected does not throw when wearable is disconnected", () => {
  assertEquals(deriveWearableDaysConnected({
    connectedAt: "2026-07-01T00:00:00.000Z",
    isConnected: false,
    nowMs: new Date("2026-07-05T12:00:00.000Z").getTime(),
  }), null);
});

Deno.test("deriveWearableDaysConnected supports connected fallback date", () => {
  assertEquals(deriveWearableDaysConnected({
    connectedAt: null,
    fallbackConnectedAt: "2026-07-03T00:00:00.000Z",
    isConnected: true,
    nowMs: new Date("2026-07-05T12:00:00.000Z").getTime(),
  }), 2);
});

Deno.test("compute-outer-readiness declares wearableDaysConnected before first use", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  const declaration = source.indexOf(
    "const wearableDaysConnected = deriveWearableDaysConnected({",
  );
  const firstUse = source.indexOf(
    "hasHistoricalData: wearableDaysConnected !== null && wearableDaysConnected >= 7",
  );

  assertEquals(declaration >= 0, true);
  assertEquals(firstUse >= 0, true);
  assertEquals(declaration < firstUse, true);
});
