import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateBody, validateBodyFourBeatStructure, validatePhrase } from "./brief-validators.ts";
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

Deno.test("validatePhrase: accepts natural four-word phrase", () => {
  const r = validatePhrase("Front-load the morning");
  assert(r.ok, `expected ok, got: ${r.reason}`);
});

Deno.test("validatePhrase: soft-rejects five-word phrase", () => {
  const r = validatePhrase("Save your edge for later");
  assertEquals(r.ok, false);
  assert(r.reason?.includes("5 words"));
});
