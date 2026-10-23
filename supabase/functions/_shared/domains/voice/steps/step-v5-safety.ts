// [KIND: step] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Step V5 · Privacy, Safety, and Biometric Compliance.
// Enforces EU AI Act Article 5/50, GDPR special category health rules, and nudge privacy.
// Source: Part 2 Layer 5 (Section 6.6, 6.12, 8.1, 11.2, D-L5-14).

import {
  BANNED_EMOTION_INFERENCES,
  NUDGE_SENSITIVE_SUBTYPES,
} from "../constants.ts";
import type { CopyCheckViolation, SurfaceContract } from "../types.ts";

/** Sensitive terms that should not appear in push notifications / lock-screen nudges. */
const SENSITIVE_MEETING_KEYWORDS = [
  "performance review",
  "annual review",
  "layoff",
  "redundancy",
  "termination",
  "disciplinary",
  "lawsuit",
  "litigation",
  "counsel",
  "therapy",
  "therapist",
  "psychiatrist",
  "oncologist",
  "doctor appointment",
  "dr ",
  "dr.",
];

export function checkSafety(
  text: string,
  contract: SurfaceContract,
): CopyCheckViolation[] {
  const violations: CopyCheckViolation[] = [];
  const lower = text.toLowerCase();

  // 1. Emotion Inferences from Biometrics (EU AI Act Article 5 & Section 6.6 S3)
  // Never label emotions like "you're stressed" or "you're anxious"
  for (const phrase of BANNED_EMOTION_INFERENCES) {
    if (lower.includes(phrase)) {
      violations.push({
        code: "banned_emotion_inference",
        rule: "V5.1 Emotion Inference",
        message: `Emotion labeling from physiology detected: "${phrase}". Describe physical signals or use only the user's declared words.`,
        offendingText: phrase,
      });
    }
  }

  // 2. Nudge Privacy: Sensitive Meeting Types and Private Items (Section 6.6, 6.12, D-L5-14)
  if (contract.surface === "nudge") {
    for (const kw of SENSITIVE_MEETING_KEYWORDS) {
      if (lower.includes(kw)) {
        violations.push({
          code: "sensitive_meeting_named",
          rule: "V5.2 Nudge Sensitive Meeting Privacy",
          message: `Sensitive meeting term "${kw}" found in nudge. Must use time-only reference (e.g. "your 3pm").`,
          offendingText: kw,
        });
      }
    }
  }

  // 3. Data points count limit: At most two data points in a sentence (Section 6.5, 6.12)
  // Look for percentage metrics (e.g. -18%, +6%), hours (5.5h, 5 hours), heart rate, HRV
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  for (const sentence of sentences) {
    const dataMatches = sentence.match(/(\b\d+%\b|\b\d+(\.\d+)?\s*(hours|h|min|minutes|ms|bpm)\b|\bhrv\b|\bresting heart rate\b|\bheart rate\b)/gi);
    if (dataMatches && dataMatches.length > 2) {
      violations.push({
        code: "too_many_data_points",
        rule: "V5.3 Data Point Limit",
        message: `Sentence contains ${dataMatches.length} data points (maximum allowed is 2): "${dataMatches.join(", ")}"`,
        offendingText: sentence.trim(),
      });
    }
  }

  return violations;
}
