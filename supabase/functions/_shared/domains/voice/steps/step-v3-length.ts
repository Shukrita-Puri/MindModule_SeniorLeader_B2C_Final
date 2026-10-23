// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step V3 · Length and Word Count Bounds.
// Validates word and character counts against surface contracts.
// Source: Part 2 Layer 5 (Section 6.4, 6.12, D-L5-2).

import { SURFACE_BOUNDARIES } from "../constants.ts";
import type { CopyCheckViolation, SurfaceContract } from "../types.ts";

export function countWords(text: string): number {
  if (!text || text.trim().length === 0) return 0;
  // Match contiguous non-whitespace words (handles hyphens within words)
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

export function checkLength(
  text: string,
  contract: SurfaceContract,
): CopyCheckViolation[] {
  const violations: CopyCheckViolation[] = [];
  const words = countWords(text);
  const chars = text.length;

  // 1. Check Explicit Contract Word Bounds
  let minWords = contract.minWords;
  let maxWords = contract.maxWords;
  let maxChars = contract.maxCharacters;

  // Defaults per surface if not provided explicitly in contract
  if (minWords === undefined && maxWords === undefined) {
    if (contract.surface === "mrs" || contract.surface === "home") {
      maxWords = SURFACE_BOUNDARIES.home.maxWords;
    } else if (contract.surface === "brief_phrase") {
      minWords = SURFACE_BOUNDARIES.brief_phrase.minWords;
      maxWords = SURFACE_BOUNDARIES.brief_phrase.maxWords;
    } else if (contract.surface === "brief_body" || contract.surface === "brief") {
      minWords = SURFACE_BOUNDARIES.brief_body.targetMinWords;
      maxWords = SURFACE_BOUNDARIES.brief_body.hardMaxWords;
    } else if (contract.surface === "brief_close") {
      minWords = SURFACE_BOUNDARIES.brief_close.minWords;
      maxWords = SURFACE_BOUNDARIES.brief_close.maxWords;
    } else if (contract.surface === "plan_title") {
      maxWords = SURFACE_BOUNDARIES.plan_title.maxWords;
    } else if (contract.surface === "plan_why") {
      maxWords = SURFACE_BOUNDARIES.plan_why.maxWords;
    } else if (contract.surface === "nudge") {
      maxWords = contract.isDenseDay
        ? SURFACE_BOUNDARIES.nudge_dense.maxWords
        : SURFACE_BOUNDARIES.nudge_body.maxWords;
      maxChars = SURFACE_BOUNDARIES.nudge_body.maxCharacters;
    } else if (contract.surface === "insights") {
      minWords = SURFACE_BOUNDARIES.insights.minWords;
      maxWords = SURFACE_BOUNDARIES.insights.maxWords;
    } else if (contract.surface === "week_ahead") {
      maxWords = SURFACE_BOUNDARIES.week_ahead.maxWords;
    }
  }

  // Min words check
  if (minWords !== undefined && words < minWords) {
    violations.push({
      code: "word_count_too_low",
      rule: "V3.1 Min Words",
      message: `Word count ${words} is below minimum required (${minWords}) for surface ${contract.surface}`,
    });
  }

  // Max words check
  if (maxWords !== undefined && words > maxWords) {
    violations.push({
      code: "word_count_too_high",
      rule: "V3.2 Max Words",
      message: `Word count ${words} exceeds maximum allowed (${maxWords}) for surface ${contract.surface}`,
    });
  }

  // Max characters check
  if (maxChars !== undefined && chars > maxChars) {
    violations.push({
      code: "character_count_too_high",
      rule: "V3.3 Max Characters",
      message: `Character count ${chars} exceeds maximum allowed (${maxChars}) for surface ${contract.surface}`,
    });
  }

  return violations;
}
