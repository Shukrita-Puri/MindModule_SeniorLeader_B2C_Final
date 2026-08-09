import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isAllDayEvent, isLoadBearingEvent } from "./db-queries.ts";

const ev = (title: string, startTime: string, endTime: string) => ({
  title,
  start_time: startTime,
  end_time: endTime,
});

Deno.test("category G travel is excluded from the load count", () => {
  assertEquals(
    isLoadBearingEvent(ev("Flight to New York (BA 183)", "2026-08-09T09:00:00Z", "2026-08-09T17:00:00Z")),
    false,
  );
  assertEquals(
    isLoadBearingEvent(ev("Airport transfer to LHR", "2026-08-09T06:00:00Z", "2026-08-09T07:00:00Z")),
    false,
  );
});

Deno.test("public holidays are excluded", () => {
  assertEquals(
    isLoadBearingEvent(ev("Bank Holiday", "2026-08-31T00:00:00Z", "2026-09-01T00:00:00Z")),
    false,
  );
});

Deno.test("all-day personal-rhythm blocks are excluded, timed ones are not judged all-day", () => {
  const hotel = ev("Hotel: The Standard", "2026-08-09T00:00:00Z", "2026-08-10T00:00:00Z");
  assertEquals(isAllDayEvent(hotel), true);
  assertEquals(isLoadBearingEvent(hotel), false);
});

Deno.test("real meetings still count", () => {
  assertEquals(
    isLoadBearingEvent(ev("Board Call", "2026-08-10T09:00:00Z", "2026-08-10T10:00:00Z")),
    true,
  );
  assertEquals(
    isLoadBearingEvent(ev("Investor update with Sequoia", "2026-08-10T13:00:00Z", "2026-08-10T14:00:00Z")),
    true,
  );
});
