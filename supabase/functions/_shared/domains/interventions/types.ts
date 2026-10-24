// [KIND: types] [LAYER: 3] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 3 Interventions Domain.
// Source: Part 2 Layer 3 (Section 8.7, 15.3, 16.3).

export type InterventionKind =
  | "practice"
  | "own_action"
  | "framework"
  | "conversation"
  | "role_play"
  | "coaching";

export type Modality = "somatic" | "mindset";

export type DeliveryMode = "push" | "app" | "live_session" | "scheduled";

export type InterventionNeed =
  | "settle_before"
  | "prime_presence"
  | "clear_and_focus"
  | "hold_steady_during"
  | "transition_between"
  | "protect_recovery_window"
  | "offload_after"
  | "protect_attention"
  | "close_the_day"
  | "protect_sleep_for_the_mind"
  | "anchor_body_clock"
  | "sustain_multi_day"
  | "steady_in_crisis"
  | "keep_the_ritual_off_days"
  | "prepare_the_week";

import type { CanonicalCapability } from "../../spine/capabilities.ts";

export type InterventionCapability = CanonicalCapability;

export interface PracticeDefinition {
  id: string;
  title: string;
  visible: boolean;
  surfaces: string[];
  content_type: string;
  sub_type: Modality;
  category: "pause" | "flow" | "reenergise" | string;
  recalibrate_page: string;
  recalibrate_section: string;
  protocol_type: string;
  minutes: number;
  duration_band: "quick" | "short" | "full" | string;
  combos: string[];
  arousal: string;
  energy_direction?: string;
  intensity?: string;
  horizon?: string[];
  moment?: string[];
  meta_skill?: string[];
  usage_occasions?: string[];
  state_signal?: string[];
  capabilities: InterventionCapability[];
  goal_tags?: string[];
}

export type SituationGroup =
  | "between_meetings"
  | "calendar_use"
  | "decision_quality"
  | "interpersonal"
  | "recovery"
  | "focus"
  | "travel"
  | "crisis"
  | "recovery_sustainable"
  | "working_day"
  | "conference"
  | "days_off"
  | string;

export type OwnActionPrinciple =
  | "protect_capacity"
  | "use_calendar"
  | "reduce_load"
  | "small_adjustment"
  | "respect_autonomy";

export type MvpPurpose =
  | "prevents_hijack"
  | "builds_presence"
  | "prevents_decision_leakage"
  | "builds_focus"
  | "prevents_burnout"
  | "builds_recovery"
  | "prevents_fatigue"
  | "builds_circadian_resilience"
  | "prevents_habit_dropout";

export interface OwnActionObservation {
  id: string;
  text: string;
  requiresFact: string;
}

export interface OwnActionDefinition {
  id: string;
  title: string;
  kind: "own_action";
  situation: SituationGroup;
  principles: OwnActionPrinciple[];
  needs: InterventionNeed[];
  purposes: MvpPurpose[];
  mindImpact: string;
  phases: Array<"pre" | "during" | "post" | "day" | "evening">;
  preconditions: string[];
  exclusions: string[];
  observations: OwnActionObservation[];
  action: string;
  changesCalendar: boolean;
  doableFromNotification: boolean;
  pairsWith?: string[];
}

export interface InterventionCandidate {
  id: string;
  title: string;
  kind: InterventionKind;
  modality?: Modality;
  minutes?: number;
  capabilities: InterventionCapability[];
  practice?: PracticeDefinition;
  ownAction?: OwnActionDefinition;
}

export interface SelectionRequest {
  feature: "plan" | "nudges" | "brief";
  slotId: string;
  anchorId?: string | null;
  anchorCategory?: string | null;
  phase: "pre" | "during" | "post" | "day" | "evening";
  availableGapMinutes: number;
  targetNeed?: InterventionNeed;
  preferredModality?: Modality;
  userGoals?: string[];
  userFavourites?: string[];
  priorCompletedIdsToday?: string[];
  recentCompletedIds14Days?: string[];
  isCrisis?: boolean;
}

export interface ScoredCandidate {
  candidate: InterventionCandidate;
  score: number;
  subScores: {
    capabilityMatch: number;
    comboMatch: number;
    goalBonus: number;
    favouriteBonus: number;
    recencyAdjustment: number;
  };
  reasons: string[];
}

export interface SelectionResult {
  decisionId: string;
  slotId: string;
  need: InterventionNeed;
  chosen: InterventionCandidate;
  alternate: InterventionCandidate | null;
  outcome: "match" | "default_set" | "static_route";
  score: number;
  reasons: string[];
  eligibleCandidates?: Array<{ id: string; score: number; relevance: number }>;
  rejected: Array<{ interventionId: string; reason: string }>;
  versions?: Record<string, string>;
}

export interface PlanSlotRecommendation {
  slotIndex: number; // 0, 1, 2
  role: "prepare" | "sustain" | "recover" | "wrap";
  decision: SelectionResult;
}

export interface DayInterventionsPlan {
  slots: PlanSlotRecommendation[];
  hasOwnAction: boolean;
  timestampUtc: string;
}
