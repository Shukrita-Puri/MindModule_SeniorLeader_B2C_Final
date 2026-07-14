/**
 * Consolidation regression test — proves every availability primitive is
 * exported from a SINGLE file and produces the expected values. If this
 * test fails, the SSOT split into multiple files by accident.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PTO_TITLE_RX,
  PERSONAL_HOLIDAY_TITLE_RX,
  parseHolidayRegionFromTitle,
  isFyiHolidayCalendar,
  matchesUserCountry,
  isApplicableHoliday,
  classifyDay,
  classifyAvailability,
  type RegionToken,
} from "./availability-classifier.ts";

Deno.test("SSOT — PTO_TITLE_RX matches an obvious PTO title", () => {
  assert(PTO_TITLE_RX.test("On PTO"));
  assert(PTO_TITLE_RX.test("Annual leave"));
  assert(!PTO_TITLE_RX.test("1:1 with Ada"));
});

Deno.test("SSOT — PERSONAL_HOLIDAY_TITLE_RX excludes plain PTO/OOO", () => {
  assert(PERSONAL_HOLIDAY_TITLE_RX.test("Vacation"));
  assert(!PERSONAL_HOLIDAY_TITLE_RX.test("OOO"));
});

Deno.test("SSOT — N. Ireland qualifier NOT applicable for GB-ENG user", () => {
  const r = isApplicableHoliday(
    { title: "Bank Holiday (N Ireland)", isAllDay: true },
    "GB-ENG",
  );
  assertEquals(r.applicable, false);
  assertEquals(r.region as RegionToken, "GB-NIR");
});

Deno.test("SSOT — England & Wales qualifier applicable for GB-ENG user", () => {
  const r = isApplicableHoliday(
    { title: "Bank Holiday (England & Wales)", isAllDay: true },
    "GB-ENG",
  );
  assertEquals(r.applicable, true);
});

Deno.test("SSOT — FYI 'Holidays in United Kingdom' feed applicable for GB user", () => {
  const r = isApplicableHoliday(
    {
      title: "Christmas Day",
      isAllDay: true,
      source: "Holidays in United Kingdom",
    },
    "GB",
  );
  assertEquals(r.applicable, true);
});

Deno.test("SSOT — FYI foreign feed NOT applicable for GB user", () => {
  const r = isApplicableHoliday(
    {
      title: "Independence Day",
      isAllDay: true,
      source: "Holidays in United States",
    },
    "GB",
  );
  assertEquals(r.applicable, false);
});

Deno.test("SSOT — classifyDay on empty weekday → isOffDay=false", () => {
  const MONDAY = new Date("2026-07-13T09:00:00");
  const r = classifyDay({ now: MONDAY, events: [] });
  assertEquals(r.isOffDay, false);
});

Deno.test("SSOT — classifyDay on Saturday → isOffDay=true", () => {
  const SAT = new Date("2026-07-18T09:00:00");
  const r = classifyDay({ now: SAT, events: [] });
  assertEquals(r.isOffDay, true);
  assertEquals(r.state, "REST_DAY");
});

Deno.test("SSOT — helpers agree with classifier envelope", () => {
  assertEquals(parseHolidayRegionFromTitle("Bank Holiday (Scotland)"), "GB-SCT");
  assert(isFyiHolidayCalendar({ source: "Holidays in United Kingdom" }));
  assert(matchesUserCountry("GB", "GB-ENG"));
  // Sanity-check classifyAvailability still produces the standard result.
  const r = classifyAvailability({
    now: new Date("2026-07-13T09:00:00"),
    userHomeCountry: "GB-ENG",
    events: [],
  });
  assert(r.state === "LIGHT_ROUTINE" || r.state === "WORKDAY");
});