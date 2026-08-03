import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { TZ_TO_COUNTRY, tzToCountry, tzOffsetDiffHours } from "./tz-to-country.ts";

Deno.test("tzToCountry maps known zones", () => {
  assertEquals(tzToCountry("Europe/London"), "GB");
  assertEquals(tzToCountry("America/New_York"), "US");
});

Deno.test("tzToCountry covers Gulf + Israel", () => {
  assertEquals(tzToCountry("Asia/Riyadh"), "SA");
  assertEquals(tzToCountry("Asia/Kuwait"), "KW");
  assertEquals(tzToCountry("Asia/Qatar"), "QA");
  assertEquals(tzToCountry("Asia/Bahrain"), "BH");
  assertEquals(tzToCountry("Asia/Muscat"), "OM");
  assertEquals(tzToCountry("Asia/Jerusalem"), "IL");
  assertEquals(tzToCountry("Asia/Dubai"), "AE");
});

Deno.test("tzToCountry returns null for unknown/empty", () => {
  assertEquals(tzToCountry("Mars/Olympus"), null);
  assertEquals(tzToCountry(null), null);
  assertEquals(tzToCountry(undefined), null);
  assertEquals(tzToCountry(""), null);
});

Deno.test("TZ_TO_COUNTRY values are ISO-2 uppercase", () => {
  for (const [tz, cc] of Object.entries(TZ_TO_COUNTRY)) {
    assertEquals(/^[A-Z]{2}$/.test(cc), true, `${tz} -> ${cc}`);
  }
});

Deno.test("tzOffsetDiffHours London vs Dubai in January is 4", () => {
  const jan = Date.UTC(2026, 0, 15, 12);
  assertEquals(tzOffsetDiffHours("Europe/London", "Asia/Dubai", jan), 4);
  assertEquals(tzOffsetDiffHours("Europe/London", "Europe/London", jan), 0);
});
