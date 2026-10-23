// [KIND: test] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Test suite for Layer 2 Day Profile composer domain.
// Source: Part 2 Layer 2 (Section 4.11, Scenarios DP-01 to DP-18).

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { dayProfileComposer } from "./engine.ts";
import type { TimeLocaleFacts } from "../time/types.ts";
import type { AvailabilityFacts } from "../availability/types.ts";
import type { TravelFacts } from "../travel/types.ts";
import type { ConferenceFacts } from "../conference/types.ts";
import type { LoadFacts } from "../load/types.ts";
import type { MixFacts } from "../mix/types.ts";
import type { CrisisFacts } from "../crisis/types.ts";
import type { WeekAheadFacts } from "../week-ahead/types.ts";
import type { ImportanceFacts } from "../importance/types.ts";
import type { ClassificationStamp } from "../events/types.ts";

function createMockInputs(overrides?: Partial<any>) {
  const timeLocale: TimeLocaleFacts = {
    localDate: "2026-10-24",
    weekday: 6,
    dayBounds: { startIso: "2026-10-24T00:00:00Z", endIso: "2026-10-24T23:59:59Z" },
    effectiveTimezone: "UTC",
    homeCountry: "GB",
    homeCountryStatus: "declared",
    homeRegion: null,
    weekendDays: [0, 6],
    planningDay: 0,
    isWeekendDay: true,
    publicHolidays: [],
  };

  const availability: AvailabilityFacts = {
    frame: "weekend",
    isWorkingDay: false,
    leave: null,
    publicHoliday: null,
    longWeekend: null,
    runPosition: null,
    possibleLeave: false,
  };

  const travel: TravelFacts = {
    isTravelling: false,
    tripStatus: "not_travelling",
    travelLegs: [],
    travelMinutesToday: 0,
    travelPhase: "none",
    timeZoneShiftHours: 0,
    daysAway: null,
    totalTripDays: null,
    distanceFromHomeKm: null,
    reentryRisk: false,
    userDeclaredPlace: false,
    landingMeeting: false,
  };

  const conference: ConferenceFacts = {
    isConferenceDay: false,
    dayNumber: null,
    totalDays: null,
    sessions: [],
    role: "none",
    standaloneSpeaking: false,
    place: "none",
    travelRelated: false,
    parallelMeetings: 0,
    firstSessionGapMinutes: null,
    trailingConferenceDays: 0,
    trailingLoad: "none",
    startsTomorrow: false,
    reentryDay: false,
    source: "none",
  };

  const load: LoadFacts = {
    level: "normal",
    reasons: ["baseline"],
    lightReason: null,
    personalDay: false,
    halfDay: false,
    highStakesAnchor: null,
    highStakesItems: [],
    decisionHeavy: false,
    travelLoad: false,
    landingMeeting: false,
    workMeetingCount: 2,
    focusMinutes: 0,
    workOnNonWorkingDay: null,
    recoveryOwed: false,
    recoveryReason: null,
    decisionDensity: 2.0,
  };

  const mix: MixFacts = {
    active: false,
    predominant: null,
    mixed: null,
    backToBack: { isBackToBackDay: false, totalChainHours: 0, longestChainHours: 0, chains: [], reachesDenseDay: false },
    contextSwitching: { level: "low", switchCount: 0, switches: [] },
    composition: { categoryCounts: {}, subtypeCounts: {}, totalWorkMeetings: 0 },
  };

  const crisis: CrisisFacts = {
    isCrisisDay: false,
    crisisEpisodeActive: false,
    activeEpisode: null,
    reasons: [],
  };

  const weekAhead: WeekAheadFacts = {
    isActive: false,
    reason: null,
    lookbackDays: 7,
    lookaheadDays: 7,
  };

  const importance: ImportanceFacts = {
    mode: "base",
    horizonHours: 24,
    anchors: [],
    topItemAnchor: null,
    topDayAnchor: null,
    excluded: [],
  };

  return {
    timeLocale,
    availability,
    travel,
    conference,
    load,
    mix,
    crisis,
    weekAhead,
    importance,
    items: [],
    stamps: [],
    ...overrides,
  };
}

Deno.test("Day Profile Composer: Scenario DP-01 Open day 81km away + confirmed reading -> 'Travel · Weekend'", () => {
  const inputs = createMockInputs({
    travel: {
      isTravelling: true,
      tripStatus: "confirmed",
      travelLegs: [],
      travelMinutesToday: 0,
      travelPhase: "none",
      timeZoneShiftHours: 0,
      daysAway: null,
      totalTripDays: null,
      distanceFromHomeKm: 81,
      reentryRisk: false,
      userDeclaredPlace: false,
      landingMeeting: false,
    },
    availability: {
      frame: "weekend",
      isWorkingDay: false,
      leave: null,
      publicHoliday: null,
      longWeekend: null,
      runPosition: null,
      possibleLeave: false,
    },
  });

  const profile = dayProfileComposer.compose(inputs);
  assertEquals(profile.headline, "Travel · Weekend");
});

Deno.test("Day Profile Composer: Scenario DP-03 Heavy budget day: high-stakes, back-to-back", () => {
  const inputs = createMockInputs({
    availability: {
      frame: "workday",
      isWorkingDay: true,
      leave: null,
      publicHoliday: null,
      longWeekend: null,
      runPosition: null,
      possibleLeave: false,
    },
    load: {
      level: "heavy",
      reasons: ["volume", "weight"],
      lightReason: null,
      personalDay: false,
      halfDay: false,
      highStakesAnchor: { itemId: "b1", title: "Board Presentation", category: "A", subtype: "gov.budget_review", stakes: "high" },
      highStakesItems: [{ itemId: "b1", title: "Board Presentation", category: "A", subtype: "gov.budget_review", stakes: "high" }],
      decisionHeavy: true,
      travelLoad: false,
      landingMeeting: false,
      workMeetingCount: 5,
      focusMinutes: 60,
      workOnNonWorkingDay: null,
      recoveryOwed: true,
      recoveryReason: "Heavy load",
      decisionDensity: 4.0,
    },
    mix: {
      active: true,
      predominant: {
        active: true,
        type: "subtype",
        id: "gov.budget_review",
        name: "budget review",
        count: 4,
        share: 0.8,
      },
      mixed: null,
      backToBack: { isBackToBackDay: true, totalChainHours: 3.5, longestChainHours: 3.5, chains: [], reachesDenseDay: false },
      contextSwitching: { level: "low", switchCount: 0, switches: [] },
      composition: { categoryCounts: { A: 4 }, subtypeCounts: { "gov.budget_review": 4 }, totalWorkMeetings: 5 },
    },
  });

  const profile = dayProfileComposer.compose(inputs);
  assertEquals(profile.headline, "Heavy budget review day: high-stakes, back-to-back");
});

Deno.test("Day Profile Composer: Scenario DP-04 Layoff announcement at 09:00 and board meeting at 14:00 -> 'High-stakes day: board and people'", () => {
  const stamps: ClassificationStamp[] = [
    {
      itemId: "layoff_1",
      sourceType: "calendar",
      category: "D",
      categoryConfidence: 0.9,
      subtype: "lead.layoff",
      subtypeConfidence: 0.9,
      bestCandidateSubtype: null,
      confirmationState: "confirmed",
      decisionSource: "provider_label",
      runnerUp: null,
      reasons: [],
      findings: [],
      dimensions: { stakes: "high", travelRelated: false, workContext: "work", durationMinutes: 60 },
      itemDemand: null,
      taxonomyVersion: "1.0",
      classifierVersion: "1.0",
      classifiedAt: "2026-10-24T00:00:00Z",
    },
    {
      itemId: "board_1",
      sourceType: "calendar",
      category: "A",
      categoryConfidence: 0.9,
      subtype: "gov.board_meeting",
      subtypeConfidence: 0.9,
      bestCandidateSubtype: null,
      confirmationState: "confirmed",
      decisionSource: "provider_label",
      runnerUp: null,
      reasons: [],
      findings: [],
      dimensions: { stakes: "high", travelRelated: false, workContext: "work", durationMinutes: 120 },
      itemDemand: null,
      taxonomyVersion: "1.0",
      classifierVersion: "1.0",
      classifiedAt: "2026-10-24T00:00:00Z",
    },
  ];

  const inputs = createMockInputs({
    availability: {
      frame: "workday",
      isWorkingDay: true,
      leave: null,
      publicHoliday: null,
      longWeekend: null,
      runPosition: null,
      possibleLeave: false,
    },
    stamps,
  });

  const profile = dayProfileComposer.compose(inputs);
  assertEquals(profile.headline, "High-stakes day: board and people");
  assertEquals(profile.contextualFacts.dualEmotionalStakes, true);
});

Deno.test("Day Profile Composer: Scenario DP-12 Saturday: working weekend -> 'Weekend · Working weekend'", () => {
  const inputs = createMockInputs({
    availability: {
      frame: "weekend",
      isWorkingDay: false,
      leave: null,
      publicHoliday: null,
      longWeekend: null,
      runPosition: null,
      possibleLeave: false,
    },
    load: {
      level: "heavy",
      reasons: ["volume"],
      lightReason: null,
      personalDay: false,
      halfDay: false,
      highStakesAnchor: null,
      highStakesItems: [],
      decisionHeavy: false,
      travelLoad: false,
      landingMeeting: false,
      workMeetingCount: 3,
      focusMinutes: 120,
      workOnNonWorkingDay: {
        active: true,
        isFullWorkingDay: true,
        meetingCount: 3,
        workMinutes: 180,
        label: "Working weekend",
      },
      recoveryOwed: true,
      recoveryReason: "Working weekend",
      decisionDensity: 2.0,
    },
  });

  const profile = dayProfileComposer.compose(inputs);
  assertEquals(profile.headline, "Weekend · Working weekend");
  assertEquals(profile.contextualFacts.recoveryOwed, true);
});

Deno.test("Day Profile Composer: Scenario DP-15 Crisis episode open + heavy operations -> 'Crisis · Heavy operations day, back-to-back'", () => {
  const inputs = createMockInputs({
    availability: {
      frame: "workday",
      isWorkingDay: true,
      leave: null,
      publicHoliday: null,
      longWeekend: null,
      runPosition: null,
      possibleLeave: false,
    },
    crisis: {
      isCrisisDay: true,
      crisisEpisodeActive: true,
      activeEpisode: {
        episodeId: "ep_1",
        openedAtUtc: "2026-10-24T00:00:00Z",
        state: "open",
        memberItemIds: ["i1"],
        reasons: ["SEV-1"],
        confidence: "high",
        lastActivityUtc: "2026-10-24T00:00:00Z",
      },
      reasons: ["SEV-1"],
    },
    load: {
      level: "heavy",
      reasons: ["volume"],
      lightReason: null,
      personalDay: false,
      halfDay: false,
      highStakesAnchor: null,
      highStakesItems: [],
      decisionHeavy: false,
      travelLoad: false,
      landingMeeting: false,
      workMeetingCount: 4,
      focusMinutes: 0,
      workOnNonWorkingDay: null,
      recoveryOwed: true,
      recoveryReason: "Heavy ops",
      decisionDensity: 2.0,
    },
    mix: {
      active: true,
      predominant: {
        active: true,
        type: "category",
        id: "I",
        name: "operations",
        count: 4,
        share: 1.0,
      },
      mixed: null,
      backToBack: { isBackToBackDay: true, totalChainHours: 4.0, longestChainHours: 4.0, chains: [], reachesDenseDay: true },
      contextSwitching: { level: "low", switchCount: 0, switches: [] },
      composition: { categoryCounts: { I: 4 }, subtypeCounts: {}, totalWorkMeetings: 4 },
    },
  });

  const profile = dayProfileComposer.compose(inputs);
  assertEquals(profile.headline, "Crisis · Heavy operations day: back-to-back");
});
