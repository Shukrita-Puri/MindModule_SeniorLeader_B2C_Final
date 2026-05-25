// Phase A — Validates enrichEvent reads the §3/§4 shared taxonomy
// correctly. Downstream label code (composeStateLabel,
// resolveJitPhaseLabel) relies on these guarantees.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enrichEvent } from "./enrich-event.ts";

Deno.test("enrichEvent surfaces categoryId, leadTimeMin and demandProfile for a Board meeting", () => {
  const e = enrichEvent({ title: "Q2 Board Meeting" });
  assertEquals(e.categoryId, "A");
  assertEquals(e.leadTimeMin, 1440); // gov.board_meeting
  assert(e.demandProfile);
  // Board meetings: high cognitive + high political + high identity exposure
  assertEquals(e.demandProfile!.cog, 3);
  assertEquals(e.demandProfile!.pol, 3);
  assertEquals(e.demandProfile!.id, 3);
  assert(e.phases.pre, "A.pre must materialise");
  assert(e.phases.post, "A.post must materialise");
});

Deno.test("enrichEvent classifies Long-haul flight to category G with circadian-heavy demand", () => {
  const e = enrichEvent({ title: "Long-haul flight to SFO" });
  assertEquals(e.categoryId, "G");
  assert(e.demandProfile);
  assertEquals(e.demandProfile!.cir, 3);
  assertEquals(e.demandProfile!.ene, 3);
});

Deno.test("enrichEvent maps Keynote subtype to a scenarioId", () => {
  const e = enrichEvent({ title: "Keynote at Money2020" });
  assertEquals(e.categoryId, "F");
  assertEquals(e.scenarioId, "pre-speaking-engagement");
});

Deno.test("enrichEvent returns null subtype for unknown title but does not throw", () => {
  const e = enrichEvent({ title: "lunch with mom" });
  assertEquals(e.subtype, null);
  assertEquals(e.categoryId, null);
  assertEquals(e.leadTimeMin, null);
  assertEquals(e.demandProfile, null);
});

Deno.test("enrichEvent accepts raw shape with nested event.title", () => {
  const e = enrichEvent({ event: { title: "Deep work block — strategy memo" } });
  assertEquals(e.categoryId, "E");
});