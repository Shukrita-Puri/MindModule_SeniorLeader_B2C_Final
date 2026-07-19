import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { evaluateWeekAheadMode } from "./week-ahead-mode.ts";
import { shouldFireWeekAheadPickerInvite } from "./week-ahead-nudge.ts";

function decide(opts: { dayOfWeek: number; localHour: number; homeCountry?: string | null }) {
  return shouldFireWeekAheadPickerInvite({
    dayOfWeek: opts.dayOfWeek,
    localHour: opts.localHour,
    weekAheadDecision: evaluateWeekAheadMode({
      dayOfWeek: opts.dayOfWeek,
      localHour: opts.localHour,
      homeCountry: opts.homeCountry ?? null,
    }),
  });
}

Deno.test("fires Sunday 17:00 (default country → weekly_planning)", () => {
  const d = decide({ dayOfWeek: 0, localHour: 17 });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "weekly_planning");
});

Deno.test("does not fire Sunday 10:00 (out of window)", () => {
  const d = decide({ dayOfWeek: 0, localHour: 10 });
  assertEquals(d.fire, false);
  assertEquals(d.reason, "out_of_window");
});

Deno.test("fires Saturday 17:00 for Sunday-start countries (SA)", () => {
  const d = decide({ dayOfWeek: 6, localHour: 17, homeCountry: "SA" });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "weekly_planning");
});

Deno.test("does not fire Saturday for Monday-start countries", () => {
  const evening = decide({ dayOfWeek: 6, localHour: 17 });
  assertEquals(evening.fire, false);
  assertEquals(evening.reason, "week_ahead_inactive");
});

Deno.test("does not fire Monday 17:00", () => {
  const d = decide({ dayOfWeek: 1, localHour: 17 });
  assertEquals(d.fire, false);
});

Deno.test("fires at 17:00 on a detected last-PTO day", () => {
  const wam = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 1,
    localHour: 17,
    weekAheadDecision: wam,
  });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "end_of_pto");
});

Deno.test("full working weekend does NOT suppress (cadence is fixed)", () => {
  const wam = evaluateWeekAheadMode({
    dayOfWeek: 0,
    localHour: 17,
    fullWorkingWeekend: true,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 0,
    localHour: 17,
    weekAheadDecision: wam,
  });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "weekly_planning");
});

Deno.test("suppressed when same reason already sent today", () => {
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 0,
    localHour: 17,
    weekAheadDecision: evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 17 }),
    alreadySentReasonsToday: new Set(["weekly_planning"]),
  });
  assertEquals(d.fire, false);
  assertEquals(d.reason, "already_sent");
});

Deno.test("per-reason dedupe: prior 'weekly_planning' does NOT block 'end_of_pto'", () => {
  // Weekly planning invite went out earlier in the week; today is a
  // return-from-PTO day. With per-reason dedupe, the new invite fires.
  const wamPto = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 1,
    localHour: 17,
    weekAheadDecision: wamPto,
    alreadySentReasonsToday: new Set(["weekly_planning"]),
  });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "end_of_pto");
});

Deno.test("suppressed when picker already opened today", () => {
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 0,
    localHour: 17,
    weekAheadDecision: evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 17 }),
    pickerOpenedToday: true,
  });
  assertEquals(d.fire, false);
  assertEquals(d.reason, "picker_already_opened");
});

Deno.test("Monday 17:00 end_of_pto fires (regression)", () => {
  const wam = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
    tomorrowIsWorkday: true,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 1,
    localHour: 17,
    weekAheadDecision: wam,
  });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "end_of_pto");
});

Deno.test("Tuesday 17:00 still on PTO (tomorrow=PTO) does NOT fire", () => {
  const wam = evaluateWeekAheadMode({
    dayOfWeek: 2,
    localHour: 17,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: true,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 2,
    localHour: 17,
    weekAheadDecision: wam,
  });
  assertEquals(d.fire, false);
});

Deno.test("Monday 17:00 end_of_long_weekend fires (SSOT flag)", () => {
  const wam = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    isLastDayOfLongWeekend: true,
    tomorrowIsWorkday: true,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 1,
    localHour: 17,
    weekAheadDecision: wam,
  });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "end_of_long_weekend");
});

Deno.test("Last day of public holiday block fires", () => {
  const wam = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 18,
    holidayAllDayEventToday: true,
    tomorrowIsWorkday: true,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 1,
    localHour: 18,
    weekAheadDecision: wam,
  });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "end_of_public_holiday");
});