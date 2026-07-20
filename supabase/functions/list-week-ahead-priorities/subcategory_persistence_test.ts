/**
 * WS-D regression test — locks the persistence-first subcategory contract
 * for `list-week-ahead-priorities`.
 *
 * We assert the source shape rather than spin up a live Supabase harness,
 * mirroring the existing `selector-evidence.test.ts` pattern. Together the
 * assertions below prove:
 *   1. Response items carry a `subcategoryId` field.
 *   2. `event_subcategory` is read from `event_priority_memory`.
 *   3. Persisted value is preferred over `enrichEvent(...).subcategory`,
 *      with `enrichEvent` used only as a fallback, and `null` when both
 *      are absent.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("response exposes subcategoryId on every priority item", () => {
  // The `Scored` interface declares the field explicitly.
  assertStringIncludes(SRC, "subcategoryId: string | null;");
  // And the picked/scored object emits it.
  assertStringIncludes(SRC, "subcategoryId:");
});

Deno.test("selects event_subcategory from event_priority_memory", () => {
  assertStringIncludes(SRC, "event_subcategory");
  // Combined into the same round-trip as the prior-signal read.
  assertStringIncludes(
    SRC,
    'select("event_id, signal, source, occurred_at, event_subcategory")',
  );
});

Deno.test("persisted subcategory wins over enrichEvent fallback", () => {
  // Emission line must consult the map first, then fall back to enrichEvent.
  const re =
    /subcategoryByEventId\.get\(eventId\)\s*\n?\s*\?\?\s*enriched\.subcategory\s*\n?\s*\?\?\s*null/;
  assertEquals(re.test(SRC), true);
});

Deno.test("subcategory map is populated from ANY memory row (not just picker)", () => {
  // The writer stamps subcategory on every signal source, so the reader
  // must accept the first (most recent) non-empty value regardless of
  // `r.source`. Prior-signal read is source-gated; subcategory is not.
  assertStringIncludes(SRC, "!subcategoryByEventId.has(r.event_id)");
  assertStringIncludes(SRC, 'typeof r.event_subcategory === "string"');
});

Deno.test("enrichEvent import remains as the fallback classifier", () => {
  assertStringIncludes(SRC, 'import { enrichEvent }');
  assertStringIncludes(SRC, "enrichEvent({ title: meta.title })");
});