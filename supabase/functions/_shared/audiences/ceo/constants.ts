// [KIND: configuration] [LAYER: audience] [TIERS: 3] [AUDIENCE: ceo]
// CEO Audience Pack Constants (with Reason for every value).
// Source: Spine Section 11, Part 4 Tree (C6 & C7).

export interface ConstantWithReason<T> {
  value: T;
  reason: string;
}

export const CEO_PACK_CONSTANTS = {
  // Layer 2: Load Thresholds
  HEAVY_DAY_MEETING_COUNT: {
    value: 5,
    reason: "CEOs experience cognitive fragmentation and decision leakage when scheduled for ≥5 distinct meetings.",
  },
  HEAVY_DAY_TOTAL_HOURS: {
    value: 6.0,
    reason: "More than 6 hours of synchronous meetings leaves insufficient capacity for strategic cognition.",
  },
  BACK_TO_BACK_CHAIN_MINUTES: {
    value: 15,
    reason: "Breaks shorter than 15 minutes do not allow sympathetic nervous system down-regulation.",
  },
  LIGHT_DAY_MAX_MEETINGS: {
    value: 2,
    reason: "Up to 2 light check-ins still qualifies as a protected or recovery day.",
  },

  // Layer 3: Experience Weights
  SOMATIC_RESET_LEAD_MINUTES: {
    value: 15,
    reason: "CEOs require at least 15 minutes pre-anchor to transition from tactical operational mode to regulated presence.",
  },

  // Layer 5: Guardrails
  DAILY_NUDGE_CAP: {
    value: 3,
    reason: "Maximum 3 unsolicited notifications per day to avoid notification fatigue.",
  },
  QUIET_HOURS_START_OFFSET_MINUTES: {
    value: 30,
    reason: "Silence notifications 30 minutes before habitual sleep time.",
  },
} as const;
