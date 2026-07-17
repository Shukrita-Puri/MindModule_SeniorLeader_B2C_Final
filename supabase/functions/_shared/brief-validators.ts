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

// ---------------------------------------------------------------------------
// W3: Shared pill-context type + canonical divergence phrases.
//
// The Brief pipeline builds the final signal_pills payload AFTER the LLM
// response is validated (compute-outer-readiness/index.ts §"Build structured
// signal_pills payload"). To keep this validator usable at every entry point
// (pre-LLM optimistic, LLM primary, retry, deterministic fallback, and the
// persistence-time coherence recheck), it takes an EXPLICIT pillContext
// argument rather than reading it from a global. Callers pass whichever
// snapshot is authoritative for their call site.
//
// `divergenceMarkers` covers the phrasings a human coach would use to make
// the check-in-vs-objective gap explicit ("despite", "at odds with", "your
// check-in reads … but the wearable …"). If a body contains one of these
// phrases, we accept a pill/felt-state contradiction as INTENTIONAL
// divergence framing. Otherwise we reject.
// ---------------------------------------------------------------------------

export type PillTier = "green" | "amber" | "red" | "neutral";

export interface PillContext {
  decisionReadiness: PillTier;
  physicalReserves: PillTier;
  resilienceCapacity?: PillTier;
  /**
   * Structural divergence descriptor. When present, the pill validator
   * accepts phrasings that would otherwise be flagged as contradicting the
   * pill tier — because the copy is intentionally describing a real gap
   * between self-reported felt state and the objective evidence.
   */
  divergence?: {
    exists: boolean;
    dimension?: "decision_readiness" | "physical_reserves" | "resilience_capacity";
    left?: {
      source?: "wearable_objective" | "self_report" | "behavioural_pattern" | "calendar_context";
      direction?: "positive" | "negative";
      evidenceKeys?: string[];
    };
    right?: {
      source?: "wearable_objective" | "self_report" | "behavioural_pattern" | "calendar_context";
      direction?: "positive" | "negative";
      evidenceKeys?: string[];
    };
  } | null;
}

export interface ExtendedValidateOptions {
  /**
   * The actual MRS presented in the header. When set, the score-restatement
   * validator rejects any numeric restatement of this value (or a nearby
   * one) inside the body. Leave `null` on entry points where the header
   * score is not yet finalized — the phrasing-only patterns are still
   * caught by DEFAULT_SCORE_RESTATEMENT_PATTERNS.
   */
  mrsScore?: number | null;
  pillContext?: PillContext | null;
}

// ---------------------------------------------------------------------------
// Score-restatement validator (§3–§4 of the W3 spec).
//
// The MRS is a header-owned artefact. The Brief body must NEVER restate it
// numerically, whether by echoing the exact score, a nearby integer, a
// typical-DOW score, or a conversational phrasing like "the score's at 70".
//
// We must NOT reject legitimate numeric evidence: HRV/RHR readings, sleep
// scores/durations, percentages, times of day, meeting counts. Those are
// always tied to a unit or a clock format.
//
// Approach: identify "readiness-score-shaped" phrases first (score / MRS /
// readiness + a copular verb + a two-digit number OR a "N/100"/"N out of
// 100" tail). Then reject.  For the pure-integer restatement of the actual
// MRS, only reject when the number appears in a context that is NOT already
// consumed by a whitelist (HRV Xms, X bpm, X%, HH:mm, sleep score X labels,
// N calls/meetings). This second layer only runs when `mrsScore` is
// provided.
// ---------------------------------------------------------------------------

/**
 * Conversational score-restatement patterns. Every regex here is
 * intentionally anchored to a "score / readiness / MRS" head noun (or the
 * "N/100" / "N out of 100" tail) so that raw numeric evidence — HRV, RHR,
 * sleep score, percentages, times, counts — never trips it.
 *
 * Exported for test coverage and for consumers that want to check a single
 * line without pulling in the rest of the validator surface.
 */
export const SCORE_RESTATEMENT_PATTERNS: RegExp[] = [
  // "61/100", "61 / 100"
  /\b\d{1,3}\s*\/\s*100\b/i,
  // "61 out of 100"
  /\b\d{1,3}\s+out\s+of\s+100\b/i,
  // "score of 61", "readiness score of 61"
  /\b(?:readiness\s+)?score\s+of\s+\d{1,3}\b/i,
  // "score is 61", "score is at 61", "score sits at 61", "score stands at 61",
  // "score reads at 61", "score came in at 61", "score's at 61". The verb
  // group is REQUIRED (not optional) so "sleep score 61" cannot trip this.
  /\bscore(?:'s|\s+(?:is|sits|stands|reads|came\s+in|lands))\s+(?:at\s+)?\d{1,3}\b/i,
  // "readiness score of 61" — anchored on the readiness prefix so "sleep
  // score of 61" does not accidentally trip.
  /\breadiness\s+score\s+of\s+\d{1,3}\b/i,
  // "the score's at 61" / "the score is at 61" (definite-article variant that
  // may not match the noun-anchored form above when a modifier intrudes)
  /\bthe\s+score(?:'s|\s+is|\s+sits|\s+stands|\s+reads)\s+(?:at\s+)?\d{1,3}\b/i,
  // "readiness is 61", "readiness sits at 61", "readiness stands/reads at 61"
  /\breadiness(?:\s+score)?\s+(?:is|sits|stands|reads|came\s+in|lands)\s+(?:at\s+)?\d{1,3}\b/i,
  // "readiness score 61" (no verb — pure label + number)
  /\breadiness\s+score\s+\d{1,3}\b/i,
  // "you're at 61", "you are at 61" — colloquial header restatement.
  // Bounded by end-of-clause so "you're at 3pm" and similar time refs
  // cannot trip it (times use HH:mm or am/pm and won't match \d{1,3}
  // in this exact position without the readiness anchor being nearby).
  /\byou(?:'re|\s+are)\s+at\s+\d{1,3}\b(?!\s*(?:%|bpm|ms|am|pm|:))/i,
  // "MRS is 61" / "MRS 61"
  /\bMRS\s+(?:is\s+)?\d{1,3}\b/i,
];

// Whitelist matcher: does the number-in-question sit inside a legitimate
// numeric evidence pattern? Used only when we consider rejecting a raw
// integer restatement of the actual MRS.
const LEGITIMATE_NUMBER_PATTERNS: RegExp[] = [
  /\b\d{1,3}\s*(?:%|bpm|ms)\b/i,
  /\b\d{1,3}(?:\.\d+)?\s*h(?:rs?|ours?)?\b/i,
  /\b\d{1,3}\s*min(?:s|utes?)?\b/i,
  /\b\d{1,2}:\d{2}\b/,
  /\b\d{1,2}\s*(?:am|pm)\b/i,
  /\b(?:sleep\s+score|hrv|rhr|heart\s+rate)\s*:?\s*\d{1,3}\b/i,
  /\b\d{1,3}\s+(?:meeting|meetings|call|calls|day|days|hour|hours|min|mins|minute|minutes)\b/i,
];

/**
 * Reject conversational or numeric restatements of the MRS in Brief body.
 * `mrsScore` is optional; the phrase-form checks are always applied.
 */
export function validateNoScoreRestatement(
  body: string,
  opts: { mrsScore?: number | null } = {},
): ValidationResult {
  const text = body || "";
  if (!text.trim()) return { ok: true };

  for (const rx of SCORE_RESTATEMENT_PATTERNS) {
    if (rx.test(text)) {
      return {
        ok: false,
        reason: `body numerically restates readiness score (matched pattern ${rx.source})`,
      };
    }
  }

  // Optional strict check: reject the exact MRS integer when it appears
  // outside a legitimate numeric-evidence phrase. Only runs when a score
  // is supplied so we do not throttle legitimate stray integers in
  // callers that don't yet plumb the score.
  if (typeof opts.mrsScore === "number" && Number.isFinite(opts.mrsScore)) {
    const score = Math.round(opts.mrsScore);
    const bareNumberRe = new RegExp(`(?<![.\\d])\\b${score}\\b(?!\\s*(?:%|bpm|ms|am|pm|:|/\\d|hrs?|hours?|min))`, "gi");
    for (const match of text.matchAll(bareNumberRe)) {
      const idx = match.index ?? 0;
      // Widen a 24-char window around the match and re-test whitelist.
      const start = Math.max(0, idx - 24);
      const end = Math.min(text.length, idx + (match[0]?.length ?? 0) + 24);
      const window = text.slice(start, end);
      const legitimate = LEGITIMATE_NUMBER_PATTERNS.some((rx) => rx.test(window));
      if (!legitimate) {
        return {
          ok: false,
          reason: `body restates the MRS numerically (bare ${score} outside legitimate numeric evidence)`,
        };
      }
    }
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Pill/body consistency validator (§5 of the W3 spec).
//
// The final signal_pills payload is the source of truth for the header
// tiers. The Brief body must not contradict those tiers unless it EXPLICITLY
// frames the phrase as a check-in-vs-objective divergence. Divergence
// framing is detected structurally via `pillContext.divergence.exists` (the
// preferred path — the caller derived the gap) OR textually via a small set
// of unambiguous connective phrases that a human coach uses to signal the
// gap.
// ---------------------------------------------------------------------------

const EVIDENCE_KEY_PATTERNS: Record<string, RegExp[]> = {
  hrvValue: [/\bHRV\b/i, /\brecovery\b/i],
  sleepDuration: [/\bsleep\b/i],
  sleepScore: [/\bsleep score\b/i, /\bsleep\b/i],
  sleepEfficiency: [/\bsleep efficiency\b/i, /\bsleep\b/i],
  rhrValue: [/\bRHR\b/i, /\bresting heart rate\b/i],
  hrValue: [/\bheart rate\b/i, /\bHR\b/i],
  outcome: [/\bchecked in\b/i, /\byou checked in\b/i, /\bself-?report(?:ed)?\b/i, /\breported\b/i, /\bdrained\b/i, /\bstrong\b/i, /\bfoggy\b/i, /\boverwhelmed\b/i],
  clarityLevel: [/\bclarity\b/i],
  emotionLevel: [/\bemotion(?:al)?\b/i],
  regulationLevel: [/\bregulation\b/i, /\bcomposure\b/i],
  pressureLevel: [/\bpressure\b/i],
};

function hasStructuredDivergenceEvidence(
  body: string,
  divergence: PillContext["divergence"],
): boolean {
  if (!divergence?.exists) return false;
  const leftKeys = divergence.left?.evidenceKeys ?? [];
  const rightKeys = divergence.right?.evidenceKeys ?? [];
  if (leftKeys.length === 0 || rightKeys.length === 0) return false;
  const mentions = (keys: string[]) =>
    keys.some((key) => (EVIDENCE_KEY_PATTERNS[key] ?? []).some((rx) => rx.test(body)));
  return mentions(leftKeys) && mentions(rightKeys);
}

// Phrase groups — each keyed to a specific contradiction. These are
// deliberately anchored to identifiable felt-state / recovery-assertion
// verbs, not raw adjectives, so they cannot accidentally trip on generic
// grounded prose.
const MIND_DEPLETED_PHRASES: RegExp[] = [
  /\b(?:mentally|mind\s+is|head\s+is)\s+(?:spent|foggy|drained|clouded|blank|off)\b/i,
  /\b(?:cognitively|mentally)\s+(?:depleted|blunted|dull)\b/i,
  /\bmind\s+feels\s+(?:spent|foggy|drained|clouded|blank)\b/i,
];
const MIND_SHARP_PHRASES: RegExp[] = [
  /\b(?:mentally\s+)?sharp\b/i,
  /\bmind\s+is\s+(?:clear|sharp)\b/i,
  /\b(?:high[- ]decision[- ]power|clear[- ]headed)\b/i,
  /\bcognitive\s+edge\b/i,
];
const BODY_DEPLETED_PHRASES: RegExp[] = [
  /\bbody\s+is\s+(?:strained|depleted|drained|spent|off)\b/i,
  /\bphysically\s+(?:depleted|drained|spent)\b/i,
];
const BODY_RECOVERED_PHRASES: RegExp[] = [
  /\bbody\s+(?:is|feels|looks|reads)\s+(?:rested|recovered|ready|steady|fresh)\b/i,
  /\bphysically\s+(?:rested|recovered|ready|fresh)\b/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((rx) => rx.test(text));
}

export function validatePillBodyConsistency(
  body: string,
  pill: PillContext | null | undefined,
): ValidationResult {
  if (!pill) return { ok: true };
  const text = body || "";
  if (!text.trim()) return { ok: true };

  const divergenceOk = hasStructuredDivergenceEvidence(text, pill.divergence);

  // Decision Readiness rules.
  if (pill.decisionReadiness === "green") {
    if (matchesAny(text, MIND_DEPLETED_PHRASES) && !divergenceOk) {
      return {
        ok: false,
        reason: "body describes cognitive depletion while Decision Readiness pill is Green with no divergence framing",
      };
    }
  } else if (pill.decisionReadiness === "red") {
    if (matchesAny(text, MIND_SHARP_PHRASES) && !divergenceOk) {
      return {
        ok: false,
        reason: "body describes mind as sharp/clear while Decision Readiness pill is Red with no divergence framing",
      };
    }
  } else if (pill.decisionReadiness === "neutral") {
    // Unread pill: reject confident assertions in either direction.
    if (matchesAny(text, MIND_SHARP_PHRASES) || matchesAny(text, MIND_DEPLETED_PHRASES)) {
      return {
        ok: false,
        reason: "body asserts a confident cognitive state while Decision Readiness pill is Unread",
      };
    }
  }

  // Physical Reserves rules.
  if (pill.physicalReserves === "green") {
    if (matchesAny(text, BODY_DEPLETED_PHRASES) && !divergenceOk) {
      return {
        ok: false,
        reason: "body describes physical depletion while Physical Reserves pill is Green with no divergence framing",
      };
    }
  } else if (pill.physicalReserves === "red") {
    if (matchesAny(text, BODY_RECOVERED_PHRASES) && !divergenceOk) {
      return {
        ok: false,
        reason: "body describes body as rested/recovered while Physical Reserves pill is Red with no divergence framing",
      };
    }
  } else if (pill.physicalReserves === "neutral") {
    if (matchesAny(text, BODY_DEPLETED_PHRASES) || matchesAny(text, BODY_RECOVERED_PHRASES)) {
      return {
        ok: false,
        reason: "body asserts a confident physical state while Physical Reserves pill is Unread",
      };
    }
  }

  return { ok: true };
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
export function validateBody(
  body: string,
  ctx: BriefContext,
  opts?: ExtendedValidateOptions,
): ValidationResult {
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

  // W3 §3 — score-restatement guard. Always runs; the numeric-strict path
  // engages only when `opts.mrsScore` is supplied.
  const score = validateNoScoreRestatement(trimmed, { mrsScore: opts?.mrsScore ?? null });
  if (!score.ok) return score;

  // W3 §5 — pill/body consistency. Only runs when caller supplies pill
  // context; entry points that don't yet have finalized pills skip it and
  // rely on the persistence-time revalidation to catch drift.
  if (opts?.pillContext) {
    const pill = validatePillBodyConsistency(trimmed, opts.pillContext);
    if (!pill.ok) return pill;
  }

  return { ok: true };
}

/** Atomic Brief Contract gate — both must pass or the brief is rejected. */
export function validateBrief(
  phrase: string,
  body: string,
  ctx: BriefContext,
  opts?: ExtendedValidateOptions,
): ValidationResult {
  const p = validatePhrase(phrase);
  if (!p.ok) return p;
  const b = validateBody(body, ctx, opts);
  if (!b.ok) return b;
  return { ok: true };
}
