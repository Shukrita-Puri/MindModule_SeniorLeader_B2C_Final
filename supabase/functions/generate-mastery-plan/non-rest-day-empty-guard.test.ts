// Source-level guard: a non-rest-day plan that resolves to zero
// horizon modules MUST emit a structured warning from the snapshot
// persister, and MUST NOT be persisted as `ready`. Rest-day plans
// (dayShape === 'rest_day' / meta.restDay === true) are explicitly
// allowed to be `ready` with zero modules — that is the truthful
// rest-day contract.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("persister emits non-rest-day empty-payload warning", () => {
  assert(
    SRC.includes("[mastery-plan-snapshot][non-rest-day-empty-payload]"),
    "persister must log a structured warning when a non-rest-day plan lands with zero horizon modules",
  );
});

Deno.test("empty-payload guard preserves rest-day exemption", () => {
  // The guard predicate must exclude rest-day payloads and awaiting
  // envelopes — those are legitimate `ready`/`awaiting` states with
  // zero modules by design.
  assert(
    /!isRestDayPayload\s*&&\s*!planIsAwaiting\s*&&\s*horizonMods\.length === 0/.test(SRC),
    "empty-payload guard must exempt rest-day and awaiting payloads",
  );
});

Deno.test("snapshotStatus contract prevents `ready` with empty non-rest-day payload", () => {
  // `hasPayload` is the gate for `ready`. It is true when either
  // priorities or timeOfDay modules exist, or when the payload is
  // explicitly a rest_day. A non-rest-day plan with zero horizon
  // modules and zero timeOfDay modules therefore falls through to
  // `awaiting`.
  assert(
    SRC.includes("(!planIsAwaiting && hasPayload) ? 'ready' : 'awaiting'"),
    "snapshotStatus must be `awaiting` unless a payload exists and the plan is not an awaiting envelope",
  );
});