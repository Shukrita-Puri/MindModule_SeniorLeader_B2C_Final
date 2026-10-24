// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step V2 · Vocabulary and Banned Lists.
// Enforces unified banned words and phrases with surface allowances.
// Source: Part 2 Layer 5 (Section 6.8, D-L5-4).

import {
  BANNED_ABSTRACT_PHRASES,
  BANNED_APP_PUSHING_WORDS,
  BANNED_BASELINE_WORDS,
  BANNED_CLINICAL_WORDS,
  BANNED_OVERREACH_PHRASES,
  BANNED_PRAISE_WORDS,
  BANNED_SCORE_TIER_WORDS,
  BANNED_WELLNESS_WORDS,
} from "../constants.ts";
import type { CopyCheckViolation, SurfaceContract } from "../types.ts";

export function checkVocabulary(
  text: string,
  contract: SurfaceContract,
): CopyCheckViolation[] {
  const violations: CopyCheckViolation[] = [];
  const lower = text.toLowerCase();

  // 1. Wellness Clichés
  for (const word of BANNED_WELLNESS_WORDS) {
    if (word === "breathe" && contract.allowPracticePhrases) {
      continue; // Recalibrate allows "breathe in for four"
    }
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) {
      violations.push({
        code: "banned_wellness_word",
        rule: "V2.1 Wellness Cliché",
        message: `Banned wellness term detected: "${word}". Use executive substitutes (e.g. steady, settle).`,
        offendingText: word,
      });
    }
  }

  // 2. Clinical and Mechanical Jargon
  for (const word of BANNED_CLINICAL_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) {
      violations.push({
        code: "banned_clinical_word",
        rule: "V2.2 Clinical Jargon",
        message: `Banned clinical term detected: "${word}". Use plain language.`,
        offendingText: word,
      });
    }
  }

  // 3. Score and Tier Words in prose (unless contract specifically allows product pills)
  if (!contract.allowProductLabels) {
    for (const word of BANNED_SCORE_TIER_WORDS) {
      // Don't ban "high" if it's in "high-stakes"
      if (word === "high" && lower.includes("high-stakes")) {
        continue;
      }
      const regex = new RegExp(`\\b${word}\\b`, "i");
      if (regex.test(lower)) {
        violations.push({
          code: "banned_score_tier_word",
          rule: "V2.3 Score/Tier Word",
          message: `Banned score or tier word detected: "${word}". Never name scores/tiers in prose.`,
          offendingText: word,
        });
      }
    }
  }

  // 4. Baseline Wording
  for (const word of BANNED_BASELINE_WORDS) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(lower)) {
      violations.push({
        code: "banned_baseline_word",
        rule: "V2.4 Baseline Wording",
        message: `Banned baseline term detected: "${word}". Say "your usual" instead.`,
        offendingText: word,
      });
    }
  }

  // 5. Praise and Engagement Speak
  for (const phrase of BANNED_PRAISE_WORDS) {
    const regex = new RegExp(`\\b${phrase}\\b`, "i");
    if (regex.test(lower)) {
      violations.push({
        code: "banned_praise_phrase",
        rule: "V2.5 Praise Speak",
        message: `Banned cheerleading or praise phrase detected: "${phrase}". Use specific earned acknowledgement.`,
        offendingText: phrase,
      });
    }
  }

  // 6. Abstract System Phrases
  for (const phrase of BANNED_ABSTRACT_PHRASES) {
    if (lower.includes(phrase)) {
      violations.push({
        code: "banned_abstract_phrase",
        rule: "V2.6 Abstract Phrase",
        message: `Banned abstract system phrase detected: "${phrase}".`,
        offendingText: phrase,
      });
    }
  }

  // 7. App-Pushing CTAs
  for (const phrase of BANNED_APP_PUSHING_WORDS) {
    if (lower.includes(phrase)) {
      violations.push({
        code: "banned_app_pushing_phrase",
        rule: "V2.7 App Pushing",
        message: `Banned app-pushing phrase detected: "${phrase}". CTAs must point to real actions.`,
        offendingText: phrase,
      });
    }
  }

  // 8. Overreach Phrases
  for (const phrase of BANNED_OVERREACH_PHRASES) {
    const regex = new RegExp(`\\b${phrase}\\b`, "i");
    if (regex.test(lower)) {
      violations.push({
        code: "banned_overreach_phrase",
        rule: "V2.8 Overreach",
        message: `Banned overreach phrase detected: "${phrase}". The user decides; never command or moralise.`,
        offendingText: phrase,
      });
    }
  }

  // 9. Judgmental Behaviour Wording (Layer 4 cross-layer addition)
  const BANNED_JUDGMENTAL_PATTERNS = [
    /\byou always\b/i,
    /\byou never\b/i,
    /\byou consistently skip\b/i,
    /\byou tend to always\b/i,
  ];
  for (const regex of BANNED_JUDGMENTAL_PATTERNS) {
    const match = lower.match(regex);
    if (match) {
      violations.push({
        code: "banned_judgmental_pattern",
        rule: "V2.9 Judgmental Pattern Wording",
        message: `Judgmental behaviour phrasing detected: "${match[0]}". State observations neutrally without absolute judgements.`,
        offendingText: match[0],
      });
    }
  }

  // 10. Raw Internal Demand Dimension Names (Layer 4 cross-layer addition)
  const BANNED_RAW_DEMAND_DIMENSIONS = [
    "cognitive_demand",
    "circadian_demand",
    "emotional_demand",
    "relational_demand",
    "political_demand",
    "visibility_demand",
    "switch_cost",
    "arousal_level",
    "recovery_minutes",
  ];
  for (const dim of BANNED_RAW_DEMAND_DIMENSIONS) {
    if (lower.includes(dim)) {
      violations.push({
        code: "banned_raw_demand_dimension",
        rule: "V2.10 Internal Demand Dimension",
        message: `Internal demand dimension name detected in copy: "${dim}". Use plain words (e.g. "emotionally demanding meetings").`,
        offendingText: dim,
      });
    }
  }

  return violations;
}
