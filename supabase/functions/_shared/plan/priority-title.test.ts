import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPriorityTitle, verbForCategoryPhase, executiveObjectiveFor } from "./title-prefixes.ts";
import type { EventCategoryId } from "../events/event-categories.ts";
import type { Phase } from "../events/event-phase-map.ts";

const CATEGORIES: EventCategoryId[] = ["A", "B", "C", "D", "E", "F", "G", "H"];
const PHASES: Phase[] = ["pre", "during", "post"];

Deno.test("buildPriorityTitle — example: pre A regulation_composure → 'Lead composed presence in tomorrow's Board Meeting'", () => {
  const out = buildPriorityTitle({
    eventTitle: "Q2 Board Meeting",
    category: "A",
    phase: "pre",
    isTomorrow: true,
    practicePriorityTag: "regulation_composure",
  });
  assertEquals(out, "Lead composed presence in tomorrow's Q2 Board Meeting");
});

Deno.test("buildPriorityTitle — example: post A → 'Reset … after the Board Meeting'", () => {
  const out = buildPriorityTitle({
    eventTitle: "Board Meeting",
    category: "A",
    phase: "post",
    isTomorrow: false,
    practicePriorityTag: null,
  });
  assertStringIncludes(out, "Reset");
  assertStringIncludes(out, "after the Board Meeting");
});

Deno.test("buildPriorityTitle — example: pre D feedback → 'Steady steady presence in the Tom feedback'", () => {
  const out = buildPriorityTitle({
    eventTitle: "Tom Mind Feedback",
    category: "D",
    phase: "pre",
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
        eventTitle: "Sample Strategy Review Session",
        category: cat,
        phase,
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
    eventTitle: null,
    category: null,
    phase: "pre",
  });
  assertStringIncludes(out, "for the day ahead");
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