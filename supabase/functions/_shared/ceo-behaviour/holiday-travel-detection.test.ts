// Travel & Holiday detection v2 — covers gaps #1 mid-trip, #2 return leg,
// #3 long-haul, #4 weekend-straddling holiday, #5 conference guard,
// #6 workcation, #7 half-day PTO, #9 declined/cancelled meetings.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSignalMatrix,
  type SignalCoverageInput,
} from "../brief-signal-coverage.ts";

// Fixed reference "now" = Wed 2026-06-10 09:00 local (a weekday).
const NOW = new Date("2026-06-10T09:00:00Z");

function at(hour: number, minute = 0, dayOffset = 0): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

function baseInput(over: Partial<SignalCoverageInput> = {}): SignalCoverageInput {
  return {
    wearable: null,
    checkIn: null,
    scoreToday: null,
    scoreYesterday: null,
    timezone: { offsetMinutes: 0, shift48hHours: null },
    events: [],
    now: NOW,
    ...over,
  };
}

function build(over: Partial<SignalCoverageInput> = {}) {
  return buildSignalMatrix(baseInput(over));
}

// --- A. Title-based PTO --------------------------------------------------

Deno.test("1. All-day 'PTO' title fires ptoTodayAllDay only", () => {
  const m = build({ events: [{ title: "PTO", startTime: at(0), endTime: at(23, 59), isAllDay: true }] });
  assertEquals(m.ptoTodayAllDay, true);
  // 'PTO' is excluded from personal-leaning regex.
  assertEquals(m.personalHolidayInferred, undefined);
  assertEquals(m.workTravelInferred, undefined);
});

Deno.test("2. All-day 'Vacation' title fires both PTO + personalHoliday", () => {
  const m = build({ events: [{ title: "Vacation", startTime: at(0), endTime: at(23, 59), isAllDay: true }] });
  assertEquals(m.ptoTodayAllDay, true);
  assertEquals(m.personalHolidayInferred, true);
});

Deno.test("3. All-day 'Strategy Offsite' does NOT read as PTO (conference guard)", () => {
  const m = build({ events: [{ title: "Strategy Offsite", startTime: at(0), endTime: at(23, 59), isAllDay: true }] });
  // 'offsite' matches CONFERENCE_RX → PTO suppressed even if title had a marker.
  assertEquals(m.ptoTodayAllDay, undefined);
  assertEquals(m.personalHolidayInferred, undefined);
});

Deno.test("4. All-day 'Q3 Summit' (conference) does NOT read as PTO", () => {
  const m = build({ events: [{ title: "Q3 Summit", startTime: at(0), endTime: at(23, 59), isAllDay: true }] });
  assertEquals(m.ptoTodayAllDay, undefined);
  assertEquals(m.personalHolidayInferred, undefined);
});

// --- B. Pattern-based holiday -------------------------------------------

Deno.test("5. 4-weekday zero-meeting run fires PTO + personalHoliday", () => {
  const surrounding = [
    { title: "x", startTime: at(0, 0, -2), dayOffset: -2 },
    { title: "x", startTime: at(0, 0, -1), dayOffset: -1 },
    { title: "x", startTime: at(0, 0, 1), dayOffset: 1 },
  ].map((e) => ({ ...e, isAllDay: true })); // markers to register the days as empty-of-meetings
  // No meetings anywhere.
  const m = build({ events: [], surroundingEvents: surrounding });
  assertEquals(m.ptoTodayAllDay, true);
  assertEquals(m.personalHolidayInferred, true);
});

Deno.test("6. Thu-Tue PTO straddling weekend (4 weekdays) fires", () => {
  // Today (Wed) is middle. Surrounding covers Thu/Fri (last week) +
  // Sat/Sun weekend + Mon/Tue, all zero-meeting. We feed a Mon -2 weekday off,
  // Tue -1 weekday off, today Wed off, Thu +1 off — 4 weekdays.
  const surrounding = [
    { title: "off", startTime: at(0, 0, -2), dayOffset: -2, isAllDay: true },
    { title: "off", startTime: at(0, 0, -1), dayOffset: -1, isAllDay: true },
    { title: "off", startTime: at(0, 0, 1), dayOffset: 1, isAllDay: true },
  ];
  const m = build({ events: [], surroundingEvents: surrounding });
  assertEquals(m.ptoTodayAllDay, true);
});

Deno.test("7. 3-weekday no-meeting run does NOT fire", () => {
  // Only 3 weekdays in the run.
  const surrounding = [
    { title: "off", startTime: at(0, 0, -1), dayOffset: -1, isAllDay: true },
    { title: "off", startTime: at(0, 0, 1), dayOffset: 1, isAllDay: true },
    // day -2 has a meeting → breaks the run.
    { title: "Board sync", startTime: at(10, 0, -2), endTime: at(11, 0, -2), dayOffset: -2 },
  ];
  const m = build({ events: [], surroundingEvents: surrounding });
  assertEquals(m.ptoTodayAllDay, undefined);
});

// --- C. Workcation (gap #6) ---------------------------------------------

Deno.test("8. Workcation: 4-weekday zero-meeting + flights still personalHoliday", () => {
  const surrounding = [
    { title: "Flight to Bali", startTime: at(8, 0, -2), endTime: at(20, 0, -2), dayOffset: -2 },
    { title: "off", startTime: at(0, 0, -1), dayOffset: -1, isAllDay: true },
    { title: "off", startTime: at(0, 0, 1), dayOffset: 1, isAllDay: true },
    { title: "Flight home", startTime: at(8, 0, 2), endTime: at(20, 0, 2), dayOffset: 2 },
  ];
  const m = build({ events: [], surroundingEvents: surrounding });
  assertEquals(m.ptoTodayAllDay, true);
  assertEquals(m.personalHolidayInferred, true);
  // No meetings → not work travel.
  assertEquals(m.workTravelInferred, undefined);
});

// --- D. Post-flight scan (outbound, short/long haul) --------------------

Deno.test("9. Flight today + meeting +3h (short-haul) → workTravelInferred", () => {
  const m = build({
    events: [
      { title: "Flight to NYC", startTime: at(10), endTime: at(12) },
      { title: "Board dinner", startTime: at(15), endTime: at(17) },
    ],
  });
  assertEquals(m.workTravelInferred, true);
});

Deno.test("10. Flight today + meeting +10h (short-haul) → NOT workTravelInferred", () => {
  const m = build({
    events: [
      { title: "Flight to NYC", startTime: at(10), endTime: at(12) },
      { title: "Late dinner", startTime: at(22), endTime: at(23) },
    ],
  });
  assertEquals(m.workTravelInferred, undefined);
});

Deno.test("11. Long-haul land 21:00 + meeting next-day 09:00 → workTravelInferred", () => {
  const m = build({
    timezone: { offsetMinutes: 0, shift48hHours: null, longHaulFlight: { durationHours: 11 } },
    events: [
      { title: "Flight to Tokyo", startTime: at(10), endTime: at(21) },
      { title: "Board meeting", startTime: at(9, 0, 1), endTime: at(11, 0, 1) },
    ],
  });
  assertEquals(m.workTravelInferred, true);
});

// --- E. Mid-trip + return leg -------------------------------------------

Deno.test("12. Mid-trip day: flight 2d ago, shifted TZ, meeting today → workTravelInferred", () => {
  const m = build({
    timezone: { offsetMinutes: 0, shift48hHours: null, shiftedTimezoneToday: true },
    events: [{ title: "Customer review", startTime: at(10), endTime: at(11) }],
    surroundingEvents: [
      { title: "Flight to SF", startTime: at(8, 0, -2), endTime: at(14, 0, -2), dayOffset: -2 },
    ],
  });
  assertEquals(m.workTravelInferred, true);
});

Deno.test("13. Mid-trip day: flight 2d ago, home TZ, return queued, no meetings → silent", () => {
  const m = build({
    timezone: { offsetMinutes: 0, shift48hHours: null, shiftedTimezoneToday: false },
    events: [],
    surroundingEvents: [
      { title: "Flight outbound", startTime: at(8, 0, -2), endTime: at(14, 0, -2), dayOffset: -2 },
      { title: "Flight home", startTime: at(8, 0, 2), endTime: at(14, 0, 2), dayOffset: 2 },
    ],
  });
  assertEquals(m.workTravelInferred, undefined);
});

Deno.test("14. Return leg: flight today + prior work-trip span → workTravelInferred", () => {
  const m = build({
    events: [{ title: "Flight home", startTime: at(15), endTime: at(20) }],
    surroundingEvents: [
      { title: "Flight outbound", startTime: at(8, 0, -3), endTime: at(14, 0, -3), dayOffset: -3 },
      { title: "Board meeting", startTime: at(10, 0, -2), endTime: at(12, 0, -2), dayOffset: -2 },
    ],
  });
  assertEquals(m.workTravelInferred, true);
});

Deno.test("15. Personal flight today, no prior work span, no post-meeting → silent", () => {
  const m = build({
    events: [{ title: "Flight to Lisbon", startTime: at(15), endTime: at(20) }],
    surroundingEvents: [],
  });
  assertEquals(m.workTravelInferred, undefined);
});

// --- F. Half-day PTO + status filters -----------------------------------

Deno.test("16. Half-day PTO (afternoon off + morning meeting) → PTO + meetingPresent", () => {
  const m = build({
    events: [
      { title: "Strategy 1:1", startTime: at(9), endTime: at(10) },
      { title: "Afternoon off", startTime: at(13), endTime: at(18) },
    ],
  });
  assertEquals(m.ptoTodayAllDay, true);
  assertEquals(m.ptoMeetingPresent, true);
});

Deno.test("17. PTO title + only declined meeting → ptoMeetingPresent false", () => {
  const m = build({
    events: [
      { title: "PTO", startTime: at(0), endTime: at(23, 59), isAllDay: true },
      { title: "Old call", startTime: at(10), endTime: at(11), status: "declined" },
    ],
  });
  assertEquals(m.ptoTodayAllDay, true);
  assertEquals(m.ptoMeetingPresent, undefined);
});

Deno.test("18. 4-weekday run but one meeting cancelled → still fires", () => {
  const surrounding = [
    { title: "off", startTime: at(0, 0, -2), dayOffset: -2, isAllDay: true },
    {
      title: "Big review",
      startTime: at(10, 0, -1),
      endTime: at(11, 0, -1),
      dayOffset: -1,
      status: "cancelled" as const,
    },
    { title: "off", startTime: at(0, 0, 1), dayOffset: 1, isAllDay: true },
  ];
  const m = build({ events: [], surroundingEvents: surrounding });
  assertEquals(m.ptoTodayAllDay, true);
});

Deno.test("19. 4-weekday run but one confirmed meeting → does NOT fire", () => {
  const surrounding = [
    { title: "off", startTime: at(0, 0, -2), dayOffset: -2, isAllDay: true },
    { title: "Big review", startTime: at(10, 0, -1), endTime: at(11, 0, -1), dayOffset: -1 },
    { title: "off", startTime: at(0, 0, 1), dayOffset: 1, isAllDay: true },
  ];
  const m = build({ events: [], surroundingEvents: surrounding });
  assertEquals(m.ptoTodayAllDay, undefined);
});

Deno.test("20. No surroundingEvents → pattern paths silent; title path still fires", () => {
  const m = build({
    events: [{ title: "PTO", startTime: at(0), endTime: at(23, 59), isAllDay: true }],
  });
  assertEquals(m.ptoTodayAllDay, true);
  // Pattern-only personal-holiday cannot fire without surroundingEvents — but
  // 'PTO' is not personal-leaning anyway, so this stays undefined.
  assertEquals(m.personalHolidayInferred, undefined);
});

// Silence unused-imports lint where assert isn't called.
void assert;