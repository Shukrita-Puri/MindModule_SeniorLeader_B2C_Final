// OWNERSHIP: engineering. §5.1 / §5.2 validators for the Decision Readiness
// Brief. Pure functions over text + BriefContext. The Atomic Brief Contract
// is preserved: callers retry-once-then-fallback on rejection.

import type { BriefContext } from "./brief-context.ts";
import {
  detectCluster,
  findForbiddenWord,
  mentionsPattern,
} from "./copy-vocabulary.ts";

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

const PHRASE_FORBIDDEN_STARTERS = ["you", "your", "the"];
const COACHING_IMPERATIVES = ["try", "consider", "should", "you should", "you need"];

/** §5.1 Phrase validator. */
export function validatePhrase(phrase: string): ValidationResult {
  const trimmed = phrase.trim();
  if (!trimmed) return { ok: false, reason: "empty phrase" };

  const words = trimmed.split(/\s+/);
  if (words.length >= 6) return { ok: false, reason: `phrase too long (${words.length} words, hard reject ≥6)` };
  if (words.length === 5) return { ok: false, reason: "phrase is 5 words — soft reject, retry with stricter instruction" };

  const firstLower = words[0].toLowerCase().replace(/[^a-z]/g, "");
  if (PHRASE_FORBIDDEN_STARTERS.includes(firstLower)) {
    return { ok: false, reason: `phrase starts with forbidden word "${words[0]}"` };
  }

  const lower = trimmed.toLowerCase();
  for (const verb of COACHING_IMPERATIVES) {
    const re = new RegExp(`\\b${verb}\\b`, "i");
    if (re.test(lower)) return { ok: false, reason: `phrase contains coaching imperative "${verb}"` };
  }

  const forbidden = findForbiddenWord(trimmed);
  if (forbidden) return { ok: false, reason: `phrase contains forbidden word "${forbidden}"` };

  return { ok: true };
}

const NUMBER_OR_TIME_RE = /(\d+\s*(?:%|bpm|h(?:rs?)?|min|ms|\/\d+)|\d{1,2}:\d{2}|\b\d{1,2}\s*(?:am|pm)\b)/i;
const LEGACY_DATA_REF_RE = /\b(HRV|RHR|HR|bpm|hrs?|hours?|sleep|baseline|pattern|streak|consecutive|archetype|goal|coach|meetings?|calendar|clarity|confidence|composure|sharpness|energy)\b/i;
const STATE_QUALITY_WORDS_RE = /\b(recovery|sleep|rested|fatigued|sharp|foggy|drained|steady|compressed|elevated|shifted|heavy|light|loaded)\b/i;

// -----------------------------------------------------------------------------
// §5.2a Four-beat structural validator.
//
// The Body prompt (BODY_FOUR_BEAT_CONTRACT in _shared/brief/copy-vocabulary.ts)
// asks the LLM to weave FOUR beats into 1–3 sentences, 45–60 words total:
//   (a) EVIDENCE               — 2–3 named inputs across sources.
//   (b) THE READ               — the judgment those inputs add up to.
//   (c) THE WORK DIRECTIVE     — a work-facing mental approach for today.
//   (d) SELF-REGULATION CLOSE  — a short 3–6 word closing clause ("…and X.").
//
// We can't reliably tag each beat by prose parsing, but we CAN enforce the
// structural fingerprint the four beats leave behind, without over-fitting to
// any specific phrasing:
//   • Body is 1–3 sentences and 25–60 words (band around the 45–60 target,
//     with a lower floor to avoid rejecting concise but grounded bodies).
//   • Body contains at least one work-directive verb (beat c).
//   • Body ends with either a short closing clause introduced by a coordinator
//     ("and", "so", "then", "but", "while", "before", "after", "until",
//     ";", or an em-dash) OR a final directive sentence carrying a short
//     2–12 word protective close (beat d).
// Evidence (beat a) is already gated by validateBody via NUMBER_OR_TIME_RE /
// named event / calendarEmpty. The Read (beat b) has no reliable structural
// signature, so it is intentionally left to prompt discipline.
// -----------------------------------------------------------------------------

// Deliberately broad lexicon of work-facing directive tokens. We do NOT try to
// enumerate every valid verb — one match is enough to prove a directive beat
// exists. Wellness / therapeutic verbs are intentionally absent (those are
// caught by the forbidden-word gate above).
//
// WHY BROAD (not tightened further):
//   • The Atomic Brief Contract retries once, then falls through to
//     `awaiting`. A false-negative here blanks the dashboard for a valid
//     brief, which is worse than a false-positive that lets a slightly weak
//     directive through (still caught by lexicon + evidence gates above).
//   • Common tokens like "keep", "take", "make", "back", "stay", "use"
//     appear in genuine work directives ("keep answers narrow", "take the
//     meeting cleanly", "make one call before the block"). Removing them
//     rejects legitimate briefs; keeping them at worst passes a weak one.
//   • Structural gates before this (sentence count, word band, evidence
//     anchor, forbidden-word list, lexicon cluster) already exclude the
//     most common failure modes.
// If we ever tighten this, do it by ADDING a stricter secondary check (e.g.
// verb-in-imperative-position), not by shrinking this list.
const WORK_DIRECTIVE_TOKENS = [
  "lead", "open", "set", "run", "block", "front-load", "front load",
  "reserve", "protect", "save", "pick", "pace", "hold", "keep", "execute",
  "skip", "cut", "push", "use", "spend", "shape", "back", "close",
  "guard", "narrow", "focus", "prioritise", "prioritize", "own",
  "ship", "drive", "defer", "stay", "walk in", "lean on", "carry",
  "shut", "make", "take", "deploy", "lean", "anchor", "ground", "signal",
];

const WORK_CONTEXT_TOKENS = [
  "board", "meeting", "meetings", "call", "calls", "review", "room",
  "agenda", "deck", "prep", "brief", "decision", "decisions", "calendar",
  "investor", "town hall", "stakeholder", "presentation", "team", "1:1",
  "block", "window", "afternoon", "morning", "handoff", "strategy",
  "interview", "negotiation", "client", "work", "priority", "priorities",
];

const CLOSING_CONNECTOR_RE = /\b(and|so|then|but|while|before|after|until)\b|[;—]/gi;

const WEARABLE_REFERENCE_RE = /\b(HRV|RHR|resting heart rate|heart rate|ms\b|bpm\b|baseline)\b|(?:sleep\s+\d)|(?:\d+(?:\.\d+)?\s*h(?:ours?)?\b)|(?:\d+(?:\.\d+)?\s*hrs?\b)/i;
const BODY_RECOVERY_ASSERTION_RE = /\b(body|physiology|system)\s+(?:is|looks|reads|stays|feels)?\s*(?:recovered|rested|ready|under-recovered|loaded|strained)\b/i;
const CHECKIN_REFERENCE_RE = /\b(check-?in|mental energy|felt state|self-declared|clarity|confidence|sharpness|mentally sharp|you reported|you said)\b/i;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * §5.2a Body four-beat structural validator. Structural only — does NOT
 * enforce any single phrasing style. Returns ok:true when the body carries
 * the fingerprint of the four beats; otherwise a short reason.
 */
export function validateBodyFourBeatStructure(body: string): ValidationResult {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, reason: "empty body" };

  const sentences = splitSentences(trimmed);
  if (sentences.length < 1 || sentences.length > 3) {
    return {
      ok: false,
      reason: `body has ${sentences.length} sentences (four-beat contract expects 1–3)`,
    };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  if (wordCount < 25) {
    return {
      ok: false,
      reason: `body too short (${wordCount} words) — cannot carry four beats`,
    };
  }
  if (wordCount > 60) {
    return {
      ok: false,
      reason: `body too long (${wordCount} words) — exceeds 60-word ceiling`,
    };
  }

  // (c) WORK DIRECTIVE beat — must contain at least one directive token.
  const lower = trimmed.toLowerCase();
  const hasDirective = WORK_DIRECTIVE_TOKENS.some((tok) => {
    const pattern = tok.includes(" ")
      ? `\\b${tok.replace(/\s+/g, "\\s+")}\\b`
      : `\\b${tok}\\b`;
    return new RegExp(pattern, "i").test(lower);
  });
  if (!hasDirective) {
    return {
      ok: false,
      reason: "body missing WORK DIRECTIVE beat (no work-facing directive verb)",
    };
  }

  // Directive must be work-shaped, not a generic wellness/protective line.
  const hasWorkContext = WORK_CONTEXT_TOKENS.some((tok) => {
    const pattern = tok.includes(" ")
      ? `\\b${tok.replace(/\s+/g, "\\s+")}\\b`
      : `\\b${tok}\\b`;
    return new RegExp(pattern, "i").test(lower);
  });
  if (!hasWorkContext) {
    return {
      ok: false,
      reason: "body missing WORK DIRECTIVE beat (directive is not tied to a work context)",
    };
  }

  // (d) SELF-REGULATION closing clause — accept either:
  //   1) a short tail after the last coordinator inside the final sentence, or
  //   2) a short final sentence that is itself a directive close.
  const lastSentence = sentences[sentences.length - 1];
  const connectors = [...lastSentence.matchAll(CLOSING_CONNECTOR_RE)];
  let closingWords = 0;
  if (connectors.length > 0) {
    const lastConn = connectors[connectors.length - 1];
    const connIdx = lastConn.index ?? 0;
    const tail = lastSentence
      .slice(connIdx + lastConn[0].length)
      .replace(/[.!?]+$/g, "")
      .trim();
    closingWords = tail.split(/\s+/).filter(Boolean).length;
  } else {
    closingWords = lastSentence.replace(/[.!?]+$/g, "").trim().split(/\s+/).filter(Boolean).length;
    const startsWithDirective = WORK_DIRECTIVE_TOKENS.some((tok) => {
      const pattern = tok.includes(" ")
        ? `^${tok.replace(/\s+/g, "\\s+")}\\b`
        : `^${tok}\\b`;
      return new RegExp(pattern, "i").test(lastSentence.trim().toLowerCase());
    });
    if (!startsWithDirective) {
      return {
        ok: false,
        reason:
          "body missing SELF-REGULATION closing clause (final sentence needs a connector or a directive-led protective close)",
      };
    }
  }
  if (closingWords < 2) {
    return { ok: false, reason: "body SELF-REGULATION closing clause too short" };
  }
  if (closingWords > 12) {
    return {
      ok: false,
      reason: `body SELF-REGULATION closing clause too long (${closingWords} words) — should be a short exhale, not a new beat`,
    };
  }

  return { ok: true };
}

function validateBodyDataAvailability(body: string, ctx: BriefContext): ValidationResult {
  const hasWearableSignal =
    ctx.signals.hrvDeviationPct != null ||
    ctx.signals.sleepHours != null ||
    ctx.signals.sleepDeviationPct != null ||
    ctx.signals.rhrDeviationPct != null ||
    ctx.signals.hrElevatedProxy === true;
  const hasCheckInSignal =
    ctx.signals.emotionalSelfDeclared != null ||
    ctx.signals.mentalSharpness != null ||
    ctx.signals.confidence != null;

  if (!hasWearableSignal) {
    if (WEARABLE_REFERENCE_RE.test(body)) {
      return {
        ok: false,
        reason: "body references wearable evidence when no wearable signal exists",
      };
    }
    if (BODY_RECOVERY_ASSERTION_RE.test(body)) {
      return {
        ok: false,
        reason: "body asserts physiological recovery when wearable signal is missing",
      };
    }
  }

  if (!hasCheckInSignal && CHECKIN_REFERENCE_RE.test(body)) {
    return {
      ok: false,
      reason: "body references check-in evidence when no current check-in exists",
    };
  }

  return { ok: true };
}

/** §5.2 Body validator. Requires lexicon cluster + named context + relevance-gated pattern. */
export function validateBody(body: string, ctx: BriefContext): ValidationResult {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, reason: "empty body" };

  const forbidden = findForbiddenWord(trimmed);
  if (forbidden) return { ok: false, reason: `body contains forbidden word "${forbidden}"` };

  // Lexicon cluster requirement.
  const cluster = detectCluster(trimmed);
  if (!cluster) return { ok: false, reason: "body does not include any Elastic Lexicon cluster concept" };

  // Signal Evidence: a number/unit OR a named event from signals.
  //
  // Keep this aligned with the live validator in compute-outer-readiness:
  // calendar-empty days may pass on approved baseline lexicon, and natural
  // state-quality prose ("recovery was short", "the afternoon is heavy")
  // counts as grounded evidence when the prompt is fed real signals.
  const anchorTitles = ctx.behaviourFlags.map((f) => f.anchorEvent).filter(Boolean) as string[];
  const hasNamedEvent = anchorTitles.some((t) => trimmed.toLowerCase().includes(t.toLowerCase()));
  const hasNumber = NUMBER_OR_TIME_RE.test(trimmed);
  const calendarEmpty = !ctx.signals.highStakesEventInNext24h && !ctx.signals.emotionalDrainEventInNext4h;
  if (!hasNamedEvent && !hasNumber) {
    const hasLegacyDataRef = LEGACY_DATA_REF_RE.test(trimmed);
    const hasStateQuality = STATE_QUALITY_WORDS_RE.test(trimmed);
    if (!hasLegacyDataRef && !hasStateQuality) {
      return { ok: false, reason: "body missing Signal Evidence (no number-with-unit, named event, or grounded state-quality signal)" };
    }
  }

  // §2.19.1 pattern-reference relevance gate.
  if (mentionsPattern(trimmed)) {
    if (!hasNumber && !hasNamedEvent) {
      return { ok: false, reason: "pattern reference present without today-signal or today-context anchor" };
    }
  }

  const availability = validateBodyDataAvailability(trimmed, ctx);
  if (!availability.ok) return availability;

  // §5.2a Four-beat structural gate — must run AFTER lexicon/evidence gates
  // so callers see the more specific reason first when both would fail.
  const structure = validateBodyFourBeatStructure(trimmed);
  if (!structure.ok) return structure;

  return { ok: true };
}

/** Atomic Brief Contract gate — both must pass or the brief is rejected. */
export function validateBrief(
  phrase: string,
  body: string,
  ctx: BriefContext,
): ValidationResult {
  const p = validatePhrase(phrase);
  if (!p.ok) return p;
  const b = validateBody(body, ctx);
  if (!b.ok) return b;
  return { ok: true };
}
