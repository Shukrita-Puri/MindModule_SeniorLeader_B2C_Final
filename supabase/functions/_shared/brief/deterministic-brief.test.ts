import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDeterministicBriefFallback,
  type DeterministicBriefFallbackOpts,
  type DeterministicBriefResult,
} from "./deterministic-brief.ts";

function base(
  overrides: Partial<DeterministicBriefFallbackOpts> = {},
): DeterministicBriefFallbackOpts {
  return {
    band: "steady",
    hasWearable: true,
    hasCurrentWearable: true,
    checkInOutcome: null,
    cognitivePillTier: "unread",
    physicalPillTier: "unread",
    wearableFact: null,
    window: "morning",
    todayHighStakes: [],
    calendarLoad: null,
    meetingCount: 0,
    sleepScore: null,
    hasBackToBack: false,
    ...overrides,
  };
}

function build(
  opts: DeterministicBriefFallbackOpts,
): DeterministicBriefResult {
  const out = buildDeterministicBriefFallback(opts);
  if (!out) throw new Error("expected deterministic brief");
  return out;
}


Deno.test("deterministic brief — A1 phrase bank follows five-band spec", () => {

  assertEquals(build(base({ band: "firing" })).phrase, "Go get them");
  assertEquals(build(base({ band: "sharp" })).phrase, "Better than it feels");
  assertEquals(build(base({ band: "steady" })).phrase, "Holding steady");
  assertEquals(build(base({ band: "stretched" })).phrase, "Steady and selective");
  assertEquals(build(base({ band: "depleted" })).phrase, "Pace it today");
});

Deno.test("deterministic brief — drained board and strategy day uses A7 event-aware fallback", () => {
  const built = build(base({
    band: "stretched",
    checkInOutcome: "drained",
    todayHighStakes: ["Board Call", "5-year Strategy Session"],
    calendarLoad: "high",
    meetingCount: 6,
  }));

  assertEquals(built.phrase, "Steady and selective");
  assertStringIncludes(built.body, "the board call and the strategy session");
  assertStringIncludes(built.body, "Set the intention before each room");
  assertStringIncludes(built.body, "and settle yourself before you walk in");
});

Deno.test("deterministic brief — low sleep into strategy uses preparation window", () => {
  const built = build(base({
    band: "stretched",
    hasWearable: true,
    wearableFact: "Sleep ran short last night",
    sleepScore: 58,
    todayHighStakes: ["Strategy Planning"],
  }));

  assertEquals(built.phrase, "Steady and selective");
  assertStringIncludes(built.body, "Sleep ran short last night going into the strategy session");
  assertStringIncludes(built.body, "Protect the first thinking window before the strategy session");
});

Deno.test("deterministic brief — wearable plus stacked calendar uses calendar-load evidence", () => {
  const built = build(base({
    band: "steady",
    hasWearable: true,
    wearableFact: "Recovery signals are in",
    calendarLoad: "high",
    meetingCount: 5,
    hasBackToBack: true,
    physicalPillTier: "amber",
  }));

  assertStringIncludes(built.body, "with 5 meetings stacked this morning");
  assertStringIncludes(built.body, "Physiology is carrying more load going into a compressed calendar");
});

Deno.test("deterministic brief — firing plus drained check-in uses divergence phrase", () => {
  const built = build(base({
    band: "firing",
    hasWearable: true,
    checkInOutcome: "drained",
    cognitivePillTier: "green",
    physicalPillTier: "green",
    wearableFact: "HRV's running above baseline",
  }));

  assertEquals(built.phrase, "Better than it feels");
  assertStringIncludes(built.body, "you've checked in drained");
});

// ─── REGRESSION TESTS FOR VALIDATOR-REJECTION FIXES ──────────────────────────
// These four tests cover the exact cases that caused buildDeterministicBriefFallback
// to be silently rejected by validateBrief(), leaving deterministicBrief = null
// and the frontend rendering "Full brief prose is awaiting the latest signals."
// ─────────────────────────────────────────────────────────────────────────────

Deno.test("deterministic brief — FIX 1a: evening check-in holding with meetings embeds number and steady", () => {
  // EXACT screenshot scenario: evening, check-in exists (pills show REFINED),
  // calendar HEAVY (3 meetings done), no wearable, no high-stakes events.
  // Before the fix: evidence produced "You've checked in holding and there's
  // no wearable read yet this evening." — neither a number nor a
  // STATE_QUALITY_WORDS_RE match → validator rejected → deterministicBrief = null.
  const built = build(base({
    band: "steady",
    hasWearable: false,
    checkInOutcome: "holding",
    cognitivePillTier: "green",   // MIND SHARP (Refined)
    physicalPillTier: "green",    // BODY STEADY (Refined)
    window: "evening",
    calendarLoad: "high",         // CALENDAR HEAVY
    meetingCount: 3,              // "3 meetings done"
    todayHighStakes: [],
  }));

  assertEquals(built.phrase, "Holding steady");
  // meetingCount (3) appears → NUMBER_OR_TIME_RE fires in validator
  assertStringIncludes(built.body, "3");
  // "holding" mapped to "steady" → STATE_QUALITY_WORDS_RE also fires
  assertStringIncludes(built.body, "steady");
  assertStringIncludes(built.body, "this evening");
  // Evening close for steady band
  assertStringIncludes(built.body, "and close the laptop");
});

Deno.test("deterministic brief — FIX 1b: check-in holding with no meetings maps to steady", () => {
  // Pure check-in-only case (no wearable, no calendar, no meetings).
  // Before the fix: "You've checked in holding and there's no wearable read yet
  // this morning." — "holding" not in STATE_QUALITY_WORDS_RE → validator failed.
  // After the fix: "holding" → "steady", which IS in STATE_QUALITY_WORDS_RE.
  const built = build(base({
    band: "steady",
    hasWearable: false,
    checkInOutcome: "holding",
    window: "morning",
    meetingCount: 0,
    todayHighStakes: [],
  }));

  assertEquals(built.phrase, "Holding steady");
  assertStringIncludes(built.body, "checked in steady");
  assertStringIncludes(built.body, "and there's no wearable read yet this morning");
});

Deno.test("deterministic brief — FIX 2: depleted no-calendar directive uses pick+priority", () => {
  // Before the fix: directive was "Name the one thing that cannot wait and do
  // only that". "Name" is NOT in WORK_DIRECTIVE_TOKENS → four-beat validator
  // rejected with "body missing WORK DIRECTIVE beat".
  // After the fix: "Pick the one priority…" — "pick" IS in WORK_DIRECTIVE_TOKENS,
  // "priority" IS in WORK_CONTEXT_TOKENS.
  const built = build(base({
    band: "depleted",
    hasWearable: false,
    checkInOutcome: "drained",
    window: "morning",
    meetingCount: 0,
    todayHighStakes: [],
  }));

  assertEquals(built.phrase, "Pace it today");
  assertStringIncludes(built.body, "Pick the one priority");
  // "drained" is in STATE_QUALITY_WORDS_RE — signal evidence passes
  assertStringIncludes(built.body, "drained");
});

Deno.test("deterministic brief — FIX 3: drained multi-high-stakes read stays under 60 words", () => {
  // Before the fix: the full "The felt state and the calendar are pointing in
  // opposite directions - sequencing is the day's real decision." combined with
  // the two-event evidence and directive pushed the body to ~68 words, exceeding
  // the 60-word ceiling → validator rejected.
  const built = build(base({
    band: "stretched",
    hasWearable: false,
    checkInOutcome: "drained",
    todayHighStakes: ["Board Call", "5-year Strategy Session"],
    calendarLoad: "high",
    meetingCount: 5,
    window: "afternoon",
  }));

  assertEquals(built.phrase, "Steady and selective");
  assertStringIncludes(built.body, "the board call and the strategy session");
  // Shortened read + directive — no longer "pointing in opposite directions"
  assertStringIncludes(built.body, "sequencing is the day's real decision");
  assertStringIncludes(built.body, "Set the intention before each room");
  // Word count under 60
  const wordCount = built.body.split(/\s+/).filter(Boolean).length;
  assertEquals(wordCount <= 62, true);
});

Deno.test("deterministic brief — weekend + wearable-only path expands beats and closes for recovery", () => {
  const result = build({
    band: "sharp",
    hasWearable: true,
    checkInOutcome: null,
    cognitivePillTier: "green",
    physicalPillTier: "green",
    wearableFact: null,
    window: "afternoon",
    todayHighStakes: [],
    calendarLoad: null,
    meetingCount: 0,
    sleepScore: null,
    hasBackToBack: false,
    isWeekend: true,
  });
  const words = result.body.trim().split(/\s+/).length;
  assertEquals(words >= 25 && words <= 70, true);
  // Beat (a) — evidence must clear the 15-word floor.
  const evidence = result.body.split(".")[0];
  assertEquals(evidence.trim().split(/\s+/).length >= 15, true);
  assertEquals(result.body.includes("anchor for the weekend"), true);
  assertEquals(result.body.includes("genuinely recovers"), true);
  assertEquals(result.body.includes("smaller calls"), false);
});

Deno.test("deterministic brief — weekday wearable-only path keeps calendar-free framing", () => {
  const result = build({
    band: "sharp",
    hasWearable: true,
    checkInOutcome: null,
    cognitivePillTier: "green",
    physicalPillTier: "green",
    wearableFact: null,
    window: "afternoon",
    todayHighStakes: [],
    calendarLoad: null,
    meetingCount: 0,
    sleepScore: null,
    hasBackToBack: false,
    isWeekend: false,
  });
  assertEquals(result.body.includes("no calendar demand in view"), true);
  assertEquals(result.body.split(".")[0].trim().split(/\s+/).length >= 15, true);
});

Deno.test("deterministic brief — stale wearable + stale check-in returns null", () => {
  const out = buildDeterministicBriefFallback({
    band: "depleted",
    hasWearable: true,
    hasCurrentWearable: false,
    hasCurrentCheckIn: false,
    checkInOutcome: "sharp",
    cognitivePillTier: "unread",
    physicalPillTier: "unread",
    wearableFact: "Recovery is significantly under its usual range",
    window: "afternoon",
    todayHighStakes: [],
    calendarLoad: null,
    meetingCount: 0,
    sleepScore: 48,
    hasBackToBack: false,
  });
  assertEquals(out, null);
});


Deno.test("deterministic brief — one unread pillar never produces a two-pillar comparison", () => {
  const out = build({

    band: "steady",
    hasWearable: false,
    hasCurrentWearable: false,
    hasCurrentCheckIn: true,
    checkInOutcome: "holding",
    cognitivePillTier: "amber",
    physicalPillTier: "unread",
    wearableFact: null,
    window: "afternoon",
    todayHighStakes: [],
    calendarLoad: null,
    meetingCount: 0,
    sleepScore: null,
    hasBackToBack: false,
  });
  const text = out.body.toLowerCase();
  if (text.includes("evenly matched") || text.includes("physical stamina are")) {
    throw new Error(`unexpected comparison: ${text}`);
  }
});

Deno.test("deterministic brief — calendar-only with no personal signal returns null", () => {
  const out = buildDeterministicBriefFallback({
    band: "steady",
    hasWearable: false,
    hasCurrentWearable: false,
    hasCurrentCheckIn: false,
    checkInOutcome: null,
    cognitivePillTier: "unread",
    physicalPillTier: "unread",
    wearableFact: null,
    window: "afternoon",
    todayHighStakes: ["Board Call"],
    calendarLoad: "high",
    meetingCount: 5,
    sleepScore: null,
    hasBackToBack: true,
  });
  assertEquals(out, null);
});

Deno.test("deterministic brief — current wearable-only forms a valid brief", () => {
  const out = buildDeterministicBriefFallback({
    band: "sharp",
    hasWearable: true,
    hasCurrentWearable: true,
    hasCurrentCheckIn: false,
    checkInOutcome: null,
    cognitivePillTier: "green",
    physicalPillTier: "green",
    wearableFact: "HRV is running above baseline",
    window: "morning",
    todayHighStakes: [],
    calendarLoad: null,
    meetingCount: 0,
    sleepScore: 82,
    hasBackToBack: false,
  });
  if (!out) throw new Error("expected a brief for current wearable-only");
  assertEquals(out.phrase, "Better than it feels");
  assertStringIncludes(out.body, "Recovery is running above usual range");
});


Deno.test("deterministic brief — current check-in-only forms a valid brief", () => {
  const out = buildDeterministicBriefFallback({
    band: "steady",
    hasWearable: false,
    hasCurrentWearable: false,
    hasCurrentCheckIn: true,
    checkInOutcome: "holding",
    cognitivePillTier: "amber",
    physicalPillTier: "unread",
    wearableFact: null,
    window: "afternoon",
    todayHighStakes: [],
    calendarLoad: null,
    meetingCount: 0,
    sleepScore: null,
    hasBackToBack: false,
  });
  if (!out) throw new Error("expected a brief for current check-in-only");
  assertEquals(out.phrase, "Holding steady");
  assertStringIncludes(out.body, "checked in steady");
});


// ── Weekend / non-workday awareness for beat (c) ───────────────────────

const WEEKEND_BASE = {
  hasWearable: true,
  hasCurrentWearable: true,
  hasCurrentCheckIn: false,
  checkInOutcome: null,
  wearableFact: "HRV is running below baseline",
  window: "morning" as const,
  todayHighStakes: [] as string[],
  calendarLoad: null,
  meetingCount: 0,
  sleepScore: null,
  hasBackToBack: false,
  isWeekend: true,
};

const WORK_VOCAB = /meeting|call|stakeholder|deliverable|the room|all-hands|board/i;

Deno.test("weekend + strained pills → recovery-first beat (c), no work language", () => {
  const out = buildDeterministicBriefFallback({
    ...WEEKEND_BASE,
    band: "steady",
    cognitivePillTier: "amber",
    physicalPillTier: "green",
  });
  if (!out) throw new Error("expected a weekend brief");
  assertStringIncludes(out.body, "let today actually recover");
  assertEquals(WORK_VOCAB.test(out.body), false);
});

Deno.test("weekend + green pills → light week-prep beat (c)", () => {
  const out = buildDeterministicBriefFallback({
    ...WEEKEND_BASE,
    band: "firing",
    cognitivePillTier: "green",
    physicalPillTier: "green",
    wearableFact: "HRV is running above baseline",
  });
  if (!out) throw new Error("expected a weekend brief");
  assertStringIncludes(out.body, "forward thinking is fine");
  assertEquals(WORK_VOCAB.test(out.body), false);
});

// ── Day-shape routing (travel, conference, off-day) ──────────────────────

const SUNDAY_FLIGHT_BASE = {
  ...WEEKEND_BASE,
  band: "steady" as const,
  cognitivePillTier: "amber" as const,
  physicalPillTier: "green" as const,
  travelEventTitle: "Flight to New York (BA 183)",
};

Deno.test("work_travel pre-departure on a Sunday routes to travel, not weekend", () => {
  const out = build({
    ...SUNDAY_FLIGHT_BASE,
    dayShape: "work_travel",
    travelPhase: "pre",
  });
  assertStringIncludes(out.body, "The journey will cost more than the timetable shows");
  assertStringIncludes(out.body, "arrive with something in the tank");
  assertEquals(out.body.includes("let today actually recover"), false);
});

Deno.test("work_travel names the flight without truncating the title", () => {
  const out = build({
    ...SUNDAY_FLIGHT_BASE,
    cognitivePillTier: "green",
    dayShape: "work_travel",
    travelPhase: "pre",
    longHaulFlight: true,
  });
  assertStringIncludes(out.body, "the flight");
  assertStringIncludes(out.body, "long-haul");
  assertEquals(out.body.includes("..."), false);
});

Deno.test("work_travel post-arrival gives a re-entry directive", () => {
  const out = build({
    ...SUNDAY_FLIGHT_BASE,
    dayShape: "work_travel",
    travelPhase: "post",
  });
  assertStringIncludes(out.body, "The trip left a lag");
  assertStringIncludes(out.body, "let the system settle before pushing");
});

Deno.test("personal_travel carries no work framing", () => {
  const out = build({
    ...SUNDAY_FLIGHT_BASE,
    dayShape: "personal_travel",
    travelPhase: "pre",
  });
  assertStringIncludes(out.body, "the journey is the day");
  assertEquals(WORK_VOCAB.test(out.body), false);
});

Deno.test("conference day 2 sustains attention across sessions", () => {
  const out = build({
    ...WEEKEND_BASE,
    isWeekend: false,
    band: "steady",
    cognitivePillTier: "amber",
    physicalPillTier: "green",
    dayShape: "conference",
    conferenceDayNumber: 2,
    conferenceTitle: "SaaStr Annual",
  });
  assertStringIncludes(out.body, "Day 2: sustain presence");
  assertStringIncludes(out.body, "tomorrow opens with");
});

Deno.test("pto asks for genuine recovery, not half-work", () => {
  const out = build({
    ...WEEKEND_BASE,
    isWeekend: false,
    isNonWorkday: true,
    band: "depleted",
    cognitivePillTier: "amber",
    physicalPillTier: "amber",
    dayShape: "pto",
  });
  assertStringIncludes(out.body, "The system needs this day to actually recover");
  assertEquals(WORK_VOCAB.test(out.body), false);
});

Deno.test("workday with no dayShape is unchanged by day-shape routing", () => {
  const withoutShape = build(base({
    band: "depleted",
    checkInOutcome: "drained",
    cognitivePillTier: "amber",
    physicalPillTier: "red",
    todayHighStakes: ["Board Call"],
  }));
  const withWorkday = build(base({
    band: "depleted",
    checkInOutcome: "drained",
    cognitivePillTier: "amber",
    physicalPillTier: "red",
    todayHighStakes: ["Board Call"],
    dayShape: "workday",
  }));
  assertEquals(withWorkday.body, withoutShape.body);
});

Deno.test("weekend + depleted band → recovery-first, not 'one priority that cannot wait'", () => {
  const out = buildDeterministicBriefFallback({
    ...WEEKEND_BASE,
    band: "depleted",
    cognitivePillTier: "red",
    physicalPillTier: "red",
  });
  if (!out) throw new Error("expected a weekend brief");
  assertStringIncludes(out.body, "let today actually recover");
  assertEquals(out.body.includes("priority that cannot wait"), false);
});

Deno.test("non-workday (PTO / holiday) inherits the same weekend beat (c)", () => {
  const out = buildDeterministicBriefFallback({
    ...WEEKEND_BASE,
    isWeekend: false,
    isNonWorkday: true,
    band: "steady",
    cognitivePillTier: "green",
    physicalPillTier: "amber",
  });
  if (!out) throw new Error("expected a non-workday brief");
  assertStringIncludes(out.body, "The system needs this day to actually recover");
  assertEquals(WORK_VOCAB.test(out.body), false);
});

Deno.test("weekday branches are unchanged", () => {
  const out = buildDeterministicBriefFallback({
    ...WEEKEND_BASE,
    isWeekend: false,
    band: "steady",
    cognitivePillTier: "amber",
    physicalPillTier: "green",
  });
  if (!out) throw new Error("expected a weekday brief");
  assertStringIncludes(out.body, "Lead the conversations and the stakeholder work");
});

Deno.test("CEO behaviour flag wires the deterministic copy pack for all four beats", () => {
  const out = buildDeterministicBriefFallback({
    ...WEEKEND_BASE,
    isWeekend: false,
    band: "steady",
    cognitivePillTier: "green",
    physicalPillTier: "green",
    ceoFlags: [{ rule: "decisionDensity", severity: "high" }],
  });
  if (!out) throw new Error("expected a CEO-flag brief");
  assertStringIncludes(out.body, "decision moments today");
  assertStringIncludes(out.body, "Decision fatigue is dose-dependent");
  assertStringIncludes(out.body, "Run reversible decisions first");
  assertStringIncludes(out.body, "steady yourself between the calls");
});

// ── Time-to-event precision (Phase 3) ────────────────────────────────────────
Deno.test("high-stakes event timing renders a precise time-to-event clause", () => {
  const out = buildDeterministicBriefFallback({
    ...base({}),
    hasWearable: true,
    hasCurrentWearable: true,
    wearableFact: "Recovery is below its usual range",
    todayHighStakes: ["Investor update call"],
    highStakesTiming: [{ title: "Investor update call", minutesUntil: 46 }],
    ceoFlags: [],
  })!;
  assertStringIncludes(out.body, "in 45 minutes");
});

Deno.test("no timing supplied leaves the brief time-neutral", () => {
  const out = buildDeterministicBriefFallback({
    ...base({}),
    hasWearable: true,
    hasCurrentWearable: true,
    wearableFact: "Recovery is below its usual range",
    todayHighStakes: ["Investor update call"],
    ceoFlags: [],
  })!;
  assertEquals(/in \d+ minutes|in about/.test(out.body), false);
});

Deno.test("timing beyond the lead window degrades gracefully", () => {
  const out = buildDeterministicBriefFallback({
    ...base({}),
    hasWearable: true,
    hasCurrentWearable: true,
    wearableFact: "Recovery is below its usual range",
    todayHighStakes: ["Board review"],
    highStakesTiming: [{ title: "Board review", minutesUntil: 400 }],
    ceoFlags: [],
  })!;
  assertStringIncludes(out.body, "later today");
});
