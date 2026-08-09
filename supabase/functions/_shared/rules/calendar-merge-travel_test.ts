import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  mergeCalendarEvents,
  normalizeForClassify,
  titlesMatch,
} from "./calendar-merge.ts";

const T = (s: string) => normalizeForClassify(s);

const A = "Flight: BA 183 from LHR to JFK";
const B = "Flight to JFK (BA 183)";
const C = "Flight to New York (BA 183)";

Deno.test("flight-number anchor clusters drifting flight titles", () => {
  assertEquals(titlesMatch(T(A), T(B)), true);
  assertEquals(titlesMatch(T(A), T(C)), true);
  assertEquals(titlesMatch(T(B), T(C)), true);
});

Deno.test("different flight numbers never merge", () => {
  assertEquals(titlesMatch(T(A), T("Flight to JFK (BA 117)")), false);
});

Deno.test("non-travel titles keep strict exact matching", () => {
  assertEquals(titlesMatch(T("Board Call"), T("Board Call Prep")), false);
  assertEquals(titlesMatch(T("1:1 with Sam"), T("1:1 with Alex")), false);
});

Deno.test("travel titles without codes merge on high overlap only", () => {
  assertEquals(titlesMatch(T("Flight to New York"), T("Flight to New York City")), true);
  assertEquals(titlesMatch(T("Flight to New York"), T("Flight to Berlin")), false);
});

Deno.test("three iOS copies of one flight merge into one canonical event", () => {
  const start = "2026-08-09T09:00:00.000Z";
  const end = "2026-08-09T17:00:00.000Z";
  const merged = mergeCalendarEvents(
    [
      { id: "1", title: A, startTime: start, endTime: end, provider: "apple" },
      { id: "2", title: B, startTime: "2026-08-09T09:03:00.000Z", endTime: end, provider: "google" },
      { id: "3", title: C, startTime: start, endTime: end, provider: "microsoft" },
    ],
    "ios",
  );
  assertEquals(merged.length, 1);
});

Deno.test("two genuinely different flights stay separate", () => {
  const merged = mergeCalendarEvents(
    [
      { id: "1", title: A, startTime: "2026-08-09T09:00:00.000Z", endTime: "2026-08-09T17:00:00.000Z", provider: "apple" },
      { id: "2", title: "Flight to JFK (BA 117)", startTime: "2026-08-09T09:00:00.000Z", endTime: "2026-08-09T17:00:00.000Z", provider: "google" },
    ],
    "ios",
  );
  assertEquals(merged.length, 2);
});
