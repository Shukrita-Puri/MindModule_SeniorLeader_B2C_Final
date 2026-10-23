// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Mix domain.
// Source: Part 2 Layer 2 (Section 4.6, Scenarios MX-01 to MX-12).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mixEngine } from "./engine.ts";
import { toCanonicalCalendarItem } from "../calendar/canonical.ts";
import type { ClassificationStamp } from "../events/types.ts";

function mockStamp(itemId: string, category: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J", subtype?: string): ClassificationStamp {
  return {
    itemId,
    sourceType: "calendar",
    category,
    categoryConfidence: 0.9,
    subtype: (subtype ?? null) as any,
    subtypeConfidence: subtype ? 0.9 : 0,
    bestCandidateSubtype: null,
    confirmationState: "confirmed",
    decisionSource: "provider_label",
    runnerUp: null,
    reasons: [],
    findings: [],
    dimensions: { stakes: "medium", travelRelated: false, workContext: "work", durationMinutes: 60 },
    itemDemand: null,
    taxonomyVersion: "1.0",
    classifierVersion: "1.0",
    classifiedAt: "2026-10-24T00:00:00Z",
  };
}

Deno.test("Mix Domain: Scenario MX-01 Three board meetings + 1 routine sync -> Predominant A (board day)", () => {
  const m1 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m1", title: "Board 1" }, provenance: { source: "c", traceId: "t" } });
  const m2 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m2", title: "Board 2" }, provenance: { source: "c", traceId: "t" } });
  const m3 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m3", title: "Board 3" }, provenance: { source: "c", traceId: "t" } });
  const m4 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m4", title: "Sync" }, provenance: { source: "c", traceId: "t" } });

  const facts = mixEngine.evaluate({
    workMeetings: [m1, m2, m3, m4],
    stamps: [mockStamp("m1", "A"), mockStamp("m2", "A"), mockStamp("m3", "A"), mockStamp("m4", "I")],
  });

  assertEquals(facts.predominant?.active, true);
  assertEquals(facts.predominant?.id, "A");
  assertEquals(facts.predominant?.name, "board");
  assertEquals(facts.mixed, null);
});

Deno.test("Mix Domain: Scenario MX-02 Two board meetings + two pitches -> Mixed: board and pitches (tie)", () => {
  const m1 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m1", title: "Board 1" }, provenance: { source: "c", traceId: "t" } });
  const m2 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m2", title: "Board 2" }, provenance: { source: "c", traceId: "t" } });
  const p1 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "p1", title: "Pitch 1" }, provenance: { source: "c", traceId: "t" } });
  const p2 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "p2", title: "Pitch 2" }, provenance: { source: "c", traceId: "t" } });

  const facts = mixEngine.evaluate({
    workMeetings: [m1, m2, p1, p2],
    stamps: [mockStamp("m1", "A"), mockStamp("m2", "A"), mockStamp("p1", "B"), mockStamp("p2", "B")],
  });

  assertEquals(facts.predominant, null);
  assertEquals(facts.mixed?.active, true);
  assertEquals(facts.mixed?.label, "Mixed: board and pitches");
});

Deno.test("Mix Domain: Scenario MX-05 Pitch, board, people, operations back to back, 5-min gaps -> contextSwitching high", () => {
  const m1 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m1", title: "Pitch", startTime: "2026-10-24T09:00:00Z", endTime: "2026-10-24T10:00:00Z" }, provenance: { source: "c", traceId: "t" } });
  const m2 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m2", title: "Board", startTime: "2026-10-24T10:05:00Z", endTime: "2026-10-24T11:05:00Z" }, provenance: { source: "c", traceId: "t" } });
  const m3 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m3", title: "People", startTime: "2026-10-24T11:10:00Z", endTime: "2026-10-24T12:00:00Z" }, provenance: { source: "c", traceId: "t" } });
  const m4 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m4", title: "Ops", startTime: "2026-10-24T12:05:00Z", endTime: "2026-10-24T12:35:00Z" }, provenance: { source: "c", traceId: "t" } });

  const facts = mixEngine.evaluate({
    workMeetings: [m1, m2, m3, m4],
    stamps: [mockStamp("m1", "B"), mockStamp("m2", "A"), mockStamp("m3", "D"), mockStamp("m4", "I")],
  });

  assertEquals(facts.backToBack.isBackToBackDay, true);
  assertEquals(facts.contextSwitching.level, "high");
  assertEquals(facts.contextSwitching.switchCount, 3);
});

Deno.test("Mix Domain: Scenario MX-06 Predominant subtype budget review -> budget day", () => {
  const b1 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "b1", title: "Market 1 Budget" }, provenance: { source: "c", traceId: "t" } });
  const b2 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "b2", title: "Market 2 Budget" }, provenance: { source: "c", traceId: "t" } });
  const b3 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "b3", title: "Market 3 Budget" }, provenance: { source: "c", traceId: "t" } });
  const m = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m", title: "Ops review" }, provenance: { source: "c", traceId: "t" } });

  const facts = mixEngine.evaluate({
    workMeetings: [b1, b2, b3, m],
    stamps: [
      mockStamp("b1", "A", "gov.budget_review"),
      mockStamp("b2", "A", "gov.budget_review"),
      mockStamp("b3", "A", "gov.budget_review"),
      mockStamp("m", "I", "ops.operating_review"),
    ],
  });

  assertEquals(facts.predominant?.type, "subtype");
  assertEquals(facts.predominant?.id, "gov.budget_review");
  assertEquals(facts.predominant?.name, "budget review");
});

Deno.test("Mix Domain: Scenario MX-09 1 routine sync, nothing else -> mix does NOT run", () => {
  const m1 = toCanonicalCalendarItem({ userId: "u1", raw: { id: "m1", title: "Sync" }, provenance: { source: "c", traceId: "t" } });

  const facts = mixEngine.evaluate({
    workMeetings: [m1],
    stamps: [mockStamp("m1", "I")],
  });

  assertEquals(facts.active, false);
  assertEquals(facts.predominant, null);
  assertEquals(facts.mixed, null);
});
