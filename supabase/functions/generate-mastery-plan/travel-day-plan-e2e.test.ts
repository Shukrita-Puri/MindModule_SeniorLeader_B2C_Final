/**
 * travel-day-plan-e2e.test.ts
 *
 * The Mastery Plan side of the travel SSOT. Every case chains from the real
 * `deriveTravelDay()` verdict into the real `deriveStructuralDayFlags()` and
 * `evaluateWeekAheadMode()`, so a change in the hydrator's semantics shows up
 * here rather than silently changing what users get in their plan.
 *
 * The point of the suite: a domestic away-day carries NO flight-titled event,
 * so the legacy category-G calendar test alone reads it as a normal day.
 */

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveTravelDay } from "../_shared/travel/hydrate-travel-day.ts";
import { evaluateWeekAheadMode } from "../_shared/plan/week-ahead-mode.ts";
import { deriveStructuralDayFlags } from "./index.ts";

const NOW = new Date("2026-09-08T08:30:00Z"); // Tuesday
const iso = (hoursAgo: number) =>
  new Date(NOW.getTime() - hoursAgo * 3600_000).toISOString();

const HOME_ROW = {
  state: "not_travelling",
  distance_from_home_km: 4,
  last_location_at: iso(2),
  last_state_change_at: iso(20),
  last_known_timezone: "Europe/London",
};

/** Away by 120 km, same timezone, nothing on the calendar says "flight". */
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

/** Ordinary working calendar — no category-G (travel) event anywhere. */
const NON_TRAVEL_EVENTS = [
  {
    title: "Board prep",
    eventCategory: "A",
    start_time: "2026-09-08T10:00:00Z",
    end_time: "2026-09-08T11:00:00Z",
  },
  {
    title: "Product review",
    eventCategory: "B",
    start_time: "2026-09-08T13:00:00Z",
    end_time: "2026-09-08T14:00:00Z",
  },
];

/** Calendar that already declares travel the old way. */
const CALENDAR_TRAVEL_EVENTS = [
  {
    title: "BA 442 LHR → AMS",
    eventCategory: "G",
    start_time: "2026-09-08T10:00:00Z",
    end_time: "2026-09-08T11:20:00Z",
  },
];

function flagsFor(row: Record<string, unknown> | null, tz = "Europe/London", events = NON_TRAVEL_EVENTS) {
  const verdict = deriveTravelDay(row, { now: NOW, currentTimezone: tz });
  const flags = deriveStructuralDayFlags(events, "moderate", {
    now: NOW,
    travelDaySignal: verdict.travelDay,
  });
  return { verdict, flags };
}

// ── 1. Control ───────────────────────────────────────────────────────────

Deno.test("plan e2e: home row is not a travel day", () => {
  const { verdict, flags } = flagsFor(HOME_ROW);
  assertEquals(verdict.travelDay, false);
  assertEquals(flags.hasTravelDay, false);
});

Deno.test("plan e2e: home row keeps the normal weekday structure", () => {
  const { flags } = flagsFor(HOME_ROW);
  assertEquals(flags.isPtoOrHoliday, false);
  assertEquals(flags.isWeekendRestDay, false);
});

// ── 2. GPS-derived travel reaches the plan allocator ─────────────────────

Deno.test("plan e2e: domestic away-day sets hasTravelDay without a flight event", () => {
  const { verdict, flags } = flagsFor(DOMESTIC_AWAY_ROW);
  assertEquals(verdict.travelDay, true);
  assertEquals(verdict.evidence, "distance");
  assertEquals(flags.hasTravelDay, true);
});

Deno.test("plan e2e: the same calendar without the signal reads as a normal day", () => {
  // Proves the flag came from the travel SSOT, not from the events.
  const withoutSignal = deriveStructuralDayFlags(NON_TRAVEL_EVENTS, "moderate", {
    now: NOW,
    travelDaySignal: false,
  });
  assertEquals(withoutSignal.hasTravelDay, false);
});

Deno.test("plan e2e: timezone change promotes travel day", () => {
  const { verdict, flags } = flagsFor(INTERNATIONAL_ROW, "America/New_York");
  assertEquals(verdict.evidence, "timezone");
  assertEquals(flags.hasTravelDay, true);
});

Deno.test("plan e2e: state machine decides when the location fix is stale", () => {
  const { verdict, flags } = flagsFor({
    ...DOMESTIC_AWAY_ROW,
    last_location_at: iso(48),      // older than LOCATION_FRESH_HOURS
    last_state_change_at: iso(24 * 30), // older than STATE_CHANGE_FRESH_DAYS
  });
  assertEquals(verdict.evidence, "state");
  assertEquals(verdict.travelDay, true);
  assertEquals(flags.hasTravelDay, true);
});

// ── 3. Never removes existing evidence ───────────────────────────────────

Deno.test("plan e2e: calendar travel still wins when the signal is false", () => {
  const flags = deriveStructuralDayFlags(CALENDAR_TRAVEL_EVENTS, "light", {
    now: NOW,
    travelDaySignal: false,
  });
  assertEquals(flags.hasTravelDay, true);
});

Deno.test("plan e2e: calendar travel plus signal stays a single travel day", () => {
  const { flags } = flagsFor(DOMESTIC_AWAY_ROW, "Europe/London", CALENDAR_TRAVEL_EVENTS);
  assertEquals(flags.hasTravelDay, true);
});

Deno.test("plan e2e: omitting the option is backwards compatible", () => {
  const flags = deriveStructuralDayFlags(NON_TRAVEL_EVENTS, "moderate", { now: NOW });
  assertEquals(flags.hasTravelDay, false);
  const travelFlags = deriveStructuralDayFlags(CALENDAR_TRAVEL_EVENTS, "moderate", { now: NOW });
  assertEquals(travelFlags.hasTravelDay, true);
});

// ── 4. Week-ahead interaction ────────────────────────────────────────────

Deno.test("plan e2e: travel day feeds the week-ahead decision", () => {
  const { flags } = flagsFor(DOMESTIC_AWAY_ROW);
  const decision = evaluateWeekAheadMode({
    dayOfWeek: 2,
    localHour: 8,
    travelDay: flags.hasTravelDay,
  });
  // A mid-week travel day must not fabricate a week-ahead planning session.
  assertEquals(decision.active, false);
});

Deno.test("plan e2e: travel day does not turn a Tuesday into a rest day", () => {
  const { flags } = flagsFor(DOMESTIC_AWAY_ROW);
  assertEquals(flags.isWeekendRestDay, false);
  assertEquals(flags.isPtoOrHoliday, false);
});

// ── 5. Fail-open guards ──────────────────────────────────────────────────

Deno.test("plan e2e: missing travel row leaves the plan untouched", () => {
  const { verdict, flags } = flagsFor(null);
  assertEquals(verdict.travelDay, false);
  assertEquals(verdict.reason, "no_row");
  assertEquals(flags.hasTravelDay, false);
});

Deno.test("plan e2e: malformed distance never promotes travel", () => {
  const { verdict, flags } = flagsFor({
    ...HOME_ROW,
    distance_from_home_km: Number.NaN,
  });
  assertEquals(verdict.distanceKm, null);
  assertEquals(verdict.travelDay, false);
  assertEquals(flags.hasTravelDay, false);
});

Deno.test("plan e2e: negative distance is discarded, not treated as 0 km", () => {
  const { verdict } = flagsFor({ ...HOME_ROW, distance_from_home_km: -12 });
  assertEquals(verdict.distanceKm, null);
});

Deno.test("plan e2e: malformed timezone is never read as a timezone change", () => {
  const { verdict } = flagsFor(
    { ...HOME_ROW, last_known_timezone: "Not/AZone" },
    "Also/Bogus",
  );
  assertEquals(verdict.travelDay, false);
  assert(verdict.evidence !== "timezone");
});

Deno.test("plan e2e: a 22 km commute is not travel", () => {
  const { verdict, flags } = flagsFor({
    ...HOME_ROW,
    distance_from_home_km: 22,
  });
  assertEquals(verdict.travelDay, false);
  assertEquals(flags.hasTravelDay, false);
});

Deno.test("plan e2e: an empty calendar with a travel signal is still a travel day", () => {
  const verdict = deriveTravelDay(DOMESTIC_AWAY_ROW, {
    now: NOW,
    currentTimezone: "Europe/London",
  });
  const flags = deriveStructuralDayFlags([], "light", {
    now: NOW,
    travelDaySignal: verdict.travelDay,
  });
  assertEquals(flags.hasTravelDay, true);
});

Deno.test("plan e2e: null calendar does not throw with the travel signal set", () => {
  const flags = deriveStructuralDayFlags(null, "light", {
    now: NOW,
    travelDaySignal: true,
  });
  assertEquals(flags.hasTravelDay, true);
});
