// [KIND: test] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Unit tests for Layer 0 Calendar domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeForClassify,
  titlesMatch,
  mergeCalendarEvents,
  toCanonicalCalendarItem,
} from "./index.ts";
import type { CalendarMergeInput } from "./merge.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "google_sync",
  version: "1.0.0",
  traceId: "test_trace_cal",
};

Deno.test("Calendar Domain: Title normalization and matching", () => {
  const t1 = "Board Meeting: Q3 Performance Review!";
  const t2 = "board meeting q3 performance review";
  const norm1 = normalizeForClassify(t1);
  const norm2 = normalizeForClassify(t2);
  assertEquals(norm1, norm2);
  assertEquals(titlesMatch(norm1, norm2), true);
});

Deno.test("Calendar Domain: Multi-calendar merge with precedence", () => {
  const events: CalendarMergeInput[] = [
    {
      id: "evt_google_1",
      title: "Executive Staff Sync",
      startTime: "2026-10-23T14:00:00Z",
      endTime: "2026-10-23T15:00:00Z",
      provider: "google",
      location: "Room 402",
      attendees: [
        { displayName: "Alice", email: "alice@acme.com", isSelf: true },
        { displayName: "Bob", email: "bob@acme.com", isSelf: false },
      ],
    },
    {
      id: "evt_apple_1",
      title: "Executive Staff Sync",
      startTime: "2026-10-23T14:00:00Z",
      endTime: "2026-10-23T15:00:00Z",
      provider: "apple",
      conferenceUrl: "https://meet.google.com/xyz",
      attendees: [
        { displayName: "Alice", email: "alice@acme.com", isSelf: true },
      ],
    },
  ];

  // On iOS, Apple and Google merge because they share attendee Alice and timeslot
  const iosMerged = mergeCalendarEvents(events, "ios");
  assertEquals(iosMerged.length, 1);
  assertEquals(iosMerged[0].mergedFromCount, 2);
  assertEquals(iosMerged[0].attendees.length, 2);
  assertEquals(iosMerged[0].conferenceUrl, "https://meet.google.com/xyz");
  assertEquals(iosMerged[0].location, "Room 402");
});

Deno.test("Calendar Domain: toCanonicalCalendarItem transformation", () => {
  const raw: CalendarMergeInput = {
    id: "g_123",
    title: "1:1 Strategy",
    startTime: "2026-10-23T16:00:00Z",
    endTime: "2026-10-23T16:30:00Z",
    provider: "google",
    attendees: [{ displayName: "Dave", email: "dave@example.com", isOrganizer: false }],
  };

  const canonical = toCanonicalCalendarItem({
    userId: "user_test",
    raw,
    provenance: mockProvenance,
  });

  assertEquals(canonical.userId, "user_test");
  assertEquals(canonical.cleanTitle, "1 1 strategy");
  assertEquals(canonical.attendees.length, 1);
  assertEquals(canonical.attendees[0].domain, "example.com");
  assertEquals(canonical.provenance.source, "google_sync");
});
