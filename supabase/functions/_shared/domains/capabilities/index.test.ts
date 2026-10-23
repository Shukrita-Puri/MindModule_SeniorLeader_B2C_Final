// [KIND: test] [LAYER: 0] [TIERS: 0] [AUDIENCE: universal]
// Unit tests for Layer 0 Capabilities domain.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyGoogleCalendarError,
  classifyMicrosoftCalendarError,
  computeBackoffFromCount,
  buildCapabilityFlags,
  computeSubscriptionExpiration,
  MS_GRAPH_SUB_MAX_MINUTES,
} from "./index.ts";
import type { Provenance } from "../../spine/types.ts";

const mockProvenance: Provenance = {
  source: "capabilities_test",
  version: "1.0.0",
  traceId: "test_capabilities_trace",
};

Deno.test("Capabilities Domain: Error classification", () => {
  const gAuth = classifyGoogleCalendarError(401, "");
  assertEquals(gAuth.kind, "auth_failed");

  const gRate = classifyGoogleCalendarError(429, "");
  assertEquals(gRate.kind, "rate_limited");

  const msAuth = classifyMicrosoftCalendarError(401, "");
  assertEquals(msAuth.kind, "auth_failed");

  const ms503 = classifyMicrosoftCalendarError(503, "");
  assertEquals(ms503.kind, "rate_limited");
});

Deno.test("Capabilities Domain: Retry backoff ladder", () => {
  // Ladder: [300, 600, 1200, 2400, 3600]
  assertEquals(computeBackoffFromCount(0), 300);
  assertEquals(computeBackoffFromCount(1), 600);
  assertEquals(computeBackoffFromCount(2), 1200);
  assertEquals(computeBackoffFromCount(3), 2400);
  assertEquals(computeBackoffFromCount(4), 3600);
  assertEquals(computeBackoffFromCount(10), 3600); // capped at 3600
});

Deno.test("Capabilities Domain: Microsoft Graph subscription cap", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const expIso = computeSubscriptionExpiration(now);
  const expTime = new Date(expIso).getTime();
  const diffMinutes = (expTime - now.getTime()) / (60 * 1000);
  assertEquals(diffMinutes <= MS_GRAPH_SUB_MAX_MINUTES, true);
});

Deno.test("Capabilities Domain: buildCapabilityFlags canonical aggregation", () => {
  const flags = buildCapabilityFlags({
    userId: "user_cap",
    calendar: {
      google: { state: "connected", lastSuccessUtc: "2026-10-23T10:00:00Z", freshness: "fresh" },
    },
    wearable: {
      oura: { state: "connected", lastSuccessUtc: "2026-10-23T07:00:00Z", freshness: "fresh" },
    },
    location: {
      permitted: true,
      lastReadingUtc: "2026-10-23T11:00:00Z",
    },
    provenance: mockProvenance,
  });

  assertEquals(flags.userId, "user_cap");
  assertEquals(flags.hasCalendar, true);
  assertEquals(flags.hasWearable, true);
  assertEquals(flags.hasLocation, true);
  assertEquals(flags.calendar.google.state, "connected");
  assertEquals(flags.calendar.microsoft.state, "not_connected");
});
