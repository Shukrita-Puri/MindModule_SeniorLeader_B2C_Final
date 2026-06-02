// MRS v3 — Window context types (Morning / Afternoon / Evening).
//
// Pure, in-memory derivations layered on top of `daily_context_snapshot`.
// No DB calls, no LLM. Brief / Plan / Nudges consume the window slice that
// matches the user's local time-of-day plus the shared daily context.
//
// See plan: docs/PERFORMANCE_READINESS_BRIEF_LOGIC.md "Window Context Split".

import type { ClassifiedEventLite, DemandLevel } from './types.ts';

// ───────────────────────────────────────────────────────────────────────────
// Shared input shape — what every window builder receives.
// All fields except `events` and `now` are nullable so the builders never
// throw on missing wearable / check-in / JIT data.
// ───────────────────────────────────────────────────────────────────────────

export interface WearableSnapshotInput {
  /** Today's overnight HRV reading. */
  hrvToday: number | null;
  /** Personal 30-day HRV baseline. */
  hrvBaseline30d: number | null;
  /** Most recent intraday HRV reading (4-hourly stream). Used by evening. */
  hrvLatest?: number | null;
  /** This morning's resting heart rate. */
  rhrToday?: number | null;
  /** Personal 30-day RHR baseline. */
  rhrBaseline30d?: number | null;
  /** Total sleep hours (already Apple-corrected if applicable). */
  sleepHours?: number | null;
  /** Personal 30-day sleep-score baseline (0-100). */
  sleepScore?: number | null;
  sleepScoreBaseline30d?: number | null;
  /** Current HR (intraday). Used by afternoon only. */
  hrCurrent?: number | null;
  /**
   * Avg HR across the afternoon's intraday samples. Used by evening to
   * compute `body_load_elevated`. Pass null if not tracked.
   */
  hrAvgAfternoon?: number | null;
}

export interface JitEventLite {
  id: string;
  event_title: string;
  event_start_time: string;
  actioned: boolean;
}

export interface PlanStatusInput {
  /** True when every priority is checked off. */
  allCompleted: boolean;
  /** Title / label of priority 1, or null if no plan. */
  priorityOneTitle: string | null;
  /** True when priority 1 is checked off. */
  priorityOneCompleted: boolean;
  /** Count of priorities still outstanding (0 when allCompleted). */
  remainingCount: number;
}

export interface CheckinSnapshotInput {
  /** 1–5 charge residue captured at last check-in today, or null. */
  chargeResidue?: number | null;
}

export interface WindowContextInput {
  /** User's local `now`. Drives split between completed / remaining events. */
  now: Date;
  /** Events that fall on the local day. Pre-fetched by the consumer. */
  todayEvents: ClassifiedEventLite[];
  /** Events from local yesterday. Drives morning carry-over signals. */
  yesterdayEvents?: ClassifiedEventLite[];
  /** Events from local tomorrow. Drives evening "what is tonight preparing for" framing. */
  tomorrowEvents?: ClassifiedEventLite[];
  /** Unactioned JIT events for today. */
  jitEventsToday?: JitEventLite[];
  wearable?: WearableSnapshotInput | null;
  plan?: PlanStatusInput | null;
  checkin?: CheckinSnapshotInput | null;
  /** Day-kind detector output (travel / conference / weekend / weekday). */
  dayKind?: 'travel' | 'conference' | 'weekend' | 'weekday' | string | null;
  /** Conference day N when on a multi-day conference chain. */
  conferenceDayNumber?: number | null;
}

// ───────────────────────────────────────────────────────────────────────────
// Output shapes — one per window. Fields mirror the spec attached to the
// approved plan. Every field is serialisable so the whole object can be
// stamped onto `brief_snapshots.input_signature` for parity verification.
// ───────────────────────────────────────────────────────────────────────────

export type StakesCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type SleepQuality = 'poor' | 'fair' | 'good' | 'peak' | null;

export interface EventLite {
  title: string;
  startTime: string;
  endTime: string;
  category?: StakesCategory | null;
  minutesUntil?: number;
}

export interface MorningContext {
  window: 'morning';
  yesterdayLoadScore: number;           // 0–100
  yesterdayLoad: DemandLevel;
  yesterdayHadHighStakes: boolean;
  yesterdayHadConflict: boolean;
  sleepHours: number | null;
  sleepQuality: SleepQuality;
  hrvDeviationPct: number | null;       // overnight HRV vs 30d baseline
  rhrDeviationPct: number | null;       // morning RHR vs 30d baseline
  todayMeetingCount: number;
  todayClassifiedEvents: EventLite[];
  todayFirstHighStakes: EventLite | null;
  vetoRisk: boolean;
  dayKind: string | null;
  conferenceDayNumber: number | null;
}

export interface AfternoonContext {
  window: 'afternoon';
  meetingsCompleted: number;
  highestCompletedCategory: StakesCategory | null;
  meetingsRemaining: number;
  highestRemainingStakes: EventLite | null;
  backToBackRemainingHours: number;
  availableGapsRemaining: number;       // gaps >= 15min
  /** ONLY window where intraday HR matters. % above resting baseline, or null. */
  currentHrVsRestingPct: number | null;
  decisionLeakageRisk: boolean;
  jitEventsRemaining: number;
  planPriorityOneTitle: string | null;
  planPriorityOneCompleted: boolean;
}

export type EveningMode = 'close' | 'jit_remaining';
export type RecoveryNote = 'rest' | 'light' | 'normal';

export interface EveningContext {
  window: 'evening';
  /** §3.1 gear-shift trigger. When 'jit_remaining', Close framing is suppressed. */
  mode: EveningMode;
  todayCompletedCount: number;
  todayCompletedCategories: StakesCategory[];
  todayHadHighStakes: boolean;
  todayHadConflict: boolean;
  bodyLoadElevated: boolean;            // afternoon avg HR > 10% above RHR baseline
  hrvEveningDeviationPct: number | null;
  prioritiesAllCompleted: boolean;
  prioritiesRemainingCount: number;
  jitRemainingEvening: boolean;
  wasTravelDay: boolean;
  wasConferenceDay: boolean;
  conferenceDayNumber: number | null;
  tomorrowFirstHighStakes: EventLite | null;
  tomorrowMeetingCount: number;
  tomorrowIsHeavy: boolean;
  recoveryNote: RecoveryNote;
  chargeResidueEvening: number | null;
}

export type WindowContext = MorningContext | AfternoonContext | EveningContext;

// ───────────────────────────────────────────────────────────────────────────
// Behaviour snapshot — output of `_shared/behaviour-snapshot.ts`.
// ───────────────────────────────────────────────────────────────────────────

export interface BehaviourSnapshot {
  /** Sorted high → low. Consumed by Brief + Nudges. */
  flagsBrief: unknown[];
  /** Sorted high → low. Consumed by Plan. */
  flagsPlan: unknown[];
  /** Plan-only SlotBoost[]. Empty when no flag has a slotBoost descriptor. */
  slotBoosts: unknown[];
  /** Pre-formatted "=== ACTIVE CEO BEHAVIOURS ===" block. Empty when no flags. */
  promptBlockBrief: string;
  promptBlockPlan: string;
  /** Pre-formatted "=== EVENT TAXONOMY ===" block. Empty when no events. */
  taxonomyBlock: string;
  /** Stable hash of inputs — written to brief_snapshots.input_signature. */
  signatureHash: string;
}