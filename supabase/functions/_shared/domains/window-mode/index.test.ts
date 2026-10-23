// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Scenario tests for Layer 2 Window-Mode Domain (WN-06, WN-07).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateWindowMode } from "./index.ts";

Deno.test("WindowMode - WN-06: Evening with wearable bedtime 22:30 sets mode close and quiet hours 22:00", () => {
  const result = evaluateWindowMode({
    localHour: 20,
    localMinute: 0,
    wearableBedtime: "22:30",
  });

  assertEquals(result.window, "evening");
  assertEquals(result.mode, "close");
  assertEquals(result.quietHoursStart, "22:00");
  assertEquals(result.quietHoursActive, false);
});

Deno.test("WindowMode - WN-07: Evening with pending JIT sets mode jit_remaining", () => {
  const result = evaluateWindowMode({
    localHour: 18,
    localMinute: 45,
    hasPendingJitRemaining: true,
  });

  assertEquals(result.window, "evening");
  assertEquals(result.mode, "jit_remaining");
  assertEquals(result.hasPendingJit, true);
});

Deno.test("WindowMode - Morning sets mode set_up and Afternoon sets execute_and_hold", () => {
  const morning = evaluateWindowMode({ localHour: 9, localMinute: 0 });
  assertEquals(morning.window, "morning");
  assertEquals(morning.mode, "set_up");

  const afternoon = evaluateWindowMode({ localHour: 14, localMinute: 30 });
  assertEquals(afternoon.window, "afternoon");
  assertEquals(afternoon.mode, "execute_and_hold");
});
