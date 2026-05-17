// OWNERSHIP: coaching (primitive vocabulary). Engineering wires combos into
// rules but does not invent new ones. This file is intentionally pure data —
// no IO, no event knowledge, no behaviour knowledge. Non-event features
// (circadian nudges, free-form recovery suggestions, etc.) should import
// from here without pulling in the event taxonomy.
//
// §2 of CEO Self-Regulation Framework v1.0 — the six protocol combinations.

export type Protocol = "mindset" | "somatic";
export type ProtocolMode = "pause" | "flow" | "reenergise";
export type ComboKey = `${Protocol}.${ProtocolMode}`;

export interface ProtocolCombo {
  protocol: Protocol;
  mode: ProtocolMode;
  /** Doc §2 verbatim — when this combo is the right intervention. */
  whenToUse: string;
  /** Doc §2 verbatim — what the combo produces. */
  outcome: string;
}

export const PROTOCOL_COMBOS: Record<ComboKey, ProtocolCombo> = {
  "mindset.pause": {
    protocol: "mindset", mode: "pause",
    whenToUse: "Reactive thinking, decision fatigue, identity threat",
    outcome: "Clarity and detachment before high-consequence decision",
  },
  "mindset.flow": {
    protocol: "mindset", mode: "flow",
    whenToUse: "Pre-execution focus, narrative priming, intent setting",
    outcome: "Aligned attention, single-thread focus on outcome",
  },
  "mindset.reenergise": {
    protocol: "mindset", mode: "reenergise",
    whenToUse: "Post-event integration, meaning-making, identity reinforcement",
    outcome: "Closure, lesson capture, executive identity consolidation",
  },
  "somatic.pause": {
    protocol: "somatic", mode: "pause",
    whenToUse: "Sympathetic dominance, elevated HR, masked fatigue",
    outcome: "Parasympathetic re-entry, HRV stabilisation",
  },
  "somatic.flow": {
    protocol: "somatic", mode: "flow",
    whenToUse: "Pre-stage activation, physical readiness, breath cadence",
    outcome: "Coherent state — body matches the demand of the next block",
  },
  "somatic.reenergise": {
    protocol: "somatic", mode: "reenergise",
    whenToUse: "End-of-day depletion, post-travel, circadian drift",
    outcome: "Hardware recovery — sleep priming, vagal reset",
  },
};

/**
 * Legacy `SlotBoost.practiceType` → preferred (protocol, mode).
 *
 * SINGLE SOURCE OF TRUTH. `generate-mastery-plan` and `behaviour-evaluator`
 * import this constant. Do not duplicate the mapping anywhere — if a second
 * copy appears in review, reject the PR.
 */
export const PRACTICE_TYPE_TO_COMBO = {
  regulate:  { protocol: "somatic",  mode: "pause"      },
  align:     { protocol: "mindset",  mode: "pause"      },
  prepare:   { protocol: "mindset",  mode: "flow"       },
  integrate: { protocol: "mindset",  mode: "reenergise" },
} as const satisfies Record<string, { protocol: Protocol; mode: ProtocolMode }>;

export type LegacyPracticeType = keyof typeof PRACTICE_TYPE_TO_COMBO;

export function comboFor(practiceType: LegacyPracticeType): ProtocolCombo {
  const { protocol, mode } = PRACTICE_TYPE_TO_COMBO[practiceType];
  return PROTOCOL_COMBOS[`${protocol}.${mode}` as ComboKey];
}