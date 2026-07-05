import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyGoogleCalendarError,
} from "./google-calendar-errors.ts";

function headers(init: Record<string, string> = {}): { get(name: string): string | null } {
  const h = new Headers(init);
  return { get: (n) => h.get(n) };
}

Deno.test("429 always classifies as rate_limited even with an empty body", () => {
  const r = classifyGoogleCalendarError(429, "", headers({ "Retry-After": "42" }));
  assertEquals(r.kind, "rate_limited");
  assertEquals(r.retryAfterSeconds, 42);
});

Deno.test("403 quotaExceeded classifies as rate_limited (not auth)", () => {
  const body = JSON.stringify({
    error: {
      code: 403,
      message: "Calendar usage limits exceeded.",
      errors: [{ domain: "usageLimits", reason: "quotaExceeded", message: "Calendar usage limits exceeded." }],
    },
  });
  const r = classifyGoogleCalendarError(403, body);
  assertEquals(r.kind, "rate_limited");
  assertEquals(r.reason, "quotaExceeded");
});

Deno.test("403 userRateLimitExceeded classifies as rate_limited", () => {
  const body = JSON.stringify({
    error: { errors: [{ reason: "userRateLimitExceeded", message: "Rate Limit Exceeded" }] },
  });
  const r = classifyGoogleCalendarError(403, body);
  assertEquals(r.kind, "rate_limited");
  assertEquals(r.reason, "userRateLimitExceeded");
});

Deno.test("403 rateLimitExceeded classifies as rate_limited", () => {
  const body = JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } });
  assertEquals(classifyGoogleCalendarError(403, body).kind, "rate_limited");
});

Deno.test("403 insufficientPermissions classifies as auth_failed", () => {
  const body = JSON.stringify({
    error: { errors: [{ reason: "insufficientPermissions", message: "Insufficient Permission" }] },
  });
  const r = classifyGoogleCalendarError(403, body);
  assertEquals(r.kind, "auth_failed");
  assertEquals(r.reason, "insufficientPermissions");
});

Deno.test("bare 403 with no errors[] falls back to auth_failed (safe default for permission)", () => {
  const r = classifyGoogleCalendarError(403, "");
  assertEquals(r.kind, "auth_failed");
});

Deno.test("401 classifies as auth_failed", () => {
  const r = classifyGoogleCalendarError(401, "");
  assertEquals(r.kind, "auth_failed");
});

Deno.test("500/503 upstream errors classify as rate_limited (delayed retry)", () => {
  assertEquals(classifyGoogleCalendarError(500, "").kind, "rate_limited");
  assertEquals(classifyGoogleCalendarError(503, "").kind, "rate_limited");
});

Deno.test("generic 400 classifies as other_error", () => {
  const r = classifyGoogleCalendarError(400, JSON.stringify({ error: { errors: [{ reason: "invalid" }] } }));
  assertEquals(r.kind, "other_error");
});

Deno.test("Retry-After HTTP-date is parsed to seconds delta", () => {
  const future = new Date(Date.now() + 30_000).toUTCString();
  const r = classifyGoogleCalendarError(429, "", headers({ "Retry-After": future }));
  assertEquals(r.kind, "rate_limited");
  // Allow small clock skew.
  const ok = r.retryAfterSeconds !== null && r.retryAfterSeconds >= 25 && r.retryAfterSeconds <= 35;
  assertEquals(ok, true);
});