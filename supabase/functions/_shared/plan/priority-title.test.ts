import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPriorityTitle, verbForCategoryPhase, executiveObjectiveFor, type SlotAnchor } from "./title-prefixes.ts";
import type { EventCategoryId } from "../events/event-categories.ts";
import type { Phase } from "../events/event-phase-map.ts";

const CATEGORIES: EventCategoryId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];
const PHASES: Phase[] = ["pre", "during", "post"];

Deno.test("buildPriorityTitle — example: pre A regulation_composure → 'Lead composed presence in tomorrow's Board Meeting'", () => {
  const out = buildPriorityTitle({
    slotAnchor: { eventTitle: "Q2 Board Meeting", categoryId: "A", phase: "pre" },
    isTomorrow: true,
    practicePriorityTag: "regulation_composure",
  });
  assertEquals(out, "Lead composed presence in tomorrow's Q2 Board Meeting");
});

Deno.test("buildPriorityTitle — example: post A → 'Reset … after the Board Meeting'", () => {
  const out = buildPriorityTitle({
    slotAnchor: { eventTitle: "Board Meeting", categoryId: "A", phase: "post" },
    isTomorrow: false,
    practicePriorityTag: null,
  });
  assertStringIncludes(out, "Reset");
  assertStringIncludes(out, "after the Board Meeting");
});

Deno.test("buildPriorityTitle — example: pre D feedback → 'Steady steady presence in the Tom feedback'", () => {
  const out = buildPriorityTitle({
    slotAnchor: { eventTitle: "Tom Mind Feedback", categoryId: "D", phase: "pre" },
    isTomorrow: false,
  });
  // verb=Steady (D pre), objective=steady presence (default for D pre)
  assertStringIncludes(out, "Steady");
  assertStringIncludes(out, "Tom");
});

Deno.test("buildPriorityTitle — never exceeds 10 words for all 8×3 category/phase combos", () => {
  for (const cat of CATEGORIES) {
    for (const phase of PHASES) {
      const out = buildPriorityTitle({
        slotAnchor: { eventTitle: "Sample Strategy Review Session", categoryId: cat, phase },
        isTomorrow: true,
      });
      const words = out.split(/\s+/);
      assert(words.length > 0 && words.length <= 10, `cat=${cat} phase=${phase} → "${out}" (${words.length} words)`);
    }
  }
});

Deno.test("verbForCategoryPhase — post A/D → Reset, post F/G → Recover, default post → Land", () => {
  assertEquals(verbForCategoryPhase("A", "post"), "Reset");
  assertEquals(verbForCategoryPhase("D", "post"), "Reset");
  assertEquals(verbForCategoryPhase("F", "post"), "Recover");
  assertEquals(verbForCategoryPhase("G", "post"), "Recover");
  assertEquals(verbForCategoryPhase("E", "post"), "Land");
});

Deno.test("verbForCategoryPhase — pre verbs per category", () => {
  assertEquals(verbForCategoryPhase("A", "pre"), "Lead");
  assertEquals(verbForCategoryPhase("B", "pre"), "Present");
  assertEquals(verbForCategoryPhase("C", "pre"), "Decide");
  assertEquals(verbForCategoryPhase("D", "pre"), "Steady");
  assertEquals(verbForCategoryPhase("G", "pre"), "Reframe");
});

Deno.test("executiveObjectiveFor — practicePriorityTag overrides defaults", () => {
  assertEquals(executiveObjectiveFor("focus_clarity", "C", "pre"), "strategic clarity");
  assertEquals(executiveObjectiveFor("regulation_composure", "A", "pre"), "composed presence");
  assertEquals(executiveObjectiveFor(null, "A", "pre"), "strategic clarity");
});

Deno.test("buildPriorityTitle — state-management fallback (no event)", () => {
  const out = buildPriorityTitle({
    slotAnchor: { eventTitle: null, categoryId: null, phase: "pre" },
  });
  // Window-aware tail (Chief-of-Staff phrasing): morning/afternoon rhythm,
  // "to close the day", or the generic "for the day ahead".
  assert(
    /(for the (day ahead|morning rhythm|afternoon rhythm))|(to close the day)/.test(out),
    `expected a window-aware day tail, got "${out}"`,
  );
});

Deno.test("buildPriorityTitle — slotAnchor eliminates cross-event leakage (E category with Board title)", () => {
  // If a caller ever passes a Board-flavoured title but an E (deep-work)
  // category, the title MUST read off the CATEGORY's verb/objective — never
  // invent A's 'Lead'/'composed presence' just because the title says 'Board'.
  const anchor: SlotAnchor = { eventTitle: "Q2 Board Meeting", categoryId: "E", phase: "pre" };
  const out = buildPriorityTitle({ slotAnchor: anchor, isTomorrow: false });
  assertStringIncludes(out, "Steady");           // E pre verb (per verbForCategoryPhase)
  assertStringIncludes(out, "sustained focus");  // E pre default objective
  // Must NOT use A's verb just because the literal title says 'Board'.
  assert(!out.startsWith("Lead "), `expected E-category verb, got "${out}"`);
  // Must NOT use A's default objective either.
  assert(!out.includes("composed presence"), `expected E-category objective, got "${out}"`);
});

Deno.test("buildPriorityTitle — slotAnchor with null eventTitle falls back cleanly (no 'after the null')", () => {
  const anchor: SlotAnchor = { eventTitle: null, categoryId: "A", phase: "post" };
  const out = buildPriorityTitle({ slotAnchor: anchor });
  // State-management fallback path engages when title is missing.
  assert(
    /(for the (day ahead|morning rhythm|afternoon rhythm))|(to close the day)/.test(out),
    `expected a window-aware day tail, got "${out}"`,
  );
  assert(!out.toLowerCase().includes("null"), `output must not contain 'null', got "${out}"`);
});

// Arc-fanout 12h rule — checks the rule we documented for callers that
// allow a second pre/post slot for A/D events. The rule itself is enforced
// in generate-mastery-plan; this test pins the contract via a tiny helper.
function allowsSecondArc(prevStartMs: number, nextStartMs: number, category: EventCategoryId): boolean {
  const cap = category === "A" || category === "D" ? 2 : 1;
  if (cap < 2) return false;
  const deltaHours = Math.abs(nextStartMs - prevStartMs) / 3_600_000;
  return deltaHours >= 12;
}

Deno.test("arc cadence — A pre+post ≥ 12h apart allowed; <12h denied", () => {
  const pre = Date.UTC(2026, 5, 4, 9, 0);
  const post = Date.UTC(2026, 5, 4, 22, 0); // 13h later — allowed
  assertEquals(allowsSecondArc(pre, post, "A"), true);
  const closePost = Date.UTC(2026, 5, 4, 14, 0); // 5h later — denied
  assertEquals(allowsSecondArc(pre, closePost, "A"), false);
  // C events never allow a 2nd arc regardless of spacing.
  assertEquals(allowsSecondArc(pre, post, "C"), false);
});