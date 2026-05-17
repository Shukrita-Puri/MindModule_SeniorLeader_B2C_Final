import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { EVENT_CATEGORIES, FRAMEWORK_PILLARS, getFrameworkPillarProtocol } from "./event-categories.ts";
import { classifyEvent } from "./event-classifier.ts";

Deno.test("EVENT_CATEGORIES covers all eight pillars A–H", () => {
  assertEquals(Object.keys(EVENT_CATEGORIES).sort().join(""), "ABCDEFGH");
});

Deno.test("every category has user-friendly name, focus, and protocol contract", () => {
  for (const c of Object.values(EVENT_CATEGORIES)) {
    assert(c.name.length > 0, `${c.id} missing name`);
    assert(c.selfRegulationFocus.length > 0, `${c.id} missing focus`);
    assert(c.protocol, `${c.id} missing protocol`);
  }
});

Deno.test("FRAMEWORK_PILLARS alias mirrors EVENT_CATEGORIES", () => {
  assertEquals(FRAMEWORK_PILLARS, EVENT_CATEGORIES);
});

Deno.test("getFrameworkPillarProtocol returns expected pre/during/post for A", () => {
  const p = getFrameworkPillarProtocol("A");
  assertEquals(p.pre, "Flow");
  assertEquals(p.during, null);
  assertEquals(p.post, "Pause");
});

Deno.test("classifyEvent → categoryId maps canonical titles to categories", () => {
  assertEquals(classifyEvent("Q2 Board Review")?.categoryId, "A");
  assertEquals(classifyEvent("1:1 with Sara")?.categoryId, "D");
  assertEquals(classifyEvent("Term sheet negotiation")?.categoryId, "B");
  assertEquals(classifyEvent("Keynote at Money2020")?.categoryId, "F");
  assertEquals(classifyEvent("Deep work block")?.categoryId, "E");
  assertEquals(classifyEvent("Flight LHR to JFK")?.categoryId, "G");
  assertEquals(classifyEvent("Weekly team sync")?.categoryId, "H");
});

Deno.test("classifyEvent returns null on unknown title", () => {
  assertEquals(classifyEvent("Random stuff"), null);
});
