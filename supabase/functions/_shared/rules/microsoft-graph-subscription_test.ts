import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMicrosoftSubscriptionCreatePayload,
  buildMicrosoftSubscriptionRenewPayload,
  classifyMicrosoftSubscriptionError,
  computeSubscriptionExpiration,
  extractGraphValidationToken,
  MS_GRAPH_SUB_MAX_MINUTES,
  parseGraphNotificationEnvelope,
} from "./microsoft-graph-subscription.ts";

Deno.test("create payload targets me/events with all three change types and a client state", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");
  const p = buildMicrosoftSubscriptionCreatePayload({
    notificationUrl: "https://example.com/functions/v1/calendar-webhook",
    clientState: "abc123",
    now,
  });
  assertEquals(p.resource, "me/events");
  assertEquals(p.changeType, "created,updated,deleted");
  assertEquals(p.clientState, "abc123");
  assertEquals(p.notificationUrl, "https://example.com/functions/v1/calendar-webhook");
  assertEquals(p.expirationDateTime, new Date(now.getTime() + MS_GRAPH_SUB_MAX_MINUTES * 60_000).toISOString());
});

Deno.test("subscription lifetime stays under Graph's 4230-minute hard cap", () => {
  assert(MS_GRAPH_SUB_MAX_MINUTES <= 4230, "must stay under Graph hard cap");
});

Deno.test("renew payload only carries a fresh expirationDateTime", () => {
  const now = new Date("2026-07-05T12:00:00.000Z");
  const p = buildMicrosoftSubscriptionRenewPayload(now);
  assertEquals(Object.keys(p), ["expirationDateTime"]);
  assertEquals(p.expirationDateTime, computeSubscriptionExpiration(now));
});

Deno.test("error classifier splits temporary vs. hard failures", () => {
  assertEquals(classifyMicrosoftSubscriptionError(401), "auth_failed");
  assertEquals(classifyMicrosoftSubscriptionError(403), "auth_failed");
  assertEquals(classifyMicrosoftSubscriptionError(404), "not_found");
  assertEquals(classifyMicrosoftSubscriptionError(429), "rate_limited");
  assertEquals(classifyMicrosoftSubscriptionError(503), "rate_limited");
  assertEquals(classifyMicrosoftSubscriptionError(500), "rate_limited");
  assertEquals(classifyMicrosoftSubscriptionError(400), "other_error");
});

Deno.test("validation-token handshake is detected via query param", () => {
  const t = extractGraphValidationToken("https://example.com/functions/v1/calendar-webhook?validationToken=hello%20world");
  assertEquals(t, "hello world");
});

Deno.test("missing validationToken query returns null", () => {
  const t = extractGraphValidationToken("https://example.com/functions/v1/calendar-webhook");
  assertEquals(t, null);
});

Deno.test("notification envelope parser extracts subscriptionId + clientState", () => {
  const n = parseGraphNotificationEnvelope({
    value: [
      { subscriptionId: "sub-1", clientState: "secret", changeType: "updated", resource: "me/events/abc" },
      { subscriptionId: "sub-2" },
      { not: "a notification" },
    ],
  });
  assertEquals(n.length, 2);
  assertEquals(n[0].subscriptionId, "sub-1");
  assertEquals(n[0].clientState, "secret");
  assertEquals(n[1].clientState, undefined);
});

Deno.test("notification envelope parser is defensive against garbage", () => {
  assertEquals(parseGraphNotificationEnvelope(null).length, 0);
  assertEquals(parseGraphNotificationEnvelope({}).length, 0);
  assertEquals(parseGraphNotificationEnvelope({ value: "nope" }).length, 0);
  assertEquals(parseGraphNotificationEnvelope({ value: [null, 1, "s"] }).length, 0);
});
