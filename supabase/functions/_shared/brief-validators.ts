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