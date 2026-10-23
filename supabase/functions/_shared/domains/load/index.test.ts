// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Load domain.
// Source: Part 2 Layer 2 (Section 4.5, Scenarios LD-01 to LD-22).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadEngine } from "./engine.ts";
import { toCanonicalCalendarItem } from "../calendar/canonical.ts";
import type { AvailabilityFacts } from "../availability/types.ts";
import type { ClassificationStamp } from "../events/types.ts";

function mockAvailability(frame: AvailabilityFacts["frame"] = "workday"): AvailabilityFacts {
  return {
    frame,
    isWorkingDay: frame === "workday",
    leave: null,
    publicHoliday: null,
    longWeekend: null,
    runPosition: null,
    possibleLeave: false,
  };
}

function mockStamp(itemId: string, category: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J", stakes: "low" | "medium" | "high" = "medium", cognitive = 1): ClassificationStamp {
  return {
    itemId,
    sourceType: "calendar",
    category,
    categoryConfidence: 0.9,
    subtype: null,
    subtypeConfidence: 0,
    bestCandidateSubtype: null,
    confirmationState: "confirmed",
    decisionSource: "provider_label",
    runnerUp: null,
    reasons: ["Mocked"],
    findings: [],
    dimensions: { stakes, travelRelated: category === "G", workContext: category === "H" ? "personal" : "work", durationMinutes: 60 },
    itemDemand: {
      demandProfile: {
        cognitive,
        emotional: 1,
        visibility: 1,
        political: 1,
        relational: 1,
        energy: 1,
        circadian: 1,
        switchCost: 1,
        arousal: 1,
        identity: 1,
      },
      arousal: 1,
      switchCost: 1,
      recoveryMinutes: 15,
    },
    taxonomyVersion: "1.0",
    classifierVersion: "1.0",
    classifiedAt: "2026-10-24T00:00:00Z",
  };
}

Deno.test("Load Domain: Scenario LD-01 Working day, no meetings -> Light (open day)", () => {
  const facts = loadEngine.evaluate({
    items: [],
    stamps: [],
    availability: mockAvailability("workday"),
  });

  assertEquals(facts.level, "light");
  assertEquals(facts.reasons.includes("open_day"), true);
});

Deno.test("Load Domain: Scenario LD-03 One board meeting, nothing else -> High-stakes day, recoveryOwed", () => {
  const boardItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "board_1", title: "Board Meeting" },
    provenance: { source: "calendar", traceId: "t1" },
  });

  const facts = loadEngine.evaluate({
    items: [boardItem],
    stamps: [mockStamp("board_1", "A", "high", 3)],
    availability: mockAvailability("workday"),
  });

  assertEquals(facts.highStakesAnchor?.title, "Board Meeting");
  assertEquals(facts.recoveryOwed, true);
});

Deno.test("Load Domain: Scenario LD-05 Three meetings with 10-minute gaps -> Heavy (volume)", () => {
  const m1 = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "m1", title: "Sync 1", startTime: "2026-10-24T09:00:00Z", endTime: "2026-10-24T09:30:00Z" },
    provenance: { source: "calendar", traceId: "t1" },
  });
  const m2 = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "m2", title: "Sync 2", startTime: "2026-10-24T09:40:00Z", endTime: "2026-10-24T10:10:00Z" }, // 10 min gap
    provenance: { source: "calendar", traceId: "t2" },
  });
  const m3 = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "m3", title: "Sync 3", startTime: "2026-10-24T10:20:00Z", endTime: "2026-10-24T10:50:00Z" }, // 10 min gap
    provenance: { source: "calendar", traceId: "t3" },
  });

  const facts = loadEngine.evaluate({
    items: [m1, m2, m3],
    stamps: [mockStamp("m1", "I"), mockStamp("m2", "I"), mockStamp("m3", "I")],
    availability: mockAvailability("workday"),
  });

  assertEquals(facts.level, "heavy");
  assertEquals(facts.reasons.includes("volume"), true);
});

Deno.test("Load Domain: Scenario LD-07 Two strategy decision meetings (high cognitive demand) -> Heavy (decision)", () => {
  const s1 = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "s1", title: "Strategy Decision 1" },
    provenance: { source: "calendar", traceId: "t1" },
  });
  const s2 = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "s2", title: "Strategy Decision 2" },
    provenance: { source: "calendar", traceId: "t2" },
  });

  const facts = loadEngine.evaluate({
    items: [s1, s2],
    stamps: [mockStamp("s1", "E", "medium", 3), mockStamp("s2", "E", "medium", 3)],
    availability: mockAvailability("workday"),
  });

  assertEquals(facts.level, "heavy");
  assertEquals(facts.reasons.includes("decision"), true);
  assertEquals(facts.decisionHeavy, true);
});

Deno.test("Load Domain: Scenario LD-18 Saturday, 3 client meetings -> Weekend · working weekend; recoveryOwed", () => {
  const c1 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "c1", title: "Client 1" }, provenance: { source: "calendar", traceId: "t1" } });
  const c2 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "c2", title: "Client 2" }, provenance: { source: "calendar", traceId: "t2" } });
  const c3 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "c3", title: "Client 3" }, provenance: { source: "calendar", traceId: "t3" } });

  const facts = loadEngine.evaluate({
    items: [c1, c2, c3],
    stamps: [mockStamp("c1", "B"), mockStamp("c2", "B"), mockStamp("c3", "B")],
    availability: mockAvailability("weekend"),
  });

  assertEquals(facts.workOnNonWorkingDay?.active, true);
  assertEquals(facts.workOnNonWorkingDay?.isFullWorkingDay, true);
  assertEquals(facts.workOnNonWorkingDay?.label, "Working weekend");
  assertEquals(facts.recoveryOwed, true);
});
