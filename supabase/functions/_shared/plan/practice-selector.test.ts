import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveSlotIntent,
  scoreContentAgainstIntent,
  rankByIntent,
  selectPracticeForSlot,
  findAlternate,
  type ScorableContent,
} from "./practice-selector.ts";

// Fixtures modelled on actual catalog rows (see RECALIBRATE_TAGGING_AUDIT.md).
const ikigai: ScorableContent = {
  id: "ikigai-purpose",
  category: "presence",
  sub_type: "mindset",
  metaSkillTags: ["meta-renewal"],
  stateSignalTags: ["signal-depleted", "signal-confidence-low"],
};
const trataka: ScorableContent = {
  id: "trataka-flame-gaze",
  category: "presence",
  metaSkillTags: ["meta-clarity"],
  stateSignalTags: [],
};
const boxBreathing: ScorableContent = {
  id: "box-breathing",
  category: "power-up",
  metaSkillTags: ["meta-recalibration"],
  stateSignalTags: [],
};
const vagusWindDown: ScorableContent = {
  id: "vagus-wind-down",
  category: "pause",
  metaSkillTags: ["meta-recalibration", "meta-renewal"],
  stateSignalTags: [],
};

const boxBreathing2: ScorableContent = {
  id: "box-breathing-2",
  category: "pause",
  protocol_type: "somatic",
  metaSkillTags: ["meta-recalibration"],
  stateSignalTags: ["signal-body-under-load"],
  masteryCategory: { secondary: ["pause"] },
};

Deno.test("Sharpen-focus intent → meta-clarity wins, Ikigai is demoted", () => {
  const intent = deriveSlotIntent({
    stateAction: "Re-consolidate focus",
    anchorCategory: null,
    anchorPhase: null,
  });
  assertEquals(intent.intentLabel, "focus/flow-mastery");
  assertEquals(intent.metaSkills, ["meta-clarity"]);

  const ranked = rankByIntent([ikigai, trataka, boxBreathing], intent);
  assertEquals(ranked[0].id, "trataka-flame-gaze");
  // Ikigai is meta-renewal only → hard demoted on a focus slot.
  const ikigaiRow = ranked.find((r) => r.id === "ikigai-purpose")!;
  assert(ikigaiRow.intentScore < 0, `expected Ikigai negative on focus, got ${ikigaiRow.intentScore}`);
});

Deno.test("Steady-the-system intent → meta-recalibration / pause wins", () => {
  const intent = deriveSlotIntent({
    stateAction: "Steady the system",
    anchorCategory: null,
    anchorPhase: null,
  });
  assertEquals(intent.intentLabel, "regulation/composure");
  const ranked = rankByIntent([trataka, vagusWindDown, ikigai], intent);
  assertEquals(ranked[0].id, "vagus-wind-down");
});

Deno.test("Recovery / post-phase intent → meta-renewal pool wins", () => {
  const intent = deriveSlotIntent({
    stateAction: "Recover sleep debt",
    anchorCategory: "A",
    anchorPhase: "post",
  });
  assertEquals(intent.intentLabel, "recovery/renewal");
  const ranked = rankByIntent([trataka, ikigai, boxBreathing], intent);
  // Ikigai (meta-renewal) is the only matching meta_skill in this set.
  assertEquals(ranked[0].id, "ikigai-purpose");
});

Deno.test("Activation intent → power-up category preferred", () => {
  const intent = deriveSlotIntent({
    stateAction: "Build capacity",
    anchorCategory: null,
    anchorPhase: null,
  });
  assertEquals(intent.intentLabel, "activation/presence");
  const ranked = rankByIntent([trataka, boxBreathing, ikigai], intent);
  assertEquals(ranked[0].id, "box-breathing");
});

Deno.test("scoreContentAgainstIntent never returns NaN / undefined", () => {
  const intent = deriveSlotIntent({
    stateAction: null,
    anchorCategory: null,
    anchorPhase: null,
  });
  const s = scoreContentAgainstIntent({ id: "x" }, intent);
  assertEquals(typeof s.total, "number");
  assert(!Number.isNaN(s.total));
});

Deno.test("Empty meta_skill array does not negative-penalise", () => {
  const intent = deriveSlotIntent({
    stateAction: "Re-consolidate focus",
    anchorCategory: null,
    anchorPhase: null,
  });
  const blank: ScorableContent = { id: "blank", category: "presence", metaSkillTags: [] };
  const s = scoreContentAgainstIntent(blank, intent);
  // No meta_skill → no boost AND no penalty (only category match remains).
  assertEquals(s.metaSkill, 0);
  assert(s.recalibrateCategory > 0);
});

Deno.test("CEO verb 'Sharpen' maps to focus intent even without state verb", () => {
  const intent = deriveSlotIntent({
    stateAction: null,
    ceoVerb: "Sharpen",
    anchorCategory: null,
    anchorPhase: "pre",
  });
  assertEquals(intent.intentLabel, "focus/flow-mastery");
});

Deno.test("Anchor category E forces focus intent", () => {
  const intent = deriveSlotIntent({
    stateAction: "Steady the system",
    anchorCategory: "E",
    anchorPhase: "pre",
  });
  assertEquals(intent.intentLabel, "focus/flow-mastery");
});

Deno.test("protocol gate prefers matching protocol when present", () => {
  const intent = deriveSlotIntent({ stateAction: "Build capacity", anchorCategory: null, anchorPhase: null });
  const res = selectPracticeForSlot(
    [boxBreathing2, {...boxBreathing2, id: "wrong", protocol_type: "mindset"}],
    { mode: "jit+state", slotRole: "dominant_demand", jitPhase: "pre", arcLabel: "Prepare" },
    intent,
    new Set(),
  );
  assertEquals(res.selected[0].id, "box-breathing-2");
});

Deno.test("findAlternate prefers same intent outcome with secondary mastery category", () => {
  const intent = deriveSlotIntent({ stateAction: "Steady the system", anchorCategory: null, anchorPhase: null });
  const alt = findAlternate(
    [boxBreathing2, vagusWindDown],
    boxBreathing2,
    intent,
    new Set(["box-breathing-2"]),
  );
  assert(alt);
  assertEquals(alt?.id, "vagus-wind-down");
});
