// Tier-1 pattern evidence in the deterministic Brief.
//
// Contract under test:
//   A–H decides WHICH event the brief is about. Pattern evidence decides HOW
//   SPECIFICALLY that event is described. Evidence never reorders subjects.
//
// Timeframes are fixed per family and never mixed in one sentence:
//   hr_event_lift -> "during"; event_to_rhr / event_to_hrv -> "the morning after".

import {
  buildDeterministicBriefFallback,
  type DeterministicBriefFallbackOpts,
  type DeterministicCausalityData,
} from "./deterministic-brief.ts";

function opts(
  over: Partial<DeterministicBriefFallbackOpts> = {},
): DeterministicBriefFallbackOpts {
  return {
    band: "steady",
    hasWearable: true,
    hasCurrentWearable: true,
    hasCurrentCheckIn: true,
    checkInOutcome: "holding",
    cognitivePillTier: "green",
    physicalPillTier: "green",
    wearableFact: "Recovery is in its usual range",
    window: "morning",
    todayHighStakes: ["Q3 Board Review"],
    highStakesTiming: [{ title: "Q3 Board Review", minutesUntil: 45 }],
    calendarLoad: "medium",
    meetingCount: 5,
    remainingMeetings: 2,
    sleepScore: 72,
    hasBackToBack: false,
    isWeekend: false,
    isNonWorkday: false,
    dayShape: null,
    travelPhase: null,
    longHaulFlight: false,
    conferenceDayNumber: null,
    conferenceTitle: null,
    travelEventTitle: null,
    ceoFlags: [],
    leadNarrative: null,
    variantSeed: "test|2026-08-30|morning",
    ...over,
  } as DeterministicBriefFallbackOpts;
}

function body(over: Partial<DeterministicBriefFallbackOpts> = {}): string {
  const r = buildDeterministicBriefFallback(opts(over));
  if (!r) throw new Error("no deterministic brief produced");
  return r.body;
}

const BOARD = "Board / governance";

const HR: DeterministicCausalityData = {
  performance_lift: {
    hr_event_lift: [
      { bucket: BOARD, categoryName: BOARD, hrDeltaBpm: 14, n: 3, confidence: "strong" },
    ],
  },
};
const RHR: DeterministicCausalityData = {
  event_to_rhr: [
    { event_type: BOARD, n: 4, rhrDeltaPct: 11, confidence: "strong" },
  ],
};
const HRV: DeterministicCausalityData = {
  event_to_hrv: [
    { event_type: BOARD, n: 4, hrvDeltaPct: -20, confidence: "strong" },
  ],
};
const COG: DeterministicCausalityData = {
  event_to_cognition: [
    { event_type: BOARD, dim: "clarity", tierDelta: -0.8, n: 4, confidence: "emerging" },
  ],
};
const LOAD: DeterministicCausalityData = {
  consecutive_load: { tailDeltaPct: -11, n: 5, confidence: "emerging" },
};
const SLEEP: DeterministicCausalityData = {
  sleep_to_prs: { lowSleepPrsDeltaPct: -14, n: 6, confidence: "strong" },
};
const LIFT: DeterministicCausalityData = {
  performance_lift: {
    category_lift: [{ categoryName: BOARD, compositeLift: 12, n: 4, confidence: "strong" }],
  },
};

// ── One fixture per family ──────────────────────────────────────────────────

Deno.test("hr_event_lift speaks in-event, never morning-after", () => {
  const b = body({ causalityData: HR });
  if (!/during/i.test(b)) throw new Error(`HR lost the in-event framing: ${b}`);
  if (/morning after/i.test(b)) throw new Error(`HR mixed timeframes: ${b}`);
  if (!/14 bpm/.test(b)) throw new Error(`HR lost its measured delta: ${b}`);
});

Deno.test("event_to_rhr speaks the morning after, never during", () => {
  const b = body({ causalityData: RHR });
  if (!/mornings? after/i.test(b)) throw new Error(`RHR lost the framing: ${b}`);
  if (/\bduring\b/i.test(b)) throw new Error(`RHR mixed timeframes: ${b}`);
  if (!/11%/.test(b)) throw new Error(`RHR lost its measured delta: ${b}`);
});

Deno.test("event_to_hrv speaks the morning after, never during", () => {
  const b = body({ causalityData: HRV });
  if (!/morning after/i.test(b)) throw new Error(`HRV lost the framing: ${b}`);
  if (/\bduring\b/i.test(b)) throw new Error(`HRV mixed timeframes: ${b}`);
  if (!/20%/.test(b)) throw new Error(`HRV lost its measured delta: ${b}`);
});

Deno.test("event_to_cognition cites n and the dimension", () => {
  const b = body({ causalityData: COG });
  if (!/clarity/i.test(b)) throw new Error(`cognition lost the dimension: ${b}`);
  if (!/\b4\b/.test(b)) throw new Error(`cognition lost n: ${b}`);
});

Deno.test("consecutive_load and sleep_to_prs and category_lift each produce evidence", () => {
  const load = body({ causalityData: LOAD });
  if (!/two heavy days/i.test(load)) throw new Error(`load pattern missing: ${load}`);

  const sleep = body({ causalityData: SLEEP, sleepScore: 48 });
  if (!/short-sleep/i.test(sleep)) throw new Error(`sleep pattern missing: ${sleep}`);

  const lift = body({ causalityData: LIFT });
  if (!/come in best/i.test(lift)) throw new Error(`lift pattern missing: ${lift}`);
});

Deno.test("overnight sleep pattern never speaks outside the morning", () => {
  for (const window of ["afternoon", "evening"] as const) {
    const b = body({
      causalityData: SLEEP,
      sleepScore: 48,
      window,
      variantSeed: `test|2026-08-30|${window}`,
    });
    if (/short-sleep/i.test(b)) {
      throw new Error(`${window} quoted an overnight pattern: ${b}`);
    }
  }
});

// ── No-match fallthrough ────────────────────────────────────────────────────

Deno.test("a pattern for an event type not on today's calendar stays silent", () => {
  const unrelated: DeterministicCausalityData = {
    event_to_rhr: [
      { event_type: "Conferences & external events", n: 5, rhrDeltaPct: 18 },
    ],
  };
  const b = body({ causalityData: unrelated });
  if (/conference/i.test(b)) {
    throw new Error(`named an unmatched event type: ${b}`);
  }
  if (b !== body({ causalityData: null })) {
    throw new Error(`no-match path diverged from the null path: ${b}`);
  }
});

// ── Null-data identity ──────────────────────────────────────────────────────

Deno.test("null causality data leaves output byte-identical", () => {
  for (const window of ["morning", "afternoon", "evening"] as const) {
    const base = body({ window, variantSeed: `test|2026-08-30|${window}` });
    const withNull = body({
      window,
      causalityData: null,
      variantSeed: `test|2026-08-30|${window}`,
    });
    if (base !== withNull) {
      throw new Error(`${window} diverged with explicit null: ${withNull}`);
    }
  }
});

// ── Subject stability: the important one ────────────────────────────────────

Deno.test("pattern data never changes WHICH subject is named", () => {
  const cases: Array<
    { name: string; over: Partial<DeterministicBriefFallbackOpts>; subject: RegExp }
  > = [
    {
      name: "travel day",
      over: {
        dayShape: "work_travel",
        travelPhase: "pre",
        travelEventTitle: "Flight to New York",
      },
      subject: /new york|flight/i,
    },
    {
      name: "conference day",
      over: {
        dayShape: "conference",
        conferenceDayNumber: 2,
        conferenceTitle: "SaaStr Annual",
      },
      subject: /conference/i,
    },
    {
      name: "plain high-stakes day",
      over: {},
      subject: /board/i,
    },
  ];

  const datasets: Array<DeterministicCausalityData | null> = [
    null,
    HR,
    RHR,
    HRV,
    COG,
    LOAD,
    LIFT,
  ];

  for (const c of cases) {
    for (const causalityData of datasets) {
      const b = body({ ...c.over, causalityData });
      if (!c.subject.test(b)) {
        throw new Error(
          `${c.name}: subject changed when pattern data was added: ${b}`,
        );
      }
    }
  }
});
