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
  assertStringIncludes(built.body, "Set the thinking intention before each room");
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
