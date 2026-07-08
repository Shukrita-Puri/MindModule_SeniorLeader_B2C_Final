// Sprint D — window-signal additive scoring boost tests.
//
// Contract:
//   - Missing windowSignals → identical order/score as before.
//   - Poor sleep boosts somatic practices.
//   - HR elevated boosts somatic regulation/pause.
//   - Decision-leakage risk boosts mindset.pause / pre-decision-clarity.
//   - Evening body load boosts recovery/renewal.
//   - Good/peak sleep + stable HRV boosts mindset/flow.
//   - Recency penalty still wins over any window boost.
//   - Window boost cannot make a wrong-protocol practice beat a correct-fit one.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveSlotIntent,
  selectPracticeForSlot,
  type ScorableContent,
} from "./practice-selector.ts";

const somaticPause: ScorableContent = {
  id: "somatic-pause",
  category: "pause",
  sub_type: "tool",
  protocol_type: "somatic",
  metaSkillTags: ["meta-recalibration"],
  structuredTags: {
    pillar: "pause",
    masterySubtypes: ["grounding", "composure"],
    goalTags: ["grounding", "composure"],
    energyDirection: "downshift",
  },
};
const mindsetPause: ScorableContent = {
  id: "mindset-pause",
  category: "pause",
  sub_type: "mindset",
  protocol_type: "mindset",
  metaSkillTags: ["meta-clarity", "meta-recalibration"],
  structuredTags: {
    pillar: "pause",
    goalTags: ["mental_clarity", "decision_readiness"],
    energyDirection: "stabilize",
  },
};
const mindsetFlow: ScorableContent = {
  id: "mindset-flow",
  category: "presence",
  sub_type: "mindset",
  protocol_type: "mindset",
  metaSkillTags: ["meta-clarity"],
  structuredTags: {
    pillar: "flow",
    goalTags: ["focus", "flow", "sustained_attention"],
    energyDirection: "clarify",
  },
};
const renewal: ScorableContent = {
  id: "renewal-rest",
  category: "pause",
  sub_type: "tool",
  protocol_type: "somatic",
  metaSkillTags: ["meta-renewal", "meta-recalibration"],
  structuredTags: {
    pillar: "renewal",
    goalTags: ["recovery", "resilience", "deep_reset"],
    energyDirection: "downshift",
  },
};

const steadyIntent = deriveSlotIntent({
  stateAction: "Steady the system",
  anchorCategory: null,
  anchorPhase: null,
});
const focusIntent = deriveSlotIntent({
  stateAction: "Prime for focus",
  anchorCategory: null,
  anchorPhase: null,
});
const clarityIntent = deriveSlotIntent({
  stateAction: "Clarify before deciding",
  anchorCategory: null,
  anchorPhase: null,
});
const recoverIntent = deriveSlotIntent({
  stateAction: "Recover",
  anchorCategory: null,
  anchorPhase: null,
});

Deno.test("Sprint D — missing windowSignals leaves order unchanged", () => {
  const base = selectPracticeForSlot(
    [somaticPause, mindsetPause],
    { mode: "state" },
    steadyIntent,
    new Set(),
  );
  const withEmpty = selectPracticeForSlot(
    [somaticPause, mindsetPause],
    { mode: "state" },
    steadyIntent,
    new Set(),
    { windowSignals: null },
  );
  assertEquals(base.selected[0].id, withEmpty.selected[0].id);
});

Deno.test("Sprint D — poor sleep boosts somatic practices", () => {
  const res = selectPracticeForSlot(
    [mindsetFlow, somaticPause],
    { mode: "state" },
    steadyIntent,
    new Set(),
    { windowSignals: { sleepQuality: "poor" } },
  );
  assertEquals(res.selected[0].id, "somatic-pause");
});

Deno.test("Sprint D — HR elevated boosts somatic regulation/pause", () => {
  const res = selectPracticeForSlot(
    [mindsetPause, somaticPause],
    { mode: "state" },
    steadyIntent,
    new Set(),
    { windowSignals: { currentHrVsRestingPct: 12 } },
  );
  // Both fit steady intent; +4 boost tips somatic pause forward.
  assertEquals(res.selected[0].id, "somatic-pause");
});

Deno.test("Sprint D — decision leakage risk boosts mindset.pause / clarity", () => {
  const res = selectPracticeForSlot(
    [mindsetFlow, mindsetPause],
    { mode: "state" },
    clarityIntent,
    new Set(),
    { windowSignals: { decisionLeakageRisk: true } },
  );
  assertEquals(res.selected[0].id, "mindset-pause");
});

Deno.test("Sprint D — evening body load boosts renewal", () => {
  const res = selectPracticeForSlot(
    [somaticPause, renewal],
    { mode: "state" },
    recoverIntent,
    new Set(),
    { windowSignals: { bodyLoadElevated: true } },
  );
  assertEquals(res.selected[0].id, "renewal-rest");
});

Deno.test("Sprint D — good sleep + stable HRV boosts mindset/flow", () => {
  const res = selectPracticeForSlot(
    [somaticPause, mindsetFlow],
    { mode: "state" },
    focusIntent,
    new Set(),
    { windowSignals: { sleepQuality: "good", hrvDeviationPct: 2 } },
  );
  assertEquals(res.selected[0].id, "mindset-flow");
});

Deno.test("Sprint D — recency penalty still wins over window boost", () => {
  // Poor sleep boosts somatic (+6), but a 1-day recency penalty (-30)
  // must dominate and hand the slot to the somatic alternative. Both
  // candidates share protocol_type=somatic so the combo gate keeps them
  // in the pool.
  const somaticAlt: ScorableContent = {
    ...somaticPause,
    id: "somatic-pause-alt",
  };
  const res = selectPracticeForSlot(
    [somaticPause, somaticAlt],
    { mode: "state" },
    steadyIntent,
    new Set(),
    {
      windowSignals: { sleepQuality: "poor" },
      recentPracticeDays: { "somatic-pause": 1 },
    },
  );
  assert(res.selected[0].id !== "somatic-pause");
});

Deno.test("Sprint D — window boost cannot beat a strong correct-fit practice", () => {
  // Focus slot: mindset-flow is the correct-fit (meta-clarity + flow
  // pillar + goal match). Even with all window signals inverted toward
  // recovery, the correct-fit practice should still lead.
  const res = selectPracticeForSlot(
    [renewal, mindsetFlow],
    { mode: "state" },
    focusIntent,
    new Set(),
    { windowSignals: { bodyLoadElevated: true, sleepQuality: "poor" } },
  );
  assertEquals(res.selected[0].id, "mindset-flow");
});
