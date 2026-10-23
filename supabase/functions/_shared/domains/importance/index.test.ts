// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Importance domain.
// Source: Part 2 Layer 2 (Section 4.9, Scenarios IM-01 to IM-10, N-IM1 to N-IM4).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { importanceEngine } from "./engine.ts";
import { toCanonicalCalendarItem } from "../calendar/canonical.ts";
import type { ClassificationStamp } from "../events/types.ts";

function mockStamp(itemId: string, category: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J", subtype?: string): ClassificationStamp {
  return {
    itemId,
    sourceType: "calendar",
    category,
    categoryConfidence: 0.9,
    subtype: (subtype ?? null) as any,
    subtypeConfidence: 0.9,
    bestCandidateSubtype: null,
    confirmationState: "confirmed",
    decisionSource: "provider_label",
    runnerUp: null,
    reasons: [],
    findings: [],
    dimensions: { stakes: category === "A" ? "high" : "medium", travelRelated: category === "G", workContext: "work", durationMinutes: 60 },
    itemDemand: null,
    taxonomyVersion: "1.0",
    classifierVersion: "1.0",
    classifiedAt: "2026-10-24T00:00:00Z",
  };
}

Deno.test("Importance Domain: Scenario IM-01 Board meeting + L4 HR elevation -> Top item anchor with immediate & tactical evidence", () => {
  const board = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "board_1", title: "Quarterly Board Meeting", startTime: "2026-10-24T14:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });

  const facts = importanceEngine.evaluate({
    items: [board],
    stamps: [mockStamp("board_1", "A", "gov.board_meeting")],
    tacticalDataByItemId: {
      board_1: {
        patternElevatedHeartRate: true,
        heartRateDeltaPercent: 40,
        pastOccurrenceCount: 3,
      },
    },
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  assertEquals(facts.topItemAnchor?.anchorId, "board_1");
  assertEquals(facts.topItemAnchor?.evidence.some((e) => e.horizon === "tactical"), true);
});

Deno.test("Importance Domain: Scenario IM-04 Routine sync tagged 'priority' by user -> Ranks ABOVE untagged board meeting (user voice wins)", () => {
  const sync = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "sync_1", title: "Routine 1:1 with COO", startTime: "2026-10-24T10:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });
  const board = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "board_1", title: "Board Meeting", startTime: "2026-10-24T11:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });

  const facts = importanceEngine.evaluate({
    items: [sync, board],
    stamps: [mockStamp("sync_1", "I"), mockStamp("board_1", "A")],
    userPriorityItemIds: ["sync_1"], // tagged by user
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  // sync_1 must rank first because of user override
  assertEquals(facts.anchors[0].anchorId, "sync_1");
  assertEquals(facts.anchors[0].isUserTagOverride, true);
});

Deno.test("Importance Domain: Scenario IM-05 Strategy session aligned with declared 'decision' goal -> Strategic bonus attached", () => {
  const strat = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "strat_1", title: "Product Strategy & Architecture", startTime: "2026-10-24T14:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });

  // Give strat stamp high stakes so immediate clears the MIN_IMMEDIATE gate (IM-05: 'as immediate clears the gate')
  const stamp = mockStamp("strat_1", "E", "str.strategy_planning");
  stamp.dimensions.stakes = "high"; // base 10 + 8 (high stakes) + 10 (situation) -> clears 25

  const facts = importanceEngine.evaluate({
    items: [strat],
    stamps: [stamp],
    userProtectionGoals: ["decision"], // matches E
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  assertEquals(facts.topItemAnchor?.evidence.some((e) => e.horizon === "strategic"), true);
});

Deno.test("Importance Domain: Scenario N-IM1 Urgency formula U = 100 * exp(-m / 360)", () => {
  const soon = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "soon_1", title: "Meeting Soon", startTime: "2026-10-24T09:00:00Z" }, // 60 min away
    provenance: { source: "c", traceId: "t" },
  });

  const facts = importanceEngine.evaluate({
    items: [soon],
    stamps: [mockStamp("soon_1", "B")],
    nowUtc: new Date("2026-10-24T08:00:00Z"), // 60 min before start
  });

  const u = facts.topItemAnchor?.subScores.urgency ?? 0;
  // exp(-60 / 360) = exp(-0.1666) ~= 0.8464 -> 85
  assertEquals(u >= 80 && u <= 90, true);
});

Deno.test("Importance Domain: Scenario IM-09 Item marked 'never' in Week Ahead -> Excluded with reason", () => {
  const neverItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "skip_1", title: "Vendor Sales Call" },
    provenance: { source: "c", traceId: "t" },
  });

  const facts = importanceEngine.evaluate({
    items: [neverItem],
    stamps: [mockStamp("skip_1", "I")],
    weekAheadExcludedItemIds: ["skip_1"],
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  assertEquals(facts.anchors.length, 0);
  assertEquals(facts.excluded.length, 1);
  assertEquals(facts.excluded[0].reason, "Marked never in Week Ahead");
});

Deno.test("Importance Window Adjustment - IA-01: Low readiness before board meeting adds state anchor", () => {
  const boardItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "board_1", title: "Board Meeting", startTime: "2026-10-24T16:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });

  const baseFacts = importanceEngine.evaluate({
    items: [boardItem],
    stamps: [mockStamp("board_1", "A")],
    nowUtc: new Date("2026-10-24T14:00:00Z"),
  });

  assertEquals(baseFacts.anchors[0].anchorId, "board_1");

  // Mock StateProfile with readiness-demand gap
  const mockStateProfile: any = {
    tier: "managing",
    basePhysiologyTier: "managing",
    fit: {
      hasGap: true,
      readinessDemandGap: {
        size: "moderate",
        itemsAhead: [{ id: "board_1", title: "Board Meeting", category: "A", startUtc: "2026-10-24T16:00:00Z" }],
        minutesUntilFirst: 120,
        summary: "Managing readiness · Board Meeting in 120m",
      },
    },
    agreement: { hasDivergence: false },
  };

  const adjusted = importanceEngine.adjustForWindow({
    base: baseFacts,
    stateProfile: mockStateProfile,
    nowUtc: new Date("2026-10-24T14:00:00Z"),
  });

  assertEquals(adjusted.mode, "adjusted");
  const stateAnchor = adjusted.anchors.find((a) => a.kind === "state");
  assertEquals(stateAnchor !== undefined, true);
  assertEquals(stateAnchor?.anchorId, "state_anchor_readiness_gap");
});

Deno.test("Importance Window Adjustment - IA-02: Recovery owed ranks high in morning", () => {
  const lightItem = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "sync_1", title: "Team Sync", start: "2026-10-24T11:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });

  const baseFacts = importanceEngine.evaluate({
    items: [lightItem],
    stamps: [mockStamp("sync_1", "E")],
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  const mockStateProfile: any = {
    tier: "steady",
    basePhysiologyTier: "steady",
    fit: { hasGap: false },
    agreement: { hasDivergence: false },
  };

  const adjusted = importanceEngine.adjustForWindow({
    base: baseFacts,
    stateProfile: mockStateProfile,
    nowUtc: new Date("2026-10-24T08:00:00Z"),
    recoveryOwed: true,
  });

  assertEquals(adjusted.mode, "adjusted");
  const topAnchor = adjusted.anchors[0];
  assertEquals(topAnchor.kind, "state");
  assertEquals(topAnchor.anchorId, "state_anchor_recovery_owed");
});

Deno.test("Importance Window Adjustment - IA-03: Past anchors are dropped at 14:00", () => {
  const morningPitch = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "pitch_1", title: "Morning Pitch", startTime: "2026-10-24T10:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });

  const afternoonReview = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "review_1", title: "Performance Review", startTime: "2026-10-24T15:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });

  const baseFacts = importanceEngine.evaluate({
    items: [morningPitch, afternoonReview],
    stamps: [mockStamp("pitch_1", "A"), mockStamp("review_1", "B")],
    nowUtc: new Date("2026-10-24T08:00:00Z"),
  });

  assertEquals(baseFacts.anchors.length, 2);

  const mockStateProfile: any = {
    tier: "steady",
    basePhysiologyTier: "steady",
    fit: { hasGap: false },
    agreement: { hasDivergence: false },
  };

  // Now advance time to 14:00 (after morning pitch)
  const adjusted = importanceEngine.adjustForWindow({
    base: baseFacts,
    stateProfile: mockStateProfile,
    nowUtc: new Date("2026-10-24T14:00:00Z"),
  });

  assertEquals(adjusted.anchors.length, 1);
  assertEquals(adjusted.anchors[0].anchorId, "review_1");
});
