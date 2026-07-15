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
