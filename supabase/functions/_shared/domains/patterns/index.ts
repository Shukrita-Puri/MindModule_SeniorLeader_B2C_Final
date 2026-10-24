// [KIND: entry] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Domain Barrel for Layer 4: Patterns and Causality.
// Source: Part 2 Layer 4 (Section 12.1).

export * from "./types.ts";
export * from "./constants.ts";
export * from "./keys.ts";

// Engines and Runners
export { runPatternSpecs, type RunSpecsOptions } from "./engine/run-specs.ts";
export { computeOwnBaseline, isExcludedFromBaseline } from "./engine/baselines.ts";
export { resolveLagValue } from "./engine/lag.ts";
export { evaluateConfidence, checkTwoWindowStability } from "./engine/confidence.ts";
export { groupExposuresWithRollup } from "./engine/rollup.ts";

// Specs
export * from "./specs/index.ts";

// Specialized Engines
export { computeRhythm } from "./rhythm/engine.ts";
export { computeTrends } from "./trends/engine.ts";
export { computePracticeEfficacy } from "./efficacy/practice-efficacy.ts";
export { computeOwnActionEfficacy } from "./efficacy/own-actions.ts";
export { computePrepEffect } from "./efficacy/prep-effect.ts";
export { computeBehaviourPatterns, type SituationalBehaviourPattern } from "./efficacy/behaviour-patterns.ts";
export { computeShrunkRate } from "./efficacy/population.ts";
export { computeNudgeEngagement } from "./behaviour/engine.ts";
export { extractThemes, CANONICAL_THEMES } from "./themes/engine.ts";
export { evaluatePredictionAccuracy } from "./predictions/hit-rate.ts";

// Read Surface
export { readFindings, getCitableFindings } from "./read/read-findings.ts";
export { askPattern, type AskPatternInput } from "./read/ask-pattern.ts";
