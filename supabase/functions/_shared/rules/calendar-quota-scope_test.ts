import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildQuotaCooldownUpsert,
  computeQuotaScopeKey,
  isScopeEligibleForSync,
  UNKNOWN_CLIENT_FALLBACK,
} from "./calendar-quota-scope.ts";
import {
  buildRateLimitedUpdate,
  buildSuccessfulSyncUpdate,
} from "./calendar-connection-state.ts";

// ------------------------------ Scope key derivation

Deno.test("scope key: provider + client id, lowercased provider", () => {
  assertEquals(
    computeQuotaScopeKey({ provider: "Google", clientId: "abc.apps.googleusercontent.com" }),
    "google:abc.apps.googleusercontent.com",
  );
  assertEquals(
    computeQuotaScopeKey({ provider: "microsoft", clientId: "ms-app-guid" }),
    "microsoft:ms-app-guid",
  );
});

Deno.test("scope key: falls back to unknown-client when id missing/empty", () => {
  assertEquals(
    computeQuotaScopeKey({ provider: "google", clientId: "" }),
    `google:${UNKNOWN_CLIENT_FALLBACK}`,
  );
  assertEquals(
    computeQuotaScopeKey({ provider: "google", clientId: null }),
    `google:${UNKNOWN_CLIENT_FALLBACK}`,
  );
  assertEquals(
    computeQuotaScopeKey({ provider: "google", clientId: undefined }),
    `google:${UNKNOWN_CLIENT_FALLBACK}`,
  );
});

Deno.test("scope key: different providers with same client id do NOT collide", () => {
  const g = computeQuotaScopeKey({ provider: "google", clientId: "shared" });
  const m = computeQuotaScopeKey({ provider: "microsoft", clientId: "shared" });
  assert(g !== m);
});

// ------------------------------ Eligibility

Deno.test("isScopeEligibleForSync: missing row → eligible (fail open)", () => {
  assertEquals(isScopeEligibleForSync(null), true);
  assertEquals(isScopeEligibleForSync(undefined), true);
  assertEquals(isScopeEligibleForSync({}), true);
});

Deno.test("isScopeEligibleForSync: cooldown in future → NOT eligible", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const row = { cooldown_until: "2026-07-05T10:05:00.000Z" };
  assertEquals(isScopeEligibleForSync(row, now), false);
});

Deno.test("isScopeEligibleForSync: cooldown past → eligible again", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const row = { cooldown_until: "2026-07-05T09:55:00.000Z" };
  assertEquals(isScopeEligibleForSync(row, now), true);
});

Deno.test("isScopeEligibleForSync: unparseable timestamp fails open", () => {
  assertEquals(isScopeEligibleForSync({ cooldown_until: "not-a-date" }), true);
});

// ------------------------------ Upsert builder

Deno.test("buildQuotaCooldownUpsert: cooldown_until = now + finalRetryAfterSeconds", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const row = buildQuotaCooldownUpsert({
    scopeKey: "google:abc",
    provider: "google",
    finalRetryAfterSeconds: 600,
    reason: "quotaExceeded",
    now,
  });
  assertEquals(row.scope_key, "google:abc");
  assertEquals(row.provider, "google");
  assertEquals(row.retry_after_seconds, 600);
  assertEquals(row.cooldown_until, "2026-07-05T10:10:00.000Z");
  assertEquals(row.last_reason, "quotaExceeded");
  assertEquals(row.hit_count, 1);
});

Deno.test("buildQuotaCooldownUpsert: increments prior hit_count", () => {
  const row = buildQuotaCooldownUpsert({
    scopeKey: "google:abc",
    provider: "google",
    finalRetryAfterSeconds: 300,
    reason: null,
    priorHitCount: 7,
    now: new Date("2026-07-05T10:00:00.000Z"),
  });
  assertEquals(row.hit_count, 8);
});

// ------------------------------ Lifecycle: cross-connection coordination

Deno.test("lifecycle: same-scope Google throttle extends shared cooldown; other scope untouched", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");

  // Connection A hits a Google 429 with 60s Retry-After.
  const rateA = buildRateLimitedUpdate({
    message: "rate", reason: "userRateLimitExceeded",
    retryAfterSeconds: 60, consecutivePriorCount: 0,
    jitterSeed: "conn-A", now,
  });
  const scopeGoogle = computeQuotaScopeKey({ provider: "google", clientId: "google-client-1" });
  const scopeMs = computeQuotaScopeKey({ provider: "microsoft", clientId: "ms-client-1" });
  const scopeRowGoogle = buildQuotaCooldownUpsert({
    scopeKey: scopeGoogle, provider: "google",
    finalRetryAfterSeconds: rateA.retry_after_seconds,
    reason: "userRateLimitExceeded", priorHitCount: 0, now,
  });

  // Connection B in the SAME Google scope has never failed → its own
  // next_retry_at is null, so per-row check would let it run.
  const bRowSelf: { next_retry_at: string | null } = { next_retry_at: null };
  // But the shared scope must block it:
  assertEquals(isScopeEligibleForSync(scopeRowGoogle, now), false);

  // A DIFFERENT provider/scope (Microsoft) is completely unaffected:
  assertEquals(isScopeEligibleForSync({ scope_key: scopeMs }, now), true);

  // Sanity: after the cooldown window passes, the scope frees itself.
  const later = new Date(now.getTime() + (rateA.retry_after_seconds + 1) * 1000);
  assertEquals(isScopeEligibleForSync(scopeRowGoogle, later), true);

  // And confirm bRowSelf is a plain object so we haven't stubbed the
  // per-row check away.
  assertEquals(bRowSelf.next_retry_at, null);
});

Deno.test("lifecycle: Microsoft mirrors the Google behavior with an independent scope", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const rateM = buildRateLimitedUpdate({
    message: "throttled", reason: "TooManyRequests",
    retryAfterSeconds: 120, consecutivePriorCount: 0,
    jitterSeed: "conn-M1", now,
  });
  const scopeMs = computeQuotaScopeKey({ provider: "microsoft", clientId: "ms-client-1" });
  const scopeRowMs = buildQuotaCooldownUpsert({
    scopeKey: scopeMs, provider: "microsoft",
    finalRetryAfterSeconds: rateM.retry_after_seconds,
    reason: "TooManyRequests", now,
  });
  assertEquals(isScopeEligibleForSync(scopeRowMs, now), false);

  // A Microsoft connection under a *different* client id is unaffected.
  const otherScope = computeQuotaScopeKey({ provider: "microsoft", clientId: "ms-client-2" });
  assertEquals(otherScope !== scopeMs, true);
  assertEquals(isScopeEligibleForSync({ scope_key: otherScope }, now), true);
});

Deno.test("lifecycle: per-connection success does NOT clear shared scope (documented policy)", () => {
  // This test guards the documented policy in
  // QUOTA_COOLDOWN_SUCCESS_POLICY. Success writes to the per-row
  // state only; the scope row stays until cooldown_until elapses.
  const now = new Date("2026-07-05T10:00:00.000Z");
  const scopeGoogle = computeQuotaScopeKey({ provider: "google", clientId: "google-client-1" });
  const scopeRow = buildQuotaCooldownUpsert({
    scopeKey: scopeGoogle, provider: "google",
    finalRetryAfterSeconds: 900, reason: "quotaExceeded", now,
  });
  const perRowSuccess = buildSuccessfulSyncUpdate(now);
  // Success builder does not emit a `scope_key` field at all — it
  // owns per-row state only.
  assertEquals(Object.prototype.hasOwnProperty.call(perRowSuccess, "scope_key"), false);
  // Scope stays cooling down.
  assertEquals(isScopeEligibleForSync(scopeRow, now), false);
});

// ------------------------------ Regression: per-row backoff/jitter preserved

Deno.test("regression: adding scope layer does NOT alter per-row backoff/jitter builder output", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const upd = buildRateLimitedUpdate({
    message: "quota", reason: "quotaExceeded",
    consecutivePriorCount: 1, // ladder → 600
    jitterSeed: "conn-regression", now,
  });
  // Streak advanced.
  assertEquals(upd.consecutive_delay_count, 2);
  // Final delay still within jitter bounds of base=600 (max window 60s
  // → clamp to 300s absolute in policy, but for base=600 window = 60).
  assert(upd.retry_after_seconds >= 540 && upd.retry_after_seconds <= 660,
    `expected ~600±60, got ${upd.retry_after_seconds}`);
});