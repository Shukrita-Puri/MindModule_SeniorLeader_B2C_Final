import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateBody,
  validateBodyFourBeatStructure,
  validateNoScoreRestatement,
  validatePhrase,
  validatePillBodyConsistency,
  type PillContext,
} from "./brief-validators.ts";
import type { BriefContext } from "./brief-context.ts";

// Structural four-beat validator tests. Focus is on shape, not phrasing.
// Valid examples are drawn from BODY_FOUR_BEAT_CONTRACT worked examples;
// invalid examples deliberately strip one beat at a time.

Deno.test("four-beat: accepts worked example — strong body, board call", () => {
  const body =
    "Recovery's solid, your head is clear, and the 2pm board is the day — open it and set the agenda yourself, and keep the small calls before then short so you walk in with edge intact.";
  const r = validateBodyFourBeatStructure(body);
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("four-beat: accepts worked example — masked fatigue, investor pitch", () => {
  const body =
    "Your recovery's down hard but you're feeling sharp, and that gap is where big calls slip — run the pitch off the prep and the script, and keep the morning quiet so nothing chips at what you've got left.";
  const r = validateBodyFourBeatStructure(body);
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("four-beat: accepts worked example — Sunday evening, depleted", () => {
  const body =
    "Reserves are low and the late-night pattern's been running for three weeks, with the investor review opening Monday — block the first hour for the deck only, and shut the laptop early tonight so tomorrow doesn't start in deficit.";
  const r = validateBodyFourBeatStructure(body);
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("four-beat: rejects body with no work-directive verb", () => {
  const body =
    "Your recovery is down, your sleep was really short overnight, and the raw numbers now say the week has landed you on a bit of a deficit, and that is simply where things sit for you at this moment in time today.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("WORK DIRECTIVE"));
});

Deno.test("four-beat: rejects generic protective close with no work context", () => {
  const body =
    "Recovery is uneven and the day is carrying pressure, so protect your energy carefully and keep your edge intact so the rest of today stays contained.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("work context"));
});

Deno.test("four-beat: rejects body with no closing clause (no coordinator in final sentence)", () => {
  const body =
    "Recovery is down and sleep was short overnight for you again. The read is that today is a reserves day for the week ahead. Protect the first hour of the morning for the board deck preparation session before it begins.";
  const r = validateBodyFourBeatStructure(body);
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("four-beat: rejects body whose closing clause is a whole new beat", () => {
  const body =
    "Recovery is down and sleep was short with the board at 2pm today, so block the first hour for the deck and skip the standup; protect the hour after with a very deliberate, extremely narrow, highly controlled decompression block that stays fully isolated from everything else.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("too long"));
});

Deno.test("four-beat: rejects body that is too short to carry four beats", () => {
  const body = "Recovery is down. Protect the morning and keep it quiet.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("too short"));
});

Deno.test("four-beat: rejects body that exceeds the 60-word ceiling", () => {
  const body =
    "Recovery is down hard and sleep was really short and your head feels foggy but the 2pm board meeting is still the main event of the day today, and you should open the meeting and set the agenda yourself and also keep the small internal calls before then very short in duration, and keep the morning slot quiet so that nothing chips away at whatever edge you still have left on the reserves for later.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("too long"));
});

Deno.test("four-beat: accepts closing clause with expanded connector set", () => {
  const body =
    "Recovery is uneven and the afternoon is loaded around the board review, so anchor the prep block early and narrow the smaller calls before the room, while the last half hour stays clear for composure.";
  const r = validateBodyFourBeatStructure(body);
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("four-beat: accepts concise grounded body above new 25-word floor", () => {
  const body =
    "Recovery is heavy and the board review anchors the afternoon, so protect the first hour for the deck and keep the late calls narrow and contained today.";
  const r = validateBodyFourBeatStructure(body);
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("four-beat: rejects final sentence without connector or directive-led close", () => {
  const body =
    "Recovery is down and the board review sits in the afternoon, so protect the prep block early and keep the smaller calls tight. It was a long week already.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("SELF-REGULATION"));
});

Deno.test("four-beat: rejects body with more than three sentences", () => {
  const body =
    "Recovery is down. Sleep was short. Board is at 2pm today so block the first hour and skip the standup. Keep the morning quiet and pace yourself.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("sentences"));
});

function makeCtx(overrides: Partial<BriefContext["signals"]> = {}): BriefContext {
  return {
    signals: {
      hrvDeviationPct: null,
      hrvUnusual: false,
      sleepHours: null,
      sleepDeviationPct: null,
      sleepBelow6h: false,
      rhrDeviationPct: null,
      hrElevatedProxy: false,
      emotionalSelfDeclared: null,
      mentalSharpness: null,
      confidence: null,
      timezoneOffsetMinutes: null,
      timezoneShift48hHours: null,
      travelDay: false,
      yesterdayScore: null,
      todayScore: null,
      postPeakWindow: false,
      isHighVisibilityToday: false,
      emotionalDrainEventInNext4h: null,
      highStakesEventInNext24h: null,
      morningWasCompressed: false,
      middayRecoveryDetected: false,
      clarityDropFromTrailingAvg: null,
      ...overrides,
    },
    behaviourFlags: [],
    lexiconClusters: ["cognition"],
    forbiddenWords: [],
    allowedPatternKeywords: [],
  };
}

Deno.test("validateBody: state-quality prose passes without raw number or named event", () => {
  const body =
    "Sleep was short and the body is carrying heavy load into the board run, so protect the first hour for the deck only and keep the smaller calls around it tight so your composure holds in the room.";
  const r = validateBody(body, makeCtx());
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("validateBody: still rejects motivational copy with no grounded signal", () => {
  const body =
    "Move with intention and own the room, so keep the day pointed in the right direction.";
  const r = validateBody(body, makeCtx());
  assertEquals(r.ok, false);
  assert(r.reason !== undefined);
});

Deno.test("validateBody: rejects wearable references when no wearable signal exists", () => {
  const body =
    "Sleep was short and HRV is down, so protect the board prep block and keep the smaller calls narrow so the room gets your best attention.";
  const r = validateBody(body, makeCtx());
  assertEquals(r.ok, false);
  assert(r.reason?.includes("wearable evidence"));
});

Deno.test("validateBody: rejects check-in references when no current check-in exists", () => {
  const body =
    "Clarity has dipped and the investor review anchors the afternoon, so protect the prep block early and keep strategic composure intact in the room.";
  const r = validateBody(
    body,
    makeCtx({
      highStakesEventInNext24h: { title: "Investor Review", minutesUntil: 120 },
    }),
  );
  assertEquals(r.ok, false);
  assert(r.reason?.includes("check-in evidence"));
});

Deno.test("validateBody: allows work-shaped directive without wearable or check-in when grounded in calendar", () => {
  const body =
    "The board review anchors the afternoon and the day is compact, so protect the first prep block and keep the smaller calls narrow so strategic composure holds in the room.";
  const r = validateBody(
    body,
    makeCtx({
      highStakesEventInNext24h: { title: "Board Review", minutesUntil: 180 },
    }),
  );
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("validatePhrase: accepts natural four-word phrase", () => {
  const r = validatePhrase("Front-load the morning");
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("validatePhrase: soft-rejects five-word phrase", () => {
  const r = validatePhrase("Save your edge for later");
  assertEquals(r.ok, false);
  assert(r.reason?.includes("5 words"));
});

// ---------------------------------------------------------------------------
// W3 — Score-restatement validator
// ---------------------------------------------------------------------------

const REJECT_SCORE_PHRASINGS: [string, string][] = [
  ["scoreN/100", "Your readiness came in at 61/100 today, hold the morning."],
  ["N out of 100", "Readiness is 61 out of 100 so pace yourself."],
  ["score of N", "Score of 61 today — protect the deck."],
  ["score is N", "The score is 61 today, so keep the smaller calls tight."],
  ["score is at N", "The score is at 61 today, so keep the small calls narrow."],
  ["score's at N", "The score's at 70 today, so anchor the prep block."],
  ["score sits at N", "The score sits at 61, so protect the room."],
  ["score stands at N", "Score stands at 61, so hold the first hour."],
  ["score reads at N", "Score reads at 61, so protect the deck."],
  ["score came in at N", "Score came in at 61 today, so pace the block."],
  ["readiness is N", "Readiness is 61 today — anchor the review."],
  ["readiness sits at N", "Readiness sits at 61, so keep the calls narrow."],
  ["readiness stands at N", "Readiness stands at 61 today, so front-load the deck."],
  ["readiness score N", "Readiness score 61 today, so protect the block."],
  ["you're at N", "You're at 61 today, so keep the room narrow."],
  ["MRS is N", "MRS is 61 today, so protect the first hour."],
];

for (const [label, body] of REJECT_SCORE_PHRASINGS) {
  Deno.test(`W3 score-restatement: rejects "${label}"`, () => {
    const r = validateNoScoreRestatement(body);
    assertEquals(r.ok, false, `expected rejection for: ${body}`);
  });
}

const ALLOW_NUMERIC_EVIDENCE: [string, string][] = [
  ["HRV in ms", "HRV 61ms is below baseline and the deck is heavy — protect the first hour."],
  ["RHR in bpm", "RHR 61bpm sits high while the review anchors the afternoon."],
  ["sleep score labelled", "Sleep score 61 tonight — keep the smaller calls tight."],
  ["percentage", "Sleep was 61% below your baseline, so anchor the prep block."],
  ["time 2pm", "The 2pm board sits ahead — protect the first hour."],
  ["HH:mm", "The 14:00 board sits ahead — protect the first hour."],
  ["meeting count", "You have 3 meetings back-to-back — anchor the first block."],
];

for (const [label, body] of ALLOW_NUMERIC_EVIDENCE) {
  Deno.test(`W3 score-restatement: allows legitimate numeric evidence — ${label}`, () => {
    const r = validateNoScoreRestatement(body);
    assert(r.ok, `expected ok for: ${body} — reason=${r.reason}`);
  });
}

Deno.test("W3 score-restatement: strict mode rejects bare MRS integer outside legitimate evidence", () => {
  const r = validateNoScoreRestatement(
    "Today lands 61 across the board and the deck is heavy — protect the first hour.",
    { mrsScore: 61 },
  );
  assertEquals(r.ok, false);
});

Deno.test("W3 score-restatement: strict mode allows the same integer inside legitimate evidence", () => {
  const r = validateNoScoreRestatement(
    "HRV 61ms is below baseline and the deck is heavy — protect the first hour.",
    { mrsScore: 61 },
  );
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

// ---------------------------------------------------------------------------
// W3 — Pill/body consistency validator
// ---------------------------------------------------------------------------

function pill(
  dr: PillContext["decisionReadiness"],
  pr: PillContext["physicalReserves"],
  divergence: PillContext["divergence"] = null,
): PillContext {
  return { decisionReadiness: dr, physicalReserves: pr, divergence };
}

Deno.test("W3 pill-consistency: Mind Sharp + Body Steady body accepted", () => {
  const r = validatePillBodyConsistency(
    "The mind is sharp and the body is steady into the board — protect the first hour.",
    pill("green", "green"),
  );
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("W3 pill-consistency: Mind Foggy + Body Strained aligned body accepted", () => {
  const r = validatePillBodyConsistency(
    "The body is strained and the mind is foggy — protect the first hour and skip the standup.",
    pill("red", "red"),
  );
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("W3 pill-consistency: Green DR + 'mind feels spent' rejected without divergence", () => {
  const r = validatePillBodyConsistency(
    "The mind feels spent going into the deck — protect the first hour and pace the calls.",
    pill("green", "green"),
  );
  assertEquals(r.ok, false);
  assert(r.reason?.includes("Decision Readiness"));
});

Deno.test("W3 pill-consistency: Green DR + 'mind feels spent' accepted WITH structural divergence", () => {
  const r = validatePillBodyConsistency(
    "Your mind feels spent but the wearable disagrees — protect the first hour and pace the calls.",
    pill("green", "green", {
      exists: true,
      dimension: "decision_readiness",
      checkinDirection: "negative",
      objectiveDirection: "positive",
    }),
  );
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("W3 pill-consistency: Red DR + 'mentally sharp' rejected", () => {
  const r = validatePillBodyConsistency(
    "The mind is sharp into the board today — protect the first hour and skip the standup.",
    pill("red", "green"),
  );
  assertEquals(r.ok, false);
  assert(r.reason?.includes("Decision Readiness"));
});

Deno.test("W3 pill-consistency: Red PR + 'body is rested' rejected without divergence", () => {
  const r = validatePillBodyConsistency(
    "The body is rested and the board sits ahead — protect the first hour and pace the calls.",
    pill("green", "red"),
  );
  assertEquals(r.ok, false);
  assert(r.reason?.includes("Physical Reserves"));
});

Deno.test("W3 pill-consistency: Green PR + 'body is strained' rejected without divergence", () => {
  const r = validatePillBodyConsistency(
    "The body is strained into the board — protect the first hour and pace the calls today.",
    pill("green", "green"),
  );
  assertEquals(r.ok, false);
  assert(r.reason?.includes("Physical Reserves"));
});

Deno.test("W3 pill-consistency: Green PR + 'body is strained' accepted with 'despite' framing", () => {
  const r = validatePillBodyConsistency(
    "Despite the check-in reading tired, the body is strained on paper only — protect the first hour.",
    pill("green", "green"),
  );
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("W3 pill-consistency: Unread DR + 'mentally sharp' rejected", () => {
  const r = validatePillBodyConsistency(
    "The mind is sharp today into the deck — protect the first hour and pace the calls carefully.",
    pill("neutral", "green"),
  );
  assertEquals(r.ok, false);
  assert(r.reason?.includes("Unread"));
});

Deno.test("W3 pill-consistency: null pillContext is a no-op (backward compat)", () => {
  const r = validatePillBodyConsistency("anything at all", null);
  assert(r.ok);
});
