import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveDayTypeAndCadence } from "./day-type.ts";

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
