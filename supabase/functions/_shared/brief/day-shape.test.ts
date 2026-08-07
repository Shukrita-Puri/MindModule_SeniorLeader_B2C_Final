import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { deriveDayShape, formatDayShapeBlock } from "./day-shape.ts";
import { buildBriefSystemPrompt } from "./copy-vocabulary.ts";
import type { SignalMatrix } from "../brief-context.ts";

const S = (o: Partial<SignalMatrix>) => o as SignalMatrix;

Deno.test("workday by default", () => {
  assertEquals(deriveDayShape(S({}), {}).shape, "workday");
});

Deno.test("weekend from locale context", () => {
  const d = deriveDayShape(S({}), { isWeekend: true });
  assertEquals(d.shape, "weekend");
  assertEquals(d.isNonWorkday, true);
});

Deno.test("PTO beats public holiday and weekend", () => {
  const d = deriveDayShape(S({ ptoTodayAllDay: true, ptoMeetingPresent: true }), {
    isPublicHoliday: true,
    isWeekend: true,
  });
  assertEquals(d.shape, "pto");
  assertEquals(d.meetingOnOffDay, true);
});

Deno.test("public holiday carries its name", () => {
  const d = deriveDayShape(S({}), { isPublicHoliday: true, holidayName: "Diwali" });
  assertEquals(d.shape, "public_holiday");
  assertStringIncludes(d.reason, "Diwali");
});

Deno.test("conference day wins over travel", () => {
  const d = deriveDayShape(
    S({ conferenceDayNumber: 2, conferenceTotalDays: 3, travelDay: true }),
    {},
  );
  assertEquals(d.shape, "conference");
  assertEquals(d.isNonWorkday, false);
});

Deno.test("work travel requires the post-landing meeting inference", () => {
  const work = deriveDayShape(S({ travelDay: true, workTravelInferred: true }), {});
  assertEquals(work.shape, "work_travel");
  assertEquals(work.isNonWorkday, false);
  const personal = deriveDayShape(S({ travelDay: true }), {});
  assertEquals(personal.shape, "personal_travel");
  assertEquals(personal.isNonWorkday, true);
});

Deno.test("travel phases map from existing plan signals", () => {
  assertEquals(deriveDayShape(S({ preFlightWindowMinutes: 120 }), {}).travelPhase, "pre");
  assertEquals(deriveDayShape(S({ travelLandingDetected: true }), {}).travelPhase, "in_transit");
  assertEquals(deriveDayShape(S({ yesterdayWasTravelDay: true }), {}).travelPhase, "post");
});

Deno.test("prompt block never prints a category letter", () => {
  const block = formatDayShapeBlock(
    deriveDayShape(
      S({ travelDay: true, workTravelInferred: true, longHaulFlight: { durationHours: 9 }, highStakesEventInNext24h: { title: "Board", minutesUntil: 300 } }),
      {},
    ),
  );
  assertStringIncludes(block, "=== DAY SHAPE");
  assertStringIncludes(block, "work travel day");
  assertStringIncludes(block, "High-stakes event in the next 24h: yes");
  assertEquals(/Category [A-H]\b/.test(block), false);
});

Deno.test("system prompt swaps exactly one directive", () => {
  const holiday = buildBriefSystemPrompt({ dayShape: "public_holiday" });
  assertStringIncludes(holiday, "NON-WORKDAY CONTEXT");
  assertEquals(holiday.includes("WEEKEND CONTEXT"), false);
  const travel = buildBriefSystemPrompt({ dayShape: "work_travel", travelPhase: "post" });
  assertStringIncludes(travel, "POST-TRIP RE-ENTRY");
  const plain = buildBriefSystemPrompt({ dayShape: "workday", isWeekend: false });
  assertEquals(plain.includes("NON-WORKDAY CONTEXT"), false);
});
