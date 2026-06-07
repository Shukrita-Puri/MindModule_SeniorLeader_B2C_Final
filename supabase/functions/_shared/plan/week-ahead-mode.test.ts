import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { evaluateWeekAheadMode, normalizeEventTypeKey } from "./week-ahead-mode.ts";

Deno.test("inactive on weekday", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 2, localHour: 10 });
  assertEquals(d.active, false);
});

Deno.test("Sunday triggers", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 17 });
  assertEquals(d.active, true);
  assertEquals(d.reason, "sunday");
});

Deno.test("travel day suppresses", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 10, travelDay: true });
  assertEquals(d.active, false);
});

Deno.test("full working weekend suppresses", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 6, localHour: 10, fullWorkingWeekend: true });
  assertEquals(d.active, false);
});

Deno.test("last day of PTO triggers", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 18,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "last_day_pto");
});

Deno.test("last day of long weekend triggers", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 19,
    consecutiveOffDaysBefore: 3,
    tomorrowIsWorkday: true,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "last_day_long_weekend");
});

Deno.test("manualOverride forces active", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 2, localHour: 9, manualOverride: true });
  assertEquals(d.active, true);
  assertEquals(d.reason, "manual_override");
});

Deno.test("normalizeEventTypeKey buckets", () => {
  assertEquals(normalizeEventTypeKey("Weekly 1:1 with Sam"), "1on1");
  assertEquals(normalizeEventTypeKey("Board Meeting Q3"), "board");
  assertEquals(normalizeEventTypeKey("Deep Work block"), "deep_work");
  assertEquals(normalizeEventTypeKey(null), "untitled");
});