// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Crisis Episode domain.
// Source: Part 2 Layer 2 (Section 4.7, Scenarios CR-01 to CR-07).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { crisisEngine } from "./engine.ts";
import { toCanonicalCalendarItem } from "../calendar/canonical.ts";
import type { ClassificationStamp } from "../events/types.ts";

function mockStamp(itemId: string, category: "J" | "I" | "A", subtype: string): ClassificationStamp {
  return {
    itemId,
    sourceType: "calendar",
    category,
    categoryConfidence: 0.9,
    subtype: subtype as any,
    subtypeConfidence: 0.9,
    bestCandidateSubtype: null,
    confirmationState: "confirmed",
    decisionSource: "provider_label",
    runnerUp: null,
    reasons: [],
    findings: [],
    dimensions: { stakes: category === "J" ? "high" : "low", travelRelated: false, workContext: "work", durationMinutes: 60 },
    itemDemand: null,
    taxonomyVersion: "1.0",
    classifierVersion: "1.0",
    classifiedAt: "2026-10-24T00:00:00Z",
  };
}

Deno.test("Crisis Domain: Scenario CR-02 'SEV-1 production outage war room' -> Episode opens (rule 1)", () => {
  const warRoom = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "war_1", title: "SEV-1 production outage war room" },
    provenance: { source: "c", traceId: "t" },
  });

  const facts = crisisEngine.evaluate({
    items: [warRoom],
    stamps: [mockStamp("war_1", "J", "gov.crisis")],
  });

  assertEquals(facts.isCrisisDay, true);
  assertEquals(facts.crisisEpisodeActive, true);
  assertEquals(facts.activeEpisode?.state, "open");
  assertEquals(facts.activeEpisode?.confidence, "high");
});

Deno.test("Crisis Domain: Scenario CR-01 Outage bridge call + Customer PR holding statement + displacement -> Episode opens (rule 4)", () => {
  const m1 = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "m1", title: "Outage – bridge call", startTime: "2026-10-24T21:00:00Z" },
    provenance: { source: "c", traceId: "t" },
  });
  const m2 = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "m2", title: "Customer comms – holding statement (PR counsel)" },
    provenance: { source: "c", traceId: "t" },
  });

  const facts = crisisEngine.evaluate({
    items: [m1, m2],
    stamps: [mockStamp("m1", "J", "risk.incident_review"), mockStamp("m2", "J", "risk.reputation")],
    hasDisplacedRoutineMeetings: true,
  });

  assertEquals(facts.isCrisisDay, true);
  assertEquals(facts.activeEpisode?.state, "open");
  assertEquals(facts.activeEpisode?.memberItemIds.length, 2);
});

Deno.test("Crisis Domain: Scenario CR-03 'Weekly ops sync: urgent items' (recurring I) -> NO episode", () => {
  const m = toCanonicalCalendarItem({
    userId: "u1",
    raw: { id: "m1", title: "Weekly ops sync: urgent items" },
    provenance: { source: "c", traceId: "t" },
  });

  const facts = crisisEngine.evaluate({
    items: [m],
    stamps: [mockStamp("m1", "I", "ops.operating_review")],
  });

  assertEquals(facts.isCrisisDay, false);
  assertEquals(facts.activeEpisode, null);
});

Deno.test("Crisis Domain: Scenario CR-06 No new items for 48 hours -> Episode closes", () => {
  const openEp = {
    episodeId: "ep_1",
    openedAtUtc: "2026-10-20T00:00:00Z",
    state: "open" as const,
    memberItemIds: ["war_1"],
    reasons: ["SEV-1"],
    confidence: "high" as const,
    lastActivityUtc: "2026-10-20T12:00:00Z",
  };

  const facts = crisisEngine.evaluate({
    items: [],
    stamps: [],
    existingEpisode: openEp,
    nowUtc: new Date("2026-10-22T14:00:00Z"), // 50 hours later (> 48h)
  });

  assertEquals(facts.isCrisisDay, false);
  assertEquals(facts.activeEpisode?.state, "closed");
});
