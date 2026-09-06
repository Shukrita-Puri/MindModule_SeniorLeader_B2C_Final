import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  evaluateWeekAheadMode,
  isSaturdayRecoveryDay,
  normalizeEventTypeKey,
  planningDayOfWeek,
} from "./week-ahead-mode.ts";

Deno.test("inactive on weekday", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 2, localHour: 10 });
  assertEquals(d.active, false);
});

Deno.test("Sunday triggers weekly_planning (default country)", () => {
  const d = evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 17 });
  assertEquals(d.active, true);
  assertEquals(d.reason, "weekly_planning");
});

Deno.test("Saturday triggers weekly_planning for SA/KW/QA/BH/OM/IL", () => {
  for (const c of ["SA", "KW", "QA", "BH", "OM", "IL"]) {
    const d = evaluateWeekAheadMode({
      dayOfWeek: 6,
      localHour: 17,
      homeCountry: c,
    });
    assertEquals(d.active, true, `country=${c}`);
    assertEquals(d.reason, "weekly_planning", `country=${c}`);
  }
  assertEquals(planningDayOfWeek("SA"), 6);
  assertEquals(planningDayOfWeek("GB"), 0);
  assertEquals(planningDayOfWeek(null), 0);
});

Deno.test("Saturday inactive for Monday-start countries", () => {
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

Deno.test("travel day does NOT suppress weekly planning (cadence is fixed)", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 10,
    travelDay: true,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "weekly_planning");
});

Deno.test("full working weekend does NOT suppress weekly planning", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 10,
    fullWorkingWeekend: true,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "weekly_planning");
});

Deno.test("end of PTO triggers when tomorrow is not PTO", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 18,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "end_of_pto");
});

Deno.test("end_of_long_weekend triggers only when SSOT flag set", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 19,
    isLastDayOfLongWeekend: true,
    tomorrowIsWorkday: true,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "end_of_long_weekend");
});

Deno.test("plain weekend does NOT satisfy end_of_long_weekend (SSOT flag false)", () => {
  // Regression: shukrita@mindmodule.me, Tue 14 Jul 2026 fired
  // last_day_long_weekend because a legacy counter treated a plain
  // weekend as a long weekend. The SSOT flag now gates this.
  const d = evaluateWeekAheadMode({
    dayOfWeek: 2,
    localHour: 16,
    isLastDayOfLongWeekend: false,
    tomorrowIsWorkday: true,
  });
  assertEquals(d.active, false);
  assertEquals(d.reason, null);
});

Deno.test("weekly_planning suppressed when today is PTO", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 17,
    ptoTodayAllDay: true,
  });
  assertEquals(d.active, false);
});

Deno.test("weekly_planning suppressed when today is a public holiday", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 17,
    holidayAllDayEventToday: true,
    tomorrowIsWorkday: false, // still not "end_of_public_holiday"
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
// ── LAST-DAY-ONLY RULE ────────────────────────────────────────────────
// Week-Ahead belongs to the final day of an off-run only: last weekend
// day, last PTO day, last holiday day, last day of a long weekend.

Deno.test("planning day mid-run (bank-holiday Monday tomorrow) stays inactive", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 17,
    homeCountry: "GB",
    tomorrowIsWorkday: false,
    tomorrowIsOffDay: true,
  });
  assertEquals(d.active, false);
  assertEquals(d.reason, null);
});

Deno.test("planning day that ends the run still fires weekly_planning", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 17,
    homeCountry: "GB",
    tomorrowIsWorkday: true,
    tomorrowIsOffDay: false,
  });
  assertEquals(d.active, true);
  assertEquals(d.reason, "weekly_planning");
});

Deno.test("PTO day followed by a weekend day does not fire end_of_pto", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 5,
    localHour: 17,
    homeCountry: "GB",
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
    tomorrowIsWorkday: false,
    tomorrowIsOffDay: true,
  });
  assertEquals(d.active, false);
});

Deno.test("long-weekend flag is ignored when the run continues", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 17,
    homeCountry: "GB",
    isLastDayOfLongWeekend: true,
    tomorrowIsOffDay: true,
  });
  assertEquals(d.active, false);
});

Deno.test("day AFTER the run (return-to-work Monday) never fires", () => {
  const d = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    homeCountry: "GB",
    ptoTodayAllDay: false,
    holidayAllDayEventToday: false,
    isLastDayOfLongWeekend: false,
    tomorrowIsWorkday: true,
    tomorrowIsOffDay: false,
  });
  assertEquals(d.active, false);
});
