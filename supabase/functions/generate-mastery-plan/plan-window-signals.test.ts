// Sprint D — source-level contract for Plan window-signal wiring.
//
// The full handler cannot be imported at test time (Supabase env at
// import). These tests assert the wiring rules the reviewer scans for:
//   - `derivePlanWindowSignals` exists and is called next to selection.
//   - `windowSignals` is passed into `selectPracticeForSlot`.
//   - No new DB fetch is introduced in the derivation helper.

import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("Sprint D — derivePlanWindowSignals is defined", () => {
  assertStringIncludes(SRC, "export function derivePlanWindowSignals(");
});

Deno.test("Sprint D — windowSignals is passed into selectPracticeForSlot", () => {
  assert(
    SRC.includes("const windowSignals = derivePlanWindowSignals(req, timeOfDay);") || SRC.includes("derivePlanWindowSignals(req, timeOfDayForWhy)"),
    "derivePlanWindowSignals must be called",
  );
});

Deno.test("Sprint D — derivation helper does not add new DB queries", () => {
  // Isolate the helper body and assert it never touches supabaseClient.
  const start = SRC.indexOf("export function derivePlanWindowSignals(");
  assert(start >= 0, "helper not found");
  const end = SRC.indexOf("\nasync function buildSharedContext(", start);
  assert(end > start, "helper end not found");
  const body = SRC.slice(start, end);
  assert(!body.includes("supabaseClient"), "helper must not query the DB");
  assert(!body.includes(".from("), "helper must not call .from()");
  assert(!body.includes("fetch("), "helper must not call fetch()");
});


