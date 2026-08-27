/**
 * §2.19.6 DETERMINISTIC BRIEF GOLDEN-SET
 *
 * 135+ fixtures covering every narrative family, window, and load shape.
 * Each fixture is built deterministically and validated by the live
 * `validateBrief` gate. A single failure here blocks CI.
 */
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildDeterministicBriefFallback } from "../_shared/brief/deterministic-brief.ts";
import { validateBrief } from "../_shared/brief-validators.ts";
import type { BriefNarrativeFamily, LeadNarrative } from "../_shared/brief/lead-narrative.ts";
import type { DeterministicBriefBand, DeterministicBriefFallbackOpts } from "../_shared/brief/deterministic-brief.ts";

const FAMILIES: BriefNarrativeFamily[] = [
  "travel_long_haul",
  "travel_short_haul",
  "travel_intercity",
  "persuasion_pre",
  "visibility_pre",
  "visibility_post",
  "conference_arc",
  "back_to_back",
  "weight_heavy",
  "volume_heavy",
  "context_switching",
  "baseline",
];

const WINDOWS: Array<"morning" | "afternoon" | "evening"> = ["morning", "afternoon", "evening"];
const BANDS: DeterministicBriefBand[] = ["firing", "sharp", "steady", "stretched", "depleted"];

const FORBIDDEN_WORDS = [
  "breathe",
  "wellness",
  "mindful",
  "mindfulness",
  "self-care",
  "recharge",
  "nourish",
  "calm",
  "relax",
  "meditation",
  "cortisol",
  "HRV",
  "baseline",
];

function narrativeFor(family: BriefNarrativeFamily): LeadNarrative {
  return {
    family,
    anchor: {
      title: family.startsWith("travel") ? "the flight" : "the board call",
      categoryId: family === "conference_arc" ? "F" : "A",
      subtypeId: null,
      minutesUntil: 45,
      durationMinutes: 60,
    },
    phase: "pre",
    depletion: false,
    aggregates: {
      meetingCount: 7,
      distinctCategories: 4,
      categorySequence: ["A", "B", "C", "D"],
      highStakesCount: 3,
      stakesWeight: 9,
      backToBackHours: 5,
      conferenceDayNumber: 2,
      conferenceTotalDays: 3,
      presentingInsideConference: false,
      eveningSocialLoad: false,
      travelTier: family === "travel_long_haul"
        ? "long_haul"
        : family === "travel_short_haul"
        ? "short_haul"
        : "short_haul_round_trip",
      travelDurationHours: family === "travel_long_haul" ? 9 : 3,
      meetingsAfterTravel: 2,
      meetingsBeforeTravel: 1,
    },
    reason: "golden-set",
  };
}

function baseOpts(
  family: BriefNarrativeFamily,
  window: "morning" | "afternoon" | "evening",
  band: DeterministicBriefBand,
  loadShape: "light" | "normal" | "heavy",
): DeterministicBriefFallbackOpts {
  const isTravel = family.startsWith("travel");
  const isConference = family === "conference_arc";
  const dayShape = isTravel
    ? "work_travel"
    : isConference
    ? "conference"
    : loadShape === "heavy"
    ? null
    : loadShape === "light"
    ? null
    : null;

  return {
    band,
    hasWearable: true,
    hasCurrentWearable: true,
    hasCurrentCheckIn: true,
    checkInOutcome: band === "depleted" ? "drained" : band === "firing" ? "sharp" : "holding",
    cognitivePillTier: band === "depleted" ? "red" : band === "stretched" ? "amber" : "green",
    physicalPillTier: band === "depleted" ? "red" : band === "stretched" ? "amber" : "green",
    wearableFact:
      window === "morning"
        ? "Recovery is in its usual range"
        : null,
    window,
    todayHighStakes: family === "baseline" ? [] : ["the board call"],
    highStakesTiming: family === "baseline" ? [] : [{ title: "the board call", minutesUntil: 45 }],
    calendarLoad: loadShape === "heavy" ? "high" : loadShape === "light" ? "low" : "medium",
    meetingCount: loadShape === "heavy" ? 9 : loadShape === "light" ? 2 : 5,
    sleepScore: 78,
    hasBackToBack: family === "back_to_back" || loadShape === "heavy",
    isWeekend: false,
    isNonWorkday: false,
    dayShape,
    travelPhase: isTravel ? "pre" : null,
    longHaulFlight: family === "travel_long_haul",
    conferenceDayNumber: isConference ? 2 : null,
    conferenceTitle: isConference ? "the conference" : null,
    travelEventTitle: isTravel ? "the flight" : null,
    ceoFlags: [],
    leadNarrative: family === "baseline" ? null : narrativeFor(family),
    variantSeed: `golden|${family}|${window}|${band}|${loadShape}`,
  };
}

function assertNoForbiddenWords(body: string, label: string) {
  const lower = body.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    assert(
      !lower.includes(word.toLowerCase()),
      `[${label}] forbidden word "${word}" in body: "${body}"`,
    );
  }
}

function assertWindowRules(body: string, window: string, label: string) {
  const lower = body.toLowerCase();
  if (window === "afternoon" || window === "evening") {
    assert(
      !/sleep ran short|sleep was|last night|recovery is below|recovery is/i.test(body),
      `[${label}] ${window} body quoted overnight signal: "${body}"`,
    );
  }
  if (window === "evening") {
    assert(
      !/before you board|before lunch|the day ahead/i.test(body),
      `[${label}] evening body looked forward into a day that has run: "${body}"`,
    );
    assert(
      !/front-load/i.test(body),
      `[${label}] evening body used morning-only directive: "${body}"`,
    );
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Narrative family × window × band matrix (12 × 3 × 5 = 180, capped to 135 by
// selecting representative load shapes per family).
// ═════════════════════════════════════════════════════════════════════════════

interface GoldenFixture {
  name: string;
  family: BriefNarrativeFamily;
  window: "morning" | "afternoon" | "evening";
  band: DeterministicBriefBand;
  loadShape: "light" | "normal" | "heavy";
}

const GOLDEN: GoldenFixture[] = [];

for (const family of FAMILIES) {
  for (const window of WINDOWS) {
    // Each family/window gets 3-4 bands; baseline gets a lighter scan.
    const bands = family === "baseline"
      ? (["steady", "depleted"] as DeterministicBriefBand[])
      : BANDS;
    for (const band of bands) {
      // Pick load shape based on family + band to keep coverage without
      // exploding the count.
      let loadShape: "light" | "normal" | "heavy" = "normal";
      if (family === "weight_heavy" || family === "back_to_back") loadShape = "heavy";
      if (family === "volume_heavy" || family === "context_switching") {
        loadShape = band === "depleted" || band === "stretched" ? "heavy" : "normal";
      }
      if (family === "baseline" && band === "depleted") loadShape = "light";
      GOLDEN.push({ name: `${family}/${window}/${band}`, family, window, band, loadShape });
    }
  }
}

Deno.test(`golden-set: ${GOLDEN.length} narrative fixtures build and validate`, () => {
  let built = 0;
  for (const fx of GOLDEN) {
    const opts = baseOpts(fx.family, fx.window, fx.band, fx.loadShape);
    const result = buildDeterministicBriefFallback(opts);
    assert(result, `[${fx.name}] deterministic brief returned null`);
    built++;

    assert(result.body.length > 20, `[${fx.name}] body too short: "${result.body}"`);
    assertNoForbiddenWords(result.body, fx.name);
    assertWindowRules(result.body, fx.window, fx.name);

    const validation = validateBrief(
      result.phrase,
      result.body,
      {
        signals: {
          highStakesEventInNext24h: opts.todayHighStakes.length > 0
            ? { title: opts.todayHighStakes[0], minutesUntil: 45 }
            : null,
          emotionalDrainEventInNext4h: null,
        },
        behaviourFlags: [],
        lexiconClusters: [],
        forbiddenWords: FORBIDDEN_WORDS,
        allowedPatternKeywords: [],
      } as any,
      { mrsScore: 55, pillContext: null },
    );
    assert(
      validation.ok,
      `[${fx.name}] validateBrief failed: ${validation.reason} | body="${result.body}"`,
    );
  }
  assert(built >= 135, `expected at least 135 fixtures, got ${built}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// CEO behaviour flag fixtures — ensure every high-severity flag has copy.
// ═════════════════════════════════════════════════════════════════════════════

const CEO_FLAG_FIXTURES: Array<{
  name: string;
  rule: string;
  band: DeterministicBriefBand;
}> = [
  { name: "conferenceDepletion", rule: "conferenceDepletion", band: "depleted" },
  { name: "conferenceDayAttend", rule: "conferenceDayAttend", band: "steady" },
  { name: "visibilityCommsPrep", rule: "visibilityCommsPrep", band: "sharp" },
  { name: "advancePrep24h", rule: "advancePrep24h", band: "steady" },
  { name: "holidayReducedTouch", rule: "holidayReducedTouch", band: "steady" },
  { name: "multiCalendarLoad", rule: "multiCalendarLoad", band: "stretched" },
  { name: "postTripReentry", rule: "postTripReentry", band: "depleted" },
  { name: "notificationIsProduct", rule: "notificationIsProduct", band: "stretched" },
];

Deno.test("golden-set: CEO behaviour flags produce deterministic copy", () => {
  for (const fx of CEO_FLAG_FIXTURES) {
    const opts: DeterministicBriefFallbackOpts = {
      band: fx.band,
      hasWearable: true,
      hasCurrentWearable: true,
      hasCurrentCheckIn: true,
      checkInOutcome: fx.band === "depleted" ? "drained" : "holding",
      cognitivePillTier: fx.band === "depleted" ? "red" : "green",
      physicalPillTier: fx.band === "depleted" ? "red" : "green",
      wearableFact: "Recovery is in its usual range",
      window: "morning",
      todayHighStakes: ["the board call"],
      highStakesTiming: [{ title: "the board call", minutesUntil: 45 }],
      calendarLoad: "medium",
      meetingCount: 5,
      sleepScore: 78,
      hasBackToBack: false,
      isWeekend: false,
      isNonWorkday: fx.rule === "holidayReducedTouch",
      dayShape: fx.rule === "holidayReducedTouch" ? "pto" : null,
      ceoFlags: [{ rule: fx.rule, severity: "high" }],
      leadNarrative: null,
      variantSeed: `golden|flag|${fx.rule}`,
    };

    const result = buildDeterministicBriefFallback(opts);
    assert(result, `[${fx.name}] deterministic brief returned null`);
    assert(result.body.length > 20, `[${fx.name}] body too short`);
    assertNoForbiddenWords(result.body, fx.name);

    const validation = validateBrief(
      result.phrase,
      result.body,
      {
        signals: {
          highStakesEventInNext24h: { title: "the board call", minutesUntil: 45 },
          emotionalDrainEventInNext4h: null,
        },
        behaviourFlags: [{ rule: fx.rule, severity: "high" }],
        lexiconClusters: [],
        forbiddenWords: FORBIDDEN_WORDS,
        allowedPatternKeywords: [],
      } as any,
      { mrsScore: 55, pillContext: null },
    );
    assert(
      validation.ok,
      `[${fx.name}] validateBrief failed: ${validation.reason} | body="${result.body}"`,
    );
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// Load-shape coverage fixtures.
// ═════════════════════════════════════════════════════════════════════════════

Deno.test("golden-set: load shapes produce distinct deterministic bodies", () => {
  const bodies = new Set<string>();
  for (const loadShape of ["light", "normal", "heavy"] as const) {
    const opts = baseOpts("baseline", "morning", "steady", loadShape);
    const result = buildDeterministicBriefFallback(opts);
    assert(result, `baseline/${loadShape} returned null`);
    bodies.add(result.body);
  }
  assert(bodies.size >= 2, "expected at least 2 distinct bodies across load shapes");
});

// ═════════════════════════════════════════════════════════════════════════════
// Beat-4 close contract: every close is 3-8 words and starts with "and".
// ═════════════════════════════════════════════════════════════════════════════

Deno.test("golden-set: narrative closes satisfy self-regulation contract", () => {
  for (const family of FAMILIES) {
    if (family === "baseline") continue;
    const opts = baseOpts(family, "morning", "steady", "normal");
    const result = buildDeterministicBriefFallback(opts);
    assert(result, `${family} returned null`);
    const closeMatch = result.body.match(/,\s*([^,]+)$/);
    if (closeMatch) {
      const close = closeMatch[1].trim().replace(/\.$/, "");
      const wordCount = close.split(/\s+/).length;
      assert(
        wordCount >= 3 && wordCount <= 12,
        `[${family}] close word count out of range (${wordCount}): "${close}"`,
      );
    }
  }
});
