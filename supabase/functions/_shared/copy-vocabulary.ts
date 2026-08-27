// OWNERSHIP: engineering. Single source of truth for the shared Chief-of-Staff
// persona, notification blacklists, Elastic Lexicon (§2.20), and allowed
// pattern-reference keywords (§2.19.1 relevance gate). Wording changes go
// through code review only.
//
// Migration:
// - smart-nudges/index.ts currently has its own FORBIDDEN_WORDS_V6 constant.
//   Phase 3a swaps that for `forbiddenWords` from this module.
// - compute-outer-readiness inline WELLNESS/SCORE/READINESS blacklists are
//   Phase 2 work; this module is the destination.

import type { PillarCluster } from "./brief-context.ts";
export {
  CHIEF_OF_STAFF_PERSONA,
  FORBIDDEN_NOTIFICATION_WORDS,
} from "./brief/copy-vocabulary.ts";

/**
 * §2.20 Elastic Lexicon — three pillar clusters. The body must include ≥1
 * concept from one cluster (cluster-match, not verbatim). Strategic synonyms
 * within a cluster are accepted by the validator.
 */
export const ELASTIC_LEXICON: Record<PillarCluster, string[]> = {
  cognition: [
    "Decision Power",
    "Strategic Accuracy",
    "Mental Bandwidth",
    "Processing Capacity",
    "Solving Logic",
    "Sharpness",
    "Mind",
    "Cognitive",
    "Cognition",
  ],
  physiology: [
    "Operational Drive",
    "Leadership Stamina",
    "Physical Recovery",
    "Physical Runway",
    "Stamina",
    "Body",
    "Physiology",
    "Sleep",
  ],
  resilience: [
    "Strategic Composure",
    "Executive Presence",
    "Diplomatic Shield",
    "Reactive Risk",
    "Internal Buffer",
    "Composure",
    "Buffer",
    "Resilience",
    "Mental Energy",
  ],
};

/**
 * Wellness / data-app jargon banned everywhere. Union of the brief's blacklists
 * and smart-nudges' FORBIDDEN_WORDS_V6. Lowercase, matched case-insensitively
 * by validators.
 */
export const forbiddenWords: string[] = [
  // Wellness fluff (brief §2.19.6 + nudges)
  "relax", "mindful", "breathe", "calm", "wellness", "self-care",
  "journey", "nourish", "recharge", "restore", "genuine", "authentic",
  // Clinical jargon (brief §2.2 DON'T)
  "parasympathetic", "sympathetic dominance", "cortisol spike",
  // Wearables-app voice (brief §2.19.5 RULE 5)
  "hardware", "device", "metrics", "data points", "machine", "biometric",
  // Score/tier leak (brief §2.19.5 RULE 1)
  "moderate", "high", "low", "strong",
  // Readiness leak (brief hard constraint)
  "readiness",
  // Smart Nudges V8 — passive-consumption verbs (mem://features/notifications/smart-nudges-mvp-framework)
  "your prep is ready", "your plan is ready", "your brief is ready",
  "see your prep", "see your plan", "see your readiness", "tap to prep",
  "open the app to prep", "check into the app to prep",
  "go to the app to prep", "prep now",
  // Mechanical CoS jargon (nudges V8 voice)
  "decision posture", "decision readiness", "mental sharpness",
  "performance state", "reset trajectory", "capacity", "reserves", "baseline",
];

/**
 * §2.19.1 relevance-gate trigger keywords. If a body contains any of these,
 * the validator REQUIRES co-occurrence of a today-signal AND a today-context
 * anchor (else the pattern claim is stripped or the body rejected).
 */
export const patternReferenceTriggers: string[] = [
  "previously",
  "pattern",
  "last",
  "consistently",
  "spiked in",
  "your last",
  "consecutive",
];

/**
 * V8 qualified mind-prep CTA verbs (smart-nudges only). Kept separate from
 * forbiddenWords so nudges can require these verbatim WITHOUT brief inheriting
 * the constraint. See mem://features/notifications/cta-ab-experiment.
 */
export const ctaVerbs: string[] = [
  "log in to prep your mind",
  "log in to prep your mind tonight",
  "log in to prep your state",
  "log in to recalibrate your mind",
  "check in to recalibrate",
  "check in to set your intention",
  "check in to set tomorrow",
  "check in to close the day",
  "check in to close the week",
  "check in to land the weekend",
  "open your insights",
];

/** Returns the pillar cluster whose vocabulary appears in `text`, or null. */
export function detectCluster(text: string): PillarCluster | null {
  const lower = text.toLowerCase();
  for (const [cluster, words] of Object.entries(ELASTIC_LEXICON)) {
    for (const w of words) {
      if (lower.includes(w.toLowerCase())) return cluster as PillarCluster;
    }
  }
  return null;
}

/**
 * Returns a short, Chief-of-Staff voice clause that carries a concept from the
 * requested Elastic Lexicon cluster. Used as a last-resort injection when a
 * deterministic body would otherwise fail the lexicon gate. The clause is
 * phrased as a self-regulation directive so it fits beat (d) closes.
 */
export function lexiconFallbackClause(cluster: PillarCluster): string {
  const clauses: Record<PillarCluster, string[]> = {
    cognition: [
      "protect your Decision Power",
      "keep your Mental Bandwidth for what matters",
      "hold your Sharpness for the big calls",
    ],
    physiology: [
      "protect your Leadership Stamina",
      "keep your Physical Recovery in the frame",
      "hold your Operational Drive for the day",
    ],
    resilience: [
      "hold your Strategic Composure",
      "keep your Internal Buffer intact",
      "protect your Executive Presence",
    ],
  };
  const variants = clauses[cluster];
  return variants[Math.floor(Math.random() * variants.length)];
}

/** Returns the first forbidden word found in `text`, or null. */
export function findForbiddenWord(text: string): string | null {
  const lower = text.toLowerCase();
  for (const w of forbiddenWords) {
    // Word-boundary match for short tokens, substring for multi-word phrases.
    const needle = w.toLowerCase();
    if (needle.includes(" ")) {
      if (lower.includes(needle)) return w;
    } else {
      const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(lower)) return w;
    }
  }
  return null;
}

/** True if `text` mentions any §2.19.1 pattern-reference trigger. */
export function mentionsPattern(text: string): boolean {
  const lower = text.toLowerCase();
  return patternReferenceTriggers.some((t) => lower.includes(t.toLowerCase()));
}
