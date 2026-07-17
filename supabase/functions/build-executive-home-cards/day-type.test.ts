import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDayTypeAndCadence } from "./day-type.ts";

// -----------------------------------------------------------------------------
// Workstream 2 regression tests for the Availability SSOT → day-type resolver.
//
// Every case below asserts that `resolveDayTypeAndCadence` correctly routes
// its inputs through `classifyAvailability` / `classifyDay` (the SSOT). If a
// future edit reintroduces bespoke PTO / weekend / regional-holiday logic
// inside day-type.ts, one of these will fail.
// -----------------------------------------------------------------------------

const LDN = "Europe/London";
const NYC = "America/New_York";

// Helper: single all-day event
const allDay = (title: string, date: string, extra: Record<string, unknown> = {}) => ({
  title,
  start_time: `${date}T00:00:00Z`,
  end_time: `${date}T23:59:59Z`,
  is_all_day: true,
  ...extra,
});

// Helper: timed meeting w/ attendees
const meeting = (title: string, date: string, hour: number) => ({
  title,
  start_time: `${date}T${String(hour).padStart(2, "0")}:00:00Z`,
  end_time: `${date}T${String(hour + 1).padStart(2, "0")}:00:00Z`,
  attendees_count: 3,
});

Deno.test("day-type uses availability SSOT for foreign vs applicable regional holidays", () => {
  const monday = new Date("2026-01-05T09:00:00Z");

  const foreignHoliday = resolveDayTypeAndCadence({
    effectiveTimezone: "Europe/London",
    now: monday,
    userHomeCountry: "GB-ENG",
    todayEvents: [
      {
        title: "Bank Holiday (N Ireland)",
        start_time: "2026-01-05T00:00:00Z",
        end_time: "2026-01-06T00:00:00Z",
        is_all_day: true,
      },
    ],
    tomorrowEvents: [],
    travel: null,
    consecutiveOffDaysBefore: 0,
  });

  assertEquals(foreignHoliday.dayType, "light_day");
  assertEquals(Array.from(foreignHoliday.allowedWindows), ["morning", "evening"]);

  const applicableHoliday = resolveDayTypeAndCadence({
    effectiveTimezone: "Europe/London",
    now: monday,
    userHomeCountry: "GB-ENG",
    todayEvents: [
      {
        title: "Bank Holiday (England & Wales)",
        start_time: "2026-01-05T00:00:00Z",
        end_time: "2026-01-06T00:00:00Z",
        is_all_day: true,
      },
    ],
    tomorrowEvents: [],
    travel: null,
    consecutiveOffDaysBefore: 0,
  });

  assertEquals(applicableHoliday.dayType, "week_ahead");
  assertEquals(Array.from(applicableHoliday.allowedWindows), ["morning", "evening"]);
});

Deno.test("day-type keeps work-evidence override over applicable holidays", () => {
  const monday = new Date("2026-01-05T09:00:00Z");

  const decision = resolveDayTypeAndCadence({
    effectiveTimezone: "Europe/London",
    now: monday,
    userHomeCountry: "GB-ENG",
    todayEvents: [
      {
        title: "Bank Holiday (England & Wales)",
        start_time: "2026-01-05T00:00:00Z",
        end_time: "2026-01-06T00:00:00Z",
        is_all_day: true,
      },
      {
        title: "Board prep",
        start_time: "2026-01-05T09:00:00Z",
        end_time: "2026-01-05T10:00:00Z",
        attendees_count: 3,
      },
      {
        title: "Client review",
        start_time: "2026-01-05T11:00:00Z",
        end_time: "2026-01-05T12:00:00Z",
        attendees_count: 2,
      },
    ],
    tomorrowEvents: [],
    travel: null,
    consecutiveOffDaysBefore: 0,
  });

  assertEquals(decision.dayType, "workday");
  assertEquals(Array.from(decision.allowedWindows), ["morning", "afternoon", "evening"]);
});

// ---- W2 REGRESSION TESTS ---------------------------------------------------

Deno.test("W2: GB umbrella country + FYI 'Holidays in United Kingdom' feed → week_ahead", () => {
  // A user whose profile.country is bare "GB" should still resolve regional
  // FYI holiday feeds correctly via the SSOT GB umbrella match.
  const monday = new Date("2026-01-05T09:00:00Z");
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: monday,
    userHomeCountry: "GB",
    todayEvents: [
      allDay("Christmas Day", "2026-01-05", { source: "Holidays in United Kingdom" }),
    ],
    tomorrowEvents: [],
    travel: null,
  });
  assertEquals(d.dayType, "week_ahead");
  assertEquals(Array.from(d.allowedWindows), ["morning", "evening"]);
});

Deno.test("W2: userCurrentCountry overrides userHomeCountry for regional applicability", () => {
  // Home GB-ENG, currently in US: an England-only bank holiday is NOT
  // applicable in the user's current locale, so it should not be treated as
  // a public holiday. Expect a normal light_day (no work meetings).
  const monday = new Date("2026-01-05T09:00:00Z");
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: monday,
    userHomeCountry: "GB-ENG",
    userCurrentCountry: "US",
    todayEvents: [allDay("Bank Holiday (England & Wales)", "2026-01-05")],
    tomorrowEvents: [],
    travel: null,
  });
  assertEquals(d.dayType, "light_day");
});

Deno.test("W2: all-day PTO with a real meeting → pto_with_meeting (morning + afternoon)", () => {
  const monday = new Date("2026-01-05T09:00:00Z");
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: monday,
    userHomeCountry: "GB-ENG",
    todayEvents: [
      allDay("PTO", "2026-01-05"),
      meeting("Investor call", "2026-01-05", 10),
    ],
    tomorrowEvents: [],
    travel: null,
  });
  assertEquals(d.dayType, "pto_with_meeting");
  assertEquals(Array.from(d.allowedWindows), ["morning", "afternoon"]);
});

Deno.test("W2: Saturday with no meetings → weekend_saturday (morning + evening)", () => {
  const saturday = new Date("2026-01-03T09:00:00Z"); // Sat in Europe/London
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: saturday,
    userHomeCountry: "GB-ENG",
    todayEvents: [],
    tomorrowEvents: [],
    travel: null,
  });
  assertEquals(d.dayType, "weekend_saturday");
  assertEquals(Array.from(d.allowedWindows), ["morning", "evening"]);
});

Deno.test("W2: Sunday with no meetings → weekend_sunday (morning + evening, week-ahead reason)", () => {
  const sunday = new Date("2026-01-04T09:00:00Z"); // Sun in Europe/London
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: sunday,
    userHomeCountry: "GB-ENG",
    todayEvents: [],
    tomorrowEvents: [],
    travel: null,
  });
  assertEquals(d.dayType, "weekend_sunday");
  assertEquals(d.weekAheadReason, "sunday");
  assertEquals(Array.from(d.allowedWindows), ["morning", "evening"]);
});

Deno.test("W2: Weekday with no meetings → light_day (morning + evening)", () => {
  const tuesday = new Date("2026-01-06T09:00:00Z");
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: tuesday,
    userHomeCountry: "GB-ENG",
    todayEvents: [],
    tomorrowEvents: [],
    travel: null,
  });
  assertEquals(d.dayType, "light_day");
  assertEquals(Array.from(d.allowedWindows), ["morning", "evening"]);
});

Deno.test("W2: Tomorrow is applicable public holiday → today becomes week_ahead", () => {
  // Today = ordinary Monday, tomorrow = applicable bank holiday for GB-ENG.
  // Week-ahead should fire so the user gets tomorrow-framing tonight.
  const monday = new Date("2026-01-05T18:00:00Z");
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: monday,
    userHomeCountry: "GB-ENG",
    todayEvents: [],
    tomorrowEvents: [allDay("Bank Holiday (England & Wales)", "2026-01-06")],
    travel: null,
  });
  assertEquals(d.dayType, "week_ahead");
  assertEquals(d.weekAheadReason, "last_day_before_holiday");
  assertEquals(Array.from(d.allowedWindows), ["morning", "evening"]);
});

Deno.test("W2: No country configured + regional-qualified holiday → NOT applicable", () => {
  // With null userHomeCountry, the SSOT cannot match the region qualifier.
  // The all-day event is not applicable and there are no real meetings, so
  // we land on light_day (weekday, empty workload).
  const monday = new Date("2026-01-05T09:00:00Z");
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: LDN,
    now: monday,
    userHomeCountry: null,
    todayEvents: [allDay("Bank Holiday (England & Wales)", "2026-01-05")],
    tomorrowEvents: [],
    travel: null,
  });
  assertEquals(d.dayType, "light_day");
});

Deno.test("W2: Timezone boundary — UTC-late Sunday but Asia/Tokyo Monday morning → weekday", () => {
  // 2026-01-04 22:00 UTC = 2026-01-05 07:00 Tokyo (Monday). Effective-tz
  // resolution must treat this as a Monday, not a Sunday weekend surface.
  const now = new Date("2026-01-04T22:00:00Z");
  const d = resolveDayTypeAndCadence({
    effectiveTimezone: "Asia/Tokyo",
    now,
    userHomeCountry: "JP",
    todayEvents: [],
    tomorrowEvents: [],
    travel: null,
  });
  // Monday, no meetings → light_day, NOT weekend_sunday.
  assertEquals(d.dayType, "light_day");
});
