// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Conference domain.
// Source: Part 2 Layer 2 (Section 4.4, Scenarios CF-01 to CF-13).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { conferenceEngine } from "./engine.ts";
import { toCanonicalCalendarItem } from "../calendar/canonical.ts";
import type { ClassificationStamp } from "../events/types.ts";

function createMockStamp(itemId: string, category: "F" | "C" | "E" | "I" | "A", subtype: string): ClassificationStamp {
  return {
    itemId,
    sourceType: "calendar",
    category,
    categoryConfidence: 0.95,
    subtype: subtype as any,
    subtypeConfidence: 0.95,
    bestCandidateSubtype: null,
    confirmationState: "confirmed",
    decisionSource: "provider_label",
    runnerUp: null,
    reasons: ["Mocked stamp"],
    findings: [],
    dimensions: { stakes: "low", travelRelated: false, workContext: "work", durationMinutes: 240 },
    itemDemand: null,
    taxonomyVersion: "1.0",
    classifierVersion: "1.0",
    classifiedAt: "2026-10-24T00:00:00Z",
  };
}

Deno.test("Conference Domain: Scenario CF-01 Three-day summit in home city, day 2, attending", () => {
  const summitItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: {
      id: "summit_1",
      title: "Global Tech Summit Day 2",
      all_day: true,
      startTime: "2026-10-24T00:00:00Z",
      endTime: "2026-10-24T23:59:59Z",
    },
    provenance: { source: "calendar", traceId: "t1" },
  });

  const stamps = [createMockStamp("summit_1", "F", "conf.customer_summit")];

  const facts = conferenceEngine.evaluate({
    localDate: "2026-10-24",
    items: [summitItem],
    stamps,
    isTravellingAway: false,
    activeConferenceSpan: {
      startDate: "2026-10-23",
      endDate: "2026-10-25",
    },
  });

  assertEquals(facts.isConferenceDay, true);
  assertEquals(facts.dayNumber, 2);
  assertEquals(facts.totalDays, 3);
  assertEquals(facts.role, "attending");
  assertEquals(facts.place, "in_town");
  assertEquals(facts.travelRelated, false);
});

Deno.test("Conference Domain: Scenario CF-02 Summit with keynote today -> speaking", () => {
  const keynoteItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: {
      id: "keynote_1",
      title: "Opening Keynote Presentation",
      all_day: false,
      startTime: "2026-10-24T09:00:00Z",
      endTime: "2026-10-24T10:00:00Z",
    },
    provenance: { source: "calendar", traceId: "t1" },
  });

  const stamps = [createMockStamp("keynote_1", "C", "conf.keynote")];

  const facts = conferenceEngine.evaluate({
    localDate: "2026-10-24",
    items: [keynoteItem],
    stamps,
    userDayTags: ["conference"],
  });

  assertEquals(facts.isConferenceDay, true);
  assertEquals(facts.role, "speaking");
});

Deno.test("Conference Domain: Scenario CF-04 45-min panel, no summit, speaker -> Standalone speaking", () => {
  const panelItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: {
      id: "panel_1",
      title: "AI Founders Panel (Speaker)",
      all_day: false,
      startTime: "2026-10-24T14:00:00Z",
      endTime: "2026-10-24T14:45:00Z", // 45 min
    },
    provenance: { source: "calendar", traceId: "t1" },
  });

  const stamps = [createMockStamp("panel_1", "C", "vis.roundtable")];

  const facts = conferenceEngine.evaluate({
    localDate: "2026-10-24",
    items: [panelItem],
    stamps,
  });

  assertEquals(facts.isConferenceDay, false); // not 240m or all-day
  assertEquals(facts.role, "speaking");
  assertEquals(facts.standaloneSpeaking, true);
});

Deno.test("Conference Domain: Scenario CF-08 Day after 3-day summit -> reentryDay", () => {
  const facts = conferenceEngine.evaluate({
    localDate: "2026-10-26",
    items: [],
    stamps: [],
    yesterdayWasMultiDayConferenceEnd: true,
    activeConferenceSpan: {
      startDate: "2026-10-23",
      endDate: "2026-10-25",
    },
  });

  assertEquals(facts.reentryDay, true);
});
