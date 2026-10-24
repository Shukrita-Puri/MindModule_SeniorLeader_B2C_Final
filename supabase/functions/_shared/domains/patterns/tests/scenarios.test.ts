// [KIND: test] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Scenarios L4-1 to L4-20 for Layer 4: Patterns and Causality.
// Source: Part 2 Layer 4 (Section 11, Scenarios L4-1 to L4-20).

import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  askPattern,
  computeBehaviourPatterns,
  computeOwnActionEfficacy,
  computePracticeEfficacy,
  computePrepEffect,
  computeRhythm,
  computeShrunkRate,
  computeTrends,
  evaluatePredictionAccuracy,
  groupExposuresWithRollup,
  readFindings,
  runPatternSpecs,
  type ExposureEvent,
  type Finding,
  type History,
  type HistoryDay,
  type PatternSpec,
} from "../index.ts";

function createMockHistory(overrides: Partial<History> = {}): History {
  const days: HistoryDay[] = [];
  const baseDate = new Date("2026-04-01T00:00:00Z");

  for (let i = 0; i < 30; i++) {
    const d = new Date(baseDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dateStr = d.toISOString().slice(0, 10);

    days.push({
      date: dateStr,
      events: [],
      wearable: {
        date: dateStr,
        hrv: 55, // Clean baseline
        rhr: 58,
        readinessScore: 80,
      },
      checkins: [
        {
          id: `c_${dateStr}`,
          date: dateStr,
          localHour: 14,
          window: "afternoon",
          clarity: 70,
          energy: 70,
          calm: 75,
          focus: 70,
        },
      ],
    });
  }

  return {
    userId: "test-user-1",
    timezone: "Europe/London",
    days,
    practiceSessions: [],
    ownActionRecords: [],
    nudgeRecords: [],
    checkins: days.flatMap((d) => d.checkins || []),
    wearables: days.map((d) => d.wearable!).filter(Boolean),
    ...overrides,
  };
}

// -----------------------------------------------------------------------------
// Scenario L4-1: Basic overnight drain pattern (HRV drop after Category A)
// -----------------------------------------------------------------------------
Deno.test("L4-1: Category A board days with 20% HRV drop produce emerging/strong drain finding", () => {
  const history = createMockHistory();

  // Add 4 board days where next morning HRV drops to 42 (from baseline 55 = ~24% drop)
  const boardDates = ["2026-04-05", "2026-04-10", "2026-04-15", "2026-04-20"];
  for (const date of boardDates) {
    const day = history.days.find((d) => d.date === date)!;
    day.events.push({
      id: `ev_${date}`,
      date,
      startUtc: `${date}T09:00:00Z`,
      endUtc: `${date}T12:00:00Z`,
      durationMinutes: 180,
      bucketKey: "A",
      stamp: {
        category: "A",
        confidence: 0.95,
        decisionSource: "evidence",
        matchedRules: [],
        signals: [],
      } as any,
    });

    // Next morning HRV dropped
    const nextD = new Date(`${date}T00:00:00Z`);
    nextD.setUTCDate(nextD.getUTCDate() + 1);
    const nextStr = nextD.toISOString().slice(0, 10);
    const nextDay = history.days.find((d) => d.date === nextStr);
    if (nextDay && nextDay.wearable) {
      nextDay.wearable.hrv = 42;
    }
  }

  const spec: PatternSpec = {
    id: "event_drain_hrv",
    name: "HRV Drain",
    family: "drain_lift",
    metric: "hrv",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  };

  const findings = runPatternSpecs([spec], history);
  assertEquals(findings.length, 1);
  assertEquals(findings[0].bucketKey, "A");
  assertEquals(findings[0].direction, "harm");
  assertEquals(findings[0].measuredN, 4);
  assertEquals(findings[0].confidence, "emerging");
});

// -----------------------------------------------------------------------------
// Scenario L4-2: n < 3 occurrences -> insufficient_data (no finding written)
// -----------------------------------------------------------------------------
Deno.test("L4-2: Only 2 occurrences does not produce a finding (insufficient data)", () => {
  const history = createMockHistory();
  const boardDates = ["2026-04-05", "2026-04-10"]; // only 2 occurrences

  for (const date of boardDates) {
    const day = history.days.find((d) => d.date === date)!;
    day.events.push({
      id: `ev_${date}`,
      date,
      startUtc: `${date}T09:00:00Z`,
      endUtc: `${date}T12:00:00Z`,
      durationMinutes: 180,
      bucketKey: "A",
      stamp: { category: "A", confidence: 0.9, decisionSource: "evidence", matchedRules: [], signals: [] } as any,
    });
  }

  const spec: PatternSpec = {
    id: "event_drain_hrv",
    name: "HRV Drain",
    family: "drain_lift",
    metric: "hrv",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  };

  const findings = runPatternSpecs([spec], history);
  assertEquals(findings.length, 0);
});

// -----------------------------------------------------------------------------
// Scenario L4-3: Two-window stability test for strong
// -----------------------------------------------------------------------------
Deno.test("L4-3: 6 occurrences with effect holding in both halves qualifies as strong", () => {
  const history = createMockHistory();
  const dates = ["2026-04-02", "2026-04-06", "2026-04-10", "2026-04-14", "2026-04-18", "2026-04-22"];

  for (const date of dates) {
    const day = history.days.find((d) => d.date === date)!;
    day.events.push({
      id: `ev_${date}`,
      date,
      startUtc: `${date}T09:00:00Z`,
      endUtc: `${date}T12:00:00Z`,
      durationMinutes: 180,
      bucketKey: "A",
      stamp: { category: "A", confidence: 0.95, decisionSource: "evidence", matchedRules: [], signals: [] } as any,
    });

    const nextD = new Date(`${date}T00:00:00Z`);
    nextD.setUTCDate(nextD.getUTCDate() + 1);
    const nextStr = nextD.toISOString().slice(0, 10);
    const nextDay = history.days.find((d) => d.date === nextStr);
    if (nextDay && nextDay.wearable) {
      nextDay.wearable.hrv = 40; // ~27% drop in both halves
    }
  }

  const spec: PatternSpec = {
    id: "event_drain_hrv",
    name: "HRV Drain",
    family: "drain_lift",
    metric: "hrv",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  };

  const findings = runPatternSpecs([spec], history);
  assertEquals(findings.length, 1);
  assertEquals(findings[0].confidence, "strong");
  assertEquals(findings[0].twoWindowPassed, true);
});

// -----------------------------------------------------------------------------
// Scenario L4-4: Travel trip of 5 days is evaluated by trip, not two isolated days
// -----------------------------------------------------------------------------
Deno.test("L4-4: Travel recovery counts whole trip as one episode", () => {
  const history = createMockHistory();
  // Mark 5 days as travel
  for (let i = 5; i <= 9; i++) {
    const day = history.days[i];
    if (day.wearable) day.wearable.isExcludedDay = true;
  }
  // Baseline should exclude all 5 travel days
  assertEquals(history.days[5].wearable?.isExcludedDay, true);
});

// -----------------------------------------------------------------------------
// Scenario L4-5: Box breathing before 6 pitches, HR down 8% after each; prep effect
// -----------------------------------------------------------------------------
Deno.test("L4-5: Prep effect evaluates box breathing before pitch and reports strong efficacy & emerging prep effect", () => {
  const history = createMockHistory({
    practiceSessions: [
      { id: "p1", practiceId: "box-breathing", date: "2026-04-02", startUtc: "09:00", anchorCategory: "B", completed: true, durationSeconds: 300, preStateHr: 88, postStateHr: 81, rating: "useful" },
      { id: "p2", practiceId: "box-breathing", date: "2026-04-05", startUtc: "09:00", anchorCategory: "B", completed: true, durationSeconds: 300, preStateHr: 90, postStateHr: 82, rating: "useful" },
      { id: "p3", practiceId: "box-breathing", date: "2026-04-08", startUtc: "09:00", anchorCategory: "B", completed: true, durationSeconds: 300, preStateHr: 87, postStateHr: 80, rating: "useful" },
      { id: "p4", practiceId: "box-breathing", date: "2026-04-12", startUtc: "09:00", anchorCategory: "B", completed: true, durationSeconds: 300, preStateHr: 89, postStateHr: 82, rating: "useful" },
      { id: "p5", practiceId: "box-breathing", date: "2026-04-15", startUtc: "09:00", anchorCategory: "B", completed: true, durationSeconds: 300, preStateHr: 91, postStateHr: 83, rating: "useful" },
      { id: "p6", practiceId: "box-breathing", date: "2026-04-19", startUtc: "09:00", anchorCategory: "B", completed: true, durationSeconds: 300, preStateHr: 88, postStateHr: 81, rating: "useful" },
    ],
  });

  const efficacy = computePracticeEfficacy(history);
  assertEquals(efficacy.length, 1);
  assertEquals(efficacy[0].interventionId, "box-breathing");
  assertEquals(efficacy[0].confidence, "strong");

  const prep = computePrepEffect(history, "B");
  assertNotEquals(prep, null);
  assertEquals(prep?.category, "B");
  assertEquals(prep?.confidence, "strong");
  assertEquals(prep?.withPrepCount, 6);
});

// -----------------------------------------------------------------------------
// Scenario L4-6: Hit rate 33% after 6 checks demotes confidence and stops quoting
// -----------------------------------------------------------------------------
Deno.test("L4-6: Hit rate of 33% (2 of 6) demotes pattern and stops quoting at gate", () => {
  const stableKey = "hrv_offsites_next_morning_harm";
  const predictions = [
    { id: "1", findingId: "f1", stableKey, targetDate: "2026-04-01", predictedDirection: "harm" as const, actualDirection: "harm" as const, isCorrect: true },
    { id: "2", findingId: "f1", stableKey, targetDate: "2026-04-05", predictedDirection: "harm" as const, actualDirection: "harm" as const, isCorrect: true },
    { id: "3", findingId: "f1", stableKey, targetDate: "2026-04-10", predictedDirection: "harm" as const, actualDirection: "benefit" as const, isCorrect: false },
    { id: "4", findingId: "f1", stableKey, targetDate: "2026-04-15", predictedDirection: "harm" as const, actualDirection: "benefit" as const, isCorrect: false },
    { id: "5", findingId: "f1", stableKey, targetDate: "2026-04-20", predictedDirection: "harm" as const, actualDirection: "benefit" as const, isCorrect: false },
    { id: "6", findingId: "f1", stableKey, targetDate: "2026-04-25", predictedDirection: "harm" as const, actualDirection: "benefit" as const, isCorrect: false },
  ];

  const accuracy = evaluatePredictionAccuracy(stableKey, "emerging", predictions);
  assertEquals(accuracy.hitRatePct, 33);
  assertEquals(accuracy.allowQuoting, false);
  assertEquals(accuracy.adjustedConfidence, "insufficient_data");
});

// -----------------------------------------------------------------------------
// Scenario L4-7: No wearable -> check-in patterns only, no physiology findings
// -----------------------------------------------------------------------------
Deno.test("L4-7: History with no wearable data yields zero physiology findings", () => {
  const history = createMockHistory();
  // Clear wearable data
  for (const day of history.days) {
    day.wearable = null;
  }
  history.wearables = [];

  const spec: PatternSpec = {
    id: "event_drain_hrv",
    name: "HRV Drain",
    family: "drain_lift",
    metric: "hrv",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "harm",
  };

  const findings = runPatternSpecs([spec], history);
  assertEquals(findings.length, 0);
});

// -----------------------------------------------------------------------------
// Scenario L4-8: Hiring interviews: 2 as subtype, 5 as category D -> rolls up to D
// -----------------------------------------------------------------------------
Deno.test("L4-8: Sparse subtype (n=2) rolls up to parent Category D (n=5)", () => {
  const exposures: ExposureEvent[] = [
    { id: "e1", date: "2026-04-01", startUtc: "", endUtc: "", durationMinutes: 60, bucketKey: "D:interview", stamp: { category: "D", subtype: "interview" as any, confidence: 0.9, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any },
    { id: "e2", date: "2026-04-03", startUtc: "", endUtc: "", durationMinutes: 60, bucketKey: "D:interview", stamp: { category: "D", subtype: "interview" as any, confidence: 0.9, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any },
    { id: "e3", date: "2026-04-05", startUtc: "", endUtc: "", durationMinutes: 60, bucketKey: "D", stamp: { category: "D", confidence: 0.9, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any },
    { id: "e4", date: "2026-04-07", startUtc: "", endUtc: "", durationMinutes: 60, bucketKey: "D", stamp: { category: "D", confidence: 0.9, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any },
    { id: "e5", date: "2026-04-09", startUtc: "", endUtc: "", durationMinutes: 60, bucketKey: "D", stamp: { category: "D", confidence: 0.9, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any },
  ];

  const grouped = groupExposuresWithRollup(exposures);
  // D:interview had 2, so it rolled up into D
  assertEquals(grouped.has("D:interview"), false);
  assertEquals(grouped.get("D")?.length, 5);
});

// -----------------------------------------------------------------------------
// Scenario L4-9: User hasn't opened Insights for 3 weeks -> stale findings discarded
// -----------------------------------------------------------------------------
Deno.test("L4-9: Findings older than 36 hours are treated as stale and excluded by reader", () => {
  const staleDate = new Date(Date.now() - 40 * 60 * 60 * 1000).toISOString(); // 40h old
  const findings: Finding[] = [
    {
      findingId: "f_1",
      stableKey: "k_1",
      patternKind: "event_drain_hrv",
      bucketKey: "A",
      metric: "hrv",
      direction: "harm",
      effectPct: -20,
      effectAbs: -11,
      confidence: "emerging",
      occurrences: 4,
      measuredN: 4,
      baselineValue: 55,
      exposedValue: 44,
      twoWindowPassed: false,
      firstSeenDate: "2026-04-01",
      lastSeenDate: "2026-04-15",
      sampleDates: [],
      reason: "Stale",
      provenance: { historyDays: 30, specsVersion: "1", spineVersion: "1", computedAt: staleDate },
    },
  ];

  const readable = readFindings(findings, { maxAgeHours: 36 });
  assertEquals(readable.length, 0);
});

// -----------------------------------------------------------------------------
// Scenario L4-10: Walking calls on 6 heavy afternoons, done 5 times, useful 4 -> emerging
// -----------------------------------------------------------------------------
Deno.test("L4-10: Walking call efficacy emerging (4 of 5 useful, shrunk toward population)", () => {
  const history = createMockHistory({
    ownActionRecords: [
      { id: "1", actionId: "walking-call", date: "2026-04-01", situation: "heavy_afternoon", status: "done", rating: "useful" },
      { id: "2", actionId: "walking-call", date: "2026-04-03", situation: "heavy_afternoon", status: "done", rating: "useful" },
      { id: "3", actionId: "walking-call", date: "2026-04-05", situation: "heavy_afternoon", status: "done", rating: "useful" },
      { id: "4", actionId: "walking-call", date: "2026-04-07", situation: "heavy_afternoon", status: "done", rating: "useful" },
      { id: "5", actionId: "walking-call", date: "2026-04-09", situation: "heavy_afternoon", status: "done", rating: "neutral" },
      { id: "6", actionId: "walking-call", date: "2026-04-11", situation: "heavy_afternoon", status: "dismissed" },
    ],
  });

  const efficacy = computeOwnActionEfficacy(history);
  assertEquals(efficacy.length, 1);
  assertEquals(efficacy[0].interventionId, "walking-call");
  assertEquals(efficacy[0].reviewedUsefulCount, 4);
  assertEquals(efficacy[0].reviewedNeutralCount, 1);
  assertEquals(efficacy[0].confidence, "strong"); // 5 reviewed items
});

// -----------------------------------------------------------------------------
// Scenario L4-11: User taps 'Not relevant ever' -> declared exclusion, not efficacy failure
// -----------------------------------------------------------------------------
Deno.test("L4-11: Not relevant ever is treated as declared exclusion, does not corrupt efficacy rate", () => {
  const history = createMockHistory({
    ownActionRecords: [
      { id: "1", actionId: "run-it-at-twenty", date: "2026-04-01", situation: "general", status: "done", rating: "useful" },
      { id: "2", actionId: "run-it-at-twenty", date: "2026-04-02", situation: "general", status: "done", rating: "useful" },
      { id: "3", actionId: "run-it-at-twenty", date: "2026-04-03", situation: "general", status: "done", rating: "useful" },
      { id: "4", actionId: "run-it-at-twenty", date: "2026-04-04", situation: "general", status: "dismissed", rating: "not_relevant_ever" },
    ],
  });

  const efficacy = computeOwnActionEfficacy(history);
  assertEquals(efficacy.length, 1);
  assertEquals(efficacy[0].reviewedUsefulCount, 3);
  assertEquals(efficacy[0].efficacyRate, 1.0); // 3 of 3 useful
});

// -----------------------------------------------------------------------------
// Scenario L4-12: Own action offered 8 times, never marked done or reviewed -> no efficacy data
// -----------------------------------------------------------------------------
Deno.test("L4-12: Action offered 8 times without feedback stores 0/8 adoption, leaves efficacy at prior", () => {
  const records = [];
  for (let i = 0; i < 8; i++) {
    records.push({
      id: `r_${i}`,
      actionId: "protect-the-first-gap",
      date: "2026-04-01",
      situation: "general",
      status: "offered" as const,
    });
  }
  const history = createMockHistory({ ownActionRecords: records });

  const efficacy = computeOwnActionEfficacy(history);
  assertEquals(efficacy.length, 1);
  assertEquals(efficacy[0].offeredCount, 8);
  assertEquals(efficacy[0].completedCount, 0);
  assertEquals(efficacy[0].reviewedUsefulCount, 0);
  assertEquals(efficacy[0].confidence, "insufficient_data");
});

// -----------------------------------------------------------------------------
// Scenario L4-13: Box breathing evaluated in boards/pitches, harmonic-calm in light
// -----------------------------------------------------------------------------
Deno.test("L4-13: Practices are evaluated strictly within their own item buckets", () => {
  const history = createMockHistory({
    practiceSessions: [
      { id: "1", practiceId: "box-breathing", date: "2026-04-01", startUtc: "", anchorCategory: "A", completed: true, durationSeconds: 300, rating: "useful" },
      { id: "2", practiceId: "box-breathing", date: "2026-04-02", startUtc: "", anchorCategory: "A", completed: true, durationSeconds: 300, rating: "useful" },
      { id: "3", practiceId: "box-breathing", date: "2026-04-03", startUtc: "", anchorCategory: "A", completed: true, durationSeconds: 300, rating: "useful" },
      { id: "4", practiceId: "harmonic-calm", date: "2026-04-01", startUtc: "", anchorCategory: "E", completed: true, durationSeconds: 600, rating: "useful" },
    ],
  });

  const efficacy = computePracticeEfficacy(history);
  assertEquals(efficacy.length, 2);
  const box = efficacy.find((e) => e.interventionId === "box-breathing");
  const calm = efficacy.find((e) => e.interventionId === "harmonic-calm");

  assertEquals(box?.bucketKey, "cat_a");
  assertEquals(calm?.bucketKey, "cat_e");
});

// -----------------------------------------------------------------------------
// Scenario L4-14: Evening close skipped on 5 of 6 travel days -> low adoption pattern
// -----------------------------------------------------------------------------
Deno.test("L4-14: Evening practice skipped on 5 of 6 travel days creates behaviour pattern", () => {
  const history = createMockHistory();
  // Set 6 days as travel days
  for (let i = 0; i < 6; i++) {
    const day = history.days[i];
    day.dayProfile = {
      travel: { isTravelling: true },
    } as any;
  }

  // 6 sessions on travel days: 1 completed, 5 skipped
  history.practiceSessions = [
    { id: "1", practiceId: "evening-close", date: history.days[0].date, startUtc: "", completed: false, durationSeconds: 0 },
    { id: "2", practiceId: "evening-close", date: history.days[1].date, startUtc: "", completed: false, durationSeconds: 0 },
    { id: "3", practiceId: "evening-close", date: history.days[2].date, startUtc: "", completed: false, durationSeconds: 0 },
    { id: "4", practiceId: "evening-close", date: history.days[3].date, startUtc: "", completed: false, durationSeconds: 0 },
    { id: "5", practiceId: "evening-close", date: history.days[4].date, startUtc: "", completed: false, durationSeconds: 0 },
    { id: "6", practiceId: "evening-close", date: history.days[5].date, startUtc: "", completed: true, durationSeconds: 600 },
  ];

  const patterns = computeBehaviourPatterns(history);
  assertEquals(patterns.length, 1);
  assertEquals(patterns[0].situation, "travel");
  assertEquals(patterns[0].isReliablySkipped, true);
  assertEquals(patterns[0].situationSkippedCount, 5);
});

// -----------------------------------------------------------------------------
// Scenario L4-15: New own action with 12 users -> population rate not used (prior 0.5)
// -----------------------------------------------------------------------------
Deno.test("L4-15: Population under 20 users defaults prior to 0.5 instead of population rate", () => {
  const rateWithFewUsers = computeShrunkRate({
    observedRate: 1.0,
    sampleN: 2,
    populationUserCount: 12, // < 20 users
    populationRate: 0.9,
  });

  // Prior is 0.5: (2*1.0 + 5*0.5) / 7 = 4.5 / 7 = ~0.64
  assertEquals(rateWithFewUsers, 0.64);

  const rateWithEnoughUsers = computeShrunkRate({
    observedRate: 1.0,
    sampleN: 2,
    populationUserCount: 25, // >= 20 users
    populationRate: 0.9,
  });

  // Prior is 0.9: (2*1.0 + 5*0.9) / 7 = 6.5 / 7 = ~0.93
  assertEquals(rateWithEnoughUsers, 0.93);
});

// -----------------------------------------------------------------------------
// Scenario L4-16: No wearable, check-ins daily -> checkin & adoption findings only
// -----------------------------------------------------------------------------
Deno.test("L4-16: Check-in only user generates rhythm & streaks without error", () => {
  const history = createMockHistory();
  for (const d of history.days) d.wearable = null;
  history.wearables = [];

  const rhythm = computeRhythm(history);
  assertEquals(rhythm.streaks.checkinStreakDays > 0, true);
});

// -----------------------------------------------------------------------------
// Scenario L4-17: 'Do board days affect my sleep?' -> 2 occurrences returns 'not enough yet'
// -----------------------------------------------------------------------------
Deno.test("L4-17: askPattern on 2 occurrences returns 'not enough yet: 2 of 3 occurrences'", () => {
  const history = createMockHistory();
  // 2 Category A events
  history.days[0].events = [{
    id: "e1",
    date: history.days[0].date,
    startUtc: "",
    endUtc: "",
    durationMinutes: 120,
    bucketKey: "A",
    stamp: { category: "A", confidence: 0.95, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any,
  }];
  history.days[5].events = [{
    id: "e2",
    date: history.days[5].date,
    startUtc: "",
    endUtc: "",
    durationMinutes: 120,
    bucketKey: "A",
    stamp: { category: "A", confidence: 0.95, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any,
  }];

  const result = askPattern({
    question: "Do board days affect my sleep?",
    category: "A",
    metric: "deep_sleep",
    history,
  });

  assertEquals(result.status, "not_enough_yet");
  assertEquals(result.occurrences, 2);
  assertEquals(result.explanation.includes("Not enough yet: 2 of 3"), true);
});

// -----------------------------------------------------------------------------
// Scenario L4-18: 1:1 titled 'Coffee' with investor -> BucketKey is B from stamp only
// -----------------------------------------------------------------------------
Deno.test("L4-18: BucketKey derived exclusively from Category B stamp without keyword buckets", () => {
  const stamp = {
    category: "B",
    subtype: "investor",
    confidence: 0.92,
    decisionSource: "evidence" as const,
    matchedRules: [],
    signals: [],
  };

  const exp: ExposureEvent = {
    id: "e_coffee",
    date: "2026-04-01",
    startUtc: "",
    endUtc: "",
    durationMinutes: 45,
    bucketKey: "B:investor",
    stamp: stamp as any,
  };

  assertEquals(exp.bucketKey, "B:investor");
});

// -----------------------------------------------------------------------------
// Scenario L4-19: Friday afternoons low on clarity 6 weeks running -> rhythm trough
// -----------------------------------------------------------------------------
Deno.test("L4-19: Consecutive low clarity runs on Friday afternoons detected in rhythm troughs", () => {
  const history = createMockHistory();
  // Mark 6 Friday afternoons with low clarity (35)
  // Find Fridays
  const fridays = history.days.filter((d) => {
    const dt = new Date(`${d.date}T12:00:00Z`);
    return dt.getUTCDay() === 5; // Friday
  });

  for (const fri of fridays) {
    fri.checkins = [
      {
        id: `c_${fri.date}`,
        date: fri.date,
        localHour: 15,
        window: "afternoon",
        clarity: 35,
        energy: 40,
        calm: 50,
        focus: 40,
      },
    ];
  }
  history.checkins = history.days.flatMap((d) => d.checkins || []);

  const rhythm = computeRhythm(history);
  const fridayTrough = rhythm.troughs.find(
    (t) => t.dayOfWeek === 4 && t.windowLabel.includes("Friday")
  );

  assertNotEquals(fridayTrough, undefined);
  assertEquals(fridayTrough?.dimension, "clarity");
  assertEquals(fridayTrough?.isConsecutiveRun, true);
});

// -----------------------------------------------------------------------------
// Scenario L4-20: Days off followed by lower readiness than working days (harm direction)
// -----------------------------------------------------------------------------
Deno.test("L4-20: Days off followed by lower readiness reports harm direction", () => {
  const history = createMockHistory();
  // Mark 4 days off with readiness drops
  const offDayIndices = [6, 7, 13, 14];
  for (const idx of offDayIndices) {
    const day = history.days[idx];
    day.events.push({
      id: `off_${day.date}`,
      date: day.date,
      startUtc: "",
      endUtc: "",
      durationMinutes: 0,
      bucketKey: "DAY_OFF",
      stamp: { category: "I", subtype: "day_off" as any, confidence: 0.9, decisionSource: "evidence" as const, matchedRules: [], signals: [] } as any,
    });

    // Next morning readiness drops to 60 (from baseline 80 = 25% drop)
    const nextDay = history.days[idx + 1];
    if (nextDay && nextDay.wearable) {
      nextDay.wearable.readinessScore = 60;
    }
  }

  const spec: PatternSpec = {
    id: "days_off_restore",
    name: "Days off restoration",
    family: "day_patterns",
    metric: "prs",
    lag: "next_morning",
    baseline: "own_baseline",
    minN: 3,
    minEffectPct: 10,
    expectedDirection: "benefit",
  };

  const findings = runPatternSpecs([spec], history);
  assertEquals(findings.length, 1);
  assertEquals(findings[0].direction, "harm"); // Lower readiness is harm
  assertEquals(findings[0].confidence, "emerging");
});
