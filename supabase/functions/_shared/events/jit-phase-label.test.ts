// Validates the §4 Pre / During / Post label contract is satisfied by the
// shared phase map for the canonical CEO event categories. The plan
// generator's resolveJitPhaseLabel helper relies on these guarantees.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EVENT_CATEGORIES } from "./event-categories.ts";
import { EVENT_PHASE_MAP, phaseForEvent } from "./event-phase-map.ts";
import { classifyEvent } from "./event-classifier.ts";

Deno.test("Board meeting classifies to category A and exposes pre + post phases", () => {
  const sub = classifyEvent("Q2 Board Meeting");
  assert(sub, "Board meeting should classify");
  assertEquals(sub!.categoryId, "A");
  assert(EVENT_PHASE_MAP.A.pre, "A.pre must be defined");
  assert(EVENT_PHASE_MAP.A.post, "A.post must be defined");
  const pre = phaseForEvent("Q2 Board Meeting", "pre");
  const post = phaseForEvent("Q2 Board Meeting", "post");
  assertEquals(pre?.resolvedCombo.protocol, "somatic");
  assertEquals(post?.resolvedCombo.protocol, "mindset");
});

Deno.test("Long-haul flight classifies to category G", () => {
  const sub = classifyEvent("Long-haul flight to SFO");
  assert(sub);
  assertEquals(sub!.categoryId, "G");
});

Deno.test("Conference category F is During-notification-only by §3 contract", () => {
  // resolveJitPhaseLabel relies on this flag to downgrade During→Pre framing
  // so a slot card never asks the user to act mid-keynote.
  assertEquals(EVENT_CATEGORIES.F.protocol.duringNotificationOnly, true);
});

Deno.test("Keynote classifies to F and has both pre and post phases", () => {
  const sub = classifyEvent("Keynote at Money2020");
  assert(sub);
  assertEquals(sub!.categoryId, "F");
  assert(EVENT_PHASE_MAP.F.pre, "F.pre must be defined");
  assert(EVENT_PHASE_MAP.F.post, "F.post must be defined");
});

Deno.test("Deep work block classifies to E (Deep Work & Strategy)", () => {
  const sub = classifyEvent("Deep work block — strategy memo");
  assert(sub);
  assertEquals(sub!.categoryId, "E");
});