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

  // Slot 1 → NO During available for Cat A → state fallback.
  assertEquals(alloc.slots[1].jitPhase, null, "Cat A must not fabricate During");
  assertEquals(alloc.slots[1].jitEventTitle, null);
  assertEquals(alloc.slots[1].jitEventId, null);
  assertEquals(alloc.slots[1].slotRole, "state_anchor");
  assertEquals(alloc.slots[1].arcLabel, "Steady");
  assertEquals(alloc.slots[1].allocationReason, "state_fallback_phase_unavailable");

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
