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
  if (words.length === 4) return { ok: false, reason: "phrase is 4 words — soft reject, retry with stricter instruction" };

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
//   • Body is 1–3 sentences and 35–70 words (band around the 45–60 target).
//   • Body contains at least one work-directive verb (beat c).
//   • Body ends with a short closing clause introduced by a coordinator
//     ("and", "so", "then", or an em-dash) inside the final sentence,
//     with 2–12 words after that coordinator (beat d).
// Evidence (beat a) is already gated by validateBody via NUMBER_OR_TIME_RE /
// named event / calendarEmpty. The Read (beat b) has no reliable structural
// signature, so it is intentionally left to prompt discipline.
// -----------------------------------------------------------------------------

// Small, deliberately generic lexicon of work-facing directive tokens. We do
// NOT try to enumerate every valid verb — one match is enough to prove a
// directive beat exists. Wellness / therapeutic verbs are intentionally absent
// (those are caught by the forbidden-word gate above).
const WORK_DIRECTIVE_TOKENS = [
  "lead", "open", "set", "run", "block", "front-load", "front load",
  "reserve", "protect", "save", "pick", "pace", "hold", "keep", "execute",
  "skip", "cut", "push", "use", "spend", "shape", "back", "close",
  "guard", "narrow", "focus", "prioritise", "prioritize", "own",
  "ship", "drive", "defer", "stay", "walk in", "lean on", "carry",
  "shut", "make", "take",
];

const CLOSING_CONNECTOR_RE = /\b(and|so|then)\b|—/gi;

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
  if (wordCount < 35) {
    return {
      ok: false,
      reason: `body too short (${wordCount} words) — cannot carry four beats`,
    };
  }
  if (wordCount > 70) {
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

  // (d) SELF-REGULATION closing clause — short tail after the last coordinator
  // inside the final sentence. Reads as the exhale at the end of (c).
  const lastSentence = sentences[sentences.length - 1];
  const connectors = [...lastSentence.matchAll(CLOSING_CONNECTOR_RE)];
  if (connectors.length === 0) {
    return {
      ok: false,
      reason:
        "body missing SELF-REGULATION closing clause (no 'and/so/then/—' coordinator in final sentence)",
    };
  }
  const lastConn = connectors[connectors.length - 1];
  const connIdx = lastConn.index ?? 0;
  const tail = lastSentence
    .slice(connIdx + lastConn[0].length)
    .replace(/[.!?]+$/g, "")
    .trim();
  const tailWords = tail.split(/\s+/).filter(Boolean).length;
  if (tailWords < 2) {
    return { ok: false, reason: "body SELF-REGULATION closing clause too short" };
  }
  if (tailWords > 12) {
    return {
      ok: false,
      reason: `body SELF-REGULATION closing clause too long (${tailWords} words) — should be a short exhale, not a new beat`,
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
  const anchorTitles = ctx.behaviourFlags.map((f) => f.anchorEvent).filter(Boolean) as string[];
  const hasNamedEvent = anchorTitles.some((t) => trimmed.toLowerCase().includes(t.toLowerCase()));
  const hasNumber = NUMBER_OR_TIME_RE.test(trimmed);
  const calendarEmpty = !ctx.signals.highStakesEventInNext24h && !ctx.signals.emotionalDrainEventInNext4h;
  if (!hasNamedEvent && !hasNumber && !calendarEmpty) {
    return { ok: false, reason: "body missing Signal Evidence (no number-with-unit and no named event)" };
  }

  // §2.19.1 pattern-reference relevance gate.
  if (mentionsPattern(trimmed)) {
    if (!hasNumber && !hasNamedEvent) {
      return { ok: false, reason: "pattern reference present without today-signal or today-context anchor" };
    }
  }

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