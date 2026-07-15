// Sprint 2 (Phase 3) — ledger-evolution real-context tests.
//
// These tests pin the contract for the ledger-evolution allocation path:
//   1. deriveStructuralDayFlags is honest about the current calendar.
//   2. mergeWithLedger uses the passed allocatorContext (not fabricated
//      score:0 pseudo-candidates) so afternoon/evening allocation reflects
//      newly-added travel / conference / offsite events.
//   3. Completed ledger slots stay sticky — allocator identity does not
//      overwrite a completed slot.
//   4. Unfinished/cancelled slots refresh from the real allocator context.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveStructuralDayFlags,
  mergeWithLedger,
  type LedgerAllocatorContext,
} from "./index.ts";
import type { RankedJitCandidate } from "../_shared/events/jit-candidates.ts";

function ranked(
  eventId: string,
  title: string,
  phase: "pre" | "during" | "post",
  categoryId: any,
  score: number,
  startIso: string,
): RankedJitCandidate {
  return {
    eventId,
    title,
    phase,
    categoryId,
    comboKey: "focus_prep" as any,
    severity: "high",
    leadTimeMin: 30,
    demandProfile: null,
    windowStartMs: new Date(startIso).getTime() - 60 * 60_000,
    windowEndMs: new Date(startIso).getTime() + 60 * 60_000,
    eligible: true,
    minutesUntilWindow: 0,
    score,
    components: {
      base: score, category: 0, severity: 0, demand: 0,
      proximity: 0, skipPenalty: 0, memory: 0,
    },
  };
}

const NOW = new Date("2026-07-08T12:00:00Z").getTime();
const START_ISO = "2026-07-08T14:00:00Z";

Deno.test("deriveStructuralDayFlags detects travel/conference/offsite from real events", () => {
  const flags = deriveStructuralDayFlags(
    [{ title: "Flight to SFO" }, { title: "Board Sync" }],
    "medium",
  );
  assertEquals(flags.hasTravelDay, true);
  assertEquals(flags.hasConferenceDay, false);
  assertEquals(flags.hasOffsiteDay, false);
  assertEquals(flags.hasRestSignals, false);
});

Deno.test("deriveStructuralDayFlags detects conference/offsite terms", () => {
  const flags = deriveStructuralDayFlags(
    [{ title: "Leadership Offsite" }, { title: "Q3 Summit" }],
    "high",
  );
  assertEquals(flags.hasConferenceDay, true);
  assertEquals(flags.hasOffsiteDay, true);
  assertEquals(flags.hasTravelDay, false);
});

Deno.test("deriveStructuralDayFlags: empty weekday is LIGHT_ROUTINE, not rest (SSOT)", () => {
  // Canonical Rest Day SSOT: empty weekday calendars are workload signals
  // only. They MUST NOT collapse the day to a rest day.
  const monday = new Date("2026-07-13T09:00:00");
  const flags = deriveStructuralDayFlags([], "low", { now: monday });
  assertEquals(flags.hasRestSignals, false);
  assertEquals(flags.hasTravelDay, false);
});

Deno.test("deriveStructuralDayFlags: Saturday with no events flags rest", () => {
  const saturday = new Date("2026-07-18T09:00:00");
  const flags = deriveStructuralDayFlags([], "low", { now: saturday });
  assertEquals(flags.hasRestSignals, true);
});

Deno.test("deriveStructuralDayFlags: explicitPto flags rest", () => {
  const monday = new Date("2026-07-13T09:00:00");
  const flags = deriveStructuralDayFlags([], "low", { now: monday, explicitPto: true });
  assertEquals(flags.hasRestSignals, true);
});

Deno.test("mergeWithLedger: completed ledger slot stays sticky — allocator identity does NOT overwrite", () => {
  const completedContentId = "practice_completed_1";
  const ledger: any[] = [
    {
      horizon: "now",
      isJit: true,
      jitEventTitle: "Board Sync (original identity)",
      jitPhase: "pre",
      anchorEventId: "evt_original",
      practice: { contentId: completedContentId },
    },
    { horizon: "now", isJit: false, practice: { contentId: "p2" } },
    { horizon: "now", isJit: false, practice: { contentId: "p3" } },
  ];
  const fresh: any[] = [
    { horizon: "now", isJit: false, practice: { contentId: "fresh1" }, jitEventTitle: null, jitPhase: null },
    { horizon: "now", isJit: false, practice: { contentId: "fresh2" }, jitEventTitle: null, jitPhase: null },
    { horizon: "now", isJit: false, practice: { contentId: "fresh3" }, jitEventTitle: null, jitPhase: null },
  ];
  const context: LedgerAllocatorContext = {
    nowMs: NOW,
    rankedCandidates: [
      ranked("evt_new", "Investor Update", "pre", "A", 90, START_ISO),
    ],
    hasTravelDay: false, hasConferenceDay: false, hasOffsiteDay: false, hasRestSignals: false,
  };
  const result = mergeWithLedger(
    fresh, ledger,
    new Set<string>([completedContentId]), // slot 0 completed
    new Set<string>(), new Set<string>(),
    undefined, undefined,
    context,
  );
  assertEquals(result.source, "ledger-evolution");
  // Slot 0 is completed → sticky. Its identity must NOT be overwritten by
  // the allocator's top candidate ("Investor Update").
  assertEquals(result.modules[0].jitEventTitle, "Board Sync (original identity)");
  assertEquals(result.modules[0].practice.contentId, completedContentId);
});

Deno.test("mergeWithLedger: newly-added travel event flows into allocator context (day-shape/mode change)", () => {
  const ledger: any[] = [
    { horizon: "now", isJit: false, practice: { contentId: "p1" }, isCancelled: true },
    { horizon: "now", isJit: false, practice: { contentId: "p2" }, isCancelled: true },
    { horizon: "now", isJit: false, practice: { contentId: "p3" }, isCancelled: true },
  ];
  const fresh: any[] = [
    { horizon: "now", isJit: false, practice: { contentId: "fresh1" }, jitEventTitle: null, jitPhase: null },
    { horizon: "now", isJit: false, practice: { contentId: "fresh2" }, jitEventTitle: null, jitPhase: null },
    { horizon: "now", isJit: false, practice: { contentId: "fresh3" }, jitEventTitle: null, jitPhase: null },
  ];
  const baseCtx: LedgerAllocatorContext = {
    nowMs: NOW,
    rankedCandidates: [ranked("evt_1", "1:1 Sync", "pre", "B", 40, START_ISO)],
    hasTravelDay: false, hasConferenceDay: false, hasOffsiteDay: false, hasRestSignals: false,
  };
  // Two structural signals (travel + offsite) push the allocator's
  // dayShape to "mixed_day". This proves the real flags reach the
  // allocator, unlike the pre-Sprint-2 hardcoded `false` reconstruction.
  const withTravelCtx: LedgerAllocatorContext = {
    ...baseCtx,
    hasTravelDay: true,
    hasOffsiteDay: true,
  };
  const before = mergeWithLedger(
    fresh, ledger, new Set(), new Set(), new Set(),
    undefined, undefined, baseCtx,
  );
  const after = mergeWithLedger(
    fresh, ledger, new Set(), new Set(), new Set(),
    undefined, undefined, withTravelCtx,
  );
  // dayShape / mode are copied onto slots from the allocator, so they must
  // differ between the two contexts (base=no travel vs travel added).
  assertEquals((before.modules[0] as any).dayShape, "light_routine");
  assertEquals((after.modules[0] as any).dayShape, "mixed_day");
});

Deno.test("mergeWithLedger: cancelled (unfinished) slot refreshes from real allocator context, not score:0 pseudo-candidates", () => {
  const ledger: any[] = [
    { horizon: "now", isJit: false, practice: { contentId: "p1_cancelled" }, isCancelled: true },
    { horizon: "now", isJit: false, practice: { contentId: "p2_done" } },
    { horizon: "now", isJit: false, practice: { contentId: "p3_done" } },
  ];
  const fresh: any[] = [
    { horizon: "now", isJit: false, practice: { contentId: "fresh_replacement" }, jitEventTitle: null, jitPhase: null },
    { horizon: "now", isJit: false, practice: { contentId: "fresh2" }, jitEventTitle: null, jitPhase: null },
    { horizon: "now", isJit: false, practice: { contentId: "fresh3" }, jitEventTitle: null, jitPhase: null },
  ];
  const realCandidate = ranked("evt_real", "Board Prep", "pre", "A", 95, START_ISO);
  const context: LedgerAllocatorContext = {
    nowMs: NOW,
    rankedCandidates: [realCandidate],
    hasTravelDay: false, hasConferenceDay: false, hasOffsiteDay: false, hasRestSignals: false,
  };
  const result = mergeWithLedger(
    fresh, ledger,
    new Set<string>(["p2_done", "p3_done"]),
    new Set<string>(), new Set<string>(),
    undefined, undefined, context,
  );
  // Slot 0 was cancelled → refreshed. Allocator's real ranked candidate
  // must drive identity. It absolutely must not fall back to a score:0
  // pseudo-candidate reconstructed from freshModules.
  const slot0: any = result.modules[0];
  const allocatorPickedRealEvent = slot0.jitEventTitle === "Board Prep" ||
    slot0.anchorEventId === "evt_real";
  assert(
    allocatorPickedRealEvent,
    `Slot 0 identity should reflect the real ranked candidate. Got jitEventTitle=${slot0.jitEventTitle} anchorEventId=${slot0.anchorEventId}`,
  );
});

Deno.test("mergeWithLedger: same context morning→afternoon keeps stable allocation", () => {
  const ledger: any[] = [
    { horizon: "now", isJit: false, practice: { contentId: "p1" } },
    { horizon: "now", isJit: false, practice: { contentId: "p2" } },
    { horizon: "now", isJit: false, practice: { contentId: "p3" } },
  ];
  const fresh: any[] = [
    { horizon: "now", isJit: false, practice: { contentId: "fresh1" } },
    { horizon: "now", isJit: false, practice: { contentId: "fresh2" } },
    { horizon: "now", isJit: false, practice: { contentId: "fresh3" } },
  ];
  const ctx: LedgerAllocatorContext = {
    nowMs: NOW,
    rankedCandidates: [ranked("evt_stable", "Weekly Staff", "pre", "B", 45, START_ISO)],
    hasTravelDay: false, hasConferenceDay: false, hasOffsiteDay: false, hasRestSignals: false,
  };
  const morning = mergeWithLedger(
    fresh, ledger, new Set(), new Set(), new Set(),
    undefined, undefined, ctx,
  );
  const afternoon = mergeWithLedger(
    fresh, ledger, new Set(), new Set(), new Set(),
    undefined, undefined, ctx,
  );
  // Same context → same dayShape/mode across runs.
  assertEquals(
    (morning.modules[0] as any).dayShape,
    (afternoon.modules[0] as any).dayShape,
  );
  assertEquals(
    (morning.modules[0] as any).mode,
    (afternoon.modules[0] as any).mode,
  );
});

Deno.test("mergeWithLedger: unfinished state slots refresh when ledger period is stale", () => {
  const ledger: any[] = [
    {
      horizon: "immediate",
      isJit: false,
      timeLabel: "Steady the system ahead of this morning",
      practice: { contentId: "ledger_1" },
      practices: [{ contentId: "ledger_1" }],
    },
    {
      horizon: "tactical",
      isJit: false,
      timeLabel: "Steady the system ahead of this morning",
      practice: { contentId: "ledger_2" },
      practices: [{ contentId: "ledger_2" }],
    },
  ];
  const fresh: any[] = [
    {
      horizon: "immediate",
      isJit: false,
      timeLabel: "Steady the system ahead of this afternoon",
      practice: { contentId: "fresh_1" },
      practices: [{ contentId: "fresh_1" }],
    },
    {
      horizon: "tactical",
      isJit: false,
      timeLabel: "Build capacity ahead of this evening",
      practice: { contentId: "fresh_2" },
      practices: [{ contentId: "fresh_2" }],
    },
  ];
  const context: LedgerAllocatorContext = {
    nowMs: NOW,
    rankedCandidates: [],
    hasTravelDay: false,
    hasConferenceDay: false,
    hasOffsiteDay: false,
    hasRestSignals: false,
    currentPeriod: "afternoon",
    ledgerGeneratedPeriod: "morning",
  };
  const result = mergeWithLedger(
    fresh,
    ledger,
    new Set(),
    new Set(),
    new Set(),
    undefined,
    undefined,
    context,
  );
  assertEquals(result.modules[0].practice.contentId, "fresh_1");
  assertEquals(result.modules[0].timeLabel, "Steady the system ahead of this afternoon");
  assertEquals(result.modules[1].practice.contentId, "fresh_2");
  assertEquals(result.modules[1].timeLabel, "Build capacity ahead of this evening");
});
