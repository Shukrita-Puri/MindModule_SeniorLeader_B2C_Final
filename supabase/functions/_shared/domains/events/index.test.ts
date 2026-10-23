// [KIND: test] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Unit tests and real-event validation for Layer 1 Events domain.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveEvent, DomainEventClassifier } from "./classifier.ts";
import { SHARED_STAKES_ORDER, HIGH_STAKES_BASE_THRESHOLD } from "./constants.ts";
import { MemoryService } from "../memory/service.ts";
import type { CompanyContextProfile } from "../relationships/types.ts";

const mockContext: CompanyContextProfile = {
  userId: "shukrita_user",
  userOrgDomain: "mindmodule.me",
  sectorsSoldTo: ["education"],
  partners: [],
  investors: ["acme_ventures"],
  declaredDomains: ["mindmodule.me"],
};

Deno.test("Events Domain: Shared stakes order matches specification", () => {
  assertEquals(SHARED_STAKES_ORDER.J, 42);
  assertEquals(SHARED_STAKES_ORDER.A, 40);
  assertEquals(SHARED_STAKES_ORDER.C, 32);
  assertEquals(SHARED_STAKES_ORDER.B, 30);
  assertEquals(SHARED_STAKES_ORDER.D, 22);
  assertEquals(SHARED_STAKES_ORDER.F, 18);
  assertEquals(SHARED_STAKES_ORDER.G, 12);
  assertEquals(SHARED_STAKES_ORDER.E, 10);
  assertEquals(SHARED_STAKES_ORDER.I, 8);
  assertEquals(SHARED_STAKES_ORDER.H, 5);

  assertEquals(HIGH_STAKES_BASE_THRESHOLD, 30);
});

Deno.test("Events Domain: Cross-check Prep vs Governance ('Prep for board' -> E, not A)", () => {
  const resolved = resolveEvent("Prep for board meeting");
  assertEquals(resolved.categoryId, "E", "Board prep must resolve to Strategic Prep/Deep Work (E)");
  assertEquals(resolved.stamp.dimensions.stakes, "medium");
});

Deno.test("Events Domain: Flight number produces Category G with high confidence", () => {
  const resolved = resolveEvent("Flight BA 142 London to Brussels");
  assertEquals(resolved.categoryId, "G", "Flight booking must resolve to Travel (G)");
  assertEquals(resolved.stamp.dimensions.travelRelated, true);
  assertEquals(resolved.stamp.categoryConfidence >= 0.75, true);
});

Deno.test("Events Domain: Real event validation from Shukrita labeled set", () => {
  // 1. Weekly AI Forum - Permanent Zoom -> E (str.community)
  const forum = resolveEvent("Weekly AI Forum - Permanent Zoom", { userContext: mockContext });
  assertEquals(forum.categoryId, "E");
  assertEquals(forum.stamp.bestCandidateSubtype, "str.community");

  // 2. 1 day liquid fast -> H (rhy.wellness_self_care)
  const fast = resolveEvent("1 day liquid fast", { userContext: mockContext });
  assertEquals(fast.categoryId, "H");
  assertEquals(fast.stamp.bestCandidateSubtype, "rhy.wellness_self_care");

  // 3. OHS - Open Day -> F (conf.workshop)
  const openDay = resolveEvent("OHS- Open Day", { userContext: mockContext });
  assertEquals(openDay.categoryId, "F");
  assertEquals(openDay.stamp.bestCandidateSubtype, "conf.workshop");

  // 4. Incident response -> J
  const incident = resolveEvent("Urgent: Incident Sev-1 Database Outage Post-mortem");
  assertEquals(incident.categoryId, "J");
  assertEquals(incident.stamp.dimensions.stakes, "high");
});

Deno.test("Events Domain: User declared correction in MemoryService overrides machine findings", () => {
  const memoryService = new MemoryService();
  const classifier = new DomainEventClassifier(memoryService);

  // User explicitly declared that title pattern 'quarterly catch up' is category 'D' (People)
  memoryService.record({
    userId: "user_test",
    key: { scope: "TITLE_PATTERN", value: "quarterly catch up" },
    kind: "declared",
    tier: 3,
    payload: { category: "D", subtypeId: "peo.one_to_one" },
    isConfirmed: true,
    provenance: { source: "user_override", traceId: "trace_1" },
  });

  const res = classifier.resolve({
    userId: "user_test",
    title: "Quarterly Catch-up with Tom",
    attendees: [{ email: "tom@example.com" }],
  });

  assertEquals(res.categoryId, "D");
  assertEquals(res.stamp.decisionSource, "user_correction");
  assertEquals(res.stamp.categoryConfidence, 1.0);
});
