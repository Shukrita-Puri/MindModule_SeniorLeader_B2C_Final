import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLightDay } from "./light-day.ts";
import { allocatePlanSlots } from "../jit/slot-allocator.ts";

const ev = (title: string, startISO: string, hours = 1, allDay = false) => ({
  title,
  startTime: startISO,
  endTime: new Date(new Date(startISO).getTime() + hours * 3600000).toISOString(),
  isAllDay: allDay,
  isOrganizer: false,
  attendeesCount: 2,
});

// Wednesday 2026-09-02
const WED = new Date("2026-09-02T09:00:00Z");
// Saturday 2026-09-05
const SAT = new Date("2026-09-05T09:00:00Z");
// Sunday 2026-09-06 (planning day, ROW)
const SUN = new Date("2026-09-06T09:00:00Z");

Deno.test("empty weekday is a light workday", () => {
  const r = classifyLightDay({ now: WED, userHomeCountry: "GB", weekendDays: [0, 6], events: [] });
  assertEquals(r.isLightDay, true);
  assertEquals(r.kind, "light_workday");
});

Deno.test("one-meeting weekday is still a light workday", () => {
  const r = classifyLightDay({
    now: WED, userHomeCountry: "GB", weekendDays: [0, 6],
    events: [ev("Board review", "2026-09-02T14:00:00Z")],
  });
  assertEquals(r.isLightDay, true);
  assertEquals(r.meetingCount, 1);
});

Deno.test("three meetings is not a light day", () => {
  const r = classifyLightDay({
    now: WED, userHomeCountry: "GB", weekendDays: [0, 6],
    events: [
      ev("A", "2026-09-02T09:00:00Z"),
      ev("B", "2026-09-02T11:00:00Z"),
      ev("C", "2026-09-02T14:00:00Z"),
    ],
  });
  assertEquals(r.isLightDay, false);
});

Deno.test("first weekend day is a light day", () => {
  const r = classifyLightDay({
    now: SAT, userHomeCountry: "GB", weekendDays: [0, 6], events: [],
    tomorrowIsWorkday: false, isPlanningDay: false,
  });
  assertEquals(r.isLightDay, true);
  assertEquals(r.kind, "weekend");
});

Deno.test("last day of the weekend keeps week-ahead behaviour", () => {
  const r = classifyLightDay({
    now: SUN, userHomeCountry: "GB", weekendDays: [0, 6], events: [],
    tomorrowIsWorkday: true, isPlanningDay: true,
  });
  assertEquals(r.isLightDay, false);
  assertEquals(r.isLastDayOfRun, true);
});

Deno.test("light day plan allocates a three-slot recovery arc", () => {
  const a = allocatePlanSlots({ nowMs: Date.now(), rankedCandidates: [], isLightDay: true });
  assertEquals(a.dayShape, "light_day");
  assertEquals(a.slots.length, 3);
  assertEquals(a.slots.map((s) => s.allocationReason), [
    "light_day_recovery_intention",
    "light_day_recovery_hold",
    "light_day_recovery_protect",
  ]);
});

Deno.test("single high-stakes commitment swaps one light-day slot to prep", () => {
  const a = allocatePlanSlots({
    nowMs: Date.now(),
    isLightDay: true,
    mrsWindow: "morning",
    rankedCandidates: [{
      eventId: "e1", title: "Board review", categoryId: "A", phase: "pre",
      score: 90, durationMinutes: 60,
      // deno-lint-ignore no-explicit-any
    } as any],
  });
  assertEquals(a.slots[0].jitEventTitle, "Board review");
  assertEquals(a.slots[0].jitPhase, "pre");
  assertEquals(a.slots[2].allocationReason, "light_day_recovery_protect");
});

Deno.test("week-ahead day never becomes a light-day arc", () => {
  const a = allocatePlanSlots({
    nowMs: Date.now(), rankedCandidates: [], isLightDay: true, isWeekAhead: true,
  });
  assertEquals(a.dayShape === "light_day", false);
});
