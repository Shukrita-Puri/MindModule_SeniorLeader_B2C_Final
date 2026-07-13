import {
  assertEquals,
  assert,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyAvailability,
  classifyHasRestSignals,
  type AvailabilityEvent,
} from "./availability-classifier.ts";

// Fixed Monday & Saturday reference dates in local time.
const MONDAY = new Date("2026-07-13T09:00:00");   // Monday
const SATURDAY = new Date("2026-07-18T09:00:00"); // Saturday

function mkTimedMeeting(title: string, hour = 10): AvailabilityEvent {
  return {
    title,
    startTime: new Date(2026, 6, 13, hour).toISOString(),
    endTime: new Date(2026, 6, 13, hour + 1).toISOString(),
    isAllDay: false,
    isOrganizer: true,
    attendeesCount: 3,
  };
}
function mkAllDay(title: string, extra: Partial<AvailabilityEvent> = {}): AvailabilityEvent {
  return {
    title,
    startTime: new Date(2026, 6, 13).toISOString(),
    endTime: new Date(2026, 6, 14).toISOString(),
    isAllDay: true,
    ...extra,
  };
}

Deno.test("1. Monday empty calendar → LIGHT_ROUTINE, not rest", () => {
  const r = classifyAvailability({ now: MONDAY, events: [] });
  assertEquals(r.state, "LIGHT_ROUTINE");
  assertEquals(r.isRestDay, false);
});

Deno.test("2. Monday, Bank Holiday (N Ireland) all-day, user in GB-ENG → WORKDAY", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB-ENG",
    events: [mkAllDay("Bank Holiday (N Ireland)")],
  });
  assertEquals(r.isRestDay, false);
  // With zero work meetings on an empty day → LIGHT_ROUTINE workload
  // (still a workday, not rest).
  assert(r.state === "LIGHT_ROUTINE" || r.state === "WORKDAY", r.state);
  assertEquals(r.holiday.detected, true);
  assertEquals(r.holiday.applicable, false);
});

Deno.test("3. Applicable England Bank Holiday for GB-ENG user → PUBLIC_HOLIDAY", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB-ENG",
    events: [mkAllDay("Bank Holiday (England & Wales)")],
  });
  assertEquals(r.state, "PUBLIC_HOLIDAY");
  assertEquals(r.isRestDay, true);
});

Deno.test("4. explicitPto with no meetings → PTO", () => {
  const r = classifyAvailability({ now: MONDAY, events: [], explicitPto: true });
  assertEquals(r.state, "PTO");
  assertEquals(r.isRestDay, true);
});

Deno.test("5. Saturday, no meetings → REST_DAY", () => {
  const r = classifyAvailability({ now: SATURDAY, events: [] });
  assertEquals(r.state, "REST_DAY");
  assertEquals(r.isRestDay, true);
});

Deno.test("6. Timed 'Holiday Lunch' only → not a rest day", () => {
  const r = classifyAvailability({
    now: MONDAY,
    events: [{
      title: "Holiday Lunch",
      startTime: new Date(2026, 6, 13, 12).toISOString(),
      endTime: new Date(2026, 6, 13, 13).toISOString(),
      isAllDay: false,
      attendeesCount: 0,
    }],
  });
  assertEquals(r.isRestDay, false);
});

Deno.test("7. Planner boundary: empty weekday → hasRestSignals=false", () => {
  assertEquals(
    classifyHasRestSignals({ now: MONDAY, events: [], calendarLoad: "low" }),
    false,
  );
});

Deno.test("8. Saturday with 3 client meetings → WORKDAY (override)", () => {
  const r = classifyAvailability({
    now: SATURDAY,
    events: [mkTimedMeeting("Client review"), mkTimedMeeting("Board sync", 11), mkTimedMeeting("1:1", 14)],
  });
  assertEquals(r.state, "WORKDAY");
  assertEquals(r.isRestDay, false);
});

Deno.test("9. explicitPto + 3 work meetings → WORKDAY (work evidence overrides)", () => {
  const r = classifyAvailability({
    now: MONDAY,
    explicitPto: true,
    events: [mkTimedMeeting("A"), mkTimedMeeting("B", 11), mkTimedMeeting("C", 14)],
  });
  assertEquals(r.state, "WORKDAY");
});

Deno.test("10. Applicable holiday + 3 work meetings → WORKDAY", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB-ENG",
    events: [
      mkAllDay("Bank Holiday (England & Wales)"),
      mkTimedMeeting("Client A"),
      mkTimedMeeting("Client B", 11),
      mkTimedMeeting("Client C", 14),
    ],
  });
  assertEquals(r.state, "WORKDAY");
});

Deno.test("11. Travel-for-work: home-region holiday + 3 meetings → WORKDAY", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB-ENG",
    userCurrentCountry: "US",
    events: [
      mkAllDay("Bank Holiday (England & Wales)"),
      mkTimedMeeting("Client A"),
      mkTimedMeeting("Client B", 11),
      mkTimedMeeting("Client C", 14),
    ],
  });
  assertEquals(r.state, "WORKDAY");
});

Deno.test("12. Travel + explicitPto, no meetings → PTO (travel never overrides PTO)", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB-ENG",
    userCurrentCountry: "US",
    explicitPto: true,
    events: [],
  });
  assertEquals(r.state, "PTO");
});

Deno.test("13. userCurrentCountry differs: home holiday no longer applicable", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB-ENG",
    userCurrentCountry: "US",
    events: [mkAllDay("Bank Holiday (England & Wales)")],
  });
  assertEquals(r.isRestDay, false);
  assertEquals(r.holiday.applicable, false);
});

Deno.test("FYI subscription calendar: Holidays in United Kingdom for GB user → applicable", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB",
    events: [mkAllDay("Christmas Day", { source: "Holidays in United Kingdom" })],
  });
  assertEquals(r.state, "PUBLIC_HOLIDAY");
});

Deno.test("FYI subscription calendar: Holidays in United States for GB user → ignored", () => {
  const r = classifyAvailability({
    now: MONDAY,
    userHomeCountry: "GB",
    events: [mkAllDay("Independence Day", { source: "Holidays in United States" })],
  });
  assertEquals(r.isRestDay, false);
});