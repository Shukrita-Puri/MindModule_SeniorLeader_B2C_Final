// [KIND: specification] [LAYER: spine] [TIERS: 0-3] [AUDIENCE: universal]
// The 19 Canonical Intervention Capabilities.
// Source: Part 2 Layer 3 (Section 8.3, N-L3-22).
// Invariant: Single source of truth for what an intervention does across all modalities.

export const CANONICAL_CAPABILITIES = [
  "reduce_arousal",         // Bring the body down (e.g. release-exhale-new, harmonic-calm)
  "steady_composure",       // Hold steady under pressure (e.g. fudoshin-immovable-mind, box-breathing)
  "sharpen_focus",          // One thread, full attention (e.g. single-thread-focus, deep-work-initiation)
  "decision_clarity",       // See the decision clearly; debias (e.g. decision-paralysis-unlock, high-stakes-judgment-clarity)
  "prime_presence",         // Confidence and presence before a room (e.g. board-authority-prime, confidence-through-evidence)
  "raise_energy",           // Lift energy and alertness (e.g. energy-forge, energised-focus-didgeridoo-bowls)
  "start_action",           // Break inertia; first move (e.g. first-move-momentum, momentum-generator-stuck)
  "detach_and_offload",     // Put the last thing down (e.g. detachment-observer-new, rumination-exit-protocol)
  "process_setback",        // Absorb a setback, come back (e.g. resilience-restore-fast, buddhist-phoenix)
  "reframe_story",          // Choose the story that serves (e.g. narrative-control-reframe, failure-reframe-pivot)
  "reflect_and_learn",      // Capture the lesson (e.g. stoic-reflection, feedback-receive-openly)
  "reconnect_purpose",      // Why it matters (e.g. purpose-meaning-reconnect, ikigai-purpose)
  "relational_presence",    // Listen, influence, hold a hard conversation (e.g. stakeholder-listening-presence, influence-reframe-protocol)
  "boundary_setting",       // Say no cleanly (e.g. people-pleasing-boundary-reset)
  "strategic_thinking",     // Map interests, consequences (e.g. political-navigation-clarity, avoiding-ramification-think)
  "creative_thinking",      // Break linear thinking (e.g. creativity-unlock-protocol, wu-wei-flow)
  "reduce_effort",          // Ease off over-control (e.g. wu-wei-flow, rhythm-pulse)
  "recover_energy",         // Refill the tank (e.g. rapid-recharge-midday, deep-calm-forest-bathing)
  "sleep_preparation",      // Prime for sleep (e.g. vagus-wind-down, ina-night-fields)
] as const;

export type CanonicalCapability = (typeof CANONICAL_CAPABILITIES)[number];

/** Combo protocol mappings to target capabilities per Layer 3 Section 8.3 */
export const COMBO_TO_CAPABILITIES: Record<string, CanonicalCapability[]> = {
  "somatic.pause": ["reduce_arousal", "steady_composure"],
  "somatic.flow": ["steady_composure", "raise_energy", "sharpen_focus"],
  "mindset.reenergise": ["raise_energy", "recover_energy"],
  "mindset.reset": ["detach_and_offload", "process_setback", "reduce_arousal"],
  "somatic.recharge": ["recover_energy", "reduce_arousal"],
  "mindset.perspective": ["reframe_story", "reflect_and_learn", "reconnect_purpose"],
  "mindset.presence": ["prime_presence", "relational_presence", "decision_clarity"],
  "mindset.focus": ["sharpen_focus", "start_action", "strategic_thinking"],
  "somatic.sleep": ["sleep_preparation", "reduce_arousal"],
};
