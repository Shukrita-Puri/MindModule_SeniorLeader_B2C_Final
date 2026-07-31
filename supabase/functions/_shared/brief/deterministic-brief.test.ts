import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildDeterministicBriefFallback,
  type DeterministicBriefFallbackOpts,
} from "./deterministic-brief.ts";

function base(
  overrides: Partial<DeterministicBriefFallbackOpts> = {},
): DeterministicBriefFallbackOpts {
  return {
    band: "steady",
    hasWearable: false,
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

Deno.test("deterministic brief — A1 phrase bank follows five-band spec", () => {
  assertEquals(buildDeterministicBriefFallback(base({ band: "firing" })).phrase, "Go get them");
  assertEquals(buildDeterministicBriefFallback(base({ band: "sharp" })).phrase, "Better than it feels");
  assertEquals(buildDeterministicBriefFallback(base({ band: "steady" })).phrase, "Holding steady");
  assertEquals(buildDeterministicBriefFallback(base({ band: "stretched" })).phrase, "Steady and selective");
  assertEquals(buildDeterministicBriefFallback(base({ band: "depleted" })).phrase, "Pace it today");
});

Deno.test("deterministic brief — drained board and strategy day uses A7 event-aware fallback", () => {
  const built = buildDeterministicBriefFallback(base({
    band: "stretched",
    checkInOutcome: "drained",
    todayHighStakes: ["Board Call", "5-year Strategy Session"],
    calendarLoad: "high",
    meetingCount: 6,
  }));

  assertEquals(built.phrase, "Steady and selective");
  assertStringIncludes(built.body, "the board call and the strategy session");
  assertStringIncludes(built.body, "Set the intention before each room");
  assertStringIncludes(built.body, "and protect the close.");
});

Deno.test("deterministic brief — low sleep into strategy uses preparation window", () => {
  const built = buildDeterministicBriefFallback(base({
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
  const built = buildDeterministicBriefFallback(base({
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
  const built = buildDeterministicBriefFallback(base({
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
  const built = buildDeterministicBriefFallback(base({
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
  const built = buildDeterministicBriefFallback(base({
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
  const built = buildDeterministicBriefFallback(base({
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
  const built = buildDeterministicBriefFallback(base({
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
  assertEquals(wordCount <= 60, true);
});
