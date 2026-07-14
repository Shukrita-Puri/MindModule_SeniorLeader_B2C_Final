import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  evaluateWeekAheadMode,
  isSaturdayRecoveryDay,
  normalizeEventTypeKey,
} from "./week-ahead-mode.ts";

Deno.test("inactive on weekday", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 2, localHour: 10 });
  assertEquals(d.active, false);
});

Deno.test("Sunday triggers", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 17 });
  assertEquals(d.active, true);
  assertEquals(d.reason, "sunday");
});

Deno.test("Saturday no longer triggers Week-Ahead Mode", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 6, localHour: 10 });
  assertEquals(d.active, false);
  assertEquals(d.reason, null);
});

Deno.test("isSaturdayRecoveryDay true on plain Saturday", () => {
  assertEquals(isSaturdayRecoveryDay({ dayOfWeek: 6, localHour: 10 }), true);
});

Deno.test("isSaturdayRecoveryDay false on travel Saturday", () => {
  assertEquals(
    isSaturdayRecoveryDay({ dayOfWeek: 6, localHour: 10, travelDay: true }),
    false,
  );
});

Deno.test("isSaturdayRecoveryDay false on working-weekend Saturday", () => {
  assertEquals(
    isSaturdayRecoveryDay({ dayOfWeek: 6, localHour: 10, fullWorkingWeekend: true }),
    false,
  );
});

Deno.test("isSaturdayRecoveryDay false on Sunday/weekday", () => {
  assertEquals(isSaturdayRecoveryDay({ dayOfWeek: 0, localHour: 10 }), false);
  assertEquals(isSaturdayRecoveryDay({ dayOfWeek: 3, localHour: 10 }), false);
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
    todayIsOffDay: true,
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
    todayIsOffDay: true,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "last_day_long_weekend");
});

Deno.test("Tuesday with lookback but today is workday → inactive", () => {
  // Regression: shukrita@mindmodule.me, Tue 14 Jul 2026 fired
  // last_day_long_weekend because the lookback inflated
  // consecutiveOffDaysBefore and today was not gated as an off-day.
  const d = evaluateWeekAheadMode({
    dayOfWeek: 2,
    localHour: 16,
    consecutiveOffDaysBefore: 3,
    tomorrowIsWorkday: true,
    todayIsOffDay: false,
  });
  assertEquals(d.active, false);
  assertEquals(d.reason, null);
});

Deno.test("Monday after plain weekend → inactive (weekend != long weekend)", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    consecutiveOffDaysBefore: 2,
    tomorrowIsWorkday: true,
    todayIsOffDay: false, // Mon itself is a workday
  });
  assertEquals(d.active, false);
});

Deno.test("last_day_pto requires todayIsOffDay to be true", () => {
  // If today isn't classified as off, PTO flags alone must not fire.
  const d = evaluateWeekAheadMode({
    dayOfWeek: 2,
    localHour: 18,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
    todayIsOffDay: false,
  });
  assertEquals(d.active, false);
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