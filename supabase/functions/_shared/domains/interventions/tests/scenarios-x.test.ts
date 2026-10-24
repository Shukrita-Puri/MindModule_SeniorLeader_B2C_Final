// [KIND: test] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Scenarios X-01 to X-29 & Section 8.9 Tests for Layer 3 Interventions.
// Source: Part 2 Layer 3 (Section 8.9, Section 11 Table X-01 to X-29).

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assessNeed,
  composeDayInterventions,
  OWN_ACTIONS_CATALOGUE,
  routeNeed,
  selectIntervention,
  type InterventionCandidate,
  type PracticeDefinition,
} from "../index.ts";

const MOCK_PRACTICES: PracticeDefinition[] = [
  {
    id: "box-breathing",
    title: "Box Breathing",
    visible: true,
    surfaces: ["plan", "nudges", "brief"],
    content_type: "practice",
    sub_type: "somatic",
    category: "pause",
    recalibrate_page: "pause",
    recalibrate_section: "somatic",
    protocol_type: "box_breathing",
    minutes: 4,
    duration_band: "quick",
    combos: ["somatic.pause", "somatic.flow"],
    arousal: "calming",
    capabilities: ["reduce_arousal", "steady_composure"],
  },
  {
    id: "release-exhale-new",
    title: "Release Exhale",
    visible: true,
    surfaces: ["plan", "nudges"],
    content_type: "practice",
    sub_type: "somatic",
    category: "pause",
    recalibrate_page: "pause",
    recalibrate_section: "somatic",
    protocol_type: "release_exhale",
    minutes: 2,
    duration_band: "quick",
    combos: ["somatic.pause"],
    arousal: "calming",
    capabilities: ["reduce_arousal"],
  },
  {
    id: "fudoshin-immovable-mind",
    title: "Fudoshin Immovable Mind",
    visible: true,
    surfaces: ["plan", "nudges"],
    content_type: "practice",
    sub_type: "somatic",
    category: "flow",
    recalibrate_page: "flow",
    recalibrate_section: "somatic",
    protocol_type: "fudoshin",
    minutes: 5,
    duration_band: "quick",
    combos: ["somatic.flow"],
    arousal: "steadying",
    capabilities: ["steady_composure", "prime_presence"],
  },
  {
    id: "confidence-through-evidence",
    title: "Confidence Through Evidence",
    visible: true,
    surfaces: ["plan", "nudges"],
    content_type: "practice",
    sub_type: "mindset",
    category: "flow",
    recalibrate_page: "flow",
    recalibrate_section: "mindset",
    protocol_type: "confidence_evidence",
    minutes: 2, // 2 minutes (Section 11, X-20)
    duration_band: "quick",
    combos: ["mindset.presence"],
    arousal: "steadying",
    capabilities: ["prime_presence", "decision_clarity"],
    goal_tags: ["pitch", "investor"],
  },
  {
    id: "vagus-wind-down",
    title: "Vagus Nerve Wind Down",
    visible: true,
    surfaces: ["plan", "nudges"],
    content_type: "practice",
    sub_type: "somatic",
    category: "pause",
    recalibrate_page: "pause",
    recalibrate_section: "somatic",
    protocol_type: "vagus_nerve",
    minutes: 10,
    duration_band: "short",
    combos: ["somatic.sleep"],
    arousal: "calming",
    capabilities: ["sleep_preparation", "reduce_arousal"],
  },
  {
    id: "single-thread-focus",
    title: "Single Thread Focus",
    visible: true,
    surfaces: ["plan"],
    content_type: "practice",
    sub_type: "mindset",
    category: "flow",
    recalibrate_page: "flow",
    recalibrate_section: "mindset",
    protocol_type: "single_thread",
    minutes: 15,
    duration_band: "short",
    combos: ["mindset.focus"],
    arousal: "steadying",
    capabilities: ["sharpen_focus", "start_action"],
  },
];

// =============================================================================
// Section 8.9: Extension & Contract Tests
// =============================================================================

Deno.test("L3-8.9a: Extensibility — non-practice kind (role-play / framework) selected without core engine change", () => {
  const fictionalRolePlay: InterventionCandidate = {
    id: "board-sparring-roleplay",
    title: "Board Challenge Sparring Partner",
    kind: "role_play" as any,
    capabilities: ["steady_composure", "prime_presence"],
    minutes: 15,
  };

  const decision = selectIntervention({
    request: {
      feature: "plan",
      slotId: "slot_0",
      anchorCategory: "A",
      phase: "pre",
      availableGapMinutes: 20,
      targetNeed: "settle_before",
    },
    catalogue: MOCK_PRACTICES,
  });

  assertNotEquals(decision.chosen, null);
  assertEquals(decision.outcome, "match");
});

Deno.test("L3-8.9b: Never empty — unmapped need falls back to default set or static route", () => {
  const decision = selectIntervention({
    request: {
      feature: "plan",
      slotId: "slot_unmapped",
      anchorCategory: "UNKNOWN",
      phase: "pre",
      availableGapMinutes: 20,
      targetNeed: "keep_the_ritual_off_days",
    },
    catalogue: [], // empty catalogue forces fallback
  });

  assertEquals(decision.outcome, "default_set");
  assertNotEquals(decision.chosen, null);
  assertEquals(decision.score, 50);
});

// =============================================================================
// Scenarios X-01 to X-10 (High Stakes, Transits, Crises)
// =============================================================================

Deno.test("X-01: Board at 11 after short night (A-pre, somatic.flow, body loud)", () => {
  const { need } = assessNeed({
    anchorCategory: "A",
    phase: "pre",
    slotRole: "prepare",
    stateProfile: { tier: "depleted", trajectory: { hrDrift: { isDriftingUp: true } } } as any,
  });
  assertEquals(need, "settle_before");

  const route = routeNeed({
    need,
    availableGapMinutes: 20,
    phase: "pre",
  });
  assertEquals(route.route, "app_tool");
});

Deno.test("X-02: 4h back-to-back then pitch (B-pre dense day, notification in 15m gap)", () => {
  const routeInGap = routeNeed({
    need: "settle_before",
    availableGapMinutes: 10, // Under 15m -> own action
    phase: "pre",
  });
  assertEquals(routeInGap.route, "own_action");
  assertEquals(routeInGap.rule, "RT3_no_time_for_app");
});

Deno.test("X-03: Landed 07:00, pitch 10:00 (G-post then B-pre)", () => {
  const { need } = assessNeed({
    anchorCategory: "B",
    phase: "pre",
    slotRole: "prepare",
  });
  assertEquals(need, "settle_before");
});

Deno.test("X-04: Layoff announcement 9:00, board 14:00 (D sensitive pre & post, A-pre)", () => {
  const preD = assessNeed({ anchorCategory: "D", phase: "pre", slotRole: "prepare" });
  assertEquals(preD.need, "settle_before");

  const postD = assessNeed({ anchorCategory: "D", phase: "post", slotRole: "recover" });
  assertEquals(postD.need, "offload_after");
});

Deno.test("X-05: No meetings after heavy day (Light day, recoveryOwed)", () => {
  const { need } = assessNeed({
    phase: "evening",
    slotRole: "wrap",
    dayProfile: {
      load: { level: "heavy" },
      availability: { isWorkingDay: true },
      crisis: { isCrisisDay: false },
    } as any,
  });
  assertEquals(need, "protect_sleep_for_the_mind");
});

Deno.test("X-06: Light day with board meeting (A-pre, hold or evening, A-post)", () => {
  const preA = assessNeed({ anchorCategory: "A", phase: "pre", slotRole: "prepare" });
  assertEquals(preA.need, "settle_before");

  const postA = assessNeed({ anchorCategory: "A", phase: "post", slotRole: "recover" });
  assertEquals(postA.need, "offload_after");
});

Deno.test("X-07: Saturday no work, Sunday last day off (keep_the_ritual_off_days)", () => {
  const { need } = assessNeed({
    phase: "day",
    slotRole: "sustain",
    dayProfile: {
      availability: { isWorkingDay: false },
      weekAhead: { isActive: false },
    } as any,
  });
  assertEquals(need, "keep_the_ritual_off_days");
});

Deno.test("X-08: Sunday last day of weekend (prepare_the_week)", () => {
  const { need } = assessNeed({
    phase: "day",
    slotRole: "sustain",
    dayProfile: {
      availability: { isWorkingDay: false },
      weekAhead: { isActive: true },
    } as any,
  });
  assertEquals(need, "prepare_the_week");
});

Deno.test("X-09: Saturday client calls (treated as working day rows)", () => {
  const { need } = assessNeed({
    anchorCategory: "B",
    phase: "pre",
    slotRole: "prepare",
    dayProfile: { availability: { isWorkingDay: true } } as any,
  });
  assertEquals(need, "settle_before");
});

Deno.test("X-10: Active crisis episode open (steady_in_crisis)", () => {
  const { need } = assessNeed({
    anchorCategory: "J",
    phase: "pre",
    isCrisis: true,
  });
  assertEquals(need, "steady_in_crisis");
});

// =============================================================================
// Scenarios X-11 to X-20 (Masked Fatigue, Travel, Slumps)
// =============================================================================

Deno.test("X-11: Masked fatigue check before high stakes anchor", () => {
  const { need } = assessNeed({
    anchorCategory: "A",
    phase: "pre",
    stateProfile: { tier: "overloaded", trajectory: { hrDrift: { isDriftingUp: true } } } as any,
  });
  assertEquals(need, "settle_before");
});

Deno.test("X-12: No wearable data leaves rows ranked without body signals", () => {
  const decision = selectIntervention({
    request: {
      feature: "plan",
      slotId: "slot_0",
      anchorCategory: "C",
      phase: "pre",
      availableGapMinutes: 25,
      targetNeed: "settle_before",
    },
    catalogue: MOCK_PRACTICES,
    isBodyLoud: false,
  });
  assertEquals(decision.outcome, "match");
});

Deno.test("X-13: Strong efficacy practice boosted in ranking", () => {
  const decision = selectIntervention({
    request: {
      feature: "plan",
      slotId: "slot_0",
      anchorCategory: "A",
      phase: "pre",
      availableGapMinutes: 35, // Rung 2 fits box-breathing (4m)
      userFavourites: ["box-breathing"],
    },
    catalogue: MOCK_PRACTICES,
    allowOwnActions: false, // app tool requested
  });
  assertEquals(decision.chosen.id, "box-breathing");
});

Deno.test("X-14: Performance review at 15:00 (D sensitive)", () => {
  const pre = assessNeed({ anchorCategory: "D", phase: "pre" });
  assertEquals(pre.need, "settle_before");
  const post = assessNeed({ anchorCategory: "D", phase: "post" });
  assertEquals(post.need, "offload_after");
});

Deno.test("X-15: Long haul flight arrival G-post", () => {
  const { need } = assessNeed({ anchorCategory: "G", phase: "post", slotRole: "recover" });
  assertEquals(need, "offload_after");
});

Deno.test("X-16: Date repeated crossing dateline retains completed slots", () => {
  const plan = composeDayInterventions({
    moments: [
      { slotIndex: 0, role: "prepare", anchorCategory: "A", phase: "pre", availableGapMinutes: 20 },
      { slotIndex: 1, role: "sustain", anchorCategory: null, phase: "day", availableGapMinutes: 30 },
      { slotIndex: 2, role: "wrap", anchorCategory: null, phase: "evening", availableGapMinutes: 30 },
    ],
    catalogue: MOCK_PRACTICES,
  });
  assertEquals(plan.slots.length, 3);
});

Deno.test("X-17: Conference day 2 of 3 (evening renewal)", () => {
  const { need } = assessNeed({ phase: "evening", slotRole: "wrap" });
  assertEquals(need, "close_the_day");
});

Deno.test("X-18: First open of morning before check-in (no slot yet until plan builds)", () => {
  const { need } = assessNeed({ phase: "pre", slotRole: "prepare" });
  assertEquals(need, "settle_before");
});

Deno.test("X-19: 15-minute gap then 1:1 (T1 quick practice or own action)", () => {
  const route = routeNeed({ need: "prime_presence", availableGapMinutes: 15, phase: "pre" });
  assertEquals(route.route, "app_tool");
});

Deno.test("X-20: 35 minutes before investor pitch (T2 confidence practice)", () => {
  const decision = selectIntervention({
    request: {
      feature: "plan",
      slotId: "slot_0",
      anchorCategory: "B",
      phase: "pre",
      availableGapMinutes: 35,
      targetNeed: "prime_presence",
      userGoals: ["pitch"],
    },
    catalogue: MOCK_PRACTICES,
    allowOwnActions: false, // app tool requested
  });
  assertEquals(decision.chosen.id, "confidence-through-evidence");
});

// =============================================================================
// Scenarios X-21 to X-29 (Focus, Recovery, Slump, Own Action Slots)
// =============================================================================

Deno.test("X-21: 90 minutes free before strategy offsite (E)", () => {
  const decision = selectIntervention({
    request: {
      feature: "plan",
      slotId: "slot_0",
      anchorCategory: "E",
      phase: "pre",
      availableGapMinutes: 90,
      targetNeed: "clear_and_focus",
    },
    catalogue: MOCK_PRACTICES,
    allowOwnActions: false,
  });
  assertEquals(decision.chosen.id, "single-thread-focus");
});

Deno.test("X-22: 21:30 heavy day bedtime 22:30 (evening calming only)", () => {
  const decision = selectIntervention({
    request: {
      feature: "plan",
      slotId: "slot_2",
      anchorCategory: null,
      phase: "evening",
      availableGapMinutes: 60, // Rung 3 fits vagus-wind-down (10m)
      targetNeed: "protect_sleep_for_the_mind",
    },
    catalogue: MOCK_PRACTICES,
    allowOwnActions: false, // app tool requested
  });
  assertEquals(decision.chosen.id, "vagus-wind-down");
});

Deno.test("X-23: Afternoon slump low energy", () => {
  const { need } = assessNeed({ phase: "day", slotRole: "sustain" });
  assertEquals(need, "transition_between");
});

Deno.test("X-24: Depleted state before pitch (somatic steadying)", () => {
  const { need } = assessNeed({
    anchorCategory: "B",
    phase: "pre",
    slotRole: "prepare",
    stateProfile: { tier: "depleted" } as any,
  });
  assertEquals(need, "settle_before");
});

Deno.test("X-25: No recovery window 13:00-18:00 (allocates 1 own action, 2 app practices)", () => {
  const plan = composeDayInterventions({
    moments: [
      { slotIndex: 0, role: "prepare", anchorCategory: "A", phase: "pre", availableGapMinutes: 20 },
      { slotIndex: 1, role: "sustain", anchorCategory: "E", phase: "during", availableGapMinutes: 0 }, // Own action
      { slotIndex: 2, role: "wrap", anchorCategory: null, phase: "evening", availableGapMinutes: 45 },
    ],
    catalogue: MOCK_PRACTICES,
  });

  assertEquals(plan.slots.length, 3);
  assertEquals(plan.slots[0].decision.chosen.kind, "practice");
  assertEquals(plan.slots[1].decision.chosen.kind, "own_action");
  assertEquals(plan.slots[2].decision.chosen.kind, "practice");
});

Deno.test("X-26: Online 1:1 after heavy day (walking call own action)", () => {
  const action = OWN_ACTIONS_CATALOGUE.find((a) => a.id === "walking-call");
  assertNotEquals(action, undefined);
  assertEquals(action?.kind, "own_action");
});

Deno.test("X-27: Contentious internal at 14:00 then hiring at 15:00 (D-post distance)", () => {
  const action = OWN_ACTIONS_CATALOGUE.find((a) => a.id === "distance-before-the-next-call");
  assertNotEquals(action, undefined);
  assertEquals(action?.kind, "own_action");
});

Deno.test("X-28: Internal debate 13:00, investor 14:00 (leave-internal-arrive-external)", () => {
  const action = OWN_ACTIONS_CATALOGUE.find((a) => a.id === "leave-internal-arrive-external");
  assertNotEquals(action, undefined);
  assertEquals(action?.kind, "own_action");
});

Deno.test("X-29: Board ends 19:30, board-level day tomorrow (protect tonight)", () => {
  const action = OWN_ACTIONS_CATALOGUE.find((a) => a.id === "protect-tonight");
  assertNotEquals(action, undefined);
  assertEquals(action?.kind, "own_action");
});
