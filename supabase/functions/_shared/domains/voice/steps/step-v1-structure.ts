// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step V1 · Structure and Template Placeholders.
// Validates structural integrity and checks for unreplaced model placeholders.
// Source: Part 2 Layer 5 (Section 6.9, 11.2).

import type { CopyCheckViolation, SurfaceContract } from "../types.ts";

const PLACEHOLDER_REGEX = /\{[a-zA-Z0-9_-]+\}/g;

export function checkStructure(
  text: string,
  _contract: SurfaceContract,
): CopyCheckViolation[] {
  const violations: CopyCheckViolation[] = [];

  // Check for lingering placeholders (e.g. {meeting}, {time}, {cta})
  const matches = text.match(PLACEHOLDER_REGEX);
  if (matches && matches.length > 0) {
    violations.push({
      code: "unreplaced_placeholder",
      rule: "V1.1 Placeholder",
      message: `Output contains unresolved placeholder(s): ${matches.join(", ")}`,
      offendingText: matches.join(", "),
    });
  }

  // Check for dangling incomplete sentences
  if (text.length > 0 && !/[.!?…"']$/.test(text.trim())) {
    violations.push({
      code: "missing_terminal_punctuation",
      rule: "V1.2 Sentence Completion",
      message: "Text must end with valid terminal punctuation (. ! ? … or quote)",
    });
  }

  return violations;
}
