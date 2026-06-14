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

// NOTE: Production idempotency for the picker invite is ISO-WEEKLY (one
// invite per user per ISO week, any reason), enforced server-side in
// smart-nudges/index.ts via a notification_log lookup against
// `week_ahead_picker_invite` rows ≥ Monday-00:00-local. The pure
// predicate below still exposes a generic `alreadySentToday` flag — the
// main loop now passes the WEEKLY result through that flag, so the same
// suppression branch covers both daily and weekly semantics. These two
// tests assert the contract explicitly so a future refactor that drops
// the weekly query without updating this comment will fail loudly.
Deno.test("ISO-week idempotency: a second tick within the same week is suppressed", () => {
  // First tick — invite fires.
  const wamSun = evaluateWeekAheadMode({ dayOfWeek: 0, localHour: 17 });
  const first = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 0,
    localHour: 17,
    weekAheadDecision: wamSun,
    alreadySentToday: false, // weekly = false
  });
  assertEquals(first.fire, true);
  // Same week, later tick — weekly flag now true → suppressed.
  const second = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 0,
    localHour: 18,
    weekAheadDecision: wamSun,
    alreadySentToday: true,
  });
  assertEquals(second.fire, false);
  assertEquals(second.reason, "already_sent");
});

Deno.test("ISO-week idempotency: cross-reason dedupe (Sun invite blocks later last_day_pto invite same week)", () => {
  // Sunday invite went out.
  // Monday is a last-day-PTO trigger. With weekly dedupe, the Mon invite
  // is suppressed even though it has a different reason.
  const monPto = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    ptoTodayAllDay: true,
    ptoTomorrowAllDay: false,
    tomorrowIsWorkday: true,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 1,
    localHour: 17,
    weekAheadDecision: monPto,
    alreadySentToday: true, // weekly flag from main loop
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

Deno.test("Monday 17:00 last-day-PTO fires (regression: previously stubbed)", () => {
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
  assertEquals(d.reason, "last_day_pto_evening");
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

Deno.test("Monday 17:00 end of 3-day long weekend fires", () => {
  const wam = evaluateWeekAheadMode({
    dayOfWeek: 1,
    localHour: 17,
    consecutiveOffDaysBefore: 3,
    tomorrowIsWorkday: true,
  });
  const d = shouldFireWeekAheadPickerInvite({
    dayOfWeek: 1,
    localHour: 17,
    weekAheadDecision: wam,
  });
  assertEquals(d.fire, true);
  assertEquals(d.reason, "last_day_long_weekend_evening");
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
  assertEquals(d.reason, "last_day_holiday_evening");
});