// [KIND: types] [LAYER: 5] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Chief of Staff Voice & Behaviour Domain.
// Source: Part 2 Layer 5 (Section 6).

export type SurfaceType =
  | "mrs"
  | "home"
  | "brief"
  | "brief_phrase"
  | "brief_body"
  | "brief_close"
  | "plan_title"
  | "plan_why"
  | "nudge"
  | "insights"
  | "week_ahead"
  | "recalibrate";

export type VoiceStance =
  | "acknowledge"
  | "reinforce"
  | "steady"
  | "caution"
  | "challenge"
  | "hold";

export type EvidenceKind =
  | "declared"
  | "observed"
  | "behavioural"
  | "pattern"
  | "inferred";

export interface EvidenceObject {
  kind: EvidenceKind;
  fact: string;
  value?: unknown;
  unit?: string;
  tier?: "S0" | "S1" | "S2" | "S3" | "S4" | "S5";
  count?: number;
  of?: number;
}

export interface LeaderVoiceProfile {
  what_lands?: string[];
  what_wont_land?: string[];
  how_they_think?: string[];
  brief_voice_note?: string;
  confirmed?: boolean;
}

export interface WriteRequest {
  surface: SurfaceType;
  voiceProfile?: string;
  stance: VoiceStance;
  anchor?: {
    kind: string;
    category?: string;
    subtype?: string;
    startsInMin?: number;
    sensitivity?: "S0" | "S1" | "S2" | "S3" | "S4" | "S5";
  };
  evidence: EvidenceObject[];
  signals?: string[];
  verdict?: {
    decision: "allow" | "modify";
    modifiedText?: string;
  };
  claimSet?: string[];
  leaderVoice?: LeaderVoiceProfile;
}

export interface SurfaceContract {
  surface: SurfaceType;
  minWords?: number;
  maxWords?: number;
  maxCharacters?: number;
  allowPracticePhrases?: boolean;
  allowProductLabels?: boolean;
  allowMetricTokens?: boolean; // Defaults to true per D-L5-4
  allowTwoDataPoints?: boolean;
  checkClaimSet?: boolean;
  isDenseDay?: boolean;
}

export interface CopyCheckViolation {
  code: string;
  rule: string;
  message: string;
  offendingText?: string;
}

export interface CopyCheckResult {
  valid: boolean;
  violations: CopyCheckViolation[];
  sanitizedText: string;
  wordCount: number;
  characterCount: number;
}

export interface ClaimSet {
  claims: string[];
}
