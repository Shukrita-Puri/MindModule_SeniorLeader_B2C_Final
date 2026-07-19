/**
 * Evidence test for `list-week-ahead-priorities` (rank-never-filter model):
 *   - reads the source file directly (no full bootstrap required)
 *   - asserts relationship / memory / pattern context is still loaded
 *   - asserts the filtering selector is NOT used
 *   - asserts per-category cap and top-N truncation are gone
 *   - asserts hard hides are limited to declined/cancelled + all-day OOO
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(
  new URL("./index.ts", import.meta.url),
);

Deno.test("imports loadJitContextForEvents (relationship/memory/sovereign)", () => {
  assertStringIncludes(SRC, 'import { loadJitContextForEvents }');
  assertStringIncludes(SRC, 'loadJitContextForEvents(');
});

Deno.test("does NOT use the filtering selectJitCandidates in week-ahead", () => {
  // Must not be imported or called (allow substring in comments only).
  assertEquals(/from\s+["'][^"']*select-jit/.test(SRC), false);
  assertEquals(/selectJitCandidates\s*\(/.test(SRC), false);
});

Deno.test("does NOT import or call legacy rankJitCandidates", () => {
  assertEquals(SRC.includes("rankJitCandidates"), false);
});

Deno.test("removes per-category cap and top-N truncation", () => {
  assertEquals(SRC.includes("PER_CATEGORY_SOFT_CAP"), false);
  // TOP_N must not be defined; but `TOP_N` as a substring in comments is fine.
  assertEquals(/\bconst\s+TOP_N\s*=/.test(SRC), false);
});

Deno.test("hard hides are limited to declined/cancelled + all-day OOO", () => {
  assertStringIncludes(SRC, "isDeclinedOrCancelled(");
  assertStringIncludes(SRC, "isAllDayOoo(");
  // No noise/educational filters remain in week-ahead.
  assertEquals(SRC.includes("isNoiseTitle("), false);
  assertEquals(SRC.includes("isEducationalTitle("), false);
});

Deno.test("emits advisory tags (prior/pattern/relationship/stakes/low-signal)", () => {
  assertStringIncludes(SRC, '"prior_priority"');
  assertStringIncludes(SRC, '"pattern_based"');
  assertStringIncludes(SRC, '"known_relationship"');
  assertStringIncludes(SRC, '"high_stakes"');
  assertStringIncludes(SRC, '"historically_low_signal"');
});

Deno.test("returns weekAheadMode + priorities + generatedAt envelope", () => {
  assertStringIncludes(SRC, "weekAheadMode: decision");
  assertStringIncludes(SRC, "priorities: picked");
  assertStringIncludes(SRC, "generatedAt:");
});