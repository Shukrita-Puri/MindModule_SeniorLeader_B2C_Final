import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { WEEK_AHEAD_REASONS } from "./week-ahead-nudge.ts";

/**
 * Guard: no week-ahead reason may be a suffix of another reason. The
 * verification SQL in `docs/WEEK_AHEAD_TRIGGER_VERIFICATION.sql` and the
 * dispatched `variant_id` use a `LIKE '%::<reason>'` pattern; if reason
 * A ends with reason B (or vice versa) the LIKE clause would silently
 * match both, double-counting in dashboards and breaking per-reason
 * idempotency lookups if we ever scope them by suffix.
 */
Deno.test("WEEK_AHEAD_REASONS: no reason is a suffix of another", () => {
  const collisions: Array<[string, string]> = [];
  for (const a of WEEK_AHEAD_REASONS) {
    for (const b of WEEK_AHEAD_REASONS) {
      if (a === b) continue;
      if (b.endsWith(a)) collisions.push([a, b]);
    }
  }
  assertEquals(
    collisions,
    [],
    `Reason suffix collision(s) detected — would break '%::<reason>' LIKE matching: ${JSON.stringify(collisions)}`,
  );
});

Deno.test("WEEK_AHEAD_REASONS: all entries are unique", () => {
  assertEquals(new Set(WEEK_AHEAD_REASONS).size, WEEK_AHEAD_REASONS.length);
});

Deno.test("WEEK_AHEAD_REASONS: non-empty and well-formed", () => {
  for (const r of WEEK_AHEAD_REASONS) {
    if (!/^[a-z_]+$/.test(r)) {
      throw new Error(`Reason '${r}' must be snake_case lowercase`);
    }
  }
});