// Contract tests for the F4 reader precedence in get-mastery-plan-snapshot.
// Source-level assertions: the reader must consider awaiting rows only
// when no ready row exists, and must never let awaiting shadow ready.

import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("F4 — reader precedence enumerates all four strategies", () => {
  for (const label of [
    "'current_window_ready'",
    "'latest_ready'",
    "'current_window_awaiting'",
    "'latest_awaiting'",
  ]) {
    assertStringIncludes(SRC, label, `expected strategy label ${label}`);
  }
});

Deno.test("F4 — ready reads happen before awaiting reads (top-to-bottom)", () => {
  const readyCurrent = SRC.indexOf(".eq('status', 'ready')");
  const readyLatest = SRC.indexOf(".eq('status', 'ready')", readyCurrent + 1);
  const awaitingCurrent = SRC.indexOf(".eq('status', 'awaiting')");
  assert(readyCurrent > -1, "expected a current-window ready read");
  assert(readyLatest > -1, "expected a latest ready fallback");
  assert(awaitingCurrent > -1, "expected an awaiting read");
  assert(
    readyCurrent < readyLatest && readyLatest < awaitingCurrent,
    "ready reads must appear before any awaiting read in source order",
  );
});

Deno.test("F4 — awaiting reads are gated behind `!data` guards", () => {
  // The two awaiting queries must be inside `if (!data)` blocks so an
  // earlier ready hit prevents an awaiting shadow read entirely.
  const gatedAwaitingCurrent = /if \(!data && requestedWindow\) \{[\s\S]*?\.eq\('status', 'awaiting'\)/.test(SRC);
  const gatedAwaitingLatest = /if \(!data\) \{[\s\S]*?\.eq\('status', 'awaiting'\)[\s\S]*?\.order\('generated_at'/.test(SRC);
  assert(gatedAwaitingCurrent, "current-window awaiting read must be gated by `!data && requestedWindow`");
  assert(gatedAwaitingLatest, "latest awaiting fallback must be gated by `!data`");
});