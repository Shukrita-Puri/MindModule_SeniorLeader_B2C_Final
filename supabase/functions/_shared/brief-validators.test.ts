import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateBodyFourBeatStructure } from "./brief-validators.ts";

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
    "Your recovery is down, your sleep was short, and the numbers say you're running on reserves today, and that's simply where the week has landed you now.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("WORK DIRECTIVE"));
});

Deno.test("four-beat: rejects body with no closing clause (no coordinator in final sentence)", () => {
  const body =
    "Recovery is down and sleep was short. The read is that today is a reserves day. Protect the first hour for the board deck this morning.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("SELF-REGULATION"));
});

Deno.test("four-beat: rejects body whose closing clause is a whole new beat", () => {
  const body =
    "Recovery is down and sleep was short with the board at 2pm today, so block the first hour for the deck and skip the standup, and then you should take a long slow deep breathing session for twenty minutes before the meeting.";
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
    "Recovery is down hard and sleep was short and your head feels foggy but the 2pm board is still the day, and you need to open it and set the agenda yourself and keep the small calls before then short, and keep the morning quiet so nothing chips at what you have left on the reserves today and tomorrow.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("too long"));
});

Deno.test("four-beat: rejects body with more than three sentences", () => {
  const body =
    "Recovery is down. Sleep was short. Board is at 2pm today so block the first hour and skip the standup. Keep the morning quiet and pace yourself.";
  const r = validateBodyFourBeatStructure(body);
  assertEquals(r.ok, false);
  assert(r.reason?.includes("sentences"));
});