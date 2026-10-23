// [KIND: test] [LAYER: memory] [TIERS: 0-3] [AUDIENCE: universal]
// Tests for Memory domain and MemoryService.

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { MemoryService } from "./service.ts";
import type { MemoryRecord, EngagementEventPayload, ScopedItemCandidate } from "./types.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "test_suite",
  parserVersion: "1.0.0",
  receivedAt: new Date().toISOString(),
  traceId: "test_trace_123",
};

Deno.test("MemoryService: Inferred memory non-graduation guard", () => {
  const service = new MemoryService();

  const inferredRecord: MemoryRecord = {
    userId: "user_1",
    key: { scope: "TITLE_PATTERN", value: "board meeting" },
    kind: "inferred",
    tier: 2,
    payload: { category: "A" },
    isConfirmed: true, // Attempting to sneak isConfirmed = true
    provenance: mockProvenance,
  };

  const saved = service.record(inferredRecord);
  assertEquals(saved.isConfirmed, false, "Inferred record must NOT graduate to confirmed automatically");
  assertNotEquals(saved.expiresAtUtc, null, "Inferred record must have default 90d expiry");

  // User explicitly confirms it
  const confirmed = service.confirm("user_1", saved.key);
  assertEquals(confirmed?.isConfirmed, true, "Explicit user confirmation marks record as confirmed");
});

Deno.test("MemoryService: Scoped correction precedence (narrowest wins)", () => {
  const service = new MemoryService();
  const userId = "user_2";

  // Record an org-level correction: all meetings with "@acme.com" -> "E"
  service.record({
    userId,
    key: { scope: "ORGANISATION", value: "acme.com" },
    kind: "declared",
    tier: 3,
    payload: { category: "E" },
    isConfirmed: true,
    provenance: mockProvenance,
  });

  // Record a series-level correction: this specific series -> "B"
  service.record({
    userId,
    key: { scope: "THIS_SERIES", value: "series_sync_weekly" },
    kind: "declared",
    tier: 3,
    payload: { category: "B" },
    isConfirmed: true,
    provenance: mockProvenance,
  });

  // Candidate with both matching series and matching org
  const candidate: ScopedItemCandidate = {
    id: "evt_101",
    seriesId: "series_sync_weekly",
    title: "Weekly Sync with ACME",
    attendeeDomains: ["acme.com"],
  };

  // Narrowest wins: THIS_SERIES (precedence 2) beats ORGANISATION (precedence 5)
  const resolved = service.resolveCorrection(userId, candidate);
  assertEquals(resolved?.key.scope, "THIS_SERIES");
  assertEquals((resolved?.payload as any)?.category, "B");

  // Candidate with only org match
  const candidateOrgOnly: ScopedItemCandidate = {
    id: "evt_102",
    title: "Intro call",
    attendeeDomains: ["acme.com"],
  };
  const resolvedOrg = service.resolveCorrection(userId, candidateOrgOnly);
  assertEquals(resolvedOrg?.key.scope, "ORGANISATION");
  assertEquals((resolvedOrg?.payload as any)?.category, "E");
});

Deno.test("MemoryService: Preview wider correction and revocation", () => {
  const service = new MemoryService();
  const candidates: ScopedItemCandidate[] = [
    { id: "e1", title: "Quarterly Board Review", attendeeEmails: ["chair@corp.com"] },
    { id: "e2", title: "Board Prep", attendeeEmails: ["cfo@corp.com"] },
    { id: "e3", title: "Design Sprint", attendeeEmails: ["designer@other.com"] },
  ];

  // Preview how many items match pattern "board"
  const count = service.previewWiderCorrection("TITLE_PATTERN", "board", candidates);
  assertEquals(count, 2, "Should match e1 and e2 containing 'board'");

  // Record and revoke
  const key = { scope: "TITLE_PATTERN" as const, value: "board" };
  service.record({
    userId: "user_3",
    key,
    kind: "declared",
    tier: 3,
    payload: { category: "A" },
    isConfirmed: true,
    provenance: mockProvenance,
  });

  const beforeRevoke = service.resolveCorrection("user_3", candidates[0]);
  assertEquals(beforeRevoke !== null, true);

  service.revoke("user_3", key);
  const afterRevoke = service.resolveCorrection("user_3", candidates[0]);
  assertEquals(afterRevoke, null, "Revoked memory must not resolve");
});

Deno.test("MemoryService: Engagement recording (EN-1 shape)", () => {
  const service = new MemoryService();
  const payload: EngagementEventPayload = {
    ref: { kind: "practice", id: "box_breathing" },
    action: "completed",
    value: 5,
    atUtc: "2026-10-23T10:00:00Z",
    provenance: mockProvenance,
  };

  const rec = service.recordEngagement("user_4", payload);
  assertEquals(rec.kind, "behavioural");
  assertEquals(rec.tier, 1);
  assertEquals(rec.payload.ref.id, "box_breathing");
  assertEquals(rec.payload.action, "completed");
});
