// Regression guard for the 2026-07-04 production incident:
//   "Cannot access 'wearableDaysConnected' before initialization"
// The single `const wearableDaysConnected = ...` declaration must lexically
// precede every read of the identifier so no code path (including nested
// try/catch or scheduled-only branches invoked by build-executive-home-cards)
// can hit the Temporal Dead Zone.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const LINES = SRC.split("\n");

function findLines(pattern: RegExp): number[] {
  const hits: number[] = [];
  LINES.forEach((line, i) => {
    if (pattern.test(line)) hits.push(i + 1);
  });
  return hits;
}

Deno.test("wearableDaysConnected is declared exactly once", () => {
  const decls = findLines(/\b(const|let|var)\s+wearableDaysConnected\b/);
  assertEquals(
    decls.length,
    1,
    `expected 1 declaration of wearableDaysConnected, found ${decls.length} at lines ${decls.join(",")}`,
  );
});

Deno.test("every wearableDaysConnected read is lexically after its declaration", () => {
  const decls = findLines(/\b(const|let|var)\s+wearableDaysConnected\b/);
  assertEquals(decls.length, 1);
  const declLine = decls[0];
  const reads = findLines(/\bwearableDaysConnected\b/).filter((n) => n !== declLine);
  assert(reads.length > 0, "expected at least one read of wearableDaysConnected");
  const earlyReads = reads.filter((n) => n < declLine);
  assertEquals(
    earlyReads.length,
    0,
    `wearableDaysConnected read before declaration (line ${declLine}) at: ${earlyReads.join(",")}`,
  );
});

Deno.test("declaration preserves null semantics (no silent 0 default)", () => {
  const decls = findLines(/\b(const|let|var)\s+wearableDaysConnected\b/);
  const declLine = decls[0];
  const snippet = LINES.slice(declLine - 1, declLine + 6).join("\n");
  assert(
    /deriveWearableDaysConnected\s*\(/.test(snippet),
    "wearableDaysConnected must be initialized via deriveWearableDaysConnected(...) so unknown stays null",
  );
  assert(
    !/=\s*0\b/.test(snippet),
    "wearableDaysConnected must not default to 0 — null means 'unknown connection age'",
  );
});
