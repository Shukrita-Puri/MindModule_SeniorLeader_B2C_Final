import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getDayContext, isWeekend } from "./day-kind-detector.ts";

Deno.test("day-kind-detector keeps default Sat/Sun weekend buckets", () => {
  assertEquals(getDayContext(5, "US"), "friday");
  assertEquals(getDayContext(6, "US"), "saturday");
  assertEquals(getDayContext(0, "US"), "sunday");
  assertEquals(isWeekend(6, "US"), true);
  assertEquals(isWeekend(0, "US"), true);
  assertEquals(isWeekend(5, "US"), false);
});

Deno.test("day-kind-detector maps IL Friday/Saturday onto recovery/planning buckets", () => {
  assertEquals(getDayContext(4, "IL"), "friday");
  assertEquals(getDayContext(5, "IL"), "saturday");
  assertEquals(getDayContext(6, "IL"), "sunday");
  assertEquals(isWeekend(5, "IL"), true);
  assertEquals(isWeekend(6, "IL"), true);
  assertEquals(isWeekend(0, "IL"), false);
});
