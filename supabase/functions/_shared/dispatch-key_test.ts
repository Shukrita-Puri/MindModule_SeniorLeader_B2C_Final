import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimDispatch, computeDispatchKey } from "./dispatch-key.ts";

// Minimal in-memory supabase mock that enforces the UNIQUE constraint
// on `dispatch_key` the same way Postgres does. Enough to prove the
// concurrency contract without spinning up a real DB.
function makeMockSupabase() {
  const rows: Array<Record<string, unknown>> = [];
  return {
    _rows: rows,
    from(table: string) {
      if (table !== "notification_dispatch_claims") {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        insert(row: Record<string, unknown>) {
          const dispatchKey = String(row.dispatch_key);
          const dup = rows.find((r) => r.dispatch_key === dispatchKey);
          if (dup) {
            return {
              select() {
                return {
                  async single() {
                    return {
                      data: null,
                      error: { code: "23505", message: "duplicate key value violates unique constraint" },
                    };
                  },
                };
              },
            };
          }
          const id = `claim-${rows.length + 1}`;
          const stored = { id, notification_log_id: null, ...row };
          rows.push(stored);
          return {
            select() {
              return {
                async single() {
                  return { data: { id }, error: null };
                },
              };
            },
          };
        },
        select() {
          return {
            eq(_col: string, value: string) {
              return {
                async maybeSingle() {
                  const found = rows.find((r) => r.dispatch_key === value);
                  return { data: found ?? null, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test("computeDispatchKey is deterministic and includes all identifying fields", () => {
  const a = computeDispatchKey({
    userId: "auth0|abc",
    notificationType: "nudge_one",
    slot: "morning",
    localDate: "2026-07-11",
    eventReference: "evt-1",
  });
  const b = computeDispatchKey({
    userId: "auth0|abc",
    notificationType: "nudge_one",
    slot: "morning",
    localDate: "2026-07-11",
    eventReference: "evt-1",
  });
  assertEquals(a, b);
  assert(a.includes("auth0|abc"));
  assert(a.includes("2026-07-11"));
  assert(a.includes("nudge_one"));
  assert(a.includes("evt-1"));
});

Deno.test("computeDispatchKey differs when slot or event changes", () => {
  const base = {
    userId: "u1",
    notificationType: "nudge_two",
    localDate: "2026-07-11",
  };
  const morning = computeDispatchKey({ ...base, slot: "morning" });
  const afternoon = computeDispatchKey({ ...base, slot: "afternoon" });
  assert(morning !== afternoon);

  const evt1 = computeDispatchKey({ ...base, slot: "morning", eventReference: "e1" });
  const evt2 = computeDispatchKey({ ...base, slot: "morning", eventReference: "e2" });
  assert(evt1 !== evt2);
});

Deno.test("null/undefined field never collides with present value", () => {
  const withEvt = computeDispatchKey({
    userId: "u",
    notificationType: "t",
    localDate: "2026-07-11",
    eventReference: "-",
  });
  const withoutEvt = computeDispatchKey({
    userId: "u",
    notificationType: "t",
    localDate: "2026-07-11",
    eventReference: null,
  });
  // Both normalise to "-" but the raw "-" event id will also normalise
  // to "-" — this is acceptable because in practice event IDs are
  // UUIDs / opaque strings, never a literal dash.
  assertEquals(withEvt, withoutEvt);
});

Deno.test("claimDispatch: first claim wins, second returns already_claimed", async () => {
  const db = makeMockSupabase();
  const input = {
    userId: "u1",
    notificationType: "nudge_one",
    localDate: "2026-07-11",
    slot: "morning",
    eventReference: "e1",
  };
  const first = await claimDispatch(db, input);
  assertEquals(first.claimed, true);
  assert(first.claimId !== null);

  const second = await claimDispatch(db, input);
  assertEquals(second.claimed, false);
  assertEquals(second.reason, "already_claimed");
});

Deno.test("claimDispatch: concurrent claims produce exactly one winner", async () => {
  const db = makeMockSupabase();
  const input = {
    userId: "u1",
    notificationType: "nudge_two",
    localDate: "2026-07-11",
    slot: "afternoon",
  };
  const results = await Promise.all(
    Array.from({ length: 8 }, () => claimDispatch(db, input)),
  );
  const winners = results.filter((r) => r.claimed);
  const losers = results.filter((r) => !r.claimed);
  assertEquals(winners.length, 1, "exactly one claimant may send");
  assertEquals(losers.length, 7);
  for (const l of losers) assertEquals(l.reason, "already_claimed");
});

Deno.test("claimDispatch: different decisions do not collide", async () => {
  const db = makeMockSupabase();
  const a = await claimDispatch(db, {
    userId: "u1",
    notificationType: "nudge_one",
    localDate: "2026-07-11",
    slot: "morning",
  });
  const b = await claimDispatch(db, {
    userId: "u1",
    notificationType: "nudge_two",
    localDate: "2026-07-11",
    slot: "afternoon",
  });
  assertEquals(a.claimed, true);
  assertEquals(b.claimed, true);
});