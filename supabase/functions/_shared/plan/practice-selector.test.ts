import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveSlotIntent,
  scoreContentAgainstIntent,
  rankByIntent,
  selectPracticeForSlot,
  findAlternate,
  scoreLeaderGoalAlignment,
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
  structuredTags: {
    pillar: "flow",
    masterySubtypes: ["optimize", "maintain-peak"],
    goalTags: ["focus", "concentration", "mental_clarity", "flow"],
    cognitiveLoadHelp: ["improves_concentration"],
    intensityLevel: "low",
    energyDirection: "clarify",
  },
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

Deno.test("Recalibrate structuredTags can drive focus selection when meta_skill is missing", () => {
  const intent = deriveSlotIntent({
    stateAction: "Prime for focus",
    anchorCategory: null,
    anchorPhase: null,
  });
  const structuredFocus: ScorableContent = {
    id: "structured-focus-only",
    category: "presence",
    metaSkillTags: [],
    structuredTags: {
      pillar: "flow",
      masterySubtypes: ["optimize", "maintain-peak"],
      goalTags: ["focus", "mental_clarity", "decision_readiness"],
      cognitiveLoadHelp: ["improves_concentration", "supports_decision"],
      energyDirection: "clarify",
    },
  };
  const offTarget: ScorableContent = {
    id: "structured-renewal-only",
    category: "presence",
    metaSkillTags: [],
    structuredTags: {
      pillar: "renewal",
      masterySubtypes: ["restore"],
      goalTags: ["resilience"],
      energyDirection: "downshift",
    },
  };

  const ranked = rankByIntent([offTarget, structuredFocus], intent);
  assertEquals(ranked[0].id, "structured-focus-only");
  const score = scoreContentAgainstIntent(structuredFocus, intent);
  assert(score.structuredTags > 0, `expected structuredTags boost, got ${score.structuredTags}`);
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

Deno.test("leader goal alignment boosts prepare-oriented practices", () => {
  const prepareFirst = scoreLeaderGoalAlignment(trataka, ["prepare"]);
  const sustainFirst = scoreLeaderGoalAlignment(vagusWindDown, ["sustain"]);
  assert(prepareFirst.score > 0);
  assertEquals(prepareFirst.matchedGoals, ["prepare"]);
  assert(sustainFirst.score > 0);
  assertEquals(sustainFirst.matchedGoals, ["sustain"]);
});

Deno.test("unknown leader goals are ignored safely", () => {
  const result = scoreLeaderGoalAlignment(trataka, ["unknown-goal"]);
  assertEquals(result.score, 0);
  assertEquals(result.matchedGoals.length, 0);
});

Deno.test("ineligible module is not selected just because leader goal matches", () => {
  const intent = deriveSlotIntent({ stateAction: "Build capacity", anchorCategory: null, anchorPhase: null });
  const res = selectPracticeForSlot(
    [
      { ...vagusWindDown, id: "wrong-protocol", protocol_type: "mindset" },
      { ...boxBreathing2, id: "right-protocol", protocol_type: "somatic" },
    ],
    { mode: "jit+state", slotRole: "dominant_demand", jitPhase: "pre", arcLabel: "Prepare" },
    intent,
    new Set(),
    { leaderGoals: ["sustain"] },
  );
  assertEquals(res.selected[0].id, "right-protocol");
});

// ═══════════════════════════════════════════════════════════════════════
// Sprint 5 (Phase 7) — state-based mindset.pause branch.
//
// Locks the following contract:
//   1. deriveSlotIntent triggers pre-decision-clarity on
//      decision-fatigue / clarify / detach / reactive / explicit combo.
//   2. The new branch sits BEFORE focus/flow so `verb === "decide"`
//      still routes to flow (active decision) but explicit clarity
//      signals are not shadowed by it.
//   3. Real catalog fixtures (eye-of-storm, detachment-observer-new,
//      stillness-gap-new, fudoshin-immovable-mind) can be selected.
//   4. Existing focus/flow behaviour on plain "focus" verbs is intact.
//   5. Event-driven Cat-A post-event mindset.pause still routes to the
//      pre-decision-clarity intent when the combo is explicit.
// ═══════════════════════════════════════════════════════════════════════

// Fixtures modelled on the actual catalog rows in
// `src/data/practicesAndSoundscapes.ts`. structuredTags are copied
// verbatim where the catalog provides them; the two rows without
// structuredTags in the frontend catalog (stillness-gap-new,
// detachment-observer-new) are represented as-is so the test asserts
// they can still be picked via category + meta_skill alone.
const eyeOfStorm: ScorableContent = {
  id: "eye-of-storm",
  content_type: "micro-practice",
  category: "pause",
  sub_type: "mindset",
  metaSkillTags: ["meta-clarity"],
  structuredTags: {
    pillar: "pause",
    masterySubtypes: ["grounding", "composure"],
    goalTags: ["mental_clarity", "overwhelm_reduction", "focus", "perspective"],
    contextTags: ["overwhelm", "information_overload", "crisis_mode", "multitasking_chaos"],
    cognitiveLoadHelp: ["lowers_cognitive_load", "supports_decision"],
    intensityLevel: "low",
    energyDirection: "stabilize",
  },
};
const fudoshin: ScorableContent = {
  id: "fudoshin-immovable-mind",
  content_type: "micro-practice",
  category: "pause",
  sub_type: "tool",
  metaSkillTags: ["meta-clarity", "meta-recalibration"],
  structuredTags: {
    pillar: "pause",
    masterySubtypes: ["composure", "grounding"],
    goalTags: ["composure", "leadership", "presence", "emotional_regulation"],
    contextTags: ["high_pressure", "leadership_moment", "crisis", "difficult_conversation"],
    cognitiveLoadHelp: ["supports_decision", "emotional_intelligence"],
    intensityLevel: "low",
    energyDirection: "stabilize",
  },
};
const stillnessGap: ScorableContent = {
  id: "stillness-gap-new",
  content_type: "micro-practice",
  category: "pause",
  sub_type: "mindset",
  metaSkillTags: ["meta-clarity"],
};
const detachmentObserver: ScorableContent = {
  id: "detachment-observer-new",
  content_type: "micro-practice",
  category: "pause",
  sub_type: "mindset",
  metaSkillTags: ["meta-clarity"],
};

Deno.test("Phase 7 — state-based decision fatigue tag returns combo:'mindset.pause'", () => {
  const intent = deriveSlotIntent({
    stateAction: "Steady the system",
    ceoVerb: null,
    anchorCategory: null,
    anchorPhase: null,
    practicePriorityTag: "decision_fatigue",
  });
  assertEquals(intent.intentLabel, "pre-decision-clarity");
  assertEquals(intent.combo, "mindset.pause");
  assertEquals(intent.recalibrateCategories, ["pause"]);
  assertEquals(intent.metaSkills, ["meta-clarity", "meta-recalibration"]);
});

Deno.test("Phase 7 — 'clarify' stateAction triggers pre-decision-clarity", () => {
  const intent = deriveSlotIntent({
    stateAction: "Clarify before the board decision",
    anchorCategory: null,
    anchorPhase: null,
  });
  assertEquals(intent.intentLabel, "pre-decision-clarity");
});

Deno.test("Phase 7 — 'detach' stateAction triggers pre-decision-clarity", () => {
  const intent = deriveSlotIntent({
    stateAction: "Detach from the last conversation",
    anchorCategory: null,
    anchorPhase: null,
  });
  assertEquals(intent.intentLabel, "pre-decision-clarity");
});

Deno.test("Phase 7 — reachability: intended practice pool is non-empty and rankable", () => {
  const intent = deriveSlotIntent({
    stateAction: "Steady the system",
    practicePriorityTag: "decision_fatigue",
    anchorCategory: null,
    anchorPhase: null,
  });
  const pool = [eyeOfStorm, fudoshin, stillnessGap, detachmentObserver, ikigai, boxBreathing];
  const ranked = rankByIntent(pool, intent);
  const top = ranked[0];
  const intendedIds = new Set([
    "eye-of-storm", "fudoshin-immovable-mind",
    "stillness-gap-new", "detachment-observer-new",
  ]);
  assert(intendedIds.has(top.id),
    `expected one of the four pre-decision-clarity practices to win, got ${top.id} (scores: ${JSON.stringify(ranked.map(r => ({ id: r.id, s: r.intentScore })))})`);
  // Ikigai (renewal-only) must not win a pre-decision-clarity slot.
  const ikigaiRow = ranked.find((r) => r.id === "ikigai-purpose")!;
  assert(ikigaiRow.intentScore < top.intentScore,
    `Ikigai should rank below the intended clarity practices`);
});

Deno.test("Phase 7 — practices without structuredTags (stillness-gap, detachment-observer) still score positive on clarity", () => {
  const intent = deriveSlotIntent({
    stateAction: "Steady the system",
    practicePriorityTag: "decision_fatigue",
    anchorCategory: null,
    anchorPhase: null,
  });
  // meta-clarity match (+18) + category 'pause' (+8) = +26 minimum.
  const gap = scoreContentAgainstIntent(stillnessGap, intent);
  const obs = scoreContentAgainstIntent(detachmentObserver, intent);
  assert(gap.total >= 20, `stillness-gap-new must remain selectable; got ${gap.total}`);
  assert(obs.total >= 20, `detachment-observer-new must remain selectable; got ${obs.total}`);
});

Deno.test("Phase 7 — selectPracticeForSlot for state slot returns one of the intended practices", () => {
  const intent = deriveSlotIntent({
    stateAction: "Steady the system",
    practicePriorityTag: "decision_fatigue",
    anchorCategory: null,
    anchorPhase: null,
  });
  const res = selectPracticeForSlot(
    [eyeOfStorm, fudoshin, stillnessGap, detachmentObserver, ikigai, boxBreathing],
    { mode: "state", slotRole: "state_anchor", arcLabel: "Steady", jitPhase: null },
    intent,
    new Set(),
  );
  assert(res.selected.length === 1);
  const intendedIds = new Set([
    "eye-of-storm", "fudoshin-immovable-mind",
    "stillness-gap-new", "detachment-observer-new",
  ]);
  assert(intendedIds.has(res.selected[0].id),
    `state-mode selection returned ${res.selected[0].id}; expected one of ${[...intendedIds]}`);
});

Deno.test("Phase 7 — 'decide' verb WITHOUT clarity signals still routes to focus/flow (no over-capture)", () => {
  // Regression guard: user flagged that if `verb === "decide"` routes to
  // mindset.flow, the mindset.pause branch must not shadow it. The new
  // branch triggers only on explicit clarity/detach/fatigue/combo
  // signals — plain "decide" stays in flow.
  const intent = deriveSlotIntent({
    stateAction: "Prime for focus",
    ceoVerb: "decide",
    anchorCategory: null,
    anchorPhase: null,
  });
  assertEquals(intent.intentLabel, "focus/flow-mastery");
  assertEquals(intent.combo, "mindset.flow");
});

Deno.test("Phase 7 — event-driven Cat-A post-event with explicit mindset.pause combo still routes to pre-decision-clarity", () => {
  // Cat A post-event protocol is 'Pause' (see event-categories.ts).
  // When the caller passes the resolved combo explicitly, the branch
  // must honour it without depending on the anchor category alone.
  const intent = deriveSlotIntent({
    stateAction: "Decompress after the board",
    anchorCategory: "A",
    anchorPhase: "post",
    combo: "mindset.pause",
  });
  assertEquals(intent.intentLabel, "pre-decision-clarity");
  assertEquals(intent.combo, "mindset.pause");
});

Deno.test("Phase 7 — 'focus' stateAction still routes to focus/flow (existing branch intact)", () => {
  const intent = deriveSlotIntent({
    stateAction: "Prime for focus",
    anchorCategory: null,
    anchorPhase: null,
  });
  assertEquals(intent.intentLabel, "focus/flow-mastery");
});

Deno.test("Phase 7 — Cat-A pre anchor reaches pre-decision-clarity without combo/text hacks", () => {
  const intent = deriveSlotIntent({
    stateAction: "Steady the system",
    anchorCategory: "A",
    anchorPhase: "pre",
  });
  assertEquals(intent.intentLabel, "pre-decision-clarity");
  assertEquals(intent.combo, "mindset.pause");
});
