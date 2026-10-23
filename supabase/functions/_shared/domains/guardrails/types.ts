// [KIND: types] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 5 Guardrails Domain.
// Source: Part 2 Layer 5 (Section 5.1).

export type GuardrailVerdictKind = "allow" | "defer" | "suppress" | "modify";

export interface CandidatePayload {
  id: string;
  surface: "nudge" | "brief" | "plan" | "home" | "insights";
  kind: "push" | "in_app_card" | "chat_message" | "offer";
  pushKind?: "jit" | "morning" | "recalibrate" | "in_flight" | "look_ahead" | "evening";
  title?: string;
  body?: string;
  anchorEventId?: string | null;
  anchorCategory?: string | null;
  isCountablePush?: boolean;
  isHealthPhysiology?: boolean;
  isCrisisContent?: boolean;
  isRecoveryOffer?: boolean;
  meetingTime?: string;
  isSensitiveMeeting?: boolean;
  isPrivateItem?: boolean;
}

export interface FormLimits {
  maxWords?: number;
  maxPracticeMinutes?: number;
  pushAllowed: boolean;
  appOpenAllowed: boolean;
}

export interface GuardrailVerdict {
  verdict: GuardrailVerdictKind;
  reasonCode: string;
  description: string;
  deferUntilUtc?: string;
  formLimits?: FormLimits;
  modifiedText?: string;
}

export interface GuardrailContext {
  nowLocalHour: number;
  nowLocalMinute: number;
  nowUtc: Date;
  wearableBedtime?: string | null; // e.g. "22:30"
  gateIsOpen?: boolean;
  cardsAwaiting?: boolean;
  isCrisisEpisode?: boolean;
  isDenseDay?: boolean;
  inPostDemandingGap?: boolean;
  gapMinutesRemaining?: number;
  countablePushesTodayCount: number;
  minutesSinceLastPush?: number | null;
  completedSlotAnchorIdsToday?: string[];
  healthConsentGranted?: boolean;
}
