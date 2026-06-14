// Part 1 — Travel Load & Post-Landing Delivery Split.
// Covers the 9 scenarios in the consolidated spec.
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildSignalMatrix } from "../brief-signal-coverage.ts";
import {
  classifyTravelTier,
  isAwayFromHome,
  isSameDayRoundTrip,
  travelDayArrivalFraming,
  travelDayDuringPushOnly,
  travelDayReturnRecovery,
  travelLandingOffload,
  travelLandingPlusHighStakes,
  LONG_HAUL_MIN_HOURS,
  TRAVEL_AWAY_MIN_KM,
} from "./travel.ts";
import type { RuleContext, SignalMatrix } from "../brief-context.ts";

function inHours(now: Date, h: number): string {
  return new Date(now.getTime() + h * 3_600_000).toISOString();
}

function makeCtx(over: {
  signals?: Partial<SignalMatrix>;
  lastTravelEventEndedMinutesAgo?: number;
  backToBackHoursToday?: number;
}): RuleContext {
  const signals: SignalMatrix = {
    hrvDeviationPct: null, hrvUnusual: false, sleepHours: null,
    sleepDeviationPct: null, sleepBelow6h: false, rhrDeviationPct: null,
    hrElevatedProxy: false, emotionalSelfDeclared: null,
    mentalSharpness: null, confidence: null, timezoneOffsetMinutes: 0,
    timezoneShift48hHours: null, travelDay: true,
    yesterdayScore: null, todayScore: null, postPeakWindow: false,
    isHighVisibilityToday: false, emotionalDrainEventInNext4h: null,
    highStakesEventInNext24h: null, morningWasCompressed: false,
    middayRecoveryDetected: false, clarityDropFromTrailingAvg: null,
    ...(over.signals ?? {}),
  } as SignalMatrix;
  return {
    signals, upcomingEvents: [], localHour: 12,
    lastTravelEventEndedMinutesAgo: over.lastTravelEventEndedMinutesAgo,
    backToBackHoursToday: over.backToBackHoursToday,
  };
}

// ---- Pure helpers --------------------------------------------------------

Deno.test("isAwayFromHome — state vs distance gate", () => {
  assert(isAwayFromHome('en_route', null));
  assert(isAwayFromHome('arrived', null));
  assert(isAwayFromHome('returning', null));
  assert(!isAwayFromHome('not_travelling', null));
  assert(!isAwayFromHome(null, null));
  assert(isAwayFromHome(null, TRAVEL_AWAY_MIN_KM + 1));
  assert(!isAwayFromHome(null, TRAVEL_AWAY_MIN_KM));
});

Deno.test("classifyTravelTier — long-haul wins; same-day requires away", () => {
  assertEquals(classifyTravelTier(LONG_HAUL_MIN_HOURS, true, true), 'long_haul');
  assertEquals(classifyTravelTier(1.5, true, true), 'short_haul_round_trip');
  assertEquals(classifyTravelTier(1.5, true, false), 'short_haul');
  assertEquals(classifyTravelTier(1.5, false, true), 'short_haul');
  assertEquals(classifyTravelTier(0, false, false), 'short_haul');
});

Deno.test("isSameDayRoundTrip — needs two travel events on today's date", () => {
  const now = new Date("2026-06-06T12:00:00");
  assert(isSameDayRoundTrip([
    { title: 'Flight LHR-CDG', start_time: '2026-06-06T08:00:00', end_time: '2026-06-06T09:30:00' },
    { title: 'Flight CDG-LHR', start_time: '2026-06-06T20:00:00', end_time: '2026-06-06T21:30:00' },
  ], now));
  assert(!isSameDayRoundTrip([
    { title: 'Flight LHR-CDG', start_time: '2026-06-06T08:00:00', end_time: '2026-06-06T09:30:00' },
    { title: 'Flight CDG-LHR', start_time: '2026-06-07T20:00:00', end_time: '2026-06-07T21:30:00' },
  ], now));
});

// ---- Rule behaviour (spec scenarios 1–9) ---------------------------------

Deno.test("1. Short-haul at home, no round-trip → landing rules return null", () => {
  const ctx = makeCtx({
    signals: {
      travelLandingDetected: true,
      awayFromHome: false,
      travelTier: 'short_haul',
      longHaulFlight: { durationHours: 1.5 },
    },
    lastTravelEventEndedMinutesAgo: 20,
  });
  assertEquals(travelLandingOffload(ctx), null);
  assertEquals(travelLandingPlusHighStakes(ctx), null);
});

Deno.test("2. Short-haul, awayFromHome=true → travelLandingOffload in_app_practice", () => {
  const ctx = makeCtx({
    signals: {
      travelLandingDetected: true,
      awayFromHome: true,
      travelTier: 'short_haul',
      longHaulFlight: { durationHours: 1.5 },
    },
    lastTravelEventEndedMinutesAgo: 20,
  });
  const flag = travelLandingOffload(ctx);
  assert(flag, "expected flag");
  assertEquals(flag!.landingDeliveryMode, 'in_app_practice');
});

Deno.test("3. Long-haul, meeting in 30min → travelLandingPlusHighStakes push_only", () => {
  const ctx = makeCtx({
    signals: {
      travelLandingDetected: true,
      awayFromHome: true,
      travelTier: 'long_haul',
      longHaulFlight: { durationHours: 8 },
      highStakesEventInNext24h: { title: 'Board call', minutesUntil: 30 },
    },
    lastTravelEventEndedMinutesAgo: 10,
  });
  const flag = travelLandingPlusHighStakes(ctx);
  assert(flag);
  assertEquals(flag!.landingDeliveryMode, 'push_only');
});

Deno.test("4. Long-haul, meeting in 180min → in_app_practice", () => {
  const ctx = makeCtx({
    signals: {
      travelLandingDetected: true,
      awayFromHome: true,
      travelTier: 'long_haul',
      longHaulFlight: { durationHours: 8 },
      highStakesEventInNext24h: { title: 'Strategy review', minutesUntil: 180 },
    },
    lastTravelEventEndedMinutesAgo: 10,
  });
  const flag = travelLandingPlusHighStakes(ctx);
  assert(flag);
  assertEquals(flag!.landingDeliveryMode, 'in_app_practice');
});

Deno.test("5. Oxford↔London round trip → 3-arc fires correctly", () => {
  // Arc 1 — at destination, just landed.
  const arrival = makeCtx({
    signals: {
      travelLandingDetected: true,
      awayFromHome: true,
      travelTier: 'short_haul_round_trip',
    },
    lastTravelEventEndedMinutesAgo: 5,
    backToBackHoursToday: 5,
  });
  const f1 = travelDayArrivalFraming(arrival);
  assert(f1);
  assertEquals(f1!.landingDeliveryMode, 'push_only');

  // travelDayDuringPushOnly: same back-to-back day → fires.
  const f2 = travelDayDuringPushOnly(arrival);
  assert(f2);
  assertEquals(f2!.landingDeliveryMode, 'push_only');

  // Existing landing rules MUST be suppressed by the round-trip tier.
  assertEquals(travelLandingOffload(arrival), null);
  assertEquals(travelLandingPlusHighStakes({
    ...arrival,
    signals: { ...arrival.signals,
      highStakesEventInNext24h: { title: 'Meeting', minutesUntil: 30 } },
  }), null);

  // Arc 3 — return home.
  const ret = makeCtx({
    signals: {
      travelLandingDetected: true,
      awayFromHome: false,
      travelTier: 'short_haul_round_trip',
    },
    lastTravelEventEndedMinutesAgo: 10,
  });
  const f3 = travelDayReturnRecovery(ret);
  assert(f3);
  assertEquals(f3!.landingDeliveryMode, 'standard');
});

Deno.test("6+7. Same-day Poland/Amsterdam + Eurostar → same arc (distance & departure-time agnostic)", () => {
  // Poland early-AM departure, evening return.
  const polandArrival = makeCtx({
    signals: { travelLandingDetected: true, awayFromHome: true, travelTier: 'short_haul_round_trip' },
    lastTravelEventEndedMinutesAgo: 30, backToBackHoursToday: 6,
  });
  assert(travelDayArrivalFraming(polandArrival));
  assert(travelDayDuringPushOnly(polandArrival));

  // Eurostar 09:00 / evening return — identical tier means identical arc.
  const eurostarArrival = makeCtx({
    signals: { travelLandingDetected: true, awayFromHome: true, travelTier: 'short_haul_round_trip' },
    lastTravelEventEndedMinutesAgo: 15, backToBackHoursToday: 5,
  });
  assert(travelDayArrivalFraming(eurostarArrival));
  assert(travelDayDuringPushOnly(eurostarArrival));
});

Deno.test("8. Round trip, destination day NOT back-to-back → during is silent", () => {
  const ctx = makeCtx({
    signals: { travelLandingDetected: true, awayFromHome: true, travelTier: 'short_haul_round_trip' },
    lastTravelEventEndedMinutesAgo: 10, backToBackHoursToday: 1,
  });
  assert(travelDayArrivalFraming(ctx));
  assertEquals(travelDayDuringPushOnly(ctx), null);

  const ret = makeCtx({
    signals: { travelLandingDetected: true, awayFromHome: false, travelTier: 'short_haul_round_trip' },
    lastTravelEventEndedMinutesAgo: 5,
  });
  assert(travelDayReturnRecovery(ret));
});

Deno.test("9. Long-haul tier unaffected by Part 1 (existing 1a–1e logic preserved)", () => {
  const ctx = makeCtx({
    signals: {
      travelLandingDetected: true, awayFromHome: true, travelTier: 'long_haul',
      longHaulFlight: { durationHours: 8 },
    },
    lastTravelEventEndedMinutesAgo: 30,
  });
  const flag = travelLandingOffload(ctx);
  assert(flag);
  assertEquals(flag!.landingDeliveryMode, 'in_app_practice'); // inside 90min long-haul window

  // Round-trip-arc fns must NOT fire for long-haul.
  assertEquals(travelDayArrivalFraming(ctx), null);
  assertEquals(travelDayDuringPushOnly(ctx), null);
  assertEquals(travelDayReturnRecovery(ctx), null);
});

// ---- buildSignalMatrix end-to-end ---------------------------------------

Deno.test("buildSignalMatrix — same-day round trip + travel_state away → tier=short_haul_round_trip", () => {
  const now = new Date("2026-06-06T15:00:00");
  const matrix = buildSignalMatrix({
    wearable: null, checkIn: {}, scoreToday: null, scoreYesterday: null,
    trailingClarityAvg: null,
    timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
    travelState: { state: 'arrived', distanceFromHomeKm: 120 },
    events: [
      { title: 'Flight LHR-CDG', startTime: '2026-06-06T08:00:00', endTime: '2026-06-06T09:30:00' },
      { title: 'Flight CDG-LHR', startTime: '2026-06-06T20:00:00', endTime: '2026-06-06T21:30:00' },
    ],
    now,
  });
  assertEquals(matrix.awayFromHome, true);
  assertEquals(matrix.sameDayReturn, true);
  assertEquals(matrix.travelTier, 'short_haul_round_trip');
});

Deno.test("buildSignalMatrix — no travel_state hydration → awayFromHome undefined (fail-open)", () => {
  const now = new Date("2026-06-06T15:00:00");
  const matrix = buildSignalMatrix({
    wearable: null, checkIn: {}, scoreToday: null, scoreYesterday: null,
    trailingClarityAvg: null,
    timezone: { offsetMinutes: 0, shift48hHours: null, travelDay: false },
    events: [
      { title: 'Flight LHR-CDG', startTime: '2026-06-06T08:00:00', endTime: '2026-06-06T09:30:00' },
    ],
    now,
  });
  assertEquals(matrix.awayFromHome, undefined);
  // Tier still computed via fail-open (assume away) so the arc can classify.
  assertEquals(matrix.travelTier, 'short_haul');
});