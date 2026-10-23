// [KIND: test] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Unit tests for Layer 0 Check-ins domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  roundTo15Minutes,
  computeCheckinDedupeKey,
  normalizeCheckinWords,
  toCanonicalCheckinRecord,
} from "./index.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "mobile_checkin",
  version: "1.0.0",
  traceId: "test_checkin_trace",
};

Deno.test("Check-ins Domain: 15-minute slot rounding", () => {
  const t1 = "2026-10-23T14:07:35.123Z";
  const rounded1 = roundTo15Minutes(t1);
  assertEquals(rounded1, "2026-10-23T14:00:00.000Z");

  const t2 = "2026-10-23T14:28:59.000Z";
  const rounded2 = roundTo15Minutes(t2);
  assertEquals(rounded2, "2026-10-23T14:15:00.000Z");
});

Deno.test("Check-ins Domain: Deduplication key computation", () => {
  const k1 = computeCheckinDedupeKey("user_1", "2026-10-23", "morning", "2026-10-23T08:04:00Z");
  const k2 = computeCheckinDedupeKey("user_1", "2026-10-23", "morning", "2026-10-23T08:11:00Z");
  assertEquals(k1, k2, "Both timestamps in same 15-minute window share the exact dedupe key");
});

Deno.test("Check-ins Domain: Word normalization and canonical record creation", () => {
  const rawWords = [" Focused ", "Anxious", "focused", "  ENERGIZED  "];
  const normalized = normalizeCheckinWords(rawWords);
  assertEquals(normalized, ["focused", "anxious", "energized"]);

  const record = toCanonicalCheckinRecord({
    raw: {
      userId: "user_1",
      localDate: "2026-10-23",
      window: "morning",
      atUtc: "2026-10-23T08:05:00Z",
      dimensions: { clarity: 4, pressure: 2 },
      words: rawWords,
      chargeResidue: 15,
    },
    provenance: mockProvenance,
  });

  assertEquals(record.userId, "user_1");
  assertEquals(record.window, "morning");
  assertEquals(record.words.length, 3);
  assertEquals(record.dimensions.clarity, 4);
  assertEquals(record.chargeResidue, 15);
});
