// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Time and Locale domain.
// Source: Part 2 Layer 2 (Section 4.1, Scenarios TL-01 to TL-10).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { timeEngine } from "./engine.ts";

Deno.test("Time Domain: Scenario TL-01 Home GB (England), Saturday", () => {
  // Saturday in London
  const satLondon = new Date("2026-10-24T12:00:00Z");
  const facts = timeEngine.evaluate(
    {
      homeCountry: "GB",
      homeRegion: "England",
      deviceTimezone: "Europe/London",
    },
    satLondon,
  );

  assertEquals(facts.isWeekendDay, true);
  assertEquals(facts.weekendDays, [0, 6]);
  assertEquals(facts.planningDay, 0);
  assertEquals(facts.homeCountry, "GB");
  assertEquals(facts.homeCountryStatus, "declared");
});

Deno.test("Time Domain: Scenario TL-02 Home SA, Friday", () => {
  // Friday in Riyadh
  const friRiyadh = new Date("2026-10-23T12:00:00Z");
  const facts = timeEngine.evaluate(
    {
      homeCountry: "SA",
      deviceTimezone: "Asia/Riyadh",
    },
    friRiyadh,
  );

  assertEquals(facts.isWeekendDay, true);
  assertEquals(facts.weekendDays, [5, 6]);
  assertEquals(facts.planningDay, 6);
});

Deno.test("Time Domain: Scenario TL-03 Home AE, Friday", () => {
  // AE has Mon-Fri workweek with Sat-Sun weekend since 2022
  const friDubai = new Date("2026-10-23T12:00:00Z");
  const facts = timeEngine.evaluate(
    {
      homeCountry: "AE",
      deviceTimezone: "Asia/Dubai",
    },
    friDubai,
  );

  assertEquals(facts.isWeekendDay, false); // Friday is a workday in UAE
  assertEquals(facts.weekendDays, [0, 6]);
});

Deno.test("Time Domain: Scenario TL-04 No home country, timezone maps to single country", () => {
  const facts = timeEngine.evaluate({
    deviceTimezone: "Asia/Tokyo",
  });

  assertEquals(facts.homeCountry, "JP");
  assertEquals(facts.homeCountryStatus, "inferred");
});

Deno.test("Time Domain: Scenario TL-05 No home country, UTC -> homeCountryMissing, US never assumed", () => {
  const facts = timeEngine.evaluate({
    deviceTimezone: "UTC",
  });

  assertEquals(facts.homeCountry, null);
  assertEquals(facts.homeCountryStatus, "missing");
  assertEquals(facts.weekendDays, [0, 6]); // standard fallback
});

Deno.test("Time Domain: Scenario TL-07 Regional holiday (Scotland St Andrew's Day)", () => {
  // Nov 30 in Scotland
  const nov30 = new Date("2026-11-30T10:00:00Z");
  const factsScotland = timeEngine.evaluate(
    {
      homeCountry: "GB",
      homeRegion: "Scotland",
      deviceTimezone: "Europe/London",
    },
    nov30,
  );

  const hasStAndrews = factsScotland.publicHolidays.some((h) => h.name.includes("St Andrew"));
  assertEquals(hasStAndrews, true);

  // England should NOT have St Andrews
  const factsEngland = timeEngine.evaluate(
    {
      homeCountry: "GB",
      homeRegion: "England",
      deviceTimezone: "Europe/London",
    },
    nov30,
  );
  const hasStAndrewsEngland = factsEngland.publicHolidays.some((h) => h.name.includes("St Andrew"));
  assertEquals(hasStAndrewsEngland, false);
});
