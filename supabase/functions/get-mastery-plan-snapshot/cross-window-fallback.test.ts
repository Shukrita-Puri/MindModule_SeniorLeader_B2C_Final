// Source-level assertions for the cross-window fallback observability
// contract. Cross-window fallback is still allowed (so the UI can
// hydrate from *some* ready row when the active window hasn't been
// generated yet), but it must be stamped on the response and warned
// about — a silent fallback masks broken active-window generation.

import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("reader retains current-window-first precedence", () => {
  const readyCurrent = SRC.indexOf(".eq('mrs_window', requestedWindow)");
  const readyLatest = SRC.indexOf(".eq('status', 'ready')", readyCurrent);
  assert(readyCurrent > -1 && readyLatest > readyCurrent, "current window read must precede latest fallback");
});

Deno.test("cross-window fallback is stamped on the response `source`", () => {
  assert(
    SRC.includes("crossWindowFallback:"),
    "response.source must expose `crossWindowFallback` so UI can distinguish exact hit vs fallback",
  );
});

Deno.test("cross-window fallback logs a structured warning", () => {
  assert(
    SRC.includes("[get-mastery-plan-snapshot][cross-window-fallback]"),
    "cross-window fallback must produce a structured warning so it never silently masks missing active-window generation",
  );
  assert(
    SRC.includes("active_window_snapshot_missing"),
    "warning must carry the `active_window_snapshot_missing` reason label",
  );
});