// Regression tests for the fallback hierarchy:
//   AI copy -> deterministic fallback -> guaranteed floor.
//
// (a) Every FB-* deterministic text must survive the V8 quality gate with an
//     EMPTY context (no calendar events, no check-in on file) — the exact
//     condition that silently dropped weekend evening reminders.
// (b) The guaranteed floor texts must always be valid, so a reminder can never
//     be cancelled purely because copy was rejected.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type FallbackNudgeContext,
  getFallbackNudgeOneJitCopy,
  getFallbackNudgeOneJitPostTravelCopy,
  getFallbackNudgeOneMorningCopy,
  getFallbackNudgeThreeCopy,
  getFallbackNudgeThreeLookaheadCopy,
  getFallbackNudgeTwoConsecutiveLowCopy,
  getFallbackNudgeTwoJitCopy,
  getFallbackNudgeTwoPrioritiesCopy,
  getFallbackNudgeTwoRecalibrateCopy,
  getFallbackNudgeTwoReservesCopy,
  guaranteedFloorNudgeOneCopy,
  guaranteedFloorNudgeThreeCopy,
  guaranteedFloorNudgeTwoCopy,
  type NudgeCopy,
  validateStaticFallbackCopy,
} from "./fallback-copy.ts";

function emptyCtx(overrides: Partial<FallbackNudgeContext> = {}): FallbackNudgeContext {
  return {
    userId: "test-user",
    todayStr: "2026-09-12",
    tomorrowStr: "2026-09-13",
    localHour: 19,
    localMinute: 0,
    localTime: 19 * 60,
    dayOfWeek: 6,
    dayName: "Saturday",
    isWeekend: true,
    homeCountry: "GB",
    weekendDays: [0, 6],
    planningDay: 0,
    lightDay: { isLightDay: true, prepMeeting: null },
    briefWindow: "evening",
    timeZone: "Europe/London",
    todayEvents: [],
    tomorrowEvents: [],
    nonNoiseEvents: [],
    firstNonNoiseEvent: null,
    eventCount: 0,
    highStakesEvents: [],
    calendarGaps: [],
    dayType: "light",
    wearable: {
      sleepScore: null,
      hrv: null,
      rhr: null,
      hrvBaseline30d: null,
      rhrBaseline30d: null,
      hrvDeltaPct: null,
      rhrElevated: false,
      totalSleepMinutes: null,
    },
    hasWearableData: false,
    wearableFreshness: "missing",
    coach: {
      pendingCommitments: [],
      activePatterns: [],
      stressSignals: [],
      lastSessionAt: null,
      sessionsIn7d: 0,
    },
    morningCheckinOutcome: null,
    afternoonCheckinOutcome: null,
    lastCheckinTime: null,
    checkinCountToday: 0,
    pendingPracticeIds: [],
    completedPracticeIds: [],
    planSlots: null,
    planSnapshotStatus: "missing",
    planPersistedDayKind: null,
    planPersistedDayShape: null,
    jitEvents: [],
    hrvDeltaPctFromSnapshot: null,
    pattern: null,
    dayContext: { kind: "normal", postTravel: false },
    ...overrides,
  };
}

/** Every deterministic text reachable with an empty context, per nudge type. */
function deterministicCopies(): Array<
  { nudgeType: string; ctx: FallbackNudgeContext; copy: NudgeCopy }
> {
  const out: Array<
    { nudgeType: string; ctx: FallbackNudgeContext; copy: NudgeCopy }
  > = [];

  const dayVariants: Array<Partial<FallbackNudgeContext>> = [
    // Saturday (first day off), Sunday (reset), a quiet weekday
    { dayOfWeek: 6, dayName: "Saturday", isWeekend: true },
    { dayOfWeek: 0, dayName: "Sunday", isWeekend: true },
    { dayOfWeek: 5, dayName: "Friday", isWeekend: false },
    { dayOfWeek: 2, dayName: "Tuesday", isWeekend: false },
    // Travel shapes
    {
      dayOfWeek: 2,
      dayName: "Tuesday",
      isWeekend: false,
      dayContext: { kind: "travel-day", postTravel: false },
    },
    {
      dayOfWeek: 2,
      dayName: "Tuesday",
      isWeekend: false,
      dayContext: { kind: "away-day", postTravel: false },
    },
    {
      dayOfWeek: 2,
      dayName: "Tuesday",
      isWeekend: false,
      dayContext: { kind: "normal", postTravel: true },
    },
  ];

  for (const v of dayVariants) {
    const ctx = emptyCtx(v);
    out.push({
      nudgeType: "nudge_one_morning",
      ctx,
      copy: getFallbackNudgeOneMorningCopy(ctx),
    });
    out.push({
      nudgeType: "nudge_three",
      ctx,
      copy: getFallbackNudgeThreeCopy(ctx),
    });
  }

  const base = emptyCtx();
  // Event-anchored variants: the named event is on the calendar, as it always
  // is on the code paths that reach them.
  const evt = {
    id: "e1",
    title: "Board review",
    start_time: new Date().toISOString(),
    end_time: new Date().toISOString(),
    external_id: "x1",
  };
  const withEvent = emptyCtx({
    todayEvents: [evt],
    nonNoiseEvents: [evt],
    firstNonNoiseEvent: evt,
    eventCount: 1,
    highStakesEvents: [evt],
  });
  // Reserves copy only fires with wearable data and a completed morning check-in.
  const withWearable = emptyCtx({
    todayEvents: [evt],
    nonNoiseEvents: [evt],
    firstNonNoiseEvent: evt,
    eventCount: 1,
    hasWearableData: true,
    wearableFreshness: "fresh",
    morningCheckinOutcome: "managing",
    wearable: { ...base.wearable, hrv: 42, rhr: 61, rhrElevated: true },
  });
  const withTomorrow = emptyCtx({ tomorrowEvents: [evt] });

  out.push({
    nudgeType: "nudge_one_jit",
    ctx: withEvent,
    copy: getFallbackNudgeOneJitCopy("Board review", 45),
  });
  out.push({
    nudgeType: "nudge_one_jit",
    ctx: withEvent,
    copy: getFallbackNudgeOneJitPostTravelCopy("Board review", 45),
  });
  out.push({
    nudgeType: "nudge_two_jit",
    ctx: withEvent,
    copy: getFallbackNudgeTwoJitCopy("Board review", 20),
  });
  out.push({
    nudgeType: "nudge_two_jit",
    ctx: withEvent,
    copy: getFallbackNudgeTwoJitCopy("Board review", 120),
  });
  out.push({
    nudgeType: "nudge_two_priorities",
    ctx: base,
    copy: getFallbackNudgeTwoPrioritiesCopy(2, "current plan slot"),
  });
  out.push({
    nudgeType: "nudge_two_recalibrate",
    ctx: withWearable,
    copy: getFallbackNudgeTwoRecalibrateCopy("Board review"),
  });
  out.push({
    nudgeType: "nudge_two_reserves",
    ctx: withWearable,
    copy: getFallbackNudgeTwoReservesCopy("Board review", "rhr"),
  });
  out.push({
    nudgeType: "nudge_two_reserves",
    ctx: withWearable,
    copy: getFallbackNudgeTwoReservesCopy("Board review", "hrv"),
  });
  out.push({
    nudgeType: "nudge_two_consec_low",
    ctx: base,
    copy: getFallbackNudgeTwoConsecutiveLowCopy(3),
  });
  out.push({
    nudgeType: "nudge_three",
    ctx: withTomorrow,
    copy: getFallbackNudgeThreeLookaheadCopy("Board review"),
  });

  return out;
}

Deno.test("every FB-* deterministic text passes the quality gate with an empty context", () => {
  const rejected: string[] = [];
  for (const { nudgeType, ctx, copy } of deterministicCopies()) {
    const validated = validateStaticFallbackCopy(copy, ctx, nudgeType);
    if (!validated) rejected.push(`${copy.variantId} (${nudgeType})`);
  }
  assertEquals(
    rejected,
    [],
    `deterministic fallback texts rejected with empty context: ${
      rejected.join(", ")
    }`,
  );
});

Deno.test("FB-N3-sat (weekend evening) survives an empty context", () => {
  const ctx = emptyCtx({ dayOfWeek: 6, dayName: "Saturday", isWeekend: true });
  const raw = getFallbackNudgeThreeCopy(ctx);
  assertEquals(raw.variantId, "FB-N3-sat");
  const validated = validateStaticFallbackCopy(raw, ctx, "nudge_three");
  assert(validated, "weekend evening deterministic copy must not be dropped");
  assert(validated!.body.length > 0);
});

Deno.test("guaranteed floor texts are always valid", () => {
  const ctx = emptyCtx();
  for (const [type, copy] of [
    ["nudge_one_morning", guaranteedFloorNudgeOneCopy()],
    ["nudge_two_recalibrate", guaranteedFloorNudgeTwoCopy()],
    ["nudge_three", guaranteedFloorNudgeThreeCopy()],
  ] as Array<[string, NudgeCopy]>) {
    const validated = validateStaticFallbackCopy(copy, ctx, type);
    assert(validated, `floor copy ${copy.variantId} must pass the gate`);
  }
});

Deno.test("evening reminder always resolves to copy when the AI path fails", () => {
  // Mirrors evaluateNudgeThree's chain with aiCopy = null on a weekend day
  // that has no events at all.
  const ctx = emptyCtx({ dayOfWeek: 6, dayName: "Saturday", isWeekend: true });
  const aiCopy: NudgeCopy | null = null;
  const fallback = validateStaticFallbackCopy(
    getFallbackNudgeThreeCopy(ctx),
    ctx,
    "nudge_three",
  );
  const copy = aiCopy || fallback || guaranteedFloorNudgeThreeCopy();
  assert(copy, "evening reminder must never resolve to null copy");
  assert(copy.body.trim().length > 0);
});
