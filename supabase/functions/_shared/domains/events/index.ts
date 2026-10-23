// [KIND: barrel] [LAYER: 1] [TIERS: 0-3] [AUDIENCE: universal]
// Public entry point for Layer 1 Events (A–J Demand Classifier) domain.
// Source: Part 2 Layer 1 (Section 1, 2), Part 4 Tree (events/).

export * from "./types.ts";
export * from "./constants.ts";
export * from "./classifier.ts";
export * from "./steps/step1-prepare.ts";
export * from "./steps/step2-findings.ts";
export * from "./steps/step3-picture.ts";
