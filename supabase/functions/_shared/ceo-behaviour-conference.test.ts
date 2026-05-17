import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RuleContext, SignalMatrix } from "./brief-context.ts";
import {
  conferenceNightBeforeSummit,
  conferenceDayAttend,
  conferenceDayWithSpeaking,
  dropInSpeakingHighStakes,
  conferenceMidSessionReset,
  conferenceCarryFatigue,
  postConferenceReentry,
  amplifyByDayCount,
  engagementBaseSeverity,
} from "./ceo-behaviour/conference.ts";

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
    localHour: 10,
    ...over,
  };
}

// ─── helpers ──────────────────────────────────────────────────────────────

Deno.test("engagementBaseSeverity: attend+speaking=high, drop-in=medium, attend=low", () => {
  assertEquals(engagementBaseSeverity(true, true), "high");
  assertEquals(engagementBaseSeverity(true, false), "medium");
  assertEquals(engagementBaseSeverity(false, true), "low");
  assertEquals(engagementBaseSeverity(false, false), "low");
});

Deno.test("amplifyByDayCount: caps at high", () => {
  assertEquals(amplifyByDayCount("low", 1), "low");
  assertEquals(amplifyByDayCount("low", 2), "medium");
  assertEquals(amplifyByDayCount("low", 3), "high");
  assertEquals(amplifyByDayCount("low", 7), "high");
  assertEquals(amplifyByDayCount("medium", 1), "medium");
  assertEquals(amplifyByDayCount("medium", 2), "high");
});

// ─── conferenceNightBeforeSummit ──────────────────────────────────────────

Deno.test("conferenceNightBeforeSummit: fires only in evening when tomorrow is Day 1", () => {
  const evening = conferenceNightBeforeSummit(ctx({ localHour: 19 }, {
    conferenceStartsTomorrow: true, conferenceEventTitle: "CEO Summit",
  }));
  assert(evening, "should fire in evening");
  assertEquals(evening!.severity, "medium");
  assertEquals(evening!.anchorEvent, "CEO Summit");
  assert(evening!.copyHint.includes("open-brief"));

  const morning = conferenceNightBeforeSummit(ctx({ localHour: 9 }, {
    conferenceStartsTomorrow: true,
  }));
  assertEquals(morning, null, "morning should not fire");
});

Deno.test("conferenceNightBeforeSummit: escalates to high when travel-fatigued", () => {
  const flag = conferenceNightBeforeSummit(ctx({ localHour: 20 }, {
    conferenceStartsTomorrow: true,
    yesterdayWasTravelDay: true,
  }));
  assertEquals(flag!.severity, "high");
  assert(flag!.copyHint.includes("offload travel"));
});

// ─── conferenceDayAttend ──────────────────────────────────────────────────

Deno.test("conferenceDayAttend: day-count amplifier 1→low, 2→medium, 3→high", () => {
  const d1 = conferenceDayAttend(ctx({}, { conferenceDayNumber: 1, hasFullDayConferenceWrapper: true }));
  const d2 = conferenceDayAttend(ctx({}, { conferenceDayNumber: 2, hasFullDayConferenceWrapper: true }));
  const d3 = conferenceDayAttend(ctx({}, { conferenceDayNumber: 3, hasFullDayConferenceWrapper: true }));
  assertEquals(d1!.severity, "low");
  assertEquals(d2!.severity, "medium");
  assertEquals(d3!.severity, "high");
  assert(d1!.copyHint.includes("open-plan"));
});

Deno.test("conferenceDayAttend: suppressed when speaking blocks exist", () => {
  const flag = conferenceDayAttend(ctx({}, {
    conferenceDayNumber: 1,
    hasFullDayConferenceWrapper: true,
    speakingBlocksToday: [{ title: "Panel: Future of AI", minutesUntil: 120, durationMinutes: 45, kind: "panel" }],
  }));
  assertEquals(flag, null);
});

// ─── conferenceDayWithSpeaking ────────────────────────────────────────────

Deno.test("conferenceDayWithSpeaking: fires at high severity, names the speaking block", () => {
  const flag = conferenceDayWithSpeaking(ctx({}, {
    conferenceDayNumber: 1,
    hasFullDayConferenceWrapper: true,
    speakingBlocksToday: [{ title: "Fireside chat with X", minutesUntil: 180, durationMinutes: 30, kind: "fireside" }],
  }));
  assert(flag);
  assertEquals(flag!.severity, "high");
  assertEquals(flag!.anchorEvent, "Fireside chat with X");
  assert(flag!.copyHint.includes("open-plan"));
});

Deno.test("conferenceDayWithSpeaking: silent when not a conference day", () => {
  const flag = conferenceDayWithSpeaking(ctx({}, {
    speakingBlocksToday: [{ title: "Panel", minutesUntil: 60, durationMinutes: 45, kind: "panel" }],
  }));
  assertEquals(flag, null);
});

// ─── dropInSpeakingHighStakes ─────────────────────────────────────────────

Deno.test("dropInSpeakingHighStakes: fires when speaking but no conference wrapper", () => {
  const flag = dropInSpeakingHighStakes(ctx({}, {
    speakingBlocksToday: [{ title: "Keynote at TechFest", minutesUntil: 90, durationMinutes: 30, kind: "keynote" }],
  }));
  assert(flag);
  assertEquals(flag!.severity, "medium");
  assertEquals(flag!.anchorEvent, "Keynote at TechFest");
  assert(flag!.copyHint.includes("open-plan"));
});

Deno.test("dropInSpeakingHighStakes: suppressed inside a conference day (other rule wins)", () => {
  const flag = dropInSpeakingHighStakes(ctx({}, {
    conferenceDayNumber: 1,
    speakingBlocksToday: [{ title: "Keynote", minutesUntil: 60, durationMinutes: 30, kind: "keynote" }],
  }));
  assertEquals(flag, null);
});

// ─── conferenceMidSessionReset ────────────────────────────────────────────

Deno.test("conferenceMidSessionReset: ≥30min gap triggers, <30 does not", () => {
  const yes = conferenceMidSessionReset(ctx({}, {
    conferenceDayNumber: 1, firstSessionGapMinutesToday: 45,
  }));
  assert(yes);
  assert(yes!.copyHint.includes("inline-somatic"));
  assert(!yes!.copyHint.includes("open-brief") && !yes!.copyHint.includes("open-plan"));

  const no = conferenceMidSessionReset(ctx({}, {
    conferenceDayNumber: 1, firstSessionGapMinutesToday: 15,
  }));
  assertEquals(no, null);
});

// ─── conferenceCarryFatigue ───────────────────────────────────────────────

Deno.test("conferenceCarryFatigue: severity tracks trailingConferenceLoad", () => {
  const high = conferenceCarryFatigue(ctx({}, {
    conferenceDaysInTrailing4: 2, trailingConferenceLoad: "high",
  }));
  const med = conferenceCarryFatigue(ctx({}, {
    conferenceDaysInTrailing4: 1, trailingConferenceLoad: "medium",
  }));
  assertEquals(high!.severity, "high");
  assertEquals(med!.severity, "medium");
});

Deno.test("conferenceCarryFatigue: suppressed on a conference day", () => {
  const flag = conferenceCarryFatigue(ctx({}, {
    conferenceDayNumber: 2, conferenceDaysInTrailing4: 2, trailingConferenceLoad: "high",
  }));
  assertEquals(flag, null);
});

// ─── postConferenceReentry ────────────────────────────────────────────────

Deno.test("postConferenceReentry: fires day after multi-day; high when next 3 days dense", () => {
  const base = postConferenceReentry(ctx({}, { conferenceDayNumberYesterday: 3 }));
  assertEquals(base!.severity, "medium");

  const dense = postConferenceReentry(ctx({}, {
    conferenceDayNumberYesterday: 2, nextThreeDaysMeetingCount: 12,
  }));
  assertEquals(dense!.severity, "high");
  assert(dense!.copyHint.includes("open-brief"));
});

Deno.test("postConferenceReentry: silent when yesterday was single day", () => {
  const flag = postConferenceReentry(ctx({}, { conferenceDayNumberYesterday: 1 }));
  assertEquals(flag, null);
});

// ─── hand-off contract ────────────────────────────────────────────────────

Deno.test("every non-mid-session rule carries a brief/plan hand-off marker", () => {
  const rules = [
    conferenceNightBeforeSummit(ctx({ localHour: 19 }, { conferenceStartsTomorrow: true })),
    conferenceDayAttend(ctx({}, { conferenceDayNumber: 1, hasFullDayConferenceWrapper: true })),
    conferenceDayWithSpeaking(ctx({}, {
      conferenceDayNumber: 1, hasFullDayConferenceWrapper: true,
      speakingBlocksToday: [{ title: "Panel", minutesUntil: 60, durationMinutes: 45, kind: "panel" }],
    })),
    dropInSpeakingHighStakes(ctx({}, {
      speakingBlocksToday: [{ title: "Keynote", minutesUntil: 60, durationMinutes: 30, kind: "keynote" }],
    })),
    conferenceCarryFatigue(ctx({}, { conferenceDaysInTrailing4: 1, trailingConferenceLoad: "medium" })),
    postConferenceReentry(ctx({}, { conferenceDayNumberYesterday: 2 })),
  ];
  for (const r of rules) {
    assert(r, "rule should fire under its test signals");
    assert(
      r!.copyHint.includes("open-brief") || r!.copyHint.includes("open-plan"),
      `rule ${r!.rule} missing brief/plan hand-off in copyHint: ${r!.copyHint}`,
    );
  }
});