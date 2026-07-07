/**
 * Regression tests for the safe-loosening changes applied to the live
 * Brief validator (`validateV61Output`) inside
 * `supabase/functions/compute-outer-readiness/index.ts`.
 *
 * The live validator is an INLINE closure over request-scoped state
 * (todayHighStakes, materialTravelContextActive, calendarLoad, bandValence,
 * etc.), so extracting it wholesale is not safe for this stabilization
 * pass. These tests instead mirror the exact regex constants + branch
 * logic that the loosening changes touched, and assert the intended
 * acceptance / rejection behaviour. If the live constants drift, these
 * tests must be updated in lockstep — treat this file as an executable
 * specification of the loosened rules.
 *
 * Source-of-truth line refs (as of this commit):
 *   - STATE_QUALITY_WORDS               ~ index.ts:4556
 *   - LEXICON_EXECUTIVE_CONTEXT         ~ index.ts:4553
 *   - Phrase length gate (2-4 ok / 5 soft / 6+ hard) ~ index.ts:4573-4580
 *   - leanOn/watchFor SOURCE whitelist (ARCHETYPE|COACH|PATTERN|GOALS)
 *                                        ~ index.ts:~4767
 *   - body_no_signal_evidence acceptance ~ index.ts:4693-4700
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// -- Mirrored constants (keep in sync with index.ts) -------------------------
const STATE_QUALITY_WORDS = /\b(recovery|sleep|rested|fatigued|sharp|foggy|drained|steady|compressed|elevated|shifted|heavy|light|loaded)\b/i;
const LEXICON_COGNITION = /\b(intelligence|cognition|decision power|strategic accuracy|mental bandwidth|processing capacity|solving logic|sharpness|sharp|clarity)\b/i;
const LEXICON_PHYSIOLOGY = /\b(physiology|operational drive|leadership stamina|physical recovery|physical runway|stamina|drive|restoration|restore|recover|recovery|heart rate|pulse|prepare|preparation|body)\b/i;
const LEXICON_RESILIENCE = /\b(resilience|stability|strategic composure|executive presence|diplomatic shield|reactive risk|internal buffer|composure|buffer|release)\b/i;
const LEXICON_EXECUTIVE_CONTEXT = /\b(conference|summit|board|pitch|negotiation|travel|landing|back[- ]to[- ]back|compressed|decisions?|density|re[- ]?entry|offsite|speaking|presentation|high[- ]stakes|governance)\b/i;
const LEGACY_DATA_REF = /\b(HRV|RHR|HR|bpm|hrs?|hours?|sleep|baseline|pattern|streak|consecutive|archetype|goal|coach|meetings?|calendar|clarity|confidence|composure|sharpness|energy)\b/i;

const ALLOWED_SOURCES = ["ARCHETYPE", "COACH", "PATTERN", "GOALS"];

function phraseGate(phrase: string, opts: { strict?: boolean } = {}):
  { valid: boolean; softReject?: boolean; reason?: string } {
  const words = phrase.trim().replace(/[.!?,;:]/g, "").split(/\s+/).filter(Boolean);
  if (words.length >= 6) return { valid: false, reason: `phrase_hard_reject_${words.length}w` };
  if (words.length === 5 && !opts.strict) {
    return { valid: false, softReject: true, reason: "phrase_soft_reject_5w" };
  }
  return { valid: true };
}

function bodySignalEvidence(body: string, opts: {
  todayHighStakes?: string[];
  calendarEmpty?: boolean;
}): { valid: boolean; reason?: string } {
  const stripped = body.replace(/<[^>]+>/g, "");
  const hasNumberOrEvent = /\d/.test(stripped) ||
    (opts.todayHighStakes ?? []).some((e) =>
      stripped.toLowerCase().includes(e.trim().toLowerCase().slice(0, 12)),
    );
  const baselineOK = opts.calendarEmpty === true;
  if (!hasNumberOrEvent && !baselineOK) {
    const hasLegacy = LEGACY_DATA_REF.test(stripped);
    const hasStateQuality = STATE_QUALITY_WORDS.test(stripped);
    if (!hasLegacy && !hasStateQuality) {
      return { valid: false, reason: "body_no_signal_evidence" };
    }
  }
  return { valid: true };
}

function bodyLexiconGate(body: string): { valid: boolean; reason?: string } {
  const s = body.replace(/<[^>]+>/g, "");
  const ok = LEXICON_COGNITION.test(s) || LEXICON_PHYSIOLOGY.test(s) ||
    LEXICON_RESILIENCE.test(s) || LEXICON_EXECUTIVE_CONTEXT.test(s);
  return ok ? { valid: true } : { valid: false, reason: "body_no_lexicon_cluster" };
}

// -- Tests -------------------------------------------------------------------

Deno.test("state-quality prose passes body_no_signal_evidence (no raw numbers)", () => {
  const body = "Recovery was short and the afternoon reads heavy; hold the frame.";
  const r = bodySignalEvidence(body, { todayHighStakes: [], calendarEmpty: false });
  assert(r.valid, `expected pass, got: ${r.reason}`);
});

Deno.test("body with neither number, event, legacy data-ref, nor state-quality fails", () => {
  const body = "Move with intention and own the room.";
  const r = bodySignalEvidence(body, { todayHighStakes: [], calendarEmpty: false });
  assertEquals(r.valid, false);
  assertEquals(r.reason, "body_no_signal_evidence");
});

Deno.test("4-word phrase is accepted", () => {
  assertEquals(phraseGate("Body reads heavy today").valid, true);
});

Deno.test("2-word phrase is accepted", () => {
  assertEquals(phraseGate("Baseline day.").valid, true);
});

Deno.test("5-word phrase soft-rejects on first pass", () => {
  const r = phraseGate("The board day feels heavy");
  assertEquals(r.valid, false);
  assertEquals(r.softReject, true);
  assertEquals(r.reason, "phrase_soft_reject_5w");
});

Deno.test("5-word phrase accepted when strict retry", () => {
  const r = phraseGate("The board day feels heavy", { strict: true });
  assertEquals(r.valid, true);
});

Deno.test("6-word phrase hard-rejects", () => {
  const r = phraseGate("The board day feels really heavy");
  assertEquals(r.valid, false);
  assertEquals(r.softReject, undefined);
  assert(r.reason?.startsWith("phrase_hard_reject_"));
});

Deno.test("GOALS is an accepted leanOn/watchFor source", () => {
  for (const src of ["ARCHETYPE", "COACH", "PATTERN", "GOALS"]) {
    assert(ALLOWED_SOURCES.includes(src), `${src} should be allowed`);
  }
});

Deno.test("DATA and CHECK-IN remain rejected sources", () => {
  assert(!ALLOWED_SOURCES.includes("DATA"));
  assert(!ALLOWED_SOURCES.includes("CHECK-IN"));
});

Deno.test("board reference satisfies lexicon gate", () => {
  assertEquals(bodyLexiconGate("Board day sits at 11 and the run-up is quiet.").valid, true);
});

Deno.test("conference reference satisfies lexicon gate", () => {
  assertEquals(bodyLexiconGate("Conference opens tomorrow; the arc is long.").valid, true);
});

Deno.test("travel reference satisfies lexicon gate", () => {
  assertEquals(bodyLexiconGate("Travel lands at 9 and the day compresses after.").valid, true);
});

Deno.test("high-stakes reference satisfies lexicon gate", () => {
  assertEquals(bodyLexiconGate("High-stakes call at noon; posture matters more than pace.").valid, true);
});

Deno.test("prose with no lexicon cluster fails lexicon gate", () => {
  const r = bodyLexiconGate("Hold the frame and pick your battles.");
  assertEquals(r.valid, false);
  assertEquals(r.reason, "body_no_lexicon_cluster");
});
