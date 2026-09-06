/**
 * travel-day-brief-e2e.test.ts
 *
 * Proves the travel-day verdict actually changes Brief output through the real
 * chain: deriveTravelDay() -> buildBehaviourSnapshot() -> deriveDayShape() ->
 * buildDeterministicBriefFallback(). No mocked decision logic, and every case
 * chains from `deriveTravelDay()` rather than a hardcoded boolean.
 */

import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveTravelDay } from "./hydrate-travel-day.ts";
import { buildBehaviourSnapshot } from "../behaviour-snapshot.ts";
import { deriveDayShape } from "../brief/day-shape.ts";
import { buildDeterministicBriefFallback } from "../brief/deterministic-brief.ts";
import type { SignalCoverageInput } from "../brief-signal-coverage.ts";

const NOW = new Date("2026-09-08T08:30:00Z");
const iso = (hoursAgo: number) =>
  new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString();

// ── Fixtures shared by control and travel paths ──────────────────────────
// Deliberately contain NO flight-titled event: the only thing that differs
// between the two runs is the travel verdict itself.

const STANDARD_EVENTS: SignalCoverageInput["events"] = [
  {
    title: "Board prep",
    startTime: new Date("2026-09-08T10:00:00Z"),
    endTime: new Date("2026-09-08T11:00:00Z"),
    status: "confirmed",
  },
  {
    title: "Product review",
    startTime: new Date("2026-09-08T13:00:00Z"),
    endTime: new Date("2026-09-08T14:00:00Z"),
    status: "confirmed",
  },
];

function coverage(travelDay: boolean): SignalCoverageInput {
  return {
    wearable: {
      hrvDeviationPct: -12,
      sleepHours: 6.1,
      sleepDeviationPct: -14,
      rhrDeviationPct: 6,
    },
    checkIn: { mentalSharpness: 3, clarity: 3, confidence: 3 },
    scoreToday: 64,
    scoreYesterday: 70,
    timezone: {
      offsetMinutes: 60,
      shift48hHours: 0,
      travelDay,
    },
    events: STANDARD_EVENTS,
    now: NOW,
  };
}

/** Full chain: travel verdict -> signals -> day shape -> deterministic brief. */
function runBriefChain(travelDay: boolean) {
  const snapshot = buildBehaviourSnapshot({ coverage: coverage(travelDay) });
  const shape = deriveDayShape(snapshot.signals, { isWeekend: false });
  const brief = buildDeterministicBriefFallback({
    band: "stretched",
    hasWearable: true,
    hasCurrentWearable: true,
    hasCurrentCheckIn: true,
    checkInOutcome: "holding",
    cognitivePillTier: "amber",
    physicalPillTier: "amber",
    wearableFact: "Recovery is below its usual range",
    window: "morning",
    todayHighStakes: ["Board prep"],
    calendarLoad: "medium",
    meetingCount: 2,
    sleepScore: null,
    hasBackToBack: false,
    ceoFlags: snapshot.flagsBrief,
    dayShape: shape.shape,
    travelPhase: shape.travelPhase,
    travelEventTitle: shape.nextTravelEventTitle,
  });
  return { snapshot, shape, brief };
}

// ── travel_state rows ────────────────────────────────────────────────────

const HOME_ROW = {
  state: "not_travelling",
  distance_from_home_km: 4,
  last_location_at: iso(2),
  last_state_change_at: iso(20),
  last_known_timezone: "Europe/London",
};

/** Domestic away-day: same timezone, no flight event, fresh 120 km fix.
 *  This is the path that used to read as a normal day. */
const DOMESTIC_AWAY_ROW = {
  ...HOME_ROW,
  state: "arrived",
  distance_from_home_km: 120,
};

const INTERNATIONAL_ROW = {
  ...HOME_ROW,
  state: "arrived",
  distance_from_home_km: 900,
};

// ── 1. Control path ──────────────────────────────────────────────────────

Deno.test("brief e2e: control row yields no travel verdict", () => {
  const verdict = deriveTravelDay(HOME_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });
  assertEquals(verdict.travelDay, false);
  assertEquals(verdict.evidence, "none");
});

Deno.test("brief e2e: control day shape is a plain workday", () => {
  const verdict = deriveTravelDay(HOME_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });
  const { shape } = runBriefChain(verdict.travelDay);
  assertEquals(shape.shape, "workday");
});

// ── 2. Travel path ───────────────────────────────────────────────────────

Deno.test("brief e2e: domestic 120km away-day is travel by distance evidence", () => {
  const verdict = deriveTravelDay(DOMESTIC_AWAY_ROW, {
    now: NOW,
    currentTimezone: "Europe/London", // unchanged timezone
  });
  assertEquals(verdict.travelDay, true);
  assertEquals(verdict.evidence, "distance");
});

Deno.test("brief e2e: travel verdict flips the day shape to work travel", () => {
  const verdict = deriveTravelDay(DOMESTIC_AWAY_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });
  const { shape } = runBriefChain(verdict.travelDay);
  // Meetings are still on the day, so it must stay a workday shape — a
  // domestic away-day is not a holiday.
  assertEquals(shape.shape, "work_travel");
  assertEquals(shape.isNonWorkday, false);
});

Deno.test("brief e2e: deterministic brief copy differs on the travel path", () => {
  const control = deriveTravelDay(HOME_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });
  const travel = deriveTravelDay(DOMESTIC_AWAY_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });

  const controlBrief = runBriefChain(control.travelDay).brief;
  const travelBrief = runBriefChain(travel.travelDay).brief;

  assert(controlBrief !== null, "control brief should build");
  assert(travelBrief !== null, "travel brief should build");
  assertNotEquals(
    travelBrief!.body,
    controlBrief!.body,
    "travel verdict must change deterministic brief copy",
  );
});

Deno.test("brief e2e: travel brief body names the journey, control does not", () => {
  const travel = deriveTravelDay(DOMESTIC_AWAY_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });
  const control = deriveTravelDay(HOME_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });

  const travelBody = runBriefChain(travel.travelDay).brief!.body.toLowerCase();
  const controlBody = runBriefChain(control.travelDay).brief!.body.toLowerCase();

  assert(
    /travel|journey|trip|moving/.test(travelBody),
    `travel brief should reference the journey: ${travelBody}`,
  );
  assertEquals(/travel|journey|trip/.test(controlBody), false);
});

Deno.test("brief e2e: international hop reads as travel via timezone rung", () => {
  const verdict = deriveTravelDay(INTERNATIONAL_ROW, {
    now: NOW,
    currentTimezone: "America/New_York",
  });
  assertEquals(verdict.travelDay, true);
  assertEquals(verdict.evidence, "timezone");
  assertEquals(runBriefChain(verdict.travelDay).shape.shape, "work_travel");
});

// ── 3. Regression guards ─────────────────────────────────────────────────

Deno.test("brief e2e: stale evidence defers to the persisted state, not distance", () => {
  const verdict = deriveTravelDay(
    {
      ...DOMESTIC_AWAY_ROW,
      state: "not_travelling",
      last_location_at: iso(48),          // older than LOCATION_FRESH_HOURS
      last_state_change_at: iso(24 * 30), // older than STATE_CHANGE_FRESH_DAYS
    },

    { now: NOW, currentTimezone: "Europe/London" },
  );
  assertEquals(verdict.travelDay, false);
  assertEquals(runBriefChain(verdict.travelDay).shape.shape, "workday");
});


Deno.test("brief e2e: hydration failure never invents travel framing", () => {
  const verdict = deriveTravelDay(null, {
    now: NOW,
    currentTimezone: "Europe/London",
  });
  assertEquals(verdict.travelDay, false);
  assertEquals(verdict.evidence, "none");

  const { shape, brief } = runBriefChain(verdict.travelDay);
  assertEquals(shape.shape, "workday");
  assert(brief !== null, "brief must still build without travel data");
});

Deno.test("brief e2e: a short hop under the threshold stays a normal day", () => {
  const verdict = deriveTravelDay(
    { ...HOME_ROW, distance_from_home_km: 22 },
    { now: NOW, currentTimezone: "Europe/London" },
  );
  assertEquals(verdict.travelDay, false);
  assertEquals(runBriefChain(verdict.travelDay).shape.shape, "workday");
});
