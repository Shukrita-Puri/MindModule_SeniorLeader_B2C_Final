import { assertEquals, assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluate, deriveSlotBoosts } from "./behaviour-evaluator.ts";
import type { RuleContext, SignalMatrix } from "./brief-context.ts";
import { dedupeForLoad } from "./ceo-behaviour/calendar-dedupe.ts";

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

function ctx(over: Partial<RuleContext>, signals: Partial<SignalMatrix> = {}): RuleContext {
  return {
    signals: emptySignals(signals),
    upcomingEvents: [],
    localHour: 9,
    ...over,
  };
}

// ─── Weekend ladder ──────────────────────────────────────────────────────────
Deno.test("weekendMorningLightTouch on Sat 09:00 with no work meetings", () => {
  const flags = evaluate(ctx({ dayOfWeek: 6, localHour: 9 }), { scope: "brief" });
  const f = flags.find((x) => x.rule === "weekendMorningLightTouch");
  assert(f, "should fire");
  assertEquals(f?.severity, "low");
});

Deno.test("weekendMorningLightTouch suppressed when work meeting present", () => {
  const flags = evaluate(
    ctx(
      { dayOfWeek: 6, localHour: 9 },
      { hasWorkMeetingOnWeekend: true, weekendMeetingCountToday: 1 },
    ),
  );
  assertFalse(flags.some((x) => x.rule === "weekendMorningLightTouch"));
});

Deno.test("fullWorkingWeekend on Sat with 3 meetings", () => {
  const flags = evaluate(
    ctx({ dayOfWeek: 6 }, { weekendMeetingCountToday: 3, hasWorkMeetingOnWeekend: true }),
  );
  assert(flags.some((x) => x.rule === "fullWorkingWeekend"));
});

Deno.test("fullWorkingWeekend on Sun with 4.5h back-to-back", () => {
  const flags = evaluate(
    ctx({ dayOfWeek: 0, backToBackHoursToday: 4.5 }, { weekendMeetingCountToday: 1 }),
  );
  assert(flags.some((x) => x.rule === "fullWorkingWeekend"));
});

Deno.test("weekendWithMeeting fires when board call in next 60min on Sat morning", () => {
  const flags = evaluate(
    ctx(
      {
        dayOfWeek: 6,
        localHour: 9,
        upcomingEvents: [{ title: "Board sync", minutesUntil: 45 }],
      },
      { weekendMeetingCountToday: 1, hasWorkMeetingOnWeekend: true },
    ),
  );
  const f = flags.find((x) => x.rule === "weekendWithMeeting");
  assert(f, "should fire");
  assertEquals(f?.anchorEvent, "Board sync");
});

Deno.test("sundayEveningWeekAhead fires Sun 15:00 but not 19:00 (sundayReset window)", () => {
  const at15 = evaluate(ctx({ dayOfWeek: 0, localHour: 15 }));
  assert(at15.some((x) => x.rule === "sundayEveningWeekAhead"));
  const at19 = evaluate(ctx({ dayOfWeek: 0, localHour: 19 }));
  assertFalse(at19.some((x) => x.rule === "sundayEveningWeekAhead"));
  assert(at19.some((x) => x.rule === "sundayReset"));
});

// ─── PTO / Holiday ───────────────────────────────────────────────────────────
Deno.test("holidayReducedTouch fires on PTO all-day with no meetings", () => {
  const flags = evaluate(ctx({}, { ptoTodayAllDay: true }));
  const f = flags.find((x) => x.rule === "holidayReducedTouch");
  assert(f, "should fire");
  assertEquals(f?.severity, "low");
});

Deno.test("ptoWithMeetingFallback overrides reduced-touch when meeting present", () => {
  const flags = evaluate(
    ctx(
      {
        upcomingEvents: [{ title: "Quarterly Board", minutesUntil: 120, stakesLevel: "high" }],
      },
      { ptoTodayAllDay: true },
    ),
  );
  assert(flags.some((x) => x.rule === "ptoWithMeetingFallback"));
  assertFalse(flags.some((x) => x.rule === "holidayReducedTouch"));
});

// ─── Travel cluster ──────────────────────────────────────────────────────────
Deno.test("travelPreFlightMandatory fires on travel day, no landing yet", () => {
  const flags = evaluate(ctx({}, { travelDay: true }));
  assert(flags.some((x) => x.rule === "travelPreFlightMandatory"));
});

Deno.test("travelLandingOffload fires inside 60-min window, no high-stakes follow-up", () => {
  const flags = evaluate(
    ctx({ lastTravelEventEndedMinutesAgo: 20 }, { travelLandingDetected: true }),
  );
  const f = flags.find((x) => x.rule === "travelLandingOffload");
  assert(f, "should fire");
  assertEquals(f?.severity, "high");
});

Deno.test("travelLandingPlusHighStakes wins when meeting in next 60min after landing", () => {
  const flags = evaluate(
    ctx(
      { lastTravelEventEndedMinutesAgo: 10 },
      {
        travelLandingDetected: true,
        highStakesEventInNext24h: { title: "Investor pitch", minutesUntil: 45 },
      },
    ),
  );
  assert(flags.some((x) => x.rule === "travelLandingPlusHighStakes"));
  assertFalse(flags.some((x) => x.rule === "travelLandingOffload"));
});

Deno.test("longHaulRecovery fires on ≥3h flight", () => {
  const flags = evaluate(
    ctx({}, { travelDay: true, longHaulFlight: { durationHours: 9 } }),
  );
  const f = flags.find((x) => x.rule === "longHaulRecovery");
  assert(f);
  assertEquals(f?.severity, "high");
});

// ─── Advance prep 24h ────────────────────────────────────────────────────────
Deno.test("advancePrep24h fires for high-stakes event 18h out", () => {
  const flags = evaluate(
    ctx({}, {
      highStakesEventInNext24h: { title: "Board offsite", minutesUntil: 18 * 60 },
    }),
  );
  assert(flags.some((x) => x.rule === "advancePrep24h"));
});

Deno.test("advancePrep24h suppressed when event is <=4h (boardLevelOutcome owns it)", () => {
  const flags = evaluate(
    ctx({}, {
      highStakesEventInNext24h: { title: "Board offsite", minutesUntil: 180 },
      isHighVisibilityToday: true,
    }),
  );
  assertFalse(flags.some((x) => x.rule === "advancePrep24h"));
  assert(flags.some((x) => x.rule === "boardLevelOutcome"));
});

// ─── Back-to-back + meeting prep cliff ──────────────────────────────────────
Deno.test("backToBackLoadOverride fires at 5h back-to-back", () => {
  const flags = evaluate(ctx({ backToBackHoursToday: 5 }));
  const f = flags.find((x) => x.rule === "backToBackLoadOverride");
  assert(f);
  assertEquals(f?.severity, "medium");
});

Deno.test("meetingPrepCliff suppressed when gap <30min", () => {
  const flags = evaluate(
    ctx({
      backToBackHoursToday: 5,
      nextPreEventGap: { gapMinutes: 15, nextEventTitle: "Board sync", nextEventStakes: "high" },
    }),
    { scope: "nudge" },
  );
  assertFalse(flags.some((x) => x.rule === "meetingPrepCliff"));
});

Deno.test("meetingPrepCliff fires at 45min gap + high-stakes next → high severity", () => {
  const flags = evaluate(
    ctx({
      backToBackHoursToday: 2,
      nextPreEventGap: { gapMinutes: 45, nextEventTitle: "Investor pitch", nextEventStakes: "high" },
    }),
    { scope: "nudge" },
  );
  const f = flags.find((x) => x.rule === "meetingPrepCliff");
  assert(f);
  assertEquals(f?.severity, "high");
});

Deno.test("meetingPrepCliff suppressed when gap OK but no high-stakes AND no heavy load", () => {
  const flags = evaluate(
    ctx({
      backToBackHoursToday: 1,
      nextPreEventGap: { gapMinutes: 45, nextEventTitle: "1:1 with PM", nextEventStakes: null },
    }),
    { scope: "nudge" },
  );
  assertFalse(flags.some((x) => x.rule === "meetingPrepCliff"));
});

Deno.test("meetingPrepCliff fires medium for heavy load + non-high-stakes next", () => {
  const flags = evaluate(
    ctx({
      backToBackHoursToday: 5,
      nextPreEventGap: { gapMinutes: 45, nextEventTitle: "Standup", nextEventStakes: null },
    }),
    { scope: "nudge" },
  );
  const f = flags.find((x) => x.rule === "meetingPrepCliff");
  assert(f);
  assertEquals(f?.severity, "medium");
});

Deno.test("meetingPrepCliff scope: NOT in brief scope", () => {
  const flags = evaluate(
    ctx({
      backToBackHoursToday: 5,
      nextPreEventGap: { gapMinutes: 45, nextEventTitle: "Investor", nextEventStakes: "high" },
    }),
    { scope: "brief" },
  );
  assertFalse(flags.some((x) => x.rule === "meetingPrepCliff"));
});

// ─── Multi-calendar load ─────────────────────────────────────────────────────
Deno.test("multiCalendarLoad fires when 2 sources + aggregated >=4h", () => {
  const flags = evaluate(
    ctx({}, {
      calendarSources: ["google", "apple"],
      backToBackHoursAggregated: 5,
    }),
  );
  assert(flags.some((x) => x.rule === "multiCalendarLoad"));
});

// ─── Override precedence: Travel landing protects against back-to-back ─────
Deno.test("travel landing protected window suppresses backToBackLoadOverride", () => {
  const flags = evaluate(
    ctx(
      { backToBackHoursToday: 6, lastTravelEventEndedMinutesAgo: 20 },
      { travelLandingDetected: true },
    ),
  );
  assertFalse(flags.some((x) => x.rule === "backToBackLoadOverride"));
  assert(flags.some((x) => x.rule === "travelLandingOffload"));
});

// ─── Slot boosts ────────────────────────────────────────────────────────────
Deno.test("deriveSlotBoosts produces prepare boost for advancePrep24h", () => {
  const flags = evaluate(
    ctx({}, { highStakesEventInNext24h: { title: "Board", minutesUntil: 10 * 60 } }),
  );
  const boosts = deriveSlotBoosts(flags);
  const b = boosts.find((x) => x.reason === "advancePrep24h");
  assert(b);
  assertEquals(b?.practiceType, "prepare");
  assertEquals(b?.slot, "midday");
});

Deno.test("deriveSlotBoosts produces evening regulate boost for longHaulRecovery", () => {
  const flags = evaluate(
    ctx({}, { travelDay: true, longHaulFlight: { durationHours: 9 } }),
  );
  const boosts = deriveSlotBoosts(flags);
  const b = boosts.find((x) => x.reason === "longHaulRecovery");
  assert(b);
  assertEquals(b?.slot, "end_of_day");
  assertEquals(b?.practiceType, "regulate");
});

// ─── Dedupe helper ──────────────────────────────────────────────────────────
Deno.test("dedupeForLoad: title-exact collapse keeps one canonical", () => {
  const r = dedupeForLoad([
    { id: "g", title: "Standup", startMs: 1000_000, endMs: 1000_000 + 30 * 60_000, source: "google" },
    { id: "a", title: "Standup", startMs: 1000_000, endMs: 1000_000 + 30 * 60_000, source: "apple" },
  ]);
  assertEquals(r.canonical.length, 1);
  assertEquals(r.removed[0].reason, "title");
});

Deno.test("dedupeForLoad: timeslot collapse (±2min, different titles, different sources)", () => {
  const r = dedupeForLoad([
    { id: "g", title: "Strategy",  startMs: 1000_000,            endMs: 1000_000 + 60 * 60_000, source: "google" },
    { id: "o", title: "Q2 Review", startMs: 1000_000 + 30_000,   endMs: 1000_000 + 60 * 60_000 + 30_000, source: "outlook" },
  ]);
  assertEquals(r.canonical.length, 1);
  assert(r.removed.some((x) => x.reason === "timeslot"));
});

Deno.test("dedupeForLoad: all-day events excluded from aggregation", () => {
  const r = dedupeForLoad([
    { id: "h", title: "Holiday", startMs: 0, endMs: 24 * 60 * 60_000, allDay: true, source: "google" },
    { id: "m", title: "Sync",    startMs: 1000_000, endMs: 1000_000 + 30 * 60_000, source: "google" },
  ]);
  assertEquals(r.canonical.length, 1);
  assert(r.removed.some((x) => x.reason === "all-day-filter"));
});

Deno.test("dedupeForLoad: back-to-back hours sums contiguous chain (<15min gaps)", () => {
  const base = 1000_000;
  const r = dedupeForLoad([
    { id: "1", title: "A", startMs: base,                       endMs: base + 60 * 60_000,          source: "google" },
    { id: "2", title: "B", startMs: base + 60 * 60_000 + 5 * 60_000, endMs: base + 120 * 60_000,     source: "google" },
    { id: "3", title: "C", startMs: base + 180 * 60_000,        endMs: base + 210 * 60_000,         source: "google" }, // gap >15min → new chain
  ]);
  // Chain 1: 0..120 = 2h; Chain 2: 30min = 0.5h → total 2.5h
  assertEquals(r.backToBackHoursAggregated, 2.5);
});
