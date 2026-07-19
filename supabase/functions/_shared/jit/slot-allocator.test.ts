// Sprint 1 tests for slot-allocator phase-awareness + identity contract.
//
// Focus:
//  1. A Cat A (board / governance) solo event fan (pre + post) must NOT
//     produce a fake "During" slot — slot-1 degrades to state fallback.
//  2. A Cat F (multi-day conference) solo event fan (pre + during + post)
//     produces a proper full-arc allocation with correct phase per slot.
//  3. Same-event fan (multiple ranked candidates that all share eventId)
//     still qualifies as `dominant_structural_event` — the old
//     `!hasSecondJit` gate would have wrongly demoted this to mixed_day.
//  4. Identity fields (jitPhase / jitEventTitle / jitEventId / slotRole)
//     match the allocator's decisions, not array position.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { allocatePlanSlots } from "./slot-allocator.ts";
import type { RankedJitCandidate } from "../events/jit-candidates.ts";

function cand(
  eventId: string,
  title: string,
  phase: "pre" | "during" | "post",
  categoryId: string,
  score: number,
): RankedJitCandidate {
  return {
    eventId,
    title,
    phase,
    categoryId: categoryId as any,
    comboKey: "somatic.flow" as any,
    severity: "high",
    leadTimeMin: 30,
    demandProfile: null,
    windowStartMs: 0,
    windowEndMs: 1_000,
    eligible: true,
    minutesUntilWindow: 0,
    score,
    components: {
      base: 40, category: 20, severity: 15, demand: 0,
      proximity: 0, skipPenalty: 0, memory: 0,
    },
  };
}

Deno.test("allocator — Cat A solo event fan does NOT invent a During slot", () => {
  const nowMs = Date.now();
  const ranked = [
    cand("evt-1", "Q2 Board Meeting", "pre", "A", 90),
    cand("evt-1", "Q2 Board Meeting", "post", "A", 75),
  ];
  const alloc = allocatePlanSlots({ nowMs, rankedCandidates: ranked });

  assertEquals(alloc.dayShape, "dominant_structural_event");
  assertEquals(alloc.mode, "full_arc");
  assertEquals(alloc.debug.sameEventFan, true);
  assertEquals(alloc.debug.dominantEventPhases, ["pre", "post"]);

  // Slot 0 → pre
  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[0].jitEventId, "evt-1");
  assertEquals(alloc.slots[0].slotRole, "pre");
  assertEquals(alloc.slots[0].arcLabel, "Prepare");

  // Slot 1 → explicit board-protect state, not a fabricated During.
  assertEquals(alloc.slots[1].jitPhase, null, "Cat A must not fabricate During");
  assertEquals(alloc.slots[1].jitEventTitle, null);
  assertEquals(alloc.slots[1].jitEventId, null);
  assertEquals(alloc.slots[1].slotRole, "state_anchor");
  assertEquals(alloc.slots[1].arcLabel, "Steady");
  assertEquals(alloc.slots[1].allocationReason, "board_protect_state");

  // Slot 2 → post
  assertEquals(alloc.slots[2].jitPhase, "post");
  assertEquals(alloc.slots[2].jitEventId, "evt-1");
  assertEquals(alloc.slots[2].slotRole, "post");
  assertEquals(alloc.slots[2].arcLabel, "Recover");
});

Deno.test("allocator — Cat F multi-phase fan yields correct pre/during/post identity", () => {
  const nowMs = Date.now();
  const ranked = [
    cand("conf-1", "Annual Summit", "pre", "F", 60),
    cand("conf-1", "Annual Summit", "during", "F", 55),
    cand("conf-1", "Annual Summit", "post", "F", 70),
  ];
  const alloc = allocatePlanSlots({ nowMs, rankedCandidates: ranked });

  assertEquals(alloc.dayShape, "dominant_structural_event");
  assertEquals(alloc.mode, "full_arc");
  assertEquals(alloc.debug.sameEventFan, true);

  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[1].jitPhase, "during");
  assertEquals(alloc.slots[2].jitPhase, "post");
  for (const s of alloc.slots) {
    assertEquals(s.jitEventId, "conf-1");
    assertEquals(s.jitEventTitle, "Annual Summit");
  }
});

Deno.test("allocator — same-event fan still qualifies as dominant (was demoted by !hasSecondJit)", () => {
  const nowMs = Date.now();
  // Two candidates, same event. Old logic saw `hasSecondJit=true` and
  // demoted this to mixed_day; new logic keeps it as dominant.
  const ranked = [
    cand("board-9", "Board Prep", "pre", "A", 88),
    cand("board-9", "Board Prep", "post", "A", 65),
  ];
  const alloc = allocatePlanSlots({ nowMs, rankedCandidates: ranked });
  assertEquals(alloc.dayShape, "dominant_structural_event");
});

Deno.test("allocator — two DIFFERENT events keeps mixed_day (fan detection does not over-collapse)", () => {
  const nowMs = Date.now();
  const ranked = [
    cand("evt-a", "Board", "pre", "A", 90),
    cand("evt-b", "Client Pitch", "pre", "B", 60),
  ];
  const alloc = allocatePlanSlots({ nowMs, rankedCandidates: ranked });
  assert(
    alloc.dayShape === "mixed_day" || alloc.dayShape === "light_routine",
    `expected mixed_day/light_routine, got ${alloc.dayShape}`,
  );
  assertEquals(alloc.debug.sameEventFan, false);
});

Deno.test("allocator — identity fields expose jitEventId + jitCategoryId (used by generate-mastery-plan merge)", () => {
  const nowMs = Date.now();
  const ranked = [
    cand("evt-x", "Q4 Board", "pre", "A", 95),
    cand("evt-x", "Q4 Board", "post", "A", 70),
  ];
  const alloc = allocatePlanSlots({ nowMs, rankedCandidates: ranked });
  assertEquals(alloc.slots[0].jitEventId, "evt-x");
  assertEquals(alloc.slots[0].jitCategoryId, "A");
  assertEquals(alloc.slots[2].jitEventId, "evt-x");
  assertEquals(alloc.slots[2].jitCategoryId, "A");
});

// ═══════════════════════════════════════════════════════════════════
// Sprint 4 (Phase 6) — rest-day contract
// ═══════════════════════════════════════════════════════════════════

Deno.test("allocator — rest_day returns ZERO slots and the rest-day marker", () => {
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    hasTravelDay: false,
    hasConferenceDay: false,
    hasOffsiteDay: false,
    hasRestSignals: true,
  });
  assertEquals(alloc.dayShape, "rest_day");
  assertEquals(alloc.mode, "state");
  assertEquals(alloc.restDay, true);
  assertEquals(alloc.allocationReason, "rest_day_no_priorities");
  assertEquals(alloc.slots.length, 0, "rest_day must NOT fabricate 3 state_anchor slots");
});

Deno.test("allocator — Saturday recovery day returns one state slot", () => {
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    dayOfWeek: 6,
    isFullWorkingWeekend: false,
  });
  assertEquals(alloc.dayShape, "saturday");
  assertEquals(alloc.mode, "state");
  assertEquals(alloc.slots.length, 1);
  assertEquals(alloc.slots[0].allocationReason, "saturday_habit_only");
});

Deno.test("allocator — Saturday recovery day honors evening practice preference", () => {
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    dayOfWeek: 6,
    isFullWorkingWeekend: false,
    preferredPracticeWindows: ["evening"],
  });
  assertEquals(alloc.dayShape, "saturday");
  assertEquals(alloc.mode, "state");
  assertEquals(alloc.slots.length, 1);
  assertEquals(alloc.slots[0].slotRole, "close_of_day");
  assertEquals(alloc.slots[0].allocationReason, "saturday_habit_only_evening");
});

Deno.test("allocator — PTO/holiday day returns one state slot", () => {
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    isPtoOrHoliday: true,
  });
  assertEquals(alloc.dayShape, "holiday_pto");
  assertEquals(alloc.mode, "state");
  assertEquals(alloc.slots.length, 1);
  assertEquals(alloc.slots[0].allocationReason, "holiday_habit_only");
});

Deno.test("allocator — Week-Ahead day returns one planning slot", () => {
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    isWeekAhead: true,
  });
  assertEquals(alloc.dayShape, "week_ahead");
  assertEquals(alloc.mode, "state");
  assertEquals(alloc.slots.length, 1);
  assertEquals(alloc.slots[0].allocationReason, "week_ahead_planning");
});

Deno.test("allocator — travel day uses named full arc", () => {
  const ranked = [
    cand("trip-1", "Flight to NYC", "pre", "G", 70),
    cand("trip-1", "Flight to NYC", "during", "G", 80),
    cand("trip-1", "Flight to NYC", "post", "G", 75),
  ];
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: ranked,
    hasTravelDay: true,
  });
  assertEquals(alloc.dayShape, "travel_day");
  assertEquals(alloc.mode, "full_arc");
  assertEquals(alloc.slots.map((s) => s.jitPhase), ["pre", "during", "post"]);
});

Deno.test("allocator — conference day uses named full arc", () => {
  const ranked = [
    cand("conf-1", "Annual Summit", "pre", "F", 70),
    cand("conf-1", "Annual Summit", "during", "F", 80),
    cand("conf-1", "Annual Summit", "post", "F", 75),
  ];
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: ranked,
    hasConferenceDay: true,
  });
  assertEquals(alloc.dayShape, "conference_day");
  assertEquals(alloc.mode, "full_arc");
  assertEquals(alloc.slots.map((s) => s.jitPhase), ["pre", "during", "post"]);
});

Deno.test("allocator — afternoon and evening windows use window-aware state roles", () => {
  const afternoon = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    mrsWindow: "afternoon",
  });
  assertEquals(afternoon.slots.map((s) => s.slotRole), ["current_priority", "remaining_demand", "close_of_day"]);

  const evening = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    mrsWindow: "evening",
  });
  assertEquals(evening.slots.map((s) => s.slotRole), ["current_priority", "protect_tonight", "tomorrow_prep"]);
});

Deno.test("allocator — forced drain category elevates non-structural event to arc", () => {
  const ranked = [
    cand("pitch-1", "Investor Pitch", "pre", "B", 80),
    cand("pitch-1", "Investor Pitch", "post", "B", 70),
  ];
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: ranked,
    forceArcCategoryIds: ["B" as any],
  });
  assertEquals(alloc.dayShape, "dominant_structural_event");
  assertEquals(alloc.mode, "full_arc");
  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[2].jitPhase, "post");
});

Deno.test("allocator — non-rest empty-calendar day still returns 3 state fallback slots (not the rest-day path)", () => {
  // No ranked candidates and no rest signals → light_routine, NOT rest_day.
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: [],
    hasTravelDay: false,
    hasConferenceDay: false,
    hasOffsiteDay: false,
    hasRestSignals: false,
  });
  assertEquals(alloc.dayShape, "light_routine");
  assertEquals(alloc.slots.length, 3, "non-rest state-only day still shows 3 state fallback slots");
  assertEquals(alloc.restDay, undefined);
});

// ── WS4 — Plan Arc Selector (travel arc pruning) ──────────────────────

Deno.test("WS4 — short-haul flight (travel_day path) drops the During slot", () => {
  // Title has no long-haul/red-eye keyword and no duration is carried on
  // RankedJitCandidate → enrichEvent().travelArc defaults to 'pre-post'.
  const ranked = [
    cand("flt-1", "Flight BA123 to Amsterdam", "pre",    "G", 80),
    cand("flt-1", "Flight BA123 to Amsterdam", "during", "G", 70),
    cand("flt-1", "Flight BA123 to Amsterdam", "post",   "G", 75),
  ];
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: ranked,
    hasTravelDay: true,
  });
  assertEquals(alloc.dayShape, "travel_day");
  assertEquals(alloc.mode, "full_arc");
  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[1].jitPhase, null, "short-haul must NOT emit an in-flight slot");
  assertEquals(alloc.slots[1].slotRole, "state_anchor");
  assertEquals(alloc.slots[2].jitPhase, "post");
  assert(!alloc.debug.dominantEventPhases?.includes("during"));
});

Deno.test("WS4 — long-haul flight (travel_day path) keeps the During slot", () => {
  // "long-haul" keyword forces enrichEvent → 'pre-during-post' regardless
  // of duration availability at the allocator boundary.
  const ranked = [
    cand("flt-2", "Long-haul flight LHR → SFO", "pre",    "G", 80),
    cand("flt-2", "Long-haul flight LHR → SFO", "during", "G", 70),
    cand("flt-2", "Long-haul flight LHR → SFO", "post",   "G", 75),
  ];
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: ranked,
    hasTravelDay: true,
  });
  assertEquals(alloc.dayShape, "travel_day");
  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[1].jitPhase, "during", "long-haul must keep in-flight slot");
  assertEquals(alloc.slots[2].jitPhase, "post");
  assertEquals(alloc.debug.dominantEventPhases, ["pre", "during", "post"]);
});

Deno.test("WS4 — dominant-event branch prunes During for short-haul G anchor", () => {
  // No `hasTravelDay` flag → falls into dominant_structural_event branch.
  const ranked = [
    cand("flt-3", "Flight to Manchester", "pre",    "G", 80),
    cand("flt-3", "Flight to Manchester", "during", "G", 60),
    cand("flt-3", "Flight to Manchester", "post",   "G", 70),
  ];
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: ranked,
  });
  assertEquals(alloc.dayShape, "dominant_structural_event");
  assertEquals(alloc.mode, "full_arc");
  assertEquals(alloc.debug.dominantEventPhases, ["pre", "post"]);
  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[1].jitPhase, null);
  assertEquals(alloc.slots[2].jitPhase, "post");
});

Deno.test("WS4 — Cat F conference day is unaffected by travel arc pruning", () => {
  const ranked = [
    cand("conf-1", "Annual Sales Conference", "pre",    "F", 80),
    cand("conf-1", "Annual Sales Conference", "during", "F", 70),
    cand("conf-1", "Annual Sales Conference", "post",   "F", 75),
  ];
  const alloc = allocatePlanSlots({
    nowMs: Date.now(),
    rankedCandidates: ranked,
    hasConferenceDay: true,
  });
  assertEquals(alloc.dayShape, "conference_day");
  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[1].jitPhase, "during", "conference days keep the During slot");
  assertEquals(alloc.slots[2].jitPhase, "post");
});
