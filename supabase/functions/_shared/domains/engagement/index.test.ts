// [KIND: test] [LAYER: 0] [TIERS: 1] [AUDIENCE: universal]
// Unit tests for Layer 0 Engagement domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  roundToSecond,
  computeEngagementDedupeKey,
  toCanonicalEngagementEvent,
} from "./index.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "brief_client",
  version: "1.0.0",
  traceId: "test_engagement_trace",
};

Deno.test("Engagement Domain: Round to second and deduplication key", () => {
  const t1 = "2026-10-23T14:15:30.456Z";
  const t2 = "2026-10-23T14:15:30.899Z";
  assertEquals(roundToSecond(t1), "2026-10-23T14:15:30.000Z");
  assertEquals(roundToSecond(t2), "2026-10-23T14:15:30.000Z");

  const k1 = computeEngagementDedupeKey("user_eng", { kind: "brief", id: "brief_101" }, "opened", t1);
  const k2 = computeEngagementDedupeKey("user_eng", { kind: "brief", id: "brief_101" }, "opened", t2);
  assertEquals(k1, k2, "Events within the same second share identical dedupe key");
});

Deno.test("Engagement Domain: toCanonicalEngagementEvent transformation", () => {
  const event = toCanonicalEngagementEvent({
    raw: {
      userId: "user_eng",
      surface: "plan",
      ref: { kind: "slot", id: "slot_morning_deepwork" },
      action: "COMPLETED",
      value: "focus_high",
      atUtc: "2026-10-23T10:30:00.123Z",
    },
    provenance: mockProvenance,
  });

  assertEquals(event.userId, "user_eng");
  assertEquals(event.surface, "plan");
  assertEquals(event.ref.kind, "slot");
  assertEquals(event.action, "completed");
  assertEquals(event.value, "focus_high");
  assertEquals(event.atUtc, "2026-10-23T10:30:00.000Z");
});
