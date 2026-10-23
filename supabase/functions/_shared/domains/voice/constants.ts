// [KIND: constants] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Unified Voice Contract Constants for Chief of Staff Voice & Behaviour.
// Source: Part 2 Layer 5 (Section 6.8, Section 6.5, Section 6.4, Section 6.12).

/** Wellness clichés banned across surfaces (Section 6.8). */
export const BANNED_WELLNESS_WORDS = [
  "wellness",
  "mindful",
  "mindfulness",
  "relax",
  "breathe", // Allowed only inside Recalibrate practice register
  "recharge",
  "self-care",
  "self care",
  "nourish",
  "restore",
  "journey",
  "calm",
] as const;

/** Clinical and mechanical jargon banned in prose (Section 6.8). */
export const BANNED_CLINICAL_WORDS = [
  "parasympathetic",
  "sympathetic",
  "cortisol",
  "biometric",
  "data points",
  "metrics",
  "machine",
  "device",
  "hardware",
] as const;

/** Score and tier words banned in prose (Section 6.8). Allowed only as product pills. */
export const BANNED_SCORE_TIER_WORDS = [
  "moderate",
  "high",
  "low",
  "strong",
  "readiness",
] as const;

/** Baseline wording banned in prose (Section 6.8). Say "your usual". */
export const BANNED_BASELINE_WORDS = [
  "baseline",
  "deviation",
] as const;

/** Praise and engagement speak banned across surfaces (Section 6.8). */
export const BANNED_PRAISE_WORDS = [
  "streak",
  "keep it up",
  "well done",
  "great job",
  "amazing",
  "crushing it",
  "productive",
  "productivity",
  "optimal performance",
  "peak performance",
  "performance state",
  "capacity",
  "reserves",
  "cognitive load",
  "decision posture",
  "mental sharpness",
] as const;

/** Abstract system phrases banned across surfaces (Section 6.8). */
export const BANNED_ABSTRACT_PHRASES = [
  "come down clean",
  "hold the base",
  "mask the surge",
  "optimise the window",
  "optimize the window",
  "leverage your physiological runway",
  "trajectory reset",
  "reset trajectory",
  "set the tone",
  "your day your terms",
] as const;

/** App-pushing CTAs banned across surfaces (Section 6.8). */
export const BANNED_APP_PUSHING_WORDS = [
  "your plan is ready",
  "your brief is ready",
  "see your prep",
  "see your plan",
  "see your readiness",
  "tap to prep",
  "open the app to prep",
  "check into the app to prep",
  "go to the app to prep",
  "prep now",
  "open the app",
  "come back",
] as const;

/** Over-reach phrases banned across surfaces (Section 6.8). */
export const BANNED_OVERREACH_PHRASES = [
  "you should",
  "you must",
  "you need to",
] as const;

/** Emotion labels banned from biometric inferences (Section 6.6, 8.1). */
export const BANNED_EMOTION_INFERENCES = [
  "you're stressed",
  "you are stressed",
  "you're anxious",
  "you are anxious",
  "burnout",
  "exhausted",
  "overwhelmed",
] as const;

/** Sensitive meeting subtypes that cannot appear in nudges (Section 6.6, D-L5-14). */
export const NUDGE_SENSITIVE_SUBTYPES = [
  "gov.performance_review",
  "gov.layoff",
  "gov.legal",
  "personal.medical",
  "personal.therapy",
] as const;

/** Approved substitutes dictionary (Section 6.8). */
export const APPROVED_SUBSTITUTES: Record<string, string> = {
  "baseline": "your usual",
  "deviation": "difference",
  "wellness": "wellbeing",
  "calm": "steady",
  "relax": "settle",
  "recharge": "pace yourself",
  "breathe": "pause",
};

/** Surface Word & Character Boundaries (Section 6.4, 6.12). */
export const SURFACE_BOUNDARIES = {
  mrs: { maxWords: 12 },
  home: { maxWords: 12 },
  brief_phrase: { minWords: 2, maxWords: 5 },
  brief_body: { minWords: 35, targetMinWords: 40, targetMaxWords: 55, hardMaxWords: 60 },
  brief_close: { minWords: 3, maxWords: 8 },
  plan_title: { maxWords: 8 },
  plan_why: { maxWords: 20 },
  nudge_body: { maxWords: 22, maxCharacters: 140 },
  nudge_dense: { maxWords: 12 },
  insights: { minWords: 20, maxWords: 40 },
  week_ahead: { maxWords: 40 },
} as const;
