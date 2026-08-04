import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  CANONICAL_ARCHETYPES,
  isCanonicalArchetype,
  resolveArchetypeSlug,
} from "./archetype-slug.ts";

Deno.test("canonical slugs round-trip unchanged", () => {
  for (const slug of CANONICAL_ARCHETYPES) {
    assertEquals(resolveArchetypeSlug(slug), slug);
  }
});

Deno.test("live free-text CoS names resolve to canonical slugs", () => {
  assertEquals(resolveArchetypeSlug("The Architect-Commander"), "strategic-pauser");
  assertEquals(resolveArchetypeSlug("The Athlete"), "resilient-performer");
  assertEquals(resolveArchetypeSlug("The Juggler (Provisional)"), "adaptive-navigator");
});

Deno.test("suffix and prefix stripping", () => {
  assertEquals(resolveArchetypeSlug("  The Navigator (Provisional)  "), "adaptive-navigator");
  assertEquals(resolveArchetypeSlug("Provisional Clear Thinker"), "clear-thinker");
});

Deno.test("legacy underscore ids map through", () => {
  assertEquals(resolveArchetypeSlug("natural_regulator"), "natural-regulator");
  assertEquals(resolveArchetypeSlug("high_octane_performer"), "high-octane-performer");
  assertEquals(resolveArchetypeSlug("strategic_pauser"), "strategic-pauser");
});

Deno.test("unknown text returns null so the tier fallback stays honest", () => {
  assertEquals(resolveArchetypeSlug("The Provisional Executive Operator zzz"), null);
  assertEquals(resolveArchetypeSlug(""), null);
  assertEquals(resolveArchetypeSlug(null), null);
  assertEquals(resolveArchetypeSlug(undefined), null);
});

Deno.test("isCanonicalArchetype only accepts exact slugs", () => {
  assertEquals(isCanonicalArchetype("clear-thinker"), true);
  assertEquals(isCanonicalArchetype("The Athlete"), false);
  assertEquals(isCanonicalArchetype(null), false);
});
