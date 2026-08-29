// Generic (non-narrative) deterministic-brief invariants.
//
// The narrative contract tests in personas/ceo/behaviour-copy.contract.test.ts
// only exercise NARRATIVE_COPY. This file asserts the same three copy rules on
// the generic branch (leadNarrative: null), which is the branch that runs on
// the most common LLM-failure path.

import {
  buildDeterministicBriefFallback,
  type DeterministicBriefBand,
  type DeterministicBriefFallbackOpts,
} from "./deterministic-brief.ts";

const WINDOWS: Array<"morning" | "afternoon" | "evening"> = [
  "morning",
  "afternoon",
  "evening",
];
const BANDS: DeterministicBriefBand[] = [
  "firing",
  "sharp",
  "steady",
  "stretched",
  "depleted",
];

function opts(
  window: typeof WINDOWS[number],
  band: DeterministicBriefBand,
  over: Partial<DeterministicBriefFallbackOpts> = {},
): DeterministicBriefFallbackOpts {
  return {
    band,
    hasWearable: true,
    hasCurrentWearable: true,
    hasCurrentCheckIn: true,
    checkInOutcome: band === "depleted" ? "drained" : "holding",
    cognitivePillTier: band === "depleted" ? "red" : "green",
    physicalPillTier: band === "depleted" ? "red" : "green",
    wearableFact: window === "morning" ? "Recovery is in its usual range" : null,
    window,
    todayHighStakes: ["the board call"],
    highStakesTiming: [{ title: "the board call", minutesUntil: 45 }],
    calendarLoad: "medium",
    meetingCount: 5,
    remainingMeetings: 2,
    // Short sleep: the morning-only gate is what must suppress it later on.
    sleepScore: 48,
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
    variantSeed: `test|2026-08-29|${window}`,
    ...over,
  };
}

function bodies(
  over: Partial<DeterministicBriefFallbackOpts> = {},
): Array<{ window: string; band: string; body: string; phrase: string }> {
  const out: Array<{ window: string; band: string; body: string; phrase: string }> = [];
  for (const window of WINDOWS) {
    for (const band of BANDS) {
      const r = buildDeterministicBriefFallback(opts(window, band, over));
      if (!r) continue;
      out.push({ window, band, body: r.body, phrase: r.phrase });
    }
  }
  return out;
}

Deno.test("generic branch: no '<event> ahead' construction", () => {
  for (const { window, band, body } of bodies()) {
    if (/\b(call|flight|keynote|conference|1:1|session)\s+ahead\b/i.test(body)) {
      throw new Error(`${window}/${band} kept the 'ahead' suffix: ${body}`);
    }
  }
  // Travel shape used to be the only producer of the construction.
  for (
    const { window, band, body } of bodies({
      dayShape: "work_travel",
      travelPhase: "pre",
      travelEventTitle: "Flight to New York",
      hasWearable: false,
      hasCurrentWearable: false,
      wearableFact: null,
    })
  ) {
    if (/\bflight ahead\b/i.test(body)) {
      throw new Error(`${window}/${band} travel kept the 'ahead' suffix: ${body}`);
    }
  }
});

Deno.test("generic branch: overnight sleep never speaks after the morning", () => {
  for (const { window, band, body } of bodies()) {
    if (window === "morning") continue;
    if (/sleep ran short|last night|overnight/i.test(body)) {
      throw new Error(`${window}/${band} quoted an overnight signal: ${body}`);
    }
  }
});

Deno.test("generic branch: the anchor's timing clause is spent at most once", () => {
  for (const { window, band, body } of bodies()) {
    const hits = body.match(/in 45 minutes/g)?.length ?? 0;
    if (hits > 1) {
      throw new Error(`${window}/${band} repeated the timing clause: ${body}`);
    }
  }
});

Deno.test("generic branch: no forward-looking day framing in the evening", () => {
  for (
    const { window, band, body } of bodies({
      todayHighStakes: [],
      highStakesTiming: [],
      calendarLoad: null,
      meetingCount: 0,
      remainingMeetings: 0,
    })
  ) {
    if (window !== "evening") continue;
    if (/day ahead|open working day ahead/i.test(body)) {
      throw new Error(`${window}/${band} looked forward into a day that has run: ${body}`);
    }
  }
});

Deno.test("generic branch: window context drives the meeting count", () => {
  const withCtx = buildDeterministicBriefFallback(
    opts("afternoon", "steady", {
      todayHighStakes: [],
      highStakesTiming: [],
      remainingMeetings: 9,
      meetingCount: 9,
      windowContext: {
        window: "afternoon",
        meetingsCompleted: 4,
        highestCompletedCategory: null,
        meetingsRemaining: 2,
        highestRemainingStakes: null,
        backToBackRemainingHours: 0,
        availableGapsRemaining: 2,
        currentHrVsRestingPct: null,
        decisionLeakageRisk: false,
        jitEventsRemaining: 0,
        planPriorityOneTitle: null,
        planPriorityOneCompleted: false,
      },
    }),
  );
  if (!withCtx) throw new Error("no deterministic body");
  if (/\b9 meetings\b/.test(withCtx.body)) {
    throw new Error(`window context ignored: ${withCtx.body}`);
  }
});
