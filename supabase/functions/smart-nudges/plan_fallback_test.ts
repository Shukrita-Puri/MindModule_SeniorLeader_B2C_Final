// Source-level assertions for the plan-snapshot fail-open contract.
//
// Task-driven: when the persisted plan snapshot is `empty` or when a
// slot preference is disabled, smart-nudges must NOT hard-stop the
// user loop. Empty snapshots fall through to the legacy 3-nudge
// cascade; disabled slot preferences skip only the projected slot.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("smart-nudges fails open to legacy cascade when plan snapshot is empty", () => {
  // The old bug: `if (ctx.planSnapshotStatus === 'empty') { …; continue; }`.
  // The new contract logs a structured warning + trace and then falls
  // through to the legacy cascade guard which now matches BOTH
  // 'missing' and 'empty'.
  assert(
    SRC.includes("[smart-nudges][plan-empty-fallback]"),
    "expected structured warning log for plan-empty fallback",
  );
  assert(
    SRC.includes("plan_snapshot_empty_fallback"),
    "expected trace outcome renamed away from `no_qualified_nudge`",
  );
  assert(
    /ctx\.planSnapshotStatus === 'missing'\s*\|\|\s*ctx\.planSnapshotStatus === 'empty'/.test(SRC),
    "legacy 3-nudge cascade guard must match both `missing` and `empty` statuses",
  );
});

Deno.test("smart-nudges does not `continue` the user loop on plan-empty status", () => {
  // Find the empty-status warning and make sure no `continue;` follows
  // it before the ready/missing branches are evaluated.
  const idx = SRC.indexOf("[smart-nudges][plan-empty-fallback]");
  assert(idx > -1);
  // Grab a bounded window and look for a `continue;` before the
  // legacy-cascade guard. If we find one, the fail-open regressed.
  const window = SRC.slice(idx, idx + 800);
  const nextContinue = window.indexOf("continue;");
  const guardIdx = window.indexOf("planSnapshotStatus === 'missing'");
  assert(
    nextContinue === -1 || (guardIdx > -1 && nextContinue > guardIdx),
    "plan-empty branch must not `continue` before the legacy cascade guard",
  );
});

Deno.test("disabled slot preference skips only the projected slot, not the whole user", () => {
  // The old bug: inside the `planSnapshotStatus === 'ready'` branch, a
  // disabled slot preference triggered `continue;` which aborted the
  // whole loop (skipping observability + downstream evaluators).
  assert(
    SRC.includes("slot_projection_skipped"),
    "expected new trace outcome for intentionally-skipped slot projections",
  );
  assert(
    SRC.includes("intentionally_skipped: true"),
    "trace metadata must mark the skip as intentional (preference-driven)",
  );
  // The block that logs `slot_projection_skipped` must not `continue;`
  // out of the user loop.
  const idx = SRC.indexOf("slot_projection_skipped");
  assert(idx > -1);
  const window = SRC.slice(idx, idx + 400);
  assert(
    !/\}\s*\)?;\s*continue;/.test(window),
    "slot_projection_skipped branch must not `continue` the enclosing user loop",
  );
});

Deno.test("plan-driven projection remains preferred when slot pref is enabled", () => {
  // A `ready` snapshot with an enabled slot preference must still call
  // `projectPlanSlotToNudge` — the fail-open is a fallback, not a
  // replacement.
  assert(
    /planSnapshotStatus === 'ready'[\s\S]*projectPlanSlotToNudge\(ctx, activeSlot/.test(
      SRC,
    ),
    "ready plan snapshot must still drive projected-slot nudge",
  );
});

Deno.test("slot-cap reconstruction prefers persisted delivery slot over family-name inference", () => {
  assert(
    SRC.includes("function slotFromNotificationLogRow("),
    "expected dedicated notification_log slot reader",
  );
  assert(
    SRC.includes(".select('notification_type, variant_id, sent_at, event_reference, payload')"),
    "today log query must hydrate payload so slot-cap can read persisted slot",
  );
  assert(
    SRC.includes("const explicitSlot = metadata?.delivery_slot ?? payload?.slot;"),
    "slot reader must prefer persisted payload slot metadata",
  );
  assert(
    SRC.includes(".map((l) => slotFromNotificationLogRow(l))"),
    "sentSlotsToday must derive from the slot reader, not hardcoded type mapping alone",
  );
  assert(
    SRC.includes("slot: notif.slot,"),
    "notification payload must persist the actual delivery slot for future runs",
  );
  assert(
    SRC.includes("delivery_slot: notif.slot,"),
    "notification payload metadata must also persist the actual delivery slot",
  );
});
