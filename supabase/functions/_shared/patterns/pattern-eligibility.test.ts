import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPatternContext,
  composePatternSentence,
  isPatternCitable,
  pickCitablePattern,
} from "./pattern-eligibility.ts";
import type { SubtypePattern365 } from "./subtype-patterns-365.ts";
import {
  buildTravelOccurrences,
  confirmTravelDay,
} from "./travel-occurrences.ts";

function pat(over: Partial<SubtypePattern365> = {}): SubtypePattern365 {
  return {
    matchLevel: "subtype",
    categoryId: "A",
    subtypeId: "gov.board_meeting",
    subcategory: "board_meeting",
    label: "Board meeting",
    measure: "rhr",
    unit: "day",
    n: 4,
    deltaPct: 18.2,
    recoveryDays: null,
    direction: "harm",
    confidence: "emerging",
    lastSeen: "2026-09-02",
    qualifies: true,
    surfaced: true,
    occurrences: [],
    ...over,
  };
}

const ctxToday = (key: string) => ({
  todayKeys: new Set([key.split(":")[0], key]),
  tomorrowKeys: new Set<string>(),
});

Deno.test("2 occurrences is rejected", () => {
  const r = isPatternCitable(pat({ n: 2 }), ctxToday("A:board_meeting"));
  assertEquals(r.ok, false);
  assertEquals(r.reason, "insufficient_occurrences");
});

Deno.test("a pattern missing the latest occurrence is rejected", () => {
  const r = isPatternCitable(pat(), {
    ...ctxToday("A:board_meeting"),
    latestOccurrenceByKey: new Map([["A:board_meeting", "2026-09-20"]]),
  });
  assertEquals(r.ok, false);
  assertEquals(r.reason, "not_up_to_date");
});

Deno.test("a positive pattern is not sent as a reminder", () => {
  const r = isPatternCitable(
    pat({ direction: "recovery", deltaPct: -12 }),
    ctxToday("A:board_meeting"),
  );
  assertEquals(r.ok, false);
  assertEquals(r.reason, "not_negative");
});

Deno.test("travel: rejected 2 days out, accepted evening before and on the day", () => {
  const travel = pat({
    matchLevel: "category",
    categoryId: "G",
    subtypeId: null,
    subcategory: null,
    label: "Travel",
    unit: "trip",
    n: 3,
    deltaPct: 27,
  });
  // two days out — travel appears in neither today nor tomorrow
  assertEquals(
    isPatternCitable(travel, { todayKeys: new Set(), tomorrowKeys: new Set() }).ok,
    false,
  );
  assertEquals(
    isPatternCitable(travel, {
      todayKeys: new Set(),
      tomorrowKeys: new Set(["G"]),
    }).timing,
    "tomorrow",
  );
  assertEquals(
    isPatternCitable(travel, { todayKeys: new Set(["G"]), tomorrowKeys: new Set() })
      .timing,
    "today",
  );
});

Deno.test("board pattern from boards spread over a year is still accepted", () => {
  const r = isPatternCitable(
    pat({ n: 3, lastSeen: "2026-08-01" }),
    {
      todayKeys: new Set(["A", "A:board_meeting"]),
      tomorrowKeys: new Set(),
      latestOccurrenceByKey: new Map([["A:board_meeting", "2026-08-01"]]),
    },
  );
  assertEquals(r.ok, true);
});

Deno.test("a conference pattern is rejected on a day with no conference", () => {
  const conf = pat({
    matchLevel: "category",
    categoryId: "F",
    subtypeId: null,
    subcategory: null,
    label: "Conferences",
    n: 4,
  });
  const r = isPatternCitable(conf, ctxToday("A:board_meeting"));
  assertEquals(r.ok, false);
  assertEquals(r.reason, "wrong_time");
});

Deno.test("copy uses the real occurrence count, past tense", () => {
  const s = composePatternSentence({ pattern: pat({ n: 5 }), timing: "today" });
  assertEquals(s, "Board meeting today. Your last 5 board meetings raised your resting heart rate by 18%.");
});

Deno.test("travel copy names trips and tomorrow", () => {
  const s = composePatternSentence({
    pattern: pat({
      matchLevel: "category",
      categoryId: "G",
      subtypeId: null,
      subcategory: null,
      label: "Travel",
      unit: "trip",
      n: 3,
      deltaPct: 27,
    }),
    timing: "tomorrow",
  });
  assertEquals(s, "Travel tomorrow. Your last 3 trips raised your resting heart rate by 27%.");
});

Deno.test("picker reports why nothing qualified", () => {
  const { chosen, rejections } = pickCitablePattern(
    { generatedAt: "", windowDays: 365, items: [pat({ n: 2 })] },
    ctxToday("A:board_meeting"),
  );
  assertEquals(chosen, null);
  assertEquals(rejections[0].reason, "insufficient_occurrences");
});

Deno.test("buildPatternContext derives both key levels", () => {
  const c = buildPatternContext(
    [{ categoryId: "A", subcategory: "board_meeting" }],
    [{ categoryId: "G", subcategory: "flight" }],
  );
  assert(c.todayKeys.has("A:board_meeting"));
  assert(c.tomorrowKeys.has("G"));
});

// ── Travel confirmation ladder ────────────────────────────────────────────

Deno.test("title that looks like a flight, location at home: not travel", () => {
  const v = confirmTravelDay("2026-09-29", { date: "2026-09-29", maxDistanceKm: 1 }, [
    { date: "2026-09-29", kind: "conference_title", title: "First Flight Innovation Forum" },
  ]);
  assertEquals(v.travel, false);
});

Deno.test("invite 200km away, attended online with location at home: not travel", () => {
  const v = confirmTravelDay("2026-09-10", { date: "2026-09-10", maxDistanceKm: 2 }, [
    { date: "2026-09-10", kind: "invite_address", title: "Summit, Manchester" },
  ]);
  assertEquals(v.travel, false);
  assertEquals(v.reason, "location-within-home-radius");
});

Deno.test("flight entry with location abroad: travel", () => {
  const v = confirmTravelDay("2026-08-09", { date: "2026-08-09", maxDistanceKm: 5500 }, [
    { date: "2026-08-09", kind: "flight", title: "Flight to New York" },
  ]);
  assertEquals(v.travel, true);
  assertEquals(v.source, "location_confirmed");
});

Deno.test("no calendar entry, 80km from home: travel detected by location", () => {
  const v = confirmTravelDay("2026-09-01", { date: "2026-09-01", maxDistanceKm: 80 }, []);
  assertEquals(v.travel, true);
  assertEquals(v.source, "location_detected");
});

Deno.test("flight entry with no location data counts", () => {
  const v = confirmTravelDay("2026-08-15", null, [
    { date: "2026-08-15", kind: "flight", title: "BA183" },
  ]);
  assertEquals(v.travel, true);
  assertEquals(v.source, "calendar_only");
});

Deno.test("conference-only evidence with no location never counts", () => {
  const v = confirmTravelDay("2026-09-17", null, [
    { date: "2026-09-17", kind: "conference_title", title: "The AI:ROI Conference" },
  ]);
  assertEquals(v.travel, false);
  assertEquals(v.reason, "conference-title-only-not-travel");
});

Deno.test("trips group by window and carry history forward", () => {
  const { days, trips } = buildTravelOccurrences({
    locationDays: [
      { date: "2026-08-09", maxDistanceKm: 5500 },
      { date: "2026-08-15", maxDistanceKm: 5400 },
      { date: "2026-08-17", maxDistanceKm: 300 },
      { date: "2026-09-17", maxDistanceKm: 3 },
    ],
    calendarEvidence: [
      { date: "2026-09-17", kind: "conference_title", title: "The AI:ROI Conference" },
    ],
    carriedForwardDays: [
      {
        date: "2026-07-02",
        travel: true,
        source: "calendar_only",
        reason: "carried",
        titles: [],
      },
    ],
  });
  assertEquals(trips.length, 2); // carried-forward July trip + the August trip
  assertEquals(trips[1].start, "2026-08-09");
  assertEquals(trips[1].end, "2026-08-17");
  assertEquals(trips[1].days, 3);
  assert(!days.find((d) => d.date === "2026-09-17")!.travel);
});
