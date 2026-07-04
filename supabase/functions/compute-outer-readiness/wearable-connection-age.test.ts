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

Deno.test("compute-outer-readiness declares wearableDaysConnected exactly once and before first use", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  const declRegex = /const wearableDaysConnected\s*=/g;
  const declMatches = source.match(declRegex) ?? [];
  // Regression guard: a second declaration would create a TDZ in the outer
  // scope's nested try/catch blocks.
  assertEquals(declMatches.length, 1);

  const declaration = source.indexOf("const wearableDaysConnected =");
  const firstReadRegex = /wearableDaysConnected(?!\s*=)/;
  const firstReadMatch = firstReadRegex.exec(source);
  assertEquals(declaration >= 0, true);
  assertEquals(firstReadMatch != null, true);
  assertEquals(declaration < firstReadMatch!.index, true);
});

Deno.test("compute-outer-readiness hoists wearableDaysConnected above getTheme(...) call", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const declaration = source.indexOf("const wearableDaysConnected =");
  const getThemeCall = source.indexOf("const theme = getTheme(");
  assertEquals(declaration >= 0, true);
  assertEquals(getThemeCall >= 0, true);
  assertEquals(declaration < getThemeCall, true);
});

Deno.test("deriveWearableDaysConnected handles scheduled build-executive-home-cards inputs", () => {
  // Simulates a scheduled build path where the wearable integration row
  // exists but the connected_at column is null (older rows). Must return
  // null — not 0 — so cold-start gates behave correctly.
  assertEquals(deriveWearableDaysConnected({
    connectedAt: null,
    fallbackConnectedAt: null,
    isConnected: true,
  }), null);

  // contextOnly requests still pass through the same helper without throwing.
  assertEquals(deriveWearableDaysConnected({
    connectedAt: "2026-06-20T00:00:00.000Z",
    isConnected: true,
    nowMs: new Date("2026-07-04T12:00:00.000Z").getTime(),
  }), 14);
});
