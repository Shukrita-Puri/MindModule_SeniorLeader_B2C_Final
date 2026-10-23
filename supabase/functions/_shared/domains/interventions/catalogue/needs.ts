// [KIND: vocabulary] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// The 15 Canonical Intervention Needs.
// Source: Part 2 Layer 3 (Section 15.3).

import type { InterventionNeed } from "../types.ts";

export interface NeedDefinition {
  id: InterventionNeed;
  label: string;
  mvpPurpose: string;
  typicalSituations: string;
}

export const CANONICAL_NEEDS: Record<InterventionNeed, NeedDefinition> = {
  settle_before: {
    id: "settle_before",
    label: "Settle Before",
    mvpPurpose: "Prevents emotion hijack; builds executive presence",
    typicalSituations: "A, B, C, D, J item soon; the body loud",
  },
  prime_presence: {
    id: "prime_presence",
    label: "Prime Presence",
    mvpPurpose: "Builds executive presence",
    typicalSituations: "A, B, C item; low energy, not tense",
  },
  clear_and_focus: {
    id: "clear_and_focus",
    label: "Clear and Focus",
    mvpPurpose: "Prevents decision leakage; builds sustained focus",
    typicalSituations: "Before E (strategy, a big decision)",
  },
  hold_steady_during: {
    id: "hold_steady_during",
    label: "Hold Steady During",
    mvpPurpose: "Prevents emotion hijack",
    typicalSituations: "Inside a demanding item",
  },
  transition_between: {
    id: "transition_between",
    label: "Transition Between",
    mvpPurpose: "Prevents stress accumulation",
    typicalSituations: "Back-to-back items; a short gap",
  },
  protect_recovery_window: {
    id: "protect_recovery_window",
    label: "Protect Recovery Window",
    mvpPurpose: "Prevents burnout; builds recovery that feeds the next event",
    typicalSituations: "No gap of 15+ min for 3+ hours; recovery owed",
  },
  offload_after: {
    id: "offload_after",
    label: "Offload After",
    mvpPurpose: "Prevents post-peak hangover and decision leakage",
    typicalSituations: "After A, D, J; the protected slot",
  },
  protect_attention: {
    id: "protect_attention",
    label: "Protect Attention",
    mvpPurpose: "Prevents notification overload; builds sustained focus",
    typicalSituations: "A focus block; high context switching",
  },
  close_the_day: {
    id: "close_the_day",
    label: "Close the Day",
    mvpPurpose: "Builds the daily habit and recovery",
    typicalSituations: "Evening; a heavy day",
  },
  protect_sleep_for_the_mind: {
    id: "protect_sleep_for_the_mind",
    label: "Protect Sleep for the Mind",
    mvpPurpose: "Builds recovery that feeds the next event",
    typicalSituations: "A heavy day; an early stake tomorrow",
  },
  anchor_body_clock: {
    id: "anchor_body_clock",
    label: "Anchor Body Clock",
    mvpPurpose: "Prevents travel fatigue; builds circadian resilience",
    typicalSituations: "Landing after a time-zone shift",
  },
  sustain_multi_day: {
    id: "sustain_multi_day",
    label: "Sustain Multi-Day",
    mvpPurpose: "Prevents performance degradation at multi-day events",
    typicalSituations: "Conference day 2 or more",
  },
  steady_in_crisis: {
    id: "steady_in_crisis",
    label: "Steady in Crisis",
    mvpPurpose: "Prevents emotion hijack and decision leakage",
    typicalSituations: "An open crisis",
  },
  keep_the_ritual_off_days: {
    id: "keep_the_ritual_off_days",
    label: "Keep the Ritual on Off Days",
    mvpPurpose: "Prevents habit dropout on weekends and leave",
    typicalSituations: "A day off",
  },
  prepare_the_week: {
    id: "prepare_the_week",
    label: "Prepare the Week",
    mvpPurpose: "Builds recovery that feeds the next event",
    typicalSituations: "The last day off",
  },
};
