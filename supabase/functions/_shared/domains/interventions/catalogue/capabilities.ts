// [KIND: vocabulary] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Capabilities Vocabulary and Combo Mappings.
// Source: Part 2 Layer 3 (Section 8.3).

import type { InterventionCapability } from "../types.ts";

export const COMBO_TO_CAPABILITIES: Record<string, InterventionCapability[]> = {
  "somatic.pause": ["reduce_arousal", "steady_composure"],
  "somatic.flow": ["steady_composure", "raise_energy", "sharpen_focus"],
  "somatic.reenergise": ["recover_energy", "sleep_preparation", "reduce_arousal"],
  "mindset.pause": ["decision_clarity", "detach_and_offload", "steady_composure"],
  "mindset.flow": ["sharpen_focus", "prime_presence", "decision_clarity", "start_action"],
  "mindset.reenergise": ["reflect_and_learn", "process_setback", "reconnect_purpose", "reframe_story"],
};

export const NEED_TO_CAPABILITIES: Record<string, InterventionCapability[]> = {
  settle_before: ["reduce_arousal", "steady_composure"],
  prime_presence: ["prime_presence", "sharpen_focus", "raise_energy"],
  clear_and_focus: ["decision_clarity", "sharpen_focus", "start_action"],
  hold_steady_during: ["steady_composure", "reduce_arousal"],
  transition_between: ["detach_and_offload", "steady_composure", "reduce_arousal"],
  protect_recovery_window: ["recover_energy", "reduce_arousal"],
  offload_after: ["detach_and_offload", "recover_energy"],
  protect_attention: ["sharpen_focus", "decision_clarity"],
  close_the_day: ["reflect_and_learn", "sleep_preparation", "detach_and_offload"],
  protect_sleep_for_the_mind: ["sleep_preparation", "reduce_arousal"],
  anchor_body_clock: ["recover_energy", "raise_energy"],
  sustain_multi_day: ["recover_energy", "steady_composure"],
  steady_in_crisis: ["steady_composure", "reduce_arousal", "decision_clarity"],
  keep_the_ritual_off_days: ["reconnect_purpose", "reflect_and_learn"],
  prepare_the_week: ["decision_clarity", "reconnect_purpose"],
};
