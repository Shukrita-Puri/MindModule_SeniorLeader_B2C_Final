// [KIND: constants] [LAYER: 2] [TIERS: 0-3] [AUDIENCE: universal]
// Importance Domain Constants.
// Source: Part 2 Layer 2 (Section 4.9, 4.9.1).

/** Shared stakes order category base points (Layer 1 SSOT). */
export const CATEGORY_BASE_SCORES: Record<string, number> = {
  J: 42, // Crisis, Risk & Incidents
  A: 40, // Board & Governance
  C: 32, // Public Speaking & Media
  B: 30, // Pitches, Deals & Negotiations
  D: 22, // People & Team Dynamics
  F: 18, // Conferences & External Events
  G: 12, // Travel
  E: 10, // Strategic Thinking & Decision Making
  I: 8,  // Operations & Execution
  H: 5,  // Personal Time & Recovery
};

/** Gate score required on immediate part before strategic goal points can attach (IM4). */
export const MIN_IMMEDIATE = 25;

/** Urgency decay parameter tau in minutes: U = 100 * exp(-m / tau) (N-IM1). */
export const URGENCY_TAU_MINUTES = 360;

/** Relationship weight cap added to immediate stakes (IM2). */
export const RELATIONSHIP_WEIGHT_CAP = 25;

/** Category D boosted cap for sensitive 1:1 / performance reviews. */
export const D_BOOSTED_CAP = 38;

/** Goal alignment multiplier on category base (N-IM4). */
export const GOAL_ALIGNMENT_MULTIPLIER = 1.3;

/** Half-life in days for tactical skips and follow-through decay (N-IM3). */
export const SKIP_HALF_LIFE_DAYS = 30;

/** Default horizon in hours for daily features (IM-Horizon). */
export const DEFAULT_HORIZON_HOURS = 24;

/** Account maturity tier weights [wK (stakes), wU (urgency), wT (tactical), wS (strategic)] (N-IM2). */
export const MATURITY_TIER_WEIGHTS = {
  T0: { wK: 0.50, wU: 0.10, wT: 0.25, wS: 0.15 },
  T1: { wK: 0.40, wU: 0.10, wT: 0.35, wS: 0.15 },
  T2: { wK: 0.27, wU: 0.08, wT: 0.50, wS: 0.15 },
  T3: { wK: 0.22, wU: 0.08, wT: 0.55, wS: 0.15 },
};

/** Onboarding V8 Protection Goals Category Map (N-IM4). */
export const ONBOARDING_GOAL_CATEGORIES: Record<string, string[]> = {
  prepare: ["A", "B"], // High-stakes board, investor, pitch
  people: ["D"],       // Navigate difficult people situations
  decision: ["A", "E"], // Decision quality under cognitive load
  models: ["E"],       // Mental models under pressure
  sustain: ["F", "G"], // Multi-day conferences and travel
};
