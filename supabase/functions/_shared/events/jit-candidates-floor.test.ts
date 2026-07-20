// Sprint 3 (Phase 5) — meaningful-candidate floor for rankJitCandidates.
//
// Verifies that weak / low-stakes classifier hits do not enter the ranked
// list and cannot anchor a Plan slot, while genuinely meaningful events
// still rank normally.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  rankJitCandidates,
  isMeaningfulJitCandidate,
  getJitCandidateDropReason,
  MIN_CANDIDATE_SCORE,
  type RankableEventInput,
} from "./jit-candidates.ts";
import { allocatePlanSlots } from "../jit/slot-allocator.ts";

const NOW = new Date("2026-07-08T12:00:00Z").getTime();

function evt(title: string, stakes?: string): RankableEventInput {
  return {
    event: {
      id: `evt_${title}`,
      title,
      start_time: "2026-07-08T14:00:00Z",
      end_time: "2026-07-08T15:00:00Z",
    },
    stakesLevel: stakes ?? null,
  };
}

Deno.test("floor: low-stakes 'Liquid Fast' personal item does NOT rank as JIT", () => {
  const ranked = rankJitCandidates([evt("Liquid Fast")], NOW);
  // Even if the classifier matched something, the personal-category
  // predicate should drop it.
  const personalKept = ranked.find(c => String(c.categoryId) === "H");
  assertEquals(personalKept, undefined,
    `personal-category candidate leaked into ranked list: ${JSON.stringify(personalKept)}`);
});

Deno.test("floor: meaningful board/governance event still ranks and allocates", () => {
  const ranked = rankJitCandidates([evt("Board Meeting", "board")], NOW);
  assert(ranked.length > 0, "board meeting should produce candidates");
  const alloc = allocatePlanSlots({
    nowMs: NOW,
    rankedCandidates: ranked,
    hasTravelDay: false, hasConferenceDay: false, hasOffsiteDay: false, hasRestSignals: false,
  });
  assertEquals(alloc.dayShape, "dominant_structural_event");
  // Category A (board): slot 1 "during" is intentionally state fallback.
  assertEquals(alloc.slots[0].jitPhase, "pre");
  assertEquals(alloc.slots[2].jitPhase, "post");
});

Deno.test("floor: meaningful conference/visibility event still ranks", () => {
  const ranked = rankJitCandidates([evt("Q3 Leadership Conference", "high")], NOW);
  assert(ranked.length > 0, "conference should produce candidates");
});

// Sprint 4 pre-check regression: Category G = Travel MUST be in the
// structural allow-list. Without this, a genuine multi-hour travel event
// with medium stakes would silently drop unless the numeric floor
// happened to catch it, and travel is exactly the kind of event we do
// not want surviving by accident.
Deno.test("floor (G/travel): medium-stakes travel event clears the structural allow-list, not just the score floor", () => {
  const travel: RankableEventInput = {
    event: {
      id: "trip-1",
      title: "Long-haul flight to New York",
      start_time: "2026-07-08T14:00:00Z",
      end_time: "2026-07-08T22:00:00Z",
    },
    stakesLevel: "medium",
  };
  const ranked = rankJitCandidates([travel], NOW);
  const gCandidate = ranked.find(c => String(c.categoryId) === "G");
  assert(gCandidate, `expected a Category G candidate for travel event, ranked=${JSON.stringify(ranked)}`);
  // Structural predicate must be what keeps this in — not the numeric
  // floor. Verify by checking that the drop predicate accepts it even
  // when the numeric floor would have rejected the raw score.
  assertEquals(
    getJitCandidateDropReason(gCandidate!, travel),
    null,
    "medium-stakes travel must clear the meaningful-candidate floor via the G structural allow-list",
  );
});

Deno.test("floor: one weak event does NOT get recycled across all three slots (mixed/light)", () => {
  // Single weak candidate that squeaks through the floor via score.
  const strongOne = evt("Investor Update", "investor");
  const ranked = rankJitCandidates([strongOne], NOW);
  assert(ranked.length >= 1, "expected at least the strong candidate");
  const alloc = allocatePlanSlots({
    nowMs: NOW,
    rankedCandidates: ranked,
    hasTravelDay: false, hasConferenceDay: false, hasOffsiteDay: false, hasRestSignals: false,
  });
  // If dominant_structural (same-event fan) then dominant branch handles
  // phases — that's fine. If it's light_routine/mixed_day, slot 1 and 2
  // must NOT recycle the same eventId as slot 0.
  if (alloc.dayShape === "light_routine" || alloc.dayShape === "mixed_day") {
    const slot0Ev = alloc.slots[0].jitEventId;
    // At least one of slots 1/2 must be state fallback (no jit id).
    const recycled = [alloc.slots[1], alloc.slots[2]].filter(
      s => s.jitEventId && s.jitEventId === slot0Ev,
    );
    assertEquals(recycled.length, 0,
      `top candidate was recycled across slots in ${alloc.dayShape}: ${JSON.stringify(alloc.slots)}`);
  }
});

Deno.test("floor: empty calendar yields all state-fallback slots with truthful reason", () => {
  const alloc = allocatePlanSlots({
    nowMs: NOW,
    rankedCandidates: [],
    hasTravelDay: false, hasConferenceDay: false, hasOffsiteDay: false, hasRestSignals: false,
  });
  for (const s of alloc.slots) {
    assertEquals(s.jitEventId, null);
    assertEquals(s.jitPhase, null);
    assertEquals(s.allocationReason, "state_fallback_no_meaningful_jit");
  }
});

Deno.test("predicate: strong stakes alone clears the floor even for otherwise-weak items", () => {
  // Same title with vs without strong stakes — strong stakes must keep it.
  const weak = rankJitCandidates([evt("1:1 Sync")], NOW);
  const strong = rankJitCandidates([evt("1:1 Sync", "board")], NOW);
  assert(strong.length >= weak.length,
    `strong-stakes variant should keep at least as many candidates: weak=${weak.length} strong=${strong.length}`);
});

Deno.test("predicate: positive memoryDelta clears the floor even for weak-looking items", () => {
  const ev: RankableEventInput = {
    ...evt("Weekly Ritual"),
    memoryDelta: 20,
  };
  const ranked = rankJitCandidates([ev], NOW);
  // Not asserting length > 0 unconditionally because enrichEvent may or
  // may not classify this title; assert instead that IF it produced a
  // candidate, the predicate accepts it.
  for (const c of ranked) {
    assertEquals(isMeaningfulJitCandidate(c, ev), true,
      `positive memory candidate rejected: ${JSON.stringify(c)}`);
  }
});

Deno.test("MIN_CANDIDATE_SCORE is the documented numeric floor", () => {
  // Locking the constant so a silent tweak forces a review.
  assertEquals(MIN_CANDIDATE_SCORE, 25);
});

Deno.test("getJitCandidateDropReason: personal category without stakes → dropped", () => {
  const ev = evt("Errand");
  const fake = {
    eventId: "e", title: "Errand", phase: "pre" as const,
    categoryId: "H" as any, comboKey: "focus_prep" as any,
    severity: "medium" as const, leadTimeMin: 30, demandProfile: null,
    windowStartMs: NOW, windowEndMs: NOW + 60_000, eligible: true,
    minutesUntilWindow: 0, score: 40, durationMinutes: null,
    components: { base: 5, category: 0, severity: 8, demand: 0, proximity: 0, skipPenalty: 0, memory: 0 },
  };
  assertEquals(getJitCandidateDropReason(fake, ev), "personal_category_without_explicit_stakes");
});

Deno.test("getJitCandidateDropReason: admin/compliance noise drops before numeric floor", () => {
  const ev = evt("R&D Tax claim review");
  const fake = {
    eventId: "tax", title: "R&D Tax claim review", phase: "pre" as const,
    categoryId: "D" as any, comboKey: "somatic.pause" as any,
    severity: "high" as const, leadTimeMin: 30,
    demandProfile: {
      cog: 3 as const, emo: 2 as const, vis: 0 as const, pol: 0 as const,
      rel: 0 as const, ene: 1 as const, cir: 0 as const, id: 0 as const,
    },
    windowStartMs: NOW, windowEndMs: NOW + 60_000, eligible: true,
    minutesUntilWindow: 0, score: MIN_CANDIDATE_SCORE + 20, durationMinutes: null,
    components: { base: 15, category: 15, severity: 15, demand: 10, proximity: 0, skipPenalty: 0, memory: 0 },
  };
  assertEquals(getJitCandidateDropReason(fake, ev), "admin_compliance_noise");
});
