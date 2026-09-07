import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyLightDay, LightDayClassificationError } from "./light-day.ts";
import { allocatePlanSlots } from "../jit/slot-allocator.ts";
import { resolveLightDaySends } from "../../smart-nudges/index.ts";

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

Deno.test("single high-stakes commitment builds a meeting-anchored arc", () => {
  const a = allocatePlanSlots({
    nowMs: Date.now(),
    isLightDay: true,
    realMeetingCount: 1,
    mrsWindow: "morning",
    rankedCandidates: [{
      eventId: "e1", title: "Board review", categoryId: "A", phase: "pre",
      score: 90, durationMinutes: 60,
      // deno-lint-ignore no-explicit-any
    } as any],
  });
  assertEquals(a.dayShape, "light_day");
  assertEquals(a.slots.map((s) => s.jitEventTitle), [
    "Board review",
    "Board review",
    "Board review",
  ]);
  assertEquals(a.slots.map((s) => s.jitPhase), ["pre", "during", "post"]);
  assertEquals(a.slots[2].allocationReason, "light_day_single_commitment_debrief");
});

Deno.test("week-ahead day never becomes a light-day arc", () => {
  const a = allocatePlanSlots({
    nowMs: Date.now(), rankedCandidates: [], isLightDay: true, isWeekAhead: true,
  });
  assertEquals(a.dayShape === "light_day", false);
});

// ── SM-5 regression cases ────────────────────────────────────────────

Deno.test("SM-1: classifier throws without a real events array", () => {
  let threw = false;
  try {
    // deno-lint-ignore no-explicit-any
    classifyLightDay({ now: WED, userHomeCountry: "GB", weekendDays: [0, 6] } as any);
  } catch (e) {
    threw = e instanceof LightDayClassificationError;
  }
  assertEquals(threw, true);
});

Deno.test("SM-2: travel and conference signals override the light day", () => {
  const travel = classifyLightDay({
    now: WED, userHomeCountry: "GB", weekendDays: [0, 6], events: [],
    travelDaySignal: true,
  });
  assertEquals(travel.isLightDay, false);
  assertEquals(travel.reason, "override_travel_day");
  const conf = classifyLightDay({
    now: WED, userHomeCountry: "GB", weekendDays: [0, 6], events: [],
    conferenceDaySignal: true,
  });
  assertEquals(conf.isLightDay, false);
  assertEquals(conf.reason, "override_conference_day");
});

Deno.test("packed day never takes the light-day arc in the allocator", () => {
  const a = allocatePlanSlots({
    nowMs: Date.now(), rankedCandidates: [], isLightDay: true, realMeetingCount: 3,
  });
  assertEquals(a.dayShape === "light_day", false);
});

Deno.test("travel day beats the light-day flag in the allocator", () => {
  const a = allocatePlanSlots({
    nowMs: Date.now(),
    isLightDay: true,
    hasTravelDay: true,
    rankedCandidates: [{
      eventId: "g1", title: "Flight to JFK", categoryId: "G", phase: "pre",
      score: 80, durationMinutes: 480,
      // deno-lint-ignore no-explicit-any
    } as any],
  });
  assertEquals(a.dayShape, "travel_day");
});

Deno.test("light-day notifications: morning + evening baseline", () => {
  const { sends, cap } = resolveLightDaySends({
    kind: "weekend", prepMeeting: null, briefTiming: null,
  });
  assertEquals(sends.map((s) => s.slot), ["morning", "evening"]);
  assertEquals(cap, 2);
});

Deno.test("light-day notifications: high-stakes afternoon adds a third send", () => {
  const { sends, cap } = resolveLightDaySends({
    kind: "light_workday", prepMeeting: { startHour: 15 }, briefTiming: null,
  });
  assertEquals(sends.map((s) => s.slot), ["morning", "afternoon", "evening"]);
  assertEquals(sends[1].anchored, true);
  assertEquals(cap, 3);
});

Deno.test("light-day notifications: high-stakes evening replaces the recovery evening", () => {
  const { sends, cap } = resolveLightDaySends({
    kind: "light_workday", prepMeeting: { startHour: 19.5 }, briefTiming: null,
  });
  assertEquals(sends.map((s) => s.slot), ["morning", "evening"]);
  assertEquals(sends[1].anchored, true);
  assertEquals(cap, 2);
});

Deno.test("light-day notifications: high-stakes morning replaces the recovery morning", () => {
  const { sends, cap } = resolveLightDaySends({
    kind: "light_workday", prepMeeting: { startHour: 9 }, briefTiming: "morning",
  });
  assertEquals(sends.map((s) => s.slot), ["morning", "evening"]);
  assertEquals(sends[0].anchored, true);
  assertEquals(cap, 2);
});

// Gulf / Israel weekend pair — Friday light, Saturday week-ahead.
const FRI = new Date("2026-09-04T09:00:00Z");
const SAT_IL = new Date("2026-09-05T09:00:00Z");

Deno.test("Gulf/Israel Friday is a light day", () => {
  const r = classifyLightDay({
    now: FRI, userHomeCountry: "AE", weekendDays: [5, 6], events: [],
    tomorrowIsWorkday: false, isPlanningDay: false,
  });
  assertEquals(r.isLightDay, true);
  assertEquals(r.kind, "weekend");
});

Deno.test("Gulf/Israel Saturday keeps week-ahead behaviour", () => {
  const r = classifyLightDay({
    now: SAT_IL, userHomeCountry: "AE", weekendDays: [5, 6], events: [],
    tomorrowIsWorkday: true, isPlanningDay: true,
  });
  assertEquals(r.isLightDay, false);
  assertEquals(r.isLastDayOfRun, true);
});

Deno.test("weekend day carrying meetings is not a light day", () => {
  const r = classifyLightDay({
    now: SAT, userHomeCountry: "GB", weekendDays: [0, 6],
    events: [
      ev("Client sync", "2026-09-05T10:00:00Z"),
      ev("Deal review", "2026-09-05T13:00:00Z"),
    ],
    tomorrowIsWorkday: false, isPlanningDay: false,
  });
  assertEquals(r.isLightDay, false);
});
