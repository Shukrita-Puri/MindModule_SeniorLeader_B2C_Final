import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("brief prompt contract includes data-availability honesty block and work-shaped retry guidance", async () => {
  const src = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertStringIncludes(src, "=== DATA AVAILABILITY CONTRACT ===");
  assertStringIncludes(src, "No wearable signal exists for this brief.");
  assertStringIncludes(src, "No current-period check-in exists for this brief.");
  assertStringIncludes(src, "The work-direction clause must contain a concrete work move tied to today's real demand");
});

// v2026-09-07 — the Brief must honour taught event importance from the same
// two stores the Plan and Smart Nudges read, not just stakes ranking.
Deno.test("brief names events through taught event priority", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  assertStringIncludes(src, "loadPriorityMemoryForUser");
  assertStringIncludes(src, 'from("event_priority_derived")');
  assertStringIncludes(
    src,
    "const todayHighStakes: string[] = applyEventPriorityToBriefTitles(",
  );
  assertStringIncludes(
    src,
    "const tomorrowHighStakes: string[] = applyEventPriorityToBriefTitles(",
  );
  // "never" titles are removed from naming entirely.
  assertStringIncludes(
    src,
    "const kept = titles.filter((t) => !view.neverKeys.has(keyOf(t)));",
  );
  // Marked-important events win the brief anchor over the generic stakes pick.
  assertStringIncludes(src, "importantCandidates.length > 0");
});
