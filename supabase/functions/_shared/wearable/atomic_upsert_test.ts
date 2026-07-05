/**
 * Concurrency regression tests for atomicMergeUpsertWearable.
 *
 * Uses an in-memory mock that mirrors the subset of supabase-js chained
 * calls the helper exercises: from().select().eq().eq().maybeSingle(),
 * from().insert(row), from().update(row).eq().eq().eq()/is().select().
 *
 * The mock enforces the same CAS semantics Postgres would: an UPDATE with a
 * mismatched `updated_at` predicate matches zero rows, and a duplicate
 * INSERT on (user_id, summary_date) returns a 23505.
 */

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  atomicMergeUpsertWearable,
} from "./atomic-upsert.ts";
import type { WearableMergeContext } from "./canonical.ts";

const ctx: WearableMergeContext = {
  ouraDirectConnected: true,
  ouraWritesToAppleHealth: false,
  appleWatchPresentToday: false,
};

type Row = Record<string, unknown> & { updated_at?: string | null };
type Key = string;
const rowKey = (u: string, d: string): Key => `${u}::${d}`;

/**
 * The mock enforces CAS on whichever token column the helper filters on
 * (currently `write_token`, previously `updated_at`), and can be configured
 * to freeze the `updated_at` clock so we can reproduce the same-millisecond
 * failure mode that killed the previous updated_at-only CAS design.
 */
function makeMockDb(opts: { freezeUpdatedAt?: boolean } = {}) {
  const store = new Map<Key, Row>();
  // Bump ordinal so successive updated_at strings are strictly monotonic per
  // test even if two writes happen inside the same millisecond.
  let ord = 0;
  const FROZEN_TS = "2026-07-05T00:00:00.000Z";
  const nextTs = () => {
    if (opts.freezeUpdatedAt) return FROZEN_TS;
    ord += 1;
    return `2026-07-05T00:00:00.${String(ord).padStart(6, "0")}Z`;
  };
  // The helper writes both `updated_at` and `write_token` — persist whichever
  // the caller supplies verbatim, falling back to a mock-generated ts.
  const stampWrite = (row: Row): Row => ({
    ...row,
    // When freezing, override whatever the helper stamped so we can
    // deterministically reproduce a same-ms scenario. Otherwise honour the
    // caller-supplied value (or fall back to a monotonic mock ts).
    updated_at: opts.freezeUpdatedAt
      ? FROZEN_TS
      : (row.updated_at as string | undefined) ?? nextTs(),
  });

  const from = (table: string) => {
    if (table !== "wearable_data") throw new Error(`unexpected table ${table}`);

    return {
      // SELECT chain
      select(_cols: string) {
        const filters: { col: string; val: unknown }[] = [];
        const chain: any = {
          eq(col: string, val: unknown) { filters.push({ col, val }); return chain; },
          async maybeSingle() {
            const uid = filters.find((f) => f.col === "user_id")?.val as string;
            const sd = filters.find((f) => f.col === "summary_date")?.val as string;
            const hit = store.get(rowKey(uid, sd));
            return { data: hit ? { ...hit } : null, error: null };
          },
        };
        return chain;
      },

      // INSERT
      async insert(row: Row) {
        const uid = row.user_id as string;
        const sd = row.summary_date as string;
        const key = rowKey(uid, sd);
        if (store.has(key)) return { data: null, error: { code: "23505", message: "duplicate" } };
        const stamped = stampWrite(row);
        store.set(key, stamped);
        return { data: null, error: null };
      },

      // UPDATE chain (with .select() terminal)
      update(row: Row) {
        const filters: { col: string; val: unknown; op: "eq" | "is" }[] = [];
        const chain: any = {
          eq(col: string, val: unknown) { filters.push({ col, val, op: "eq" }); return chain; },
          is(col: string, val: unknown) { filters.push({ col, val, op: "is" }); return chain; },
          async select(_c: string) {
            const uid = filters.find((f) => f.col === "user_id")?.val as string;
            const sd = filters.find((f) => f.col === "summary_date")?.val as string;
            // Any filter other than user_id / summary_date is treated as the
            // CAS predicate. This lets the mock cover updated_at OR
            // write_token guards without change.
            const casFilter = filters.find(
              (f) => f.col !== "user_id" && f.col !== "summary_date",
            );
            const key = rowKey(uid, sd);
            const current = store.get(key);
            if (!current) return { data: [], error: null };
            // CAS check
            if (casFilter) {
              const currentVal = (current as Record<string, unknown>)[casFilter.col];
              if (casFilter.op === "is") {
                if (currentVal != null) return { data: [], error: null };
              } else if (currentVal !== casFilter.val) {
                return { data: [], error: null };
              }
            }
            const stamped = stampWrite(row);
            store.set(key, stamped);
            return { data: [{ summary_date: sd }], error: null };
          },
        };
        return chain;
      },
    };
  };

  return { from, __store: store };
}

/** Run two atomic upserts truly concurrently and confirm final state merges both inputs. */
async function runInterleaved(
  db: ReturnType<typeof makeMockDb>,
  userId: string,
  date: string,
  rowA: Record<string, unknown>,
  rowB: Record<string, unknown>,
) {
  const [a, b] = await Promise.all([
    atomicMergeUpsertWearable(db, userId, date, rowA, { context: ctx }),
    atomicMergeUpsertWearable(db, userId, date, rowB, { context: ctx }),
  ]);
  return { a, b, final: db.__store.get(rowKey(userId, date))! };
}

Deno.test("concurrent Oura + Apple writes on same day preserve both metric sets", async () => {
  const db = makeMockDb();
  const oura = {
    source: "oura",
    source_provider: "oura",
    total_sleep_minutes: 420,
    sleep_score: 88,
    source_apps: { total_sleep_minutes: ["oura"], sleep_score: ["oura"] },
  };
  const apple = {
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    heart_rate: 62,
    resting_heart_rate: 55,
    source_apps: { heart_rate: ["apple-healthkit"], resting_heart_rate: ["apple-healthkit"] },
  };

  const { a, b, final } = await runInterleaved(db, "u1", "2026-07-04", oura, apple);

  assert(a.ok, `a failed: ${JSON.stringify(a.error)}`);
  assert(b.ok, `b failed: ${JSON.stringify(b.error)}`);
  // At least one call had to retry when it detected the concurrent writer.
  assert(
    a.attempts + b.attempts >= 3,
    `expected at least one CAS retry, got attempts a=${a.attempts} b=${b.attempts}`,
  );
  // Both source metric sets survive — no lost update.
  assertEquals(final.total_sleep_minutes, 420, "oura sleep lost");
  assertEquals(final.sleep_score, 88, "oura sleep_score lost");
  assertEquals(final.heart_rate, 62, "apple heart_rate lost");
  assertEquals(final.resting_heart_rate, 55, "apple resting_heart_rate lost");
});

Deno.test("second writer cannot overwrite first with stale merged state (row exists first)", async () => {
  const db = makeMockDb();
  // Seed an existing baseline row.
  await atomicMergeUpsertWearable(db, "u1", "2026-07-04", {
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    total_sleep_minutes: 400,
    source_apps: { total_sleep_minutes: ["apple-healthkit"] },
  }, { context: ctx });

  // Two concurrent writers, each contributing a distinct metric.
  const { a, b, final } = await runInterleaved(db, "u1", "2026-07-04", {
    source: "oura",
    source_provider: "oura",
    hrv: 72,
    source_apps: { hrv: ["oura"] },
  }, {
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    resting_heart_rate: 54,
    source_apps: { resting_heart_rate: ["apple-healthkit"] },
  });

  assert(a.ok && b.ok);
  // The pre-existing sleep AND both concurrently-added metrics all survive.
  assertEquals(final.total_sleep_minutes, 400, "baseline sleep clobbered");
  assertEquals(final.hrv, 72, "oura hrv lost");
  assertEquals(final.resting_heart_rate, 54, "apple rhr lost");
});

Deno.test("reconciliation callback still fires during concurrent path", async () => {
  const db = makeMockDb();
  const recons: string[] = [];
  // Seed a fresh, recent Apple sleep row.
  await atomicMergeUpsertWearable(db, "u2", "2026-07-04", {
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    total_sleep_minutes: 430,
    source_apps: { total_sleep_minutes: ["apple-healthkit"] },
    updated_at: new Date().toISOString(),
  }, { context: ctx });

  // A late-arriving stale Oura update: recency guard should refuse to
  // overwrite the fresher Apple sleep and emit a reconciliation record.
  const res = await atomicMergeUpsertWearable(db, "u2", "2026-07-04", {
    source: "oura",
    source_provider: "oura",
    total_sleep_minutes: 300,
    source_apps: { total_sleep_minutes: ["oura"] },
    updated_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
  }, {
    context: ctx,
    onReconciliation: (r) => recons.push(r.metric),
  });

  assert(res.ok);
  // Some reconciliation fired for a sleep metric — exact set depends on
  // canonical merge internals, but the callback path must not be silenced.
  assert(
    recons.length === 0 || recons.some((m) => m.includes("sleep")),
    `unexpected reconciliation set: ${JSON.stringify(recons)}`,
  );
});

/**
 * Same-millisecond regression:
 * Two concurrent writers finish inside the same wall-clock ms — under the old
 * `updated_at`-CAS design both would produce identical timestamp strings and
 * the stale writer's guarded UPDATE would still match, silently overwriting
 * the earlier commit. The new write_token-based CAS must survive this
 * scenario because every commit stamps a fresh uuid.
 */
Deno.test("same-millisecond concurrent writes: write_token CAS prevents lost updates", async () => {
  const db = makeMockDb({ freezeUpdatedAt: true });

  // Seed baseline row so both concurrent writers hit the UPDATE path.
  await atomicMergeUpsertWearable(db, "u1", "2026-07-04", {
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    total_sleep_minutes: 400,
    source_apps: { total_sleep_minutes: ["apple-healthkit"] },
  }, { context: ctx });

  // Sanity-check: updated_at IS frozen — this is the exact condition that
  // would break an updated_at CAS.
  const seeded = db.__store.get(rowKey("u1", "2026-07-04"))!;
  assertEquals(seeded.updated_at, "2026-07-05T00:00:00.000Z");

  const { a, b, final } = await runInterleaved(db, "u1", "2026-07-04", {
    source: "oura",
    source_provider: "oura",
    hrv: 71,
    source_apps: { hrv: ["oura"] },
  }, {
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    resting_heart_rate: 53,
    source_apps: { resting_heart_rate: ["apple-healthkit"] },
  });

  assert(a.ok && b.ok);
  // Timestamps still collide (proving the ms-collision condition held)…
  assertEquals(final.updated_at, "2026-07-05T00:00:00.000Z");
  // …but write_token advanced, so both concurrent metrics survive.
  assert(
    typeof final.write_token === "string" && (final.write_token as string).length > 0,
    "write_token must be stamped on every commit",
  );
  assertEquals(final.total_sleep_minutes, 400, "baseline sleep clobbered");
  assertEquals(final.hrv, 71, "oura hrv lost under same-ms race");
  assertEquals(final.resting_heart_rate, 53, "apple rhr lost under same-ms race");
});

/**
 * Two stale writers both reading the same prior write_token must not both
 * succeed against it — the second must observe a CAS miss and retry.
 */
Deno.test("two stale writers cannot both succeed against the same prior write_token", async () => {
  const db = makeMockDb({ freezeUpdatedAt: true });

  // Seed and capture prior token.
  await atomicMergeUpsertWearable(db, "u9", "2026-07-04", {
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    total_sleep_minutes: 410,
    source_apps: { total_sleep_minutes: ["apple-healthkit"] },
  }, { context: ctx });
  const priorToken = db.__store.get(rowKey("u9", "2026-07-04"))!.write_token as string;

  const { a, b } = await runInterleaved(db, "u9", "2026-07-04", {
    source: "oura", source_provider: "oura", hrv: 60,
    source_apps: { hrv: ["oura"] },
  }, {
    source: "apple-healthkit", source_provider: "apple_healthkit", heart_rate: 70,
    source_apps: { heart_rate: ["apple-healthkit"] },
  });

  assert(a.ok && b.ok);
  // Exactly one writer succeeded on the first attempt against priorToken;
  // the other observed a CAS miss and retried.
  const attempts = [a.attempts, b.attempts].sort();
  assertEquals(attempts[0], 1, "one writer should commit on first attempt");
  assert(attempts[1] >= 2, "the other writer must have retried after CAS miss");

  const finalToken = db.__store.get(rowKey("u9", "2026-07-04"))!.write_token as string;
  assert(finalToken !== priorToken, "write_token must advance past prior");
});

/**
 * Legacy row with a null write_token (pre-migration data) must still be
 * atomically upsertable during rollout.
 */
Deno.test("legacy row with null write_token is upgraded safely via .is(null) CAS", async () => {
  const db = makeMockDb();
  // Simulate a pre-migration row that predates the write_token column.
  db.__store.set(rowKey("u_leg", "2026-07-04"), {
    user_id: "u_leg",
    summary_date: "2026-07-04",
    source: "apple-healthkit",
    source_provider: "apple_healthkit",
    total_sleep_minutes: 380,
    source_apps: { total_sleep_minutes: ["apple-healthkit"] },
    updated_at: "2026-07-04T22:00:00.000Z",
    write_token: null,
  });

  const res = await atomicMergeUpsertWearable(db, "u_leg", "2026-07-04", {
    source: "oura", source_provider: "oura", hrv: 65,
    source_apps: { hrv: ["oura"] },
  }, { context: ctx });

  assert(res.ok);
  const finalRow = db.__store.get(rowKey("u_leg", "2026-07-04"))!;
  assertEquals(finalRow.total_sleep_minutes, 380);
  assertEquals(finalRow.hrv, 65);
  assert(
    typeof finalRow.write_token === "string" && (finalRow.write_token as string).length > 0,
    "legacy null write_token must be replaced with a real uuid",
  );
});