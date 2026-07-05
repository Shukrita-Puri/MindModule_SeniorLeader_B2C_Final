import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyJitterToDelay,
  buildRateLimitedUpdate,
  buildSuccessfulSyncUpdate,
  computeRetryJitterSeconds,
  RETRY_HINT_MAX_SECONDS,
  RETRY_HINT_MIN_SECONDS,
  RETRY_JITTER_MAX_SECONDS,
  RETRY_JITTER_MIN_SECONDS,
  RETRY_JITTER_RATIO,
} from "./calendar-connection-state.ts";

Deno.test("computeRetryJitterSeconds: deterministic for same seed + base", () => {
  const a = computeRetryJitterSeconds("conn-abc:1", 600);
  const b = computeRetryJitterSeconds("conn-abc:1", 600);
  assertEquals(a, b);
});

Deno.test("computeRetryJitterSeconds: different seeds spread within allowed window", () => {
  const base = 600;
  const window = Math.max(
    RETRY_JITTER_MIN_SECONDS,
    Math.min(RETRY_JITTER_MAX_SECONDS, Math.floor(base * RETRY_JITTER_RATIO)),
  );
  const seen = new Set<number>();
  for (let i = 0; i < 50; i++) {
    const j = computeRetryJitterSeconds(`conn-${i}:1`, base);
    assert(j >= -window && j <= window, `jitter ${j} out of window ±${window}`);
    seen.add(j);
  }
  // Across 50 distinct seeds we expect meaningful spread, not one value.
  assert(seen.size > 10, `expected spread, got ${seen.size} unique values`);
});

Deno.test("computeRetryJitterSeconds: enforces min/max jitter window regardless of base", () => {
  // Very small base → min window applies
  for (let i = 0; i < 20; i++) {
    const j = computeRetryJitterSeconds(`s-${i}`, 60);
    assert(Math.abs(j) <= RETRY_JITTER_MIN_SECONDS,
      `expected |jitter|<=${RETRY_JITTER_MIN_SECONDS}, got ${j}`);
  }
  // Very large base → max window caps
  for (let i = 0; i < 20; i++) {
    const j = computeRetryJitterSeconds(`s-${i}`, 3600);
    assert(Math.abs(j) <= RETRY_JITTER_MAX_SECONDS,
      `expected |jitter|<=${RETRY_JITTER_MAX_SECONDS}, got ${j}`);
  }
});

Deno.test("applyJitterToDelay: no seed → no jitter (backward compat)", () => {
  const r = applyJitterToDelay(null, 600);
  assertEquals(r.jitterSeconds, 0);
  assertEquals(r.finalDelaySeconds, 600);
});

Deno.test("applyJitterToDelay: final delay clamped to [MIN, MAX]", () => {
  // Force a seed whose jitter would push below MIN; final must clamp.
  // We test the property via a scan.
  for (let i = 0; i < 200; i++) {
    const r = applyJitterToDelay(`edge-${i}`, RETRY_HINT_MIN_SECONDS);
    assert(r.finalDelaySeconds >= RETRY_HINT_MIN_SECONDS);
    assert(r.finalDelaySeconds <= RETRY_HINT_MAX_SECONDS);
  }
  for (let i = 0; i < 200; i++) {
    const r = applyJitterToDelay(`edge-${i}`, RETRY_HINT_MAX_SECONDS);
    assert(r.finalDelaySeconds >= RETRY_HINT_MIN_SECONDS);
    assert(r.finalDelaySeconds <= RETRY_HINT_MAX_SECONDS);
  }
});

Deno.test("buildRateLimitedUpdate: explicit Retry-After still wins before jitter", () => {
  // Provider hint 120s + jitterSeed → base=120, jitter window = max(15, 12) = 15
  const upd = buildRateLimitedUpdate({
    message: "throttled",
    reason: "TooManyRequests",
    retryAfterSeconds: 120,
    consecutivePriorCount: 3, // ladder would say 2400s, must be ignored
    jitterSeed: "conn-explicit",
    now: new Date("2026-07-05T10:00:00.000Z"),
  });
  // With base=120 and jitter window=15, final ∈ [max(60,105), 135]
  assert(upd.retry_after_seconds >= 105 && upd.retry_after_seconds <= 135,
    `expected ~120±15, got ${upd.retry_after_seconds}`);
});

Deno.test("buildRateLimitedUpdate: two connections at same base are unlikely to get same next_retry_at (collision-reducing, not collision-proof)", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const a = buildRateLimitedUpdate({
    message: "quota", reason: "quotaExceeded",
    consecutivePriorCount: 1, // base=600
    jitterSeed: "connection-a",
    now,
  });
  const b = buildRateLimitedUpdate({
    message: "quota", reason: "quotaExceeded",
    consecutivePriorCount: 1, // base=600
    jitterSeed: "connection-b",
    now,
  });
  // These two specific seeds resolve to different jittered delays; the
  // real guarantee we're documenting is spread across MANY seeds, not a
  // per-pair uniqueness contract. See the spread test above.
  assertNotEquals(a.next_retry_at, b.next_retry_at);
});

Deno.test("lifecycle: repeated Google throttles advance streak and stay in retry window", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  let priorCount = 0;
  const seed = "google-conn-xyz";
  const bases = [300, 600, 1200];
  for (const base of bases) {
    const upd = buildRateLimitedUpdate({
      message: "quota", reason: "quotaExceeded",
      consecutivePriorCount: priorCount,
      jitterSeed: seed,
      now,
    });
    assertEquals(upd.sync_status, "sync_delayed");
    assertEquals(upd.consecutive_delay_count, priorCount + 1);
    const window = Math.max(
      RETRY_JITTER_MIN_SECONDS,
      Math.min(RETRY_JITTER_MAX_SECONDS, Math.floor(base * RETRY_JITTER_RATIO)),
    );
    assert(
      upd.retry_after_seconds >= Math.max(RETRY_HINT_MIN_SECONDS, base - window) &&
        upd.retry_after_seconds <= Math.min(RETRY_HINT_MAX_SECONDS, base + window),
      `delay ${upd.retry_after_seconds} out of ${base}±${window}`,
    );
    priorCount++;
  }
});

Deno.test("lifecycle: repeated Microsoft throttles advance streak (same shared builder)", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const seed = "ms-conn-xyz";
  let priorCount = 0;
  for (let i = 0; i < 3; i++) {
    const upd = buildRateLimitedUpdate({
      message: "throttled", reason: "TooManyRequests",
      retryAfterSeconds: null, // provider omitted hint → ladder
      consecutivePriorCount: priorCount,
      jitterSeed: seed,
      now,
    });
    assertEquals(upd.consecutive_delay_count, i + 1);
    priorCount++;
  }
});

Deno.test("lifecycle: success after jittered delays resets streak + metadata", () => {
  const now = new Date("2026-07-05T10:00:00.000Z");
  const delayed = buildRateLimitedUpdate({
    message: "quota", reason: "quotaExceeded",
    consecutivePriorCount: 2,
    jitterSeed: "reset-conn",
    now,
  });
  assertEquals(delayed.consecutive_delay_count, 3);
  const success = buildSuccessfulSyncUpdate(new Date("2026-07-05T10:30:00.000Z"));
  assertEquals(success.consecutive_delay_count, 0);
  assertEquals(success.retry_after_seconds, null);
  assertEquals(success.next_retry_at, null);
  assertEquals(success.last_sync_delayed_at, null);
});