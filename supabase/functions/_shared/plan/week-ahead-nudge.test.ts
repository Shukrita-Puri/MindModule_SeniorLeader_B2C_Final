import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { evaluateWeekAheadMode } from "./week-ahead-mode.ts";
import { shouldFireWeekAheadPickerInvite } from "./week-ahead-nudge.ts";

function decide(opts: { dayOfWeek: number; localHour: number; reason?: any; active?: boolean }) {
  return shouldFireWeekAheadPickerInvite({
    dayOfWeek: opts.dayOfWeek,
    localHour: opts.localHour,
    weekAheadDecision: evaluateWeekAheadMode({
      dayOfWeek: opts.dayOfWeek,
      localHour: opts.localHour,
    }),
  });
}

Deno.test("fires Sunday 17:00", () => {
  const d = decide({ dayOfWeek: 0, localHour: 17 });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "sunday_evening");
});

Deno.test("does not fire Sunday 10:00 (out of window)", () => {
  const d = decide({ dayOfWeek: 0, localHour: 10 });
  assertEquals(d.fire, false);
  assertEquals(d.reason, "out_of_window");
});

Deno.test("never fires on Saturday (recovery day)", () => {
  const morning = decide({ dayOfWeek: 6, localHour: 10 });
  const evening = decide({ dayOfWeek: 6, localHour: 17 });
  assertEquals(morning.fire, false);
  assertEquals(morning.reason, "saturday_recovery_day");
  assertEquals(evening.fire, false);
  assertEquals(evening.reason, "saturday_recovery_day");
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
  assertEquals(d.reason, "last_day_pto_evening");
});

Deno.test("suppressed when full working weekend (Sunday)", () => {
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
  assertEquals(d.fire, false);
});

Deno.test("suppressed when already sent today", () => {
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 0,
    localHour: 17,
    weekAheadDecision: evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 17 }),
    alreadySentToday: true,
  });
  assertEquals(d.fire, false);
  assertEquals(d.reason, "already_sent");
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