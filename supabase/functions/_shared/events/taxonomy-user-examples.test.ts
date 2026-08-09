// Regression suite for the A–H schema examples reported from live calendars.
// Every surface (Brief, Pills, Week-Ahead, Plan, Nudges, Insights) resolves
// categories through classifyEvent, so asserting here covers all of them.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyEvent } from "./event-classifier.ts";
import { subcategoryFromSubtypeId } from "./enrich-event.ts";

const CASES: Array<[string, string, string]> = [
  // title, categoryId, subcategory
  ["1 day liquid fast", "H", "wellness_self_care"],
  ["National Day", "H", "holiday"],
  ["Stay: DoubleTree by Hilton", "G", "accommodation"],
  ["Weekly AI Forum", "E", "community"],
  ["Statue of Liberty and Ellis Island tour", "G", "travel"],
  ["Reservation at Yoshoku", "H", "recreation"],
  ["Chief AI Thursday connects", "E", "community"],
  ["Flight to New York (BA 183)", "G", "flight"],
  ["Weekly team sync", "E", "routine_sync"],
  ["Keynote at Founder Summit", "C", "speaking"],
  ["Speaking at the AI leaders roundtable", "C", "roundtable"],
  ["3-year strategy planning", "A", "strategy"],
  ["Production incident escalation", "D", "crisis_decision"],
  ["Queen's Gate School open evening", "F", "workshop"],
  ["Deep work block — strategy memo", "E", "deep_work"],
];

for (const [title, category, subcategory] of CASES) {
  Deno.test(`taxonomy — "${title}" → ${category}.${subcategory}`, () => {
    const sub = classifyEvent(title);
    assertEquals(sub?.categoryId ?? null, category);
    assertEquals(subcategoryFromSubtypeId(sub?.id ?? null), subcategory);
  });
}

Deno.test("taxonomy — unresolved titles stay unlabelled (no blanket Meeting)", () => {
  assertEquals(classifyEvent("Random stuff"), null);
});
