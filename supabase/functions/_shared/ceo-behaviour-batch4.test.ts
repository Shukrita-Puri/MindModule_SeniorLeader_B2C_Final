import { assertEquals, assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RuleContext, SignalMatrix } from "./brief-context.ts";
import {
  decisionLeakageGuardPlan,
} from "./ceo-behaviour/workweek.ts";
import {
  travelPreFlightMandatory,
  travelInFlightConnection,
} from "./ceo-behaviour/travel.ts";
import {
  nudgeDeferOffline,
  nudgeSuppressDND,
  nudgeStaleSkip,
  nudgeBatchOnReturn,
} from "./ceo-behaviour/delivery.ts";

function emptySignals(over: Partial<SignalMatrix> = {}): SignalMatrix {
  return {
    hrvDeviationPct: null, hrvUnusual: false,
    sleepHours: null, sleepDeviationPct: null, sleepBelow6h: false,
    rhrDeviationPct: null, hrElevatedProxy: false,
    emotionalSelfDeclared: null, mentalSharpness: null, confidence: null,
    timezoneOffsetMinutes: null, timezoneShift48hHours: null, travelDay: false,
    yesterdayScore: null, todayScore: null,
    postPeakWindow: false, isHighVisibilityToday: false,
    emotionalDrainEventInNext4h: null, highStakesEventInNext24h: null,
    morningWasCompressed: false, middayRecoveryDetected: false,
    clarityDropFromTrailingAvg: null,
    ...over,
  };
}

function ctx(
  over: Partial<RuleContext>,
  signals: Partial<SignalMatrix> = {},
): RuleContext {
  return {
    signals: emptySignals(signals),
    upcomingEvents: [],
    localHour: 10,
    ...over,
  };
}

// ─── decisionLeakageGuardPlan (24h tail) ─────────────────────────────────────

Deno.test("decisionLeakageGuardPlan: fires when drain in next 24h and not in 4h", () => {
  const flag = decisionLeakageGuardPlan(ctx({}, {
    emotionalDrainEventInNext24h: { title: "Layoff conversation", minutesUntil: 420 },
  }));
  assert(flag, "should fire");
  assertEquals(flag!.anchorEvent, "Layoff conversation");
});

Deno.test("decisionLeakageGuardPlan: suppressed when next-4h rule will also fire", () => {
  const flag = decisionLeakageGuardPlan(ctx({}, {
    emotionalDrainEventInNext24h: { title: "Layoff", minutesUntil: 90 },
    emotionalDrainEventInNext4h: { title: "Layoff", minutesUntil: 90 },
  }));
  assertEquals(flag, null);
});

Deno.test("decisionLeakageGuardPlan: silent without drain event", () => {
  assertEquals(decisionLeakageGuardPlan(ctx({})), null);
});

// ─── travelPreFlightMandatory tightened by preFlightWindowMinutes ────────────

Deno.test("travelPreFlightMandatory: fires inside 60–240 min window", () => {
  const flag = travelPreFlightMandatory(ctx({}, {
    travelDay: true,
    preFlightWindowMinutes: 120,
    nextTravelEventTitle: "LHR → JFK",
  }));
  assert(flag);
  assertEquals(flag!.anchorEvent, "LHR → JFK");
});

Deno.test("travelPreFlightMandatory: suppressed when a known flight sits outside the window", () => {
  assertEquals(
    travelPreFlightMandatory(ctx({}, {
      travelDay: true,
      preFlightWindowMinutes: null,
      nextTravelEventTitle: "LHR → JFK",
    })),
    null,
  );
});

Deno.test("travelPreFlightMandatory: fires on a GPS-derived travel day with no calendar flight", () => {
  // Domestic away-day: travel is known from location/timezone, so there is no
  // travel event and therefore no pre-flight window to test against.
  const flag = travelPreFlightMandatory(ctx({}, {
    travelDay: true,
    preFlightWindowMinutes: null,
  }));
  assert(flag);
  assertEquals(flag!.anchorEvent, undefined);
});


Deno.test("travelPreFlightMandatory: legacy fallback (undefined window) still fires on travelDay", () => {
  // Pre-Batch-4 callers that don't yet set preFlightWindowMinutes.
  const flag = travelPreFlightMandatory(ctx({}, { travelDay: true }));
  assert(flag);
});

// ─── travelInFlightConnection ────────────────────────────────────────────────

Deno.test("travelInFlightConnection: fires only when Edge sets connection minutes", () => {
  assertEquals(travelInFlightConnection(ctx({})), null);
  const flag = travelInFlightConnection(ctx({}, {
    inFlightConnectionMinutes: 75,
    nextTravelEventTitle: "JFK → SFO",
  }));
  assert(flag);
  assertEquals(flag!.anchorEvent, "JFK → SFO");
});

// ─── Delivery cluster ───────────────────────────────────────────────────────

Deno.test("nudgeDeferOffline: fires when offline", () => {
  const flag = nudgeDeferOffline(ctx({}, { deviceOnline: false }));
  assert(flag);
  assertEquals(flag!.copyHint, "defer-until-online");
});

Deno.test("nudgeDeferOffline: fires on airplane mode even if online flag unknown", () => {
  const flag = nudgeDeferOffline(ctx({}, { airplaneModeActive: true }));
  assert(flag);
});

Deno.test("nudgeDeferOffline: silent when online and not airplane", () => {
  assertEquals(
    nudgeDeferOffline(ctx({}, { deviceOnline: true })),
    null,
  );
});

Deno.test("nudgeSuppressDND: fires when DND active with known end", () => {
  const flag = nudgeSuppressDND(ctx({}, {
    dndActive: true,
    dndEndsInMinutes: 45,
  }));
  assert(flag);
  assertEquals(flag!.copyHint, "suppress-until-dnd-ends");
});

Deno.test("nudgeSuppressDND: silent without end time", () => {
  assertEquals(
    nudgeSuppressDND(ctx({}, { dndActive: true })),
    null,
  );
});

Deno.test("nudgeStaleSkip: fires when back online and no near-term anchor", () => {
  const flag = nudgeStaleSkip(ctx({
    upcomingEvents: [{ title: "Sync", minutesUntil: 120 }],
  }, {
    deviceOnline: true,
    lastSeenOnlineMinutesAgo: 60,
  }));
  assert(flag);
  assertEquals(flag!.copyHint, "drop-stale");
});

Deno.test("nudgeStaleSkip: silent when near-term anchor still exists", () => {
  const flag = nudgeStaleSkip(ctx({
    upcomingEvents: [{ title: "Standup", minutesUntil: 10 }],
  }, {
    deviceOnline: true,
    lastSeenOnlineMinutesAgo: 60,
  }));
  assertEquals(flag, null);
});

Deno.test("nudgeBatchOnReturn: fires within 15min of returning online", () => {
  const flag = nudgeBatchOnReturn(ctx({}, {
    deviceOnline: true,
    lastSeenOnlineMinutesAgo: 8,
  }));
  assert(flag);
  assertEquals(flag!.copyHint, "batch-coalesce");
});

Deno.test("nudgeBatchOnReturn: silent past the batch window", () => {
  assertEquals(
    nudgeBatchOnReturn(ctx({}, {
      deviceOnline: true,
      lastSeenOnlineMinutesAgo: 45,
    })),
    null,
  );
});

Deno.test("nudgeBatchOnReturn: silent when still offline", () => {
  assertEquals(
    nudgeBatchOnReturn(ctx({}, {
      deviceOnline: false,
      lastSeenOnlineMinutesAgo: 5,
    })),
    null,
  );
});