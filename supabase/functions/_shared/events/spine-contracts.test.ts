import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCanonicalItemFromRaw,
  computeItemDemand,
  buildClassificationStamp,
  type ScopedMemoryRecord,
  type InvalidationTrigger,
} from "./spine-contracts.ts";
import { EVENT_CATEGORIES } from "./event-categories.ts";
import { EVENT_TYPES } from "./event-subtypes.ts";
import {
  formatScopeKey,
  lookupScopedMemoryFromContext,
  parseScopedMemoryFromRow,
  type LearningContext,
} from "./learning-store.ts";
import { resolveEvent } from "./resolve-event-category.ts";
import { enrichEvent } from "./enrich-event.ts";

Deno.test("Contract 1: buildCanonicalItemFromRaw creates canonical item from diverse raw shapes", () => {
  const raw = {
    id: "evt_123",
    title: "  Strategy Session with Rick  ",
    description: "Review quarterly targets",
    calendar_name: "Work Calendar",
    start_time: "2026-10-01T10:00:00Z",
    end_time: "2026-10-01T11:00:00Z",
    recurring_event_id: "series_abc",
    location: "Boardroom A",
    meet_link: "https://meet.google.com/xyz-123",
    is_far_from_home: false,
    attendees: [
      { displayName: "Rick Sanchez", email: "rick@school.edu", isSelf: false },
      { displayName: "Shukrita Puri", email: "shukrita@mindmodule.me", isSelf: true, isOrganizer: true },
    ],
    organizer: { displayName: "Shukrita Puri", email: "shukrita@mindmodule.me", isCurrentUser: true },
  };

  const item = buildCanonicalItemFromRaw(raw);
  assertEquals(item.itemId, "evt_123");
  assertEquals(item.title, "Strategy Session with Rick");
  assertEquals(item.description, "Review quarterly targets");
  assertEquals(item.isRecurring, true);
  assertEquals(item.seriesId, "series_abc");
  assertEquals(item.time?.durationMinutes, 60);
  assertEquals(item.time?.isAllDay, false);
  assertEquals(item.place?.videoLink, "https://meet.google.com/xyz-123");
  assertEquals(item.attendees?.length, 2);
  assertEquals(item.attendees?.[0].domain, "school.edu");
  assertEquals(item.attendees?.[1].isSelf, true);
  assertEquals(item.organizer?.domain, "mindmodule.me");
});

Deno.test("Contract 2 & 3: computeItemDemand produces adjusted demand profile from category or subtype", () => {
  // Category baseline demand for A (Board & Governance)
  const categoryA = EVENT_CATEGORIES["A"];
  const baselineDemand = computeItemDemand(categoryA, null, 60);
  assertEquals(baselineDemand !== null, true);
  assertEquals(baselineDemand!.demandProfile.cog >= 2, true);
  assertEquals(baselineDemand!.arousal, 2);
  assertEquals(baselineDemand!.switchCost, 1);
  assertEquals(baselineDemand!.recoveryMinutes, 15);

  // Long duration escalation -> recoveryMinutes increases to 30
  const longDemand = computeItemDemand(categoryA, null, 240);
  assertEquals(longDemand !== null, true);
  assertEquals(longDemand!.recoveryMinutes >= 30, true);

  // New Category I (Operations) has switchCost of 3
  const categoryI = EVENT_CATEGORIES["I"];
  const opsDemand = computeItemDemand(categoryI, null, 30);
  assertEquals(opsDemand !== null, true);
  assertEquals(opsDemand!.switchCost, 3);
  assertEquals(opsDemand!.arousal, 1);
});

Deno.test("Contract 3: buildClassificationStamp generates full stamp with provenance and confirmation states", () => {
  const categoryA = EVENT_CATEGORIES["A"];
  const subtypeBoard = EVENT_TYPES.find((t) => t.id === "gov.board_meeting") ?? null;

  const raw = {
    id: "evt_board_1",
    title: "Q3 Board of Directors Meeting",
    start_time: "2026-10-05T09:00:00Z",
    end_time: "2026-10-05T12:00:00Z",
  };

  const stamp = buildClassificationStamp({
    raw,
    title: "Q3 Board of Directors Meeting",
    category: categoryA,
    subtype: subtypeBoard,
    confidence: "high",
    source: "user_override",
    durationMinutes: 180,
    travelArc: null,
  });

  assertEquals(stamp.category, "A");
  assertEquals(stamp.categoryConfidence, 1.0);
  assertEquals(stamp.confirmationState, "confirmed");
  assertEquals(stamp.decisionSource, "user_correction");
  assertEquals(stamp.taxonomyVersion, "2026.09.A_J");
  assertEquals(stamp.dimensions.stakes, "high");
  assertEquals(stamp.dimensions.workContext, "work");
  assertEquals(stamp.dimensions.durationMinutes, 180);
  assertEquals(stamp.itemDemand !== null, true);
  assertNotEquals(stamp.inputHash, "");
  assertEquals(stamp.reasons.length > 0, true);
});

Deno.test("Contract 4 & 5: formatScopeKey and parseScopedMemoryFromRow round-trip correctly", () => {
  assertEquals(formatScopeKey("event", "evt_999"), "event:evt_999");
  assertEquals(formatScopeKey("series", "ser_123"), "series:ser_123");
  assertEquals(formatScopeKey("title_pattern", "Weekly 1:1 with Bob!"), "pattern:weekly 1 1 with bob");
  assertEquals(formatScopeKey("person", "Rick@School.EDU"), "person:rick@school.edu");
  assertEquals(formatScopeKey("organisation", "School.EDU"), "org:school.edu");

  const row = {
    id: "mem_1",
    user_id: "user_42",
    title_norm: "person:rick@school.edu",
    event_category: "B",
    source: "user_override",
    confidence: "high",
    resolved_by: JSON.stringify({
      v: 1,
      scopeType: "person",
      scopeKey: "rick@school.edu",
      memoryType: "event_category",
      value: "B",
      source: "user",
      confidence: 1.0,
      confirmedAt: "2026-09-30T10:00:00Z",
      version: "2026.09.A_J",
    }),
  };

  const parsed = parseScopedMemoryFromRow(row, "user_42");
  assertEquals(parsed?.scopeType, "person");
  assertEquals(parsed?.scopeKey, "rick@school.edu");
  assertEquals(parsed?.value, "B");
  assertEquals(parsed?.confidence, 1.0);
  assertEquals(parsed?.source, "user");
});

Deno.test("Contract 4 & 5: lookupScopedMemoryFromContext enforces precedence order", () => {
  // Precedence: THIS_EVENT > THIS_SERIES > TITLE_PATTERN > PERSON > ORGANISATION
  const scopedMemories = new Map<string, ScopedMemoryRecord>();

  // Add person-level memory (Rick -> B)
  scopedMemories.set("person:rick@school.edu", {
    userId: "u1",
    scopeType: "person",
    scopeKey: "rick@school.edu",
    memoryType: "event_category",
    value: "B",
    source: "user",
    confidence: 1.0,
    confirmedAt: "2026-09-30T10:00:00Z",
    version: "2026.09.A_J",
  });

  // Add series-level memory (ser_team -> I)
  scopedMemories.set("series:ser_team", {
    userId: "u1",
    scopeType: "series",
    scopeKey: "ser_team",
    memoryType: "event_category",
    value: "I",
    source: "user",
    confidence: 1.0,
    confirmedAt: "2026-09-30T10:00:00Z",
    version: "2026.09.A_J",
  });

  // Add event-level memory (evt_urgent -> J)
  scopedMemories.set("event:evt_urgent", {
    userId: "u1",
    scopeType: "event",
    scopeKey: "evt_urgent",
    memoryType: "event_category",
    value: "J",
    source: "user",
    confidence: 1.0,
    confirmedAt: "2026-09-30T10:00:00Z",
    version: "2026.09.A_J",
  });

  const ctx: LearningContext = {
    titles: new Map(),
    tokens: new Map(),
    scopedMemories,
  };

  // Event with eventId evt_urgent matches event level -> J
  const hit1 = lookupScopedMemoryFromContext(ctx, {
    eventId: "evt_urgent",
    seriesId: "ser_team",
    emails: ["rick@school.edu"],
  });
  assertEquals(hit1?.value, "J");

  // Event with seriesId ser_team and person rick@school.edu -> series wins (I over B)
  const hit2 = lookupScopedMemoryFromContext(ctx, {
    eventId: "evt_other",
    seriesId: "ser_team",
    emails: ["rick@school.edu"],
  });
  assertEquals(hit2?.value, "I");

  // Event with only person rick@school.edu -> person wins (B)
  const hit3 = lookupScopedMemoryFromContext(ctx, {
    eventId: "evt_standalone",
    emails: ["rick@school.edu"],
  });
  assertEquals(hit3?.value, "B");
});

Deno.test("Contract 6: Single read surface resolveEvent & enrichEvent reflects scoped memory and includes stamp", () => {
  const scopedMemories = new Map<string, ScopedMemoryRecord>();
  scopedMemories.set("event:special_offsite", {
    userId: "u1",
    scopeType: "event",
    scopeKey: "special_offsite",
    memoryType: "event_category",
    value: "E",
    source: "user",
    confidence: 1.0,
    confirmedAt: "2026-09-30T10:00:00Z",
    version: "2026.09.A_J",
  });

  const ctx: LearningContext = {
    titles: new Map(),
    tokens: new Map(),
    scopedMemories,
  };

  const rawEvent = {
    id: "special_offsite",
    title: "Team Lunch and Discussion",
    start_time: "2026-10-02T12:00:00Z",
    end_time: "2026-10-02T13:30:00Z",
    learned: ctx,
  };

  const resolved = resolveEvent(rawEvent);
  assertEquals(resolved.categoryId, "E");
  assertEquals(resolved.stamp.category, "E");
  assertEquals(resolved.stamp.confirmationState, "confirmed");

  const enriched = enrichEvent(rawEvent);
  assertEquals(enriched.categoryId, "E");
  assertEquals(enriched.canonicalItem.itemId, "special_offsite");
  assertEquals(enriched.stamp.category, "E");
});

Deno.test("Contract 7: Invalidation trigger contract type integrity", () => {
  const trigger: InvalidationTrigger = {
    reason: "memory_changed",
    itemId: "evt_123",
    invalidatedAt: new Date().toISOString(),
  };
  assertEquals(trigger.reason, "memory_changed");
  assertEquals(trigger.itemId, "evt_123");
});
