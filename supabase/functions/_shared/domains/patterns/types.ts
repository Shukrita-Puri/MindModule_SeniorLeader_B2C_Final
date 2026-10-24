// [KIND: types] [LAYER: 4] [TIERS: 0-3] [AUDIENCE: universal]
// Types for Layer 4: Patterns and Causality.
// Source: Part 2 Layer 4 (Section 2.5, 4A, 4C, 5.1, 6, 7, 9).

import type { ClassificationStamp } from "../events/types.ts";
import type { DayProfile } from "../day-profile/types.ts";

export type MetricId =
  | "hrv"
  | "rhr"
  | "hr"
  | "deep_sleep"
  | "rem_sleep"
  | "total_sleep"
  | "sleep_efficiency"
  | "prs"
  | "focus"
  | "energy"
  | "calm"
  | "clarity";

export type LagType =
  | "same_window"
  | "same_day"
  | "next_morning"
  | "next_day"
  | "multi_day";

export type BaselineType =
  | "own_baseline"
  | "matched_comparator"
  | "own_before";

export type ConfidenceTier = "emerging" | "strong" | "insufficient_data";

export type EffectDirection = "harm" | "benefit" | "neutral";

export interface PatternSpec {
  id: string;
  name: string;
  family:
    | "drain_lift"
    | "anticipation"
    | "recovery"
    | "load"
    | "demand_state"
    | "day_patterns";
  metric: MetricId;
  lag: LagType;
  baseline: BaselineType;
  minN: number;
  minEffectPct: number;
  expectedDirection: EffectDirection;
}

export interface MetricComparison {
  date: string;
  exposureId: string;
  bucketKey: string;
  exposedValue: number;
  baselineValue: number;
  diffAbs: number;
  diffPct: number;
  direction: EffectDirection;
}

export interface Finding {
  findingId: string;
  stableKey: string;
  patternKind: string; // e.g. "event_drain_hrv" or "shadow:event_drain_hrv"
  bucketKey: string;
  metric: MetricId | string;
  direction: EffectDirection;
  effectPct: number;
  effectAbs: number;
  confidence: ConfidenceTier;
  occurrences: number;
  measuredN: number;
  baselineValue: number;
  exposedValue: number;
  twoWindowPassed: boolean;
  firstSeenDate: string;
  lastSeenDate: string;
  sampleDates: string[];
  reason: string;
  provenance: {
    historyDays: number;
    specsVersion: string;
    spineVersion: string;
    computedAt: string;
  };
}

export interface ExposureEvent {
  id: string;
  date: string; // YYYY-MM-DD
  startUtc: string;
  endUtc: string;
  durationMinutes: number;
  stamp?: Partial<ClassificationStamp>;
  bucketKey: string;
}

export interface WearableDayRecord {
  date: string; // YYYY-MM-DD
  bedtime?: string | null;
  hrv?: number | null;
  rhr?: number | null;
  deepSleepMinutes?: number | null;
  remSleepMinutes?: number | null;
  totalSleepMinutes?: number | null;
  sleepEfficiency?: number | null;
  readinessScore?: number | null;
  isExcludedDay?: boolean; // travel, illness, leave, crisis
}

export interface CheckinRecord {
  id: string;
  date: string;
  localHour: number;
  window: "morning" | "midday" | "afternoon" | "evening";
  focus?: number | null;
  energy?: number | null;
  calm?: number | null;
  clarity?: number | null;
  tags?: string[];
  note?: string | null;
}

export interface PracticeSessionRecord {
  id: string;
  practiceId: string;
  date: string;
  startUtc: string;
  targetNeed?: string;
  anchorCategory?: string;
  preItemStakes?: boolean;
  completed: boolean;
  durationSeconds: number;
  preStateHr?: number;
  postStateHr?: number;
  rating?: "useful" | "neutral" | "not_relevant_now" | "not_relevant_ever" | null;
}

export interface OwnActionFeedbackRecord {
  id: string;
  actionId: string;
  date: string;
  situation: string;
  targetNeed?: string;
  status: "offered" | "done" | "dismissed";
  rating?: "useful" | "neutral" | "not_relevant_now" | "not_relevant_ever" | null;
}

export interface NudgeFeedbackRecord {
  id: string;
  date: string;
  nudgeKind: string;
  delivered: boolean;
  opened: boolean;
  tappedAction: boolean;
  dismissed: boolean;
}

export interface HistoryDay {
  date: string; // YYYY-MM-DD
  dayProfile?: DayProfile | null;
  events: ExposureEvent[];
  wearable?: WearableDayRecord | null;
  checkins?: CheckinRecord[];
}

export interface History {
  userId: string;
  timezone: string;
  days: HistoryDay[];
  practiceSessions: PracticeSessionRecord[];
  ownActionRecords: OwnActionFeedbackRecord[];
  nudgeRecords: NudgeFeedbackRecord[];
  checkins: CheckinRecord[];
  wearables: WearableDayRecord[];
}

export interface EfficacyRow {
  interventionId: string;
  interventionKind: "practice" | "own_action";
  bucketKey: string;
  need?: string;
  offeredCount: number;
  startedCount: number;
  completedCount: number;
  reviewedUsefulCount: number;
  reviewedNeutralCount: number;
  reviewedNotRelevantCount: number;
  adoptionRate: number;
  efficacyRate: number;
  shrunkRate: number;
  confidence: ConfidenceTier;
  prepEffect?: {
    withPrepAvgChange: number;
    withoutPrepAvgChange: number;
    gainPct: number;
  };
}

export interface PredictionRecord {
  id: string;
  findingId: string;
  stableKey: string;
  targetDate: string;
  predictedDirection: EffectDirection;
  actualDirection?: EffectDirection;
  isCorrect?: boolean;
  verifiedAt?: string;
}

export interface RhythmGridCell {
  dayOfWeek: number; // 0=Mon, 6=Sun
  hour: number; // 0-23 in user's local time
  checkinCount: number;
  avgEnergy?: number;
  avgClarity?: number;
  avgCalm?: number;
  avgFocus?: number;
}

export interface RhythmPeak {
  type: "peak" | "trough";
  dimension: "energy" | "clarity" | "calm" | "focus";
  dayOfWeek: number;
  hour: number;
  windowLabel: string;
  value: number;
  isConsecutiveRun: boolean;
  consecutiveCount?: number;
}

export interface RhythmResult {
  grid: RhythmGridCell[];
  peaks: RhythmPeak[];
  troughs: RhythmPeak[];
  streaks: {
    checkinStreakDays: number;
    practiceStreakDays: number;
  };
  frictionRates: {
    backToBackFrictionPct: number;
    highSwitchingFrictionPct: number;
  };
}

export interface TrendResult {
  mrs3DayTrend: "rising" | "falling" | "steady";
  mrsWeeklyDeltaPct: number;
  deficitDaysCount: number;
  burnoutRiskLevel: "low" | "moderate" | "elevated" | "high";
  daysSinceLastRestoration: number;
}

export interface AskPatternResult {
  status: "found" | "not_enough_yet" | "no_data";
  question: string;
  occurrences: number;
  requiredOccurrences: number;
  dates: string[];
  finding?: Finding;
  explanation: string;
}
