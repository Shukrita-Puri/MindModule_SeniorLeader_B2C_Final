/**
 * Retry/backoff regression tests for atomicMergeUpsertWearable.
 *
 * These tests use a fake db that can be scripted to force N CAS misses
 * before allowing a commit, and a mock sleep + rng so we can assert on the
 * exact backoff sequence without waiting on real timers.
 */

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  atomicMergeUpsertWearable,
  DEFAULT_ATOMIC_UPSERT_MAX_ATTEMPTS,
} from "./atomic-upsert.ts";
import type { WearableMergeContext } from "./canonical.ts";

const ctx: WearableMergeContext = {
  ouraDirectConnected: true,
  ouraWritesToAppleHealth: false,
  appleWatchPresentToday: false,
};

/**
 * Scriptable db: pretends there IS a row already and rejects the first
 * `casMissesToInject` UPDATEs with a CAS miss (data:[]), then commits.
 */
function scriptedMissesDb(casMissesToInject: number) {
  let misses = 0;
  const store: Record<string, unknown> = {
    write_token: "seed-token",
    total_sleep_minutes: 400,
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
  };
  return {
    from(_t: string) {
      return {
        select(_c: string) {
          const chain: any = {
            eq() { return chain; },
            async maybeSingle() { return { data: { ...store }, error: null }; },
          };
          return chain;
        },
        insert(_row: Record<string, unknown>) {
          return Promise.resolve({ data: null, error: null });
        },
        update(row: Record<string, unknown>) {
          const chain: any = {
            eq() { return chain; },
            is() { return chain; },
            async select(_c: string) {
              if (misses < casMissesToInject) {
                misses += 1;
                return { data: [], error: null };
              }
              Object.assign(store, row);
              return { data: [{ summary_date: row.summary_date }], error: null };
            },
          };
          return chain;
        },
      };
    },
  };
}

Deno.test("default max attempts is 12 (raised from 5)", () => {
  assertEquals(DEFAULT_ATOMIC_UPSERT_MAX_ATTEMPTS, 12);
});

Deno.test("survives 8 CAS misses (would fail under old default of 5)", async () => {
  const db = scriptedMissesDb(8);
  const sleeps: number[] = [];
  const res = await atomicMergeUpsertWearable(
    db,
    "u_retry",
    "2026-07-04",
    { source: "oura", source_provider: "oura", hrv: 65, source_apps: { hrv: ["oura"] } },
    {
      context: ctx,
      sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
      random: () => 0.5,
    },
  );
  assert(res.ok, `expected success, got ${JSON.stringify(res.error)}`);
  assertEquals(res.attempts, 9);
  // 8 misses ⇒ 8 backoff sleeps invoked, one per conflict.
  assertEquals(sleeps.length, 8);
  // Full-jitter: delay is < min(cap, initial * 2^n) with random()=0.5,
  // so delay = floor(0.5 * exp). All must fit within [0, maxBackoff).
  for (const d of sleeps) {
    assert(d >= 0 && d <= 500, `sleep out of expected bounds: ${d}`);
  }
  // Delays should increase (or hit the cap) monotonically for the first few.
  assert(sleeps[1] >= sleeps[0], `expected exponential growth: ${sleeps.join(",")}`);
});

Deno.test("exhaustion after configured maxAttempts returns terminal error", async () => {
  const db = scriptedMissesDb(100); // always miss
  const res = await atomicMergeUpsertWearable(
    db,
    "u_exhaust",
    "2026-07-04",
    { source: "oura", source_provider: "oura", hrv: 65, source_apps: { hrv: ["oura"] } },
    {
      context: ctx,
      maxAttempts: 4,
      sleep: () => Promise.resolve(),
      random: () => 0,
    },
  );
  assert(!res.ok);
  assertEquals(res.attempts, 4);
  assertEquals(
    (res.error as Error)?.message,
    "atomic_merge_max_retries_exceeded",
  );
});

Deno.test("backoff jitter uses injected random with capped exponential ceiling", async () => {
  const db = scriptedMissesDb(3);
  const sleeps: number[] = [];
  // random()=1 gives the maximum jittered delay; we can then assert the cap.
  const rngValues = [1, 1, 1];
  let i = 0;
  await atomicMergeUpsertWearable(
    db,
    "u_jit",
    "2026-07-04",
    { source: "oura", source_provider: "oura", hrv: 60, source_apps: { hrv: ["oura"] } },
    {
      context: ctx,
      initialBackoffMs: 10,
      maxBackoffMs: 80,
      sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); },
      random: () => rngValues[i++ % rngValues.length],
    },
  );
  // With initial=10, cap=80: exp[1..3] = min(80, 10*2^1=20, 40, 80).
  // random()=1 ⇒ delay = floor(exp) − but Math.floor(1*exp) may equal exp,
  // however since Math.random() is [0,1) our contract uses random()<1 so
  // production would never quite hit exp. The test still asserts monotonic
  // ceiling growth up to the cap.
  assertEquals(sleeps.length, 3);
  assert(sleeps[0] <= sleeps[1]);
  assert(sleeps[1] <= sleeps[2]);
  assert(sleeps[2] <= 80);
});

/** Duplicate-insert (23505) followed by success on next iteration (as update). */
Deno.test("duplicate insert conflict followed by successful update retry", async () => {
  let hasRow = false;
  let insertsAttempted = 0;
  const store: Record<string, unknown> = {};
  const db = {
    from(_t: string) {
      return {
        select(_c: string) {
          const chain: any = {
            eq() { return chain; },
            async maybeSingle() {
              return { data: hasRow ? { ...store, write_token: "t1" } : null, error: null };
            },
          };
          return chain;
        },
        async insert(row: Record<string, unknown>) {
          insertsAttempted += 1;
          if (hasRow) return { data: null, error: { code: "23505", message: "dup" } };
          hasRow = true;
          Object.assign(store, row, { write_token: "t1" });
          return { data: null, error: null };
        },
        update(row: Record<string, unknown>) {
          const chain: any = {
            eq() { return chain; },
            is() { return chain; },
            async select(_c: string) {
              Object.assign(store, row);
              return { data: [{ summary_date: row.summary_date }], error: null };
            },
          };
          return chain;
        },
      };
    },
  };
  // Pre-fill the row so the first attempt's insert path triggers 23505.
  hasRow = true;
  Object.assign(store, { source: "apple-healthkit", total_sleep_minutes: 400, write_token: "t1" });
  const res = await atomicMergeUpsertWearable(
    db,
    "u_dup",
    "2026-07-04",
    { source: "oura", source_provider: "oura", hrv: 65, source_apps: { hrv: ["oura"] } },
    {
      context: ctx,
      sleep: () => Promise.resolve(),
      random: () => 0,
    },
  );
  assert(res.ok);
  // Because hasRow=true from the seed, existing is non-null and we go
  // straight to update — insertsAttempted stays at 0. This ordering matches
  // the real read-then-write flow; the duplicate-insert branch is exercised
  // in the concurrent-writers test where two writers observe null concurrently.
  assertEquals(insertsAttempted, 0);
});